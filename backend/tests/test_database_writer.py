import pytest

from app.database_writer import InMemoryDatabaseWriter


def _priced_item(product_id="p1", quantity=5, price=100.0, tier="retail", title="Product p1"):
    return type("PricedItem", (), {
        "product_id": product_id,
        "title": title,
        "quantity_ordered": quantity,
        "unit_price_applied": price,
        "pricing_tier": tier,
    })()


class TestInMemoryDatabaseWriter:
    def test_write_checkout_order_success(self):
        writer = InMemoryDatabaseWriter()
        items = [_priced_item("p1", 3, 100.0)]

        result = writer.write_checkout_order("user-1", "Alice", "+123", items, 300.0)

        assert result.success
        assert result.order_id is not None
        assert result.readable_order_id == 1000
        assert result.total_amount == 300.0
        assert len(result.items) == 1
        assert result.items[0]["product_id"] == "p1"

    def test_write_checkout_order_creates_order_record(self):
        writer = InMemoryDatabaseWriter()
        items = [_priced_item("p1", 3, 100.0)]

        writer.write_checkout_order("user-1", "Alice", "+123", items, 300.0)

        assert len(writer.orders) == 1
        order_id = list(writer.orders.keys())[0]
        assert writer.orders[order_id]["user_id"] == "user-1"
        assert writer.orders[order_id]["status"] == "pending_whatsapp"

    def test_write_checkout_order_decrements_stock(self):
        writer = InMemoryDatabaseWriter()
        writer.stock = {"p1": 10}
        items = [_priced_item("p1", 3, 100.0)]

        writer.write_checkout_order("user-1", "Alice", "+123", items, 300.0)

        assert writer.stock["p1"] == 7

    def test_write_checkout_order_returns_updated_stock(self):
        writer = InMemoryDatabaseWriter()
        writer.stock = {"p1": 10}
        items = [_priced_item("p1", 3, 100.0)]

        result = writer.write_checkout_order("user-1", "Alice", "+123", items, 300.0)

        assert result.updated_stock["p1"] == 7

    def test_fail_decrement_returns_race_condition(self):
        writer = InMemoryDatabaseWriter()
        writer.fail_decrement = True
        items = [_priced_item("p1", 3, 100.0)]

        result = writer.write_checkout_order("user-1", "Alice", "+123", items, 300.0)

        assert not result.success
        assert result.error == "race_condition"

    def test_update_order_status(self):
        writer = InMemoryDatabaseWriter()
        writer.orders["order-1"] = {"user_id": "user-1", "customer_name": "Test"}

        success, user_id, _ = writer.update_order_status("order-1", "completed")

        assert success
        assert user_id == "user-1"
        assert writer.order_statuses["order-1"] == "completed"

    def test_update_order_status_not_found(self):
        writer = InMemoryDatabaseWriter()

        success, user_id, _ = writer.update_order_status("nonexistent", "completed")

        assert not success
        assert user_id is None

    def test_cancel_order_changes_status(self):
        writer = InMemoryDatabaseWriter()
        writer.orders["order-1"] = {"user_id": "user-1", "customer_name": "Test"}

        success, _, _ = writer.update_order_status("order-1", "cancelled")

        assert success
        assert writer.order_statuses["order-1"] == "cancelled"

    def test_restock_product(self):
        writer = InMemoryDatabaseWriter()
        writer.stock = {"p1": 5}

        result = writer.restock_product("p1", 10)

        assert result
        assert writer.stock["p1"] == 15
