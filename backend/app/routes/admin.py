import csv
import io
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from supabase import Client

from app.database import get_supabase
from app.database_writer import DatabaseWriter, get_db_writer
from app.rate_limit import limiter
from app.schemas.admin import AdminActionResponse, ExpireOrdersRequest
from app.schemas.order import OrderStatusUpdate
from app.schemas.product import ProductImportResponse, RowImportError
from app.utils.security import get_current_user
from app.utils.ws_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def _assert_admin(user: dict, supabase: Client) -> None:
    user_id = user["sub"]
    profile_resp = supabase.table("profiles").select("role").eq("id", user_id).execute()
    rows = profile_resp.data or []
    if not rows or rows[0].get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.post("/profiles/{profile_id}/approve", response_model=AdminActionResponse)
@limiter.limit("30/minute")
async def approve_profile(
    request: Request,
    profile_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)

    supabase.table("profiles").update({"role": "wholesale_approved"}).eq("id", profile_id).execute()

    await get_manager().broadcast_to_role(
        "profile_update",
        {"profile_id": profile_id, "role": "wholesale_approved"},
        role="admin",
    )

    return AdminActionResponse(status="approved")


@router.post("/profiles/{profile_id}/reject", response_model=AdminActionResponse)
@limiter.limit("30/minute")
async def reject_profile(
    request: Request,
    profile_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)

    supabase.table("profiles").update({"role": "retail"}).eq("id", profile_id).execute()

    await get_manager().broadcast_to_role(
        "profile_update",
        {"profile_id": profile_id, "role": "retail"},
        role="admin",
    )

    return AdminActionResponse(status="rejected")


@router.patch("/orders/{order_id}/status", response_model=AdminActionResponse)
@limiter.limit("30/minute")
async def update_order_status(
    request: Request,
    order_id: str,
    body: OrderStatusUpdate,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    db_writer: DatabaseWriter = Depends(get_db_writer),
):
    _assert_admin(user, supabase)

    valid_statuses = {"pending_whatsapp", "processing", "completed", "cancelled"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}",
        )

    if body.status == "cancelled":
        order_resp = supabase.table("order_items").select(
            "product_id, quantity_ordered"
        ).eq("order_id", order_id).execute()
        items = order_resp.data or []
        if not items:
            raise HTTPException(status_code=404, detail="Order not found or has no items")
        for item in items:
            db_writer.restock_product(item["product_id"], item["quantity_ordered"])

    success, order_user_id, readable_order_id = db_writer.update_order_status(order_id, body.status)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found")

    mgr = get_manager()
    await mgr.broadcast_to_role(
        "order_status_update",
        {
            "order_id": order_id,
            "status": body.status,
            "readable_order_id": readable_order_id,
        },
        role="admin",
    )
    if order_user_id:
        await mgr.send_to_user(
            "order_status_update",
            {
                "order_id": order_id,
                "status": body.status,
                "readable_order_id": readable_order_id,
            },
            order_user_id,
        )

    return AdminActionResponse(status="updated")


VALID_GRADES = {"Grade_A", "Grade_B", "Grade_C", "For_Parts"}

CSV_HEADERS = [
    "title", "sku", "description", "grade", "items_per_lot",
    "retail_price_per_lot", "wholesale_price_per_lot", "minimum_wholesale_lots",
    "available_stock_lots", "image_urls", "tags", "hardware_specifications",
]

TEMPLATE_ROW = {
    "title": "Example Product",
    "sku": "EX-001",
    "description": "A sample product description",
    "grade": "Grade_A",
    "items_per_lot": "1",
    "retail_price_per_lot": "199.99",
    "wholesale_price_per_lot": "149.99",
    "minimum_wholesale_lots": "5",
    "available_stock_lots": "20",
    "image_urls": "https://example.com/img1.jpg, https://example.com/img2.jpg",
    "tags": "example, sample, demo",
    "hardware_specifications": '{"key": "value"}',
}


@router.get("/products/template")
@limiter.limit("30/minute")
async def download_template(
    request: Request,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_HEADERS)
    writer.writeheader()
    writer.writerow(TEMPLATE_ROW)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=product-import-template.csv"},
    )


