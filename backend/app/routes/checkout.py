import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.adapters.notification import broadcast_order_update
from app.adapters.pricing import resolve_all_items
from app.adapters.stock import check_availability
from app.adapters.txn import run_in_transaction
from app.adapters.whatsapp import build_order_link
from app.config import settings
from app.database import get_supabase
from app.schemas.order import CheckoutRequest, CheckoutResponse, ErrorResponse
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/checkout", tags=["checkout"])


@router.post("", response_model=CheckoutResponse | ErrorResponse)
async def create_checkout(
    checkout_req: CheckoutRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    user_id = user["sub"]
    profile_resp = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not profile_resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    profile = profile_resp.data
    customer_name = profile.get("full_name", "Unknown")
    customer_phone = profile.get("phone", "")
    role = profile.get("role", "retail")

    product_ids = [item.product_id for item in checkout_req.items]
    products_resp = supabase.table("products").select("*").in_("id", product_ids).execute()
    products_list = products_resp.data or []
    products_map = {p["id"]: p for p in products_list}

    stock_errors = check_availability(products_list, [{"product_id": item.product_id, "quantity": item.quantity} for item in checkout_req.items])
    if stock_errors:
        return ErrorResponse(error="insufficient_stock", out_of_stock=stock_errors)

    total_lots = sum(item.quantity for item in checkout_req.items)
    resolved_items = resolve_all_items(products_map, [{"product_id": item.product_id, "quantity": item.quantity} for item in checkout_req.items], role, total_lots)

    total_amount = sum(item.unit_price_applied * item.quantity_ordered for item in resolved_items)

    order_data = {
        "user_id": user_id,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "total_amount": total_amount,
    }

    txn_result = run_in_transaction(order_data, resolved_items)
    order_id = txn_result["order_id"]
    readable_order_id = txn_result["readable_order_id"]

    whatsapp_link = build_order_link(readable_order_id, customer_name, total_amount, resolved_items)

    broadcast_order_update({
        "order_id": order_id,
        "readable_order_id": readable_order_id,
        "total_amount": total_amount,
        "customer_name": customer_name,
    })

    return CheckoutResponse(
        order_id=order_id,
        readable_order_id=readable_order_id,
        total_amount=total_amount,
        whatsapp_deep_link=whatsapp_link,
        items=resolved_items,
    )