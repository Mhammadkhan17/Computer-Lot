import pytest

from app.pricing import compute_line_item_prices, PricedItem


def _product(pid, retail=100.0, wholesale=80.0, min_wholesale=5):
    return {
        "id": pid,
        "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "minimum_wholesale_lots": min_wholesale,
    }


def _profile(role="retail"):
    return {"full_name": "Test User", "phone": "+123", "role": role}


class TestPricingEngine:
    def test_retail_user_gets_retail_prices(self):
        items = [{"product_id": "p1", "quantity": 5}]
        products = {"p1": _product("p1")}
        result = compute_line_item_prices(items, _profile("retail"), products)
        assert result.items[0].unit_price_applied == 100.0
        assert result.items[0].pricing_tier == "retail"
        assert result.total_amount == 500.0

    def test_wholesale_pending_gets_retail(self):
        items = [{"product_id": "p1", "quantity": 10}]
        products = {"p1": _product("p1")}
        result = compute_line_item_prices(items, _profile("wholesale_pending"), products)
        assert result.items[0].unit_price_applied == 100.0
        assert result.items[0].pricing_tier == "retail"

    def test_wholesale_below_global_threshold_all_retail(self):
        items = [{"product_id": "p1", "quantity": 5}]
        products = {"p1": _product("p1")}
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        assert result.items[0].unit_price_applied == 100.0
        assert result.items[0].pricing_tier == "retail"
        assert result.total_lots == 5

    def test_wholesale_meets_global_and_per_product(self):
        items = [{"product_id": "p1", "quantity": 10}]
        products = {"p1": _product("p1", min_wholesale=3)}
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        assert result.items[0].unit_price_applied == 80.0
        assert result.items[0].pricing_tier == "wholesale"

    def test_wholesale_meets_global_below_per_product_min(self):
        items = [{"product_id": "p1", "quantity": 10}]
        products = {"p1": _product("p1", min_wholesale=15)}
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        assert result.items[0].unit_price_applied == 100.0
        assert result.items[0].pricing_tier == "retail"

    def test_mixed_cart_some_wholesale_some_retail(self):
        items = [
            {"product_id": "p1", "quantity": 8},
            {"product_id": "p2", "quantity": 2},
        ]
        products = {
            "p1": _product("p1", min_wholesale=3),
            "p2": _product("p2", retail=50.0, wholesale=30.0, min_wholesale=10),
        }
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        assert result.items[0].pricing_tier == "wholesale"
        assert result.items[0].unit_price_applied == 80.0
        assert result.items[1].pricing_tier == "retail"
        assert result.items[1].unit_price_applied == 50.0
        assert result.total_amount == 740.0

    def test_empty_cart(self):
        result = compute_line_item_prices([], _profile("retail"), {})
        assert result.items == []
        assert result.total_amount == 0.0
        assert result.total_lots == 0

    def test_exact_per_product_min_gets_wholesale(self):
        items = [{"product_id": "p1", "quantity": 5}, {"product_id": "p2", "quantity": 5}]
        products = {
            "p1": _product("p1", min_wholesale=5),
            "p2": _product("p2", retail=50.0, wholesale=30.0, min_wholesale=3),
        }
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        assert result.items[0].unit_price_applied == 80.0
        assert result.items[0].pricing_tier == "wholesale"

    def test_all_below_per_product_min_all_retail(self):
        items = [
            {"product_id": "p1", "quantity": 10},
            {"product_id": "p2", "quantity": 10},
        ]
        products = {
            "p1": _product("p1", min_wholesale=15),
            "p2": _product("p2", retail=50.0, wholesale=30.0, min_wholesale=12),
        }
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        for item in result.items:
            assert item.pricing_tier == "retail"

    def test_all_meet_per_product_min_all_wholesale(self):
        items = [
            {"product_id": "p1", "quantity": 5},
            {"product_id": "p2", "quantity": 5},
        ]
        products = {
            "p1": _product("p1", min_wholesale=3),
            "p2": _product("p2", retail=50.0, wholesale=30.0, min_wholesale=4),
        }
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        for item in result.items:
            assert item.pricing_tier == "wholesale"

    def test_admin_role_gets_retail_prices(self):
        items = [{"product_id": "p1", "quantity": 10}]
        products = {"p1": _product("p1")}
        result = compute_line_item_prices(items, _profile("admin"), products)
        assert result.items[0].unit_price_applied == 100.0
        assert result.items[0].pricing_tier == "retail"

    def test_single_item_at_global_threshold(self):
        items = [{"product_id": "p1", "quantity": 10}]
        products = {"p1": _product("p1", min_wholesale=10)}
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        assert result.items[0].pricing_tier == "wholesale"
        assert result.total_lots == 10

    def test_single_item_below_min_wholesale(self):
        items = [{"product_id": "p1", "quantity": 4}]
        products = {"p1": _product("p1", min_wholesale=5)}
        result = compute_line_item_prices(items, _profile("wholesale_approved"), products)
        assert result.items[0].pricing_tier == "retail"
        assert result.items[0].unit_price_applied == 100.0
