import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

import psycopg2

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class WriteOrderResult:
    success: bool
    order_id: str | None = None
    readable_order_id: int | None = None
    total_amount: float = 0.0
    items: list[dict] = field(default_factory=list)
    updated_stock: dict[str, int] = field(default_factory=dict)
    error: Literal["race_condition", "db_error", None] = None


class DatabaseWriter(ABC):
    @abstractmethod
    def write_checkout_order(
        self,
        user_id: str,
        customer_name: str,
        customer_phone: str,
        priced_items: list,
        total_amount: float,
    ) -> WriteOrderResult:
        ...

    @abstractmethod
    def update_order_status(self, order_id: str, new_status: str) -> tuple[bool, str | None, int | None]:
        ...

    @abstractmethod
    def restock_product(self, product_id: str, quantity: int) -> bool:
        ...


class PostgresDatabaseWriter(DatabaseWriter):
    def _get_connection(self) -> psycopg2.extensions.connection:
        return psycopg2.connect(
            dbname=settings.supabase_db_name,
            user=settings.supabase_db_user,
            password=settings.supabase_db_password,
            host=settings.supabase_db_host,
            port=settings.supabase_db_port,
        )

    def write_checkout_order(
        self,
        user_id: str,
        customer_name: str,
        customer_phone: str,
        priced_items: list,
        total_amount: float,
    ) -> WriteOrderResult:
        conn = self._get_connection()
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

                    item_records = []
                    for item in priced_items:
                        cur.execute(
                            """
                            INSERT INTO order_items (order_id, product_id, quantity_ordered, unit_price_applied)
                            VALUES (%s, %s, %s, %s)
                            """,
                            (order_id, item.product_id, item.quantity_ordered, item.unit_price_applied),
                        )
                        item_records.append({
                            "product_id": item.product_id,
                            "title": item.title,
                            "quantity_ordered": item.quantity_ordered,
                            "unit_price_applied": item.unit_price_applied,
                        })

                    for item in priced_items:
                        cur.callproc("decrement_stock_inventory", (item.product_id, item.quantity_ordered))
                        dec_result = cur.fetchone()
                        if not dec_result or not dec_result[0]:
                            raise RuntimeError(
                                f"Failed to decrement stock for product {item.product_id}"
                            )

            updated_stock: dict[str, int] = {}
            conn2 = self._get_connection()
            try:
                with conn2:
                    with conn2.cursor() as cur2:
                        product_ids = list(set(item.product_id for item in priced_items))
                        for pid in product_ids:
                            cur2.execute(
                                "SELECT available_stock_lots FROM products WHERE id = %s",
                                (pid,),
                            )
                            row = cur2.fetchone()
                            if row:
                                updated_stock[pid] = row[0]
            finally:
                conn2.close()

            return WriteOrderResult(
                success=True,
                order_id=str(order_id),
                readable_order_id=readable_order_id,
                total_amount=total_amount,
                items=item_records,
                updated_stock=updated_stock,
            )
        except RuntimeError:
            logger.warning("Checkout transaction rolled back (race condition on stock)")
            return WriteOrderResult(success=False, error="race_condition")
        except Exception as e:
            logger.error("Checkout transaction failed: %s", e)
            return WriteOrderResult(success=False, error="db_error")
        finally:
            conn.close()

    def update_order_status(self, order_id: str, new_status: str) -> tuple[bool, str | None, int | None]:
        conn = self._get_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE orders SET status = %s WHERE id = %s RETURNING id, user_id, readable_order_id",
                        (new_status, order_id),
                    )
                    row = cur.fetchone()
                    if not row:
                        return False, None, None
                    return True, row[1], row[2]
        except Exception as e:
            logger.error("Order status update failed: %s", e)
            return False, None, None
        finally:
            conn.close()

    def restock_product(self, product_id: str, quantity: int) -> bool:
        conn = self._get_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.callproc("increment_stock_inventory", (product_id, quantity))
                    result = cur.fetchone()
                    return bool(result and result[0])
        except Exception as e:
            logger.error("Restock failed for %s: %s", product_id, e)
            return False
        finally:
            conn.close()


class InMemoryDatabaseWriter(DatabaseWriter):
    def __init__(self):
        self.orders: dict = {}
        self.order_items: dict[str, list] = {}
        self.stock: dict[str, int] = {}
        self.order_statuses: dict[str, str] = {}
        self.next_readable_id = 1000
        self.fail_decrement = False

    def write_checkout_order(
        self,
        user_id: str,
        customer_name: str,
        customer_phone: str,
        priced_items: list,
        total_amount: float,
    ) -> WriteOrderResult:
        if self.fail_decrement:
            return WriteOrderResult(success=False, error="race_condition")

        order_id = f"order-{self.next_readable_id}"
        readable_id = self.next_readable_id
        self.next_readable_id += 1

        item_records = []
        for item in priced_items:
            item_records.append({
                "product_id": item.product_id,
                "title": item.title,
                "quantity_ordered": item.quantity_ordered,
                "unit_price_applied": item.unit_price_applied,
            })
            current_stock = self.stock.get(item.product_id, 100)
            self.stock[item.product_id] = current_stock - item.quantity_ordered

        self.orders[order_id] = {
            "user_id": user_id,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "total_amount": total_amount,
            "status": "pending_whatsapp",
        }
        self.order_items[order_id] = item_records
        self.order_statuses[order_id] = "pending_whatsapp"

        updated_stock = {}
        for item in priced_items:
            updated_stock[item.product_id] = self.stock.get(item.product_id, 100)

        return WriteOrderResult(
            success=True,
            order_id=order_id,
            readable_order_id=readable_id,
            total_amount=total_amount,
            items=item_records,
            updated_stock=updated_stock,
        )

    def update_order_status(self, order_id: str, new_status: str) -> tuple[bool, str | None, int | None]:
        if order_id not in self.orders:
            return False, None, None
        self.order_statuses[order_id] = new_status
        return True, self.orders[order_id]["user_id"], self.orders[order_id].get("readable_order_id")

    def restock_product(self, product_id: str, quantity: int) -> bool:
        current = self.stock.get(product_id, 100)
        self.stock[product_id] = current + quantity
        return True


_writer_instance: DatabaseWriter | None = None


def get_db_writer() -> DatabaseWriter:
    global _writer_instance
    if _writer_instance is None:
        _writer_instance = PostgresDatabaseWriter()
    return _writer_instance
