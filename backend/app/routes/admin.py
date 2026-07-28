import csv
import io
import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from supabase import Client

from app.adapters.csv_parser import get_headers, get_template_row, parse_rows
from app.adapters.db import get_raw_connection
from app.adapters.product_inserter import insert_products
from app.adapters.row_normalizer import normalize_row
from app.adapters.row_validator import validate_row
from app.database import get_supabase
from app.schemas.admin import AdminActionResponse
from app.schemas.order import OrderStatusUpdate
from app.schemas.product import ProductImportResponse, RowImportError
from app.utils.security import get_current_user
from app.utils.ws_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def _assert_admin(user: dict, supabase: Client) -> None:
    user_id = user["sub"]
    profile_resp = supabase.table("profiles").select("role").eq("id", user_id).single().execute()
    if not profile_resp.data or profile_resp.data.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.post("/profiles/{profile_id}/approve", response_model=AdminActionResponse)
async def approve_profile(
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
async def reject_profile(
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
async def update_order_status(
    order_id: str,
    body: OrderStatusUpdate,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)

    valid_statuses = {"pending_whatsapp", "processing", "completed", "cancelled"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}",
        )

    conn = get_raw_connection()
    try:
        cur = conn.cursor()
        if body.status == "cancelled":
            order_resp = supabase.table("order_items").select("product_id, quantity_ordered").eq("order_id", order_id).execute()
            items = order_resp.data or []
            if not items:
                raise HTTPException(status_code=404, detail="Order not found or has no items")

            for item in items:
                cur.callproc("increment_stock_inventory", (item["product_id"], item["quantity_ordered"]))

        cur.execute(
            "UPDATE orders SET status = %s WHERE id = %s RETURNING id, user_id, readable_order_id",
            (body.status, order_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")

        order_user_id = row[1]
        readable_order_id = row[2]
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Order status update failed: %s", e)
        conn.rollback()
        raise HTTPException(status_code=500, detail="Order update failed")
    finally:
        conn.close()

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


@router.get("/products/template")
async def download_template(
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=get_headers())
    writer.writeheader()
    writer.writerow(get_template_row())
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=product-import-template.csv"},
    )


@router.post("/products/import", response_model=ProductImportResponse)
async def import_products(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)

    content = await file.read()
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    all_rows = parse_rows(content)
    total_rows = len(all_rows)

    errors: list[RowImportError] = []
    valid_rows: list[dict] = []

    for row_idx, row in enumerate(all_rows, start=2):
        validated, row_errors = validate_row(row)
        if row_errors:
            sku = row.get("sku", "").strip() or ""
            errors.append(RowImportError(row=row_idx, sku=sku, reason="; ".join(row_errors)))
            continue

        normalized = normalize_row(validated)
        valid_rows.append(normalized)

    if errors:
        return ProductImportResponse(inserted=0, errors=errors, total_rows=total_rows)

    inserted = insert_products(supabase, valid_rows)
    insertion_errors = total_rows - inserted
    if insertion_errors > 0:
        errors.append(RowImportError(row=0, sku="", reason=f"{insertion_errors} rows failed to insert"))

    await get_manager().broadcast_to_role("product_update", {}, role="admin")
    return ProductImportResponse(inserted=inserted, errors=errors, total_rows=total_rows)


@router.post("/products/broadcast-update")
async def broadcast_product_update(
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)
    await get_manager().broadcast_to_role("product_update", {}, role="admin")
    return {"status": "ok"}