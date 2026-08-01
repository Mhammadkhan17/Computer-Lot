import os
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")


def _make_product(pid, retail, wholesale, min_wholesale=5):
    return {
        "id": pid,
        "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "minimum_wholesale_lots": min_wholesale,
    }


def make_pricing_adapter():
    from app.adapters.pricing import resolve_price

    return resolve_price


def test_retail_pricing_default():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0)
    price = adapter(product, quantity=2, role="retail", total_lots=2)
    assert price == 100.0


def test_wholesale_pricing_applies():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_approved", total_lots=10)
    assert price == 80.0


def test_wholesale_below_total_threshold_uses_retail():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_approved", total_lots=5)
    assert price == 100.0


def test_wholesale_below_per_product_minimum_uses_retail():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=5)
    price = adapter(product, quantity=3, role="wholesale_approved", total_lots=10)
    assert price == 100.0


def test_retail_role_always_gets_retail():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=10, role="retail", total_lots=10)
    assert price == 100.0


def test_wholesale_pending_role_always_gets_retail():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=20, role="wholesale_pending", total_lots=20)
    assert price == 100.0


def test_admin_role_gets_retail():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="admin", total_lots=10)
    assert price == 100.0


def test_wholesale_pending_above_threshold_still_retail():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_pending", total_lots=10)
    assert price == 100.0