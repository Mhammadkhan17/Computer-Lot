import logging

from fastapi import HTTPException
from supabase import Client

logger = logging.getLogger(__name__)


def run_in_transaction(supabase: Client, order_data: dict, items: list) -> dict:
    p_items = [
        {
            "product_id": item.product_id,
            "quantity_ordered": item.quantity_ordered,
            "unit_price_applied": str(item.unit_price_applied),
        }
        for item in items
    ]

    try:
        resp = supabase.rpc(
            "create_order",
            {
                "p_user_id": order_data["user_id"],
                "p_customer_name": order_data["customer_name"],
                "p_customer_phone": order_data["customer_phone"],
                "p_total_amount": str(order_data["total_amount"]),
                "p_items": p_items,
            },
        ).execute()
    except Exception as exc:
        logger.error("Checkout transaction failed: %s", exc)
        raise HTTPException(status_code=500, detail="Checkout failed, order rolled back") from exc

    if not resp.data:
        logger.error("Checkout transaction failed: no data returned")
        raise HTTPException(status_code=500, detail="Checkout failed, order rolled back")

    return resp.data