@router.post("/products/import", response_model=ProductImportResponse)
@limiter.limit("30/minute")
async def import_products(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)

    content = await file.read()
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    all_rows: list[dict] = list(reader)
    total_rows = len(all_rows)

    errors: list[RowImportError] = []
    rows: list[dict] = []

    for row_idx, row in enumerate(all_rows, start=2):
        row_errors = _validate_row(row)
        if row_errors:
            sku = row.get("sku", "").strip() or ""
            errors.append(RowImportError(row=row_idx, sku=sku, reason="; ".join(row_errors)))
            continue

        rows.append(_normalize_row(row))

    if errors:
        return ProductImportResponse(inserted=0, errors=errors, total_rows=total_rows)

    for row in rows:
        try:
            supabase.table("products").insert(row).execute()
        except Exception as e:
            sku = row.get("sku", "") or ""
            errors.append(RowImportError(row=0, sku=sku, reason=str(e)))

    if errors:
        return ProductImportResponse(inserted=len(rows) - len(errors), errors=errors, total_rows=total_rows)

    await get_manager().broadcast_to_role("product_update", {}, role="admin")
    return ProductImportResponse(inserted=len(rows), errors=[], total_rows=total_rows)


@router.post("/products/broadcast-update")
@limiter.limit("30/minute")
async def broadcast_product_update(
    request: Request,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)
    await get_manager().broadcast_to_role("product_update", {}, role="admin")
    return {"status": "ok"}


@router.post("/expire-orders")
@limiter.limit("30/minute")
async def expire_orders(
    request: Request,
    body: ExpireOrdersRequest | None = None,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)
    older_than_hours = (body.older_than_hours if body else None) or 24
    resp = supabase.rpc("expire_pending_orders", {"p_older_than_hours": older_than_hours}).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Order expiry failed")
    return resp.data


def _validate_row(row: dict) -> list[str]:
    errs: list[str] = []

    if not row.get("title", "").strip():
        errs.append("Missing title")

    if not row.get("sku", "").strip():
        errs.append("Missing SKU")

    grade = row.get("grade", "").strip()
    if grade and grade not in VALID_GRADES:
        errs.append(f"Invalid grade '{grade}'")

    try:
        retail = float(row.get("retail_price_per_lot", ""))
        if retail <= 0:
            errs.append("Retail price must be > 0")
    except (ValueError, TypeError):
        errs.append("Missing or invalid retail price")

    try:
        wholesale = float(row.get("wholesale_price_per_lot", ""))
        if wholesale <= 0:
            errs.append("Wholesale price must be > 0")
    except (ValueError, TypeError):
        errs.append("Missing or invalid wholesale price")

    try:
        stock = int(row.get("available_stock_lots", "0"))
        if stock < 0:
            errs.append("Stock must be >= 0")
    except (ValueError, TypeError):
        errs.append("Missing or invalid stock count")

    return errs


def _normalize_row(row: dict) -> dict:
    images = [s.strip() for s in row.get("image_urls", "").split(",") if s.strip()] if row.get("image_urls", "").strip() else None
    tags = [s.strip() for s in row.get("tags", "").split(",") if s.strip()] if row.get("tags", "").strip() else None

    specs = {}
    raw_specs = row.get("hardware_specifications", "").strip()
    if raw_specs:
        try:
            import json
            specs = json.loads(raw_specs)
        except json.JSONDecodeError:
            pass

    return {
        "title": row["title"].strip(),
        "sku": row["sku"].strip(),
        "description": row.get("description", "").strip() or None,
        "grade": row.get("grade", "").strip() or "Grade_A",
        "items_per_lot": int(row.get("items_per_lot", "1").strip() or "1"),
        "retail_price_per_lot": float(row["retail_price_per_lot"]),
        "wholesale_price_per_lot": float(row["wholesale_price_per_lot"]),
        "minimum_wholesale_lots": int(row.get("minimum_wholesale_lots", "5").strip() or "5"),
        "available_stock_lots": int(row["available_stock_lots"]),
        "images": images,
        "tags": tags,
        "hardware_specifications": specs,
    }
