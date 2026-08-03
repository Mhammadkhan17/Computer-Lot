import os
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")


def _make_product(pid, retail, wholesale, approved=None, min_wholesale=5):
    # approved_price_per_lot defaults to the wholesale value, mirroring the
    # migration-009 backfill for existing products.
    return {
        "id": pid,
        "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "approved_price_per_lot": approved if approved is not None else wholesale,
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


def test_retail_role_at_10_plus_lots_gets_wholesale():
    """Three-tier rule #3: total_lots >= 10 (any role) -> wholesale."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=10, role="retail", total_lots=10)
    assert price == 80.0


def test_wholesale_pending_at_10_plus_lots_gets_wholesale():
    """Three-tier rule #3: wholesale_pending with 10+ lots -> wholesale."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=20, role="wholesale_pending", total_lots=20)
    assert price == 80.0


def test_admin_at_10_plus_lots_gets_wholesale():
    """Three-tier rule #3: admin (no special case) at 10+ lots -> wholesale."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="admin", total_lots=10)
    assert price == 80.0


def test_wholesale_approved_total_below_threshold_gets_approved():
    """Three-tier rule #2: approved user, qty >= min, total < 10 -> approved."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, approved=70.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_approved", total_lots=5)
    assert price == 70.0


def test_wholesale_approved_total_at_threshold_gets_approved():
    """Three-tier rule #2 supersedes rule #3: approved even at 10+ total lots."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, approved=70.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_approved", total_lots=10)
    assert price == 70.0


def test_wholesale_approved_below_per_product_minimum_uses_retail():
    """Three-tier rule #1: qty < minimum_wholesale_lots -> retail, first."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, approved=70.0, min_wholesale=5)
    price = adapter(product, quantity=3, role="wholesale_approved", total_lots=10)
    assert price == 100.0


def test_wholesale_below_total_threshold_uses_retail():
    """Three-tier rule #4: no approved role, total < 10 -> retail."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_pending", total_lots=5)
    assert price == 100.0


def test_wholesale_below_per_product_minimum_uses_retail():
    """Three-tier rule #1 gates ALL tiers: qty < min even with 10+ lots."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=5)
    price = adapter(product, quantity=3, role="retail", total_lots=10)
    assert price == 100.0


def test_retail_role_always_below_threshold_gets_retail():
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=2, role="retail", total_lots=2)
    assert price == 100.0


def test_approved_price_above_wholesale_falls_back_to_wholesale():
    """Mirror of the DB CHECK: approved > wholesale is bad config; the code
    guards so the customer is never overcharged — wholesale wins."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, approved=90.0, min_wholesale=3)
    price = adapter(product, quantity=5, role="wholesale_approved", total_lots=5)
    assert price == 80.0


def test_missing_approved_price_key_falls_back_to_wholesale():
    """Robustness: fixtures / stale payloads without the key (pre-migration)
    resolve the approved tier at the wholesale price."""
    adapter = make_pricing_adapter()
    product = {
        "id": "p1",
        "title": "Product p1",
        "retail_price_per_lot": 100.0,
        "wholesale_price_per_lot": 80.0,
        "minimum_wholesale_lots": 3,
    }
    price = adapter(product, quantity=5, role="wholesale_approved", total_lots=5)
    assert price == 80.0
