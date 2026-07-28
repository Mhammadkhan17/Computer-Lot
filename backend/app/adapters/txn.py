import logging

from fastapi import HTTPException

logger = logging.getLogger(__name__)

from app.adapters.db import get_raw_connection


def run_in_transaction(order_data, items):
    conn = get_raw_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO orders (user_id, customer_name, customer_phone, total_amount)
            VALUES (%s, %s, %s, %s)
            RETURNING id, readable_order_id
            """,
            (
                order_data["user_id"],
                order_data["customer_name"],
                order_data["customer_phone"],
                order_data["total_amount"],
            ),
        )
        order_row = cur.fetchone()
        order_id = order_row[0]
        readable_order_id = order_row[1]

        for item in items:
            cur.execute(
                """
                INSERT INTO order_items (order_id, product_id, quantity_ordered, unit_price_applied)
                VALUES (%s, %s, %s, %s)
                """,
                (order_id, item["product_id"], item["quantity_ordered"], item["unit_price_applied"]),
            )

        for item in items:
            cur.callproc("decrement_stock_inventory", (item["product_id"], item["quantity_ordered"]))
            dec_result = cur.fetchone()
            if not dec_result or not dec_result[0]:
                raise RuntimeError(
                    f"Failed to decrement stock for product {item['product_id']}"
                )

        conn.commit()
        return {
            "order_id": str(order_id),
            "readable_order_id": readable_order_id,
            "commit": True,
        }
    except Exception as e:
        logger.error("Checkout transaction failed: %s", e)
        conn.rollback()
        raise HTTPException(
            status_code=500,
            detail="Checkout failed, order rolled back",
        )
    finally:
        conn.close()