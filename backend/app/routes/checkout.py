import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import Client

from app.config import settings
from app.database import get_user_supabase, get_service_role_supabase
from app.database_writer import get_db_writer, DatabaseWriter
from app.notification import get_notifier, NotificationBroadcaster
from app.pricing import compute_line_item_prices
from app.rate_limit import limiter
from app.schemas.order import (
    CheckoutRequest,
    CheckoutResponse,
    ErrorResponse,
    OrderItemResponse,
    StockErrorItem,
)
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/checkout", tags=["checkout"])


def _build_whatsapp_link(
    readable_order_id: int,
    customer_name: str,
    total_amount: float,
    items: list[OrderItemResponse],
) -> str:
    lines = [f"New Order #{readable_order_id}", f"Customer: {customer_name}", "Items:"]
    for item in items:
        lines.append(f"- {item.quantity_ordered}x {item.title} = ${item.unit_price_applied:.2f} each")
    lines.append(f"Total: ${total_amount:.2f}")
    lines.append(f"View order: {settings.frontend_url}/receipts/{readable_order_id}")
    message = "\n".join(lines)
    return f"https://wa.me/{settings.merchant_phone}?text={quote(message)}"


@router.post("", response_model=CheckoutResponse | ErrorResponse)
@limiter.limit("10/minute")
async def create_checkout(
    request: Request,
    checkout_req: CheckoutRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase),
    service_supabase: Client = Depends(get_service_role_supabase),
    notifier: NotificationBroadcaster = Depends(get_notifier),
):
    user_id = user["sub"]
    try:
        profile_resp = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    if not profile_resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    profile = profile_resp.data
    customer_name = profile.get("full_name", "Unknown")
    customer_phone = profile.get("phone") or ""

    product_ids = [item.product_id for item in checkout_req.items]
    products_resp = supabase.table("products").select("*").in_("id", product_ids).execute()
    products_map = {p["id"]: p for p in (products_resp.data or [])}

    stock_errors: list[StockErrorItem] = []
    for item in checkout_req.items:
        product = products_map.get(item.product_id)
        if not product:
            stock_errors.append(
                StockErrorItem(
                    product_id=item.product_id,
                    title="Unknown Product",
                    available=0,
                    requested=item.quantity,
                )
            )
        elif product["available_stock_lots"] < item.quantity:
            stock_errors.append(
                StockErrorItem(
                    product_id=item.product_id,
                    title=product["title"],
                    available=product["available_stock_lots"],
                    requested=item.quantity,
                )
            )

    if stock_errors:
        return ErrorResponse(error="insufficient_stock", out_of_stock=stock_errors)

    raw_items = [{"product_id": item.product_id, "quantity": item.quantity} for item in checkout_req.items]
    pricing_result = compute_line_item_prices(raw_items, profile, products_map)

    db_writer = get_db_writer(service_supabase)
    writer_result = db_writer.write_checkout_order(
        user_id=user_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        priced_items=pricing_result.items,
        total_amount=pricing_result.total_amount,
    )

    if not writer_result.success:
        if writer_result.error == "race_condition":
            return ErrorResponse(error="stock_changed_retry")
        return ErrorResponse(error="checkout_failed")

    items_response = [
        OrderItemResponse(
            product_id=item.product_id,
            title=item.title,
            quantity_ordered=item.quantity_ordered,
            unit_price_applied=item.unit_price_applied,
        )
        for item in pricing_result.items
    ]

    await notifier.order_placed(
        order_id=writer_result.order_id,
        readable_order_id=writer_result.readable_order_id,
        total_amount=writer_result.total_amount,
        items=writer_result.items,
        updated_stock=writer_result.updated_stock,
    )

    whatsapp_link = _build_whatsapp_link(
        writer_result.readable_order_id,
        customer_name,
        writer_result.total_amount,
        items_response,
    )

    return CheckoutResponse(
        order_id=writer_result.order_id,
        readable_order_id=writer_result.readable_order_id,
        total_amount=writer_result.total_amount,
        whatsapp_deep_link=whatsapp_link,
        items=items_response,
    )
