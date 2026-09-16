import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

from supabase import Client

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
    def __init__(self, supabase: Client):
        self._supabase = supabase

    def write_checkout_order(
        self,
        user_id: str,
        customer_name: str,
        customer_phone: str,
        priced_items: list,
        total_amount: float,
    ) -> WriteOrderResult:
        try:
            items_json = [
                {
                    "product_id": item.product_id,
                    "quantity_ordered": item.quantity_ordered,
                    "unit_price_applied": float(item.unit_price_applied),
                }
                for item in priced_items
            ]

            result = self._supabase.rpc(
                "create_order",
                {
                    "p_user_id": user_id,
                    "p_customer_name": customer_name,
                    "p_customer_phone": customer_phone,
                    "p_total_amount": float(total_amount),
                    "p_items": items_json,
                },
            ).execute()

            if not result.data:
                return WriteOrderResult(success=False, error="db_error")

            order_data = result.data
            order_id = order_data.get("order_id")
            readable_order_id = order_data.get("readable_order_id")

            item_records = [
                {
                    "product_id": item.product_id,
                    "title": item.title,
                    "quantity_ordered": item.quantity_ordered,
                    "unit_price_applied": item.unit_price_applied,
                }
                for item in priced_items
            ]

            updated_stock: dict[str, int] = {}
            product_ids = list(set(item.product_id for item in priced_items))
            for pid in product_ids:
                stock_resp = (
                    self._supabase.table("products")
                    .select("available_stock_lots")
                    .eq("id", pid)
                    .single()
                    .execute()
                )
                if stock_resp.data:
                    updated_stock[pid] = stock_resp.data["available_stock_lots"]

            return WriteOrderResult(
                success=True,
                order_id=str(order_id),
                readable_order_id=readable_order_id,
                total_amount=total_amount,
                items=item_records,
                updated_stock=updated_stock,
            )
        except Exception as e:
            error_str = str(e).lower()
            if "insufficient stock" in error_str or "race condition" in error_str:
                logger.warning("Checkout transaction rolled back (stock race condition)")
                return WriteOrderResult(success=False, error="race_condition")
            logger.error("Checkout transaction failed: %s", e)
            return WriteOrderResult(success=False, error="db_error")

    def update_order_status(self, order_id: str, new_status: str) -> tuple[bool, str | None, int | None]:
        try:
            result = (
                self._supabase.table("orders")
                .update({"status": new_status})
                .eq("id", order_id)
                .execute()
            )
            if not result.data:
                return False, None, None
            row = result.data[0]
            return True, row.get("user_id"), row.get("readable_order_id")
        except Exception as e:
            logger.error("Order status update failed: %s", e)
            return False, None, None

    def restock_product(self, product_id: str, quantity: int) -> bool:
        try:
            result = self._supabase.rpc(
                "increment_stock_inventory",
                {"row_id": product_id, "steps": quantity},
            ).execute()
            return bool(result.data)
        except Exception as e:
            logger.error("Restock failed for %s: %s", product_id, e)
            return False


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


def get_db_writer(supabase: Client | None = None) -> DatabaseWriter:
    global _writer_instance
    if _writer_instance is None:
        if supabase is None:
            from app.database import get_service_role_supabase
            supabase = get_service_role_supabase()
        _writer_instance = PostgresDatabaseWriter(supabase)
    return _writer_instance
