import logging

import psycopg2
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def _get_db_connection():
    from app.config import settings

    return psycopg2.connect(
        dbname=settings.supabase_db_name,
        user=settings.supabase_db_user,
        password=settings.supabase_db_password,
        host=settings.supabase_db_host,
        port=settings.supabase_db_port,
    )


def run_in_transaction(order_data, items):
    conn = _get_db_connection()
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