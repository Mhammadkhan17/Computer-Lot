import logging
from urllib.parse import quote

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.config import settings
from app.database import get_supabase
from app.schemas.order import (
    CheckoutRequest,
    CheckoutResponse,
    ErrorResponse,
    OrderItemResponse,
    StockErrorItem,
)
from app.utils.security import get_current_user
from app.utils.ws_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/checkout", tags=["checkout"])


def _get_db_connection() -> psycopg2.extensions.connection:
    return psycopg2.connect(
        dbname=settings.supabase_db_name,
        user=settings.supabase_db_user,
        password=settings.supabase_db_password,
        host=settings.supabase_db_host,
        port=settings.supabase_db_port,
    )


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

    product_ids = [item.product_id for item in checkout_req.items]
    products_resp = supabase.table("products").select("*").in_("id", product_ids).execute()
    products_map = {p["id"]: p for p in (products_resp.data or [])}

    resolved_items: list[OrderItemResponse] = []
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
            continue

        if product["available_stock_lots"] < item.quantity:
            stock_errors.append(
                StockErrorItem(
                    product_id=item.product_id,
                    title=product["title"],
                    available=product["available_stock_lots"],
                    requested=item.quantity,
                )
            )
            continue

        resolved_items.append(
            OrderItemResponse(
                product_id=item.product_id,
                title=product["title"],
                quantity_ordered=item.quantity,
                unit_price_applied=0.0,
            )
        )

    if stock_errors:
        return ErrorResponse(error="insufficient_stock", out_of_stock=stock_errors)

    total_lots = sum(item.quantity_ordered for item in resolved_items)
    is_wholesale = profile.get("role") == "wholesale_approved" and total_lots >= 10

    total_amount = 0.0
    for resolved in resolved_items:
        product = products_map[resolved.product_id]
        if is_wholesale and resolved.quantity_ordered >= product["minimum_wholesale_lots"]:
            price = float(product["wholesale_price_per_lot"])
        else:
            price = float(product["retail_price_per_lot"])
        resolved.unit_price_applied = price
        total_amount += price * resolved.quantity_ordered

    conn = _get_db_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO orders (user_id, customer_name, customer_phone, total_amount)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, readable_order_id
                    """,
                    (user_id, customer_name, customer_phone, total_amount),
                )
                order_row = cur.fetchone()
                order_id = order_row[0]
                readable_order_id = order_row[1]

                for resolved in resolved_items:
                    cur.execute(
                        """
                        INSERT INTO order_items (order_id, product_id, quantity_ordered, unit_price_applied)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (order_id, resolved.product_id, resolved.quantity_ordered, resolved.unit_price_applied),
                    )

                for resolved in resolved_items:
                    cur.callproc("decrement_stock_inventory", (resolved.product_id, resolved.quantity_ordered))
                    dec_result = cur.fetchone()
                    if not dec_result or not dec_result[0]:
                        raise RuntimeError(
                            f"Failed to decrement stock for product {resolved.product_id}"
                        )
    except Exception as e:
        logger.error("Checkout transaction failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Checkout failed, order rolled back",
        )
    finally:
        conn.close()

    for resolved in resolved_items:
        product = products_map[resolved.product_id]
        new_stock = product["available_stock_lots"] - resolved.quantity_ordered
        await get_manager().broadcast("stock_update", {
            "product_id": resolved.product_id,
            "available_stock_lots": new_stock,
        })

    whatsapp_link = _build_whatsapp_link(readable_order_id, customer_name, total_amount, resolved_items)

    return CheckoutResponse(
        order_id=str(order_id),
        readable_order_id=readable_order_id,
        total_amount=total_amount,
        whatsapp_deep_link=whatsapp_link,
        items=resolved_items,
    )
