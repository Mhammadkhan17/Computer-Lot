import csv
import io
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from supabase import Client

from app.adapters.csv_parser import get_headers, get_template_row, parse_rows
from app.adapters.product_inserter import insert_products
from app.adapters.row_normalizer import normalize_row
from app.adapters.row_validator import validate_row
from app.database import get_user_supabase
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
    profile_resp = supabase.table("profiles").select("role").eq("id", user_id).single().execute()
    if not profile_resp.data or profile_resp.data.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.post("/profiles/{profile_id}/approve", response_model=AdminActionResponse)
@limiter.limit("30/minute")
async def approve_profile(
    request: Request,
    profile_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase),
):
    _assert_admin(user, supabase)

    _set_profile_role(supabase, profile_id, "wholesale_approved")

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
    supabase: Client = Depends(get_user_supabase),
):
    _assert_admin(user, supabase)

    _set_profile_role(supabase, profile_id, "retail")

    await get_manager().broadcast_to_role(
        "profile_update",
        {"profile_id": profile_id, "role": "retail"},
        role="admin",
    )

    return AdminActionResponse(status="rejected")


def _set_profile_role(supabase: Client, profile_id: str, role: str) -> None:
    resp = supabase.rpc(
        "admin_set_profile_role",
        {"p_profile_id": profile_id, "p_role": role},
    ).execute()
    if not resp.data or resp.data.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Profile not found")


@router.patch("/orders/{order_id}/status", response_model=AdminActionResponse)
@limiter.limit("30/minute")
async def update_order_status(
    request: Request,
    order_id: str,
    body: OrderStatusUpdate,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase),
):
    _assert_admin(user, supabase)

    valid_statuses = {"pending_whatsapp", "processing", "completed", "cancelled"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}",
        )

    if body.status == "cancelled":
        # Cancel goes through the SECURITY DEFINER RPC (migration 004/007):
        # it is idempotent and only restocks orders that are still
        # pending_whatsapp, so a double cancel or a cancel racing with
        # expire_pending_orders can never restock the same inventory twice.
        cancel_resp = supabase.rpc("admin_cancel_order", {"p_order_id": order_id}).execute()
        if not cancel_resp.data:
            raise HTTPException(status_code=500, detail="Order cancel failed")
        data = cancel_resp.data
        rpc_status = data.get("status")
        if rpc_status == "not_found":
            raise HTTPException(status_code=404, detail="Order not found")
        if rpc_status == "already_cancelled_or_missing":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Order is not pending_whatsapp; it may already be cancelled",
            )
        if rpc_status != "cancelled":
            raise HTTPException(status_code=500, detail="Order cancel failed")
        readable_order_id = data.get("readable_order_id")
        order_user_id = data.get("user_id")
    else:
        order_resp = supabase.table("orders").select("user_id, readable_order_id, status").eq("id", order_id).execute()
        order_rows = order_resp.data
        if not order_rows:
            raise HTTPException(status_code=404, detail="Order not found")

        row = order_rows[0]
        order_user_id = row["user_id"]
        readable_order_id = row["readable_order_id"]
        current_status = row.get("status")

        # State-machine guard (mirrors the migration-007 DB trigger): a
        # cancelled order is terminal, and a completed order cannot be
        # reopened. Without this, an admin could re-open an order whose
        # stock was already restored on cancel, minting inventory.
        if current_status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot change the status of a cancelled order (terminal state)",
            )
        if current_status == "completed" and body.status in {"pending_whatsapp", "processing"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot reopen a completed order",
            )

        update_resp = supabase.table("orders").update({"status": body.status}).eq("id", order_id).execute()
        if not update_resp.data:
            raise HTTPException(status_code=500, detail="Order update failed")

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
    supabase: Client = Depends(get_user_supabase),
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
@limiter.limit("30/minute")
async def import_products(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase),
):
    _assert_admin(user, supabase)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")
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
@limiter.limit("30/minute")
async def broadcast_product_update(
    request: Request,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase),
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
    supabase: Client = Depends(get_user_supabase),
):
    _assert_admin(user, supabase)
    older_than_hours = (body.older_than_hours if body else None) or 24
    resp = supabase.rpc("expire_pending_orders", {"p_older_than_hours": older_than_hours}).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Order expiry failed")
    return resp.data
