import os
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
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
    """qty < min -> retail, regardless of role."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0)
    price = adapter(product, quantity=2, role="retail", total_lots=2)
    assert price == 100.0


def test_wholesale_pricing_applies():
    """qty >= min and total_lots >= 10 -> wholesale."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_approved", total_lots=10)
    assert price == 80.0


def test_retail_role_at_10_plus_lots_gets_wholesale():
    """total_lots >= 10 (any role) -> wholesale price."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=10, role="retail", total_lots=10)
    assert price == 80.0


def test_wholesale_pending_at_10_plus_lots_gets_wholesale():
    """total_lots >= 10 (any role) -> wholesale price."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=20, role="wholesale_pending", total_lots=20)
    assert price == 80.0


def test_admin_at_10_plus_lots_gets_wholesale():
    """Admin follows the uniform rule (no special case)."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="admin", total_lots=10)
    assert price == 80.0


def test_wholesale_below_total_threshold_uses_retail():
    """total_lots < 10 -> retail, even for wholesale-eligible products."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
    price = adapter(product, quantity=10, role="wholesale_pending", total_lots=5)
    assert price == 100.0


def test_wholesale_below_per_product_minimum_uses_retail():
    """qty < minimum_wholesale_lots gates ALL tiers -> retail, even with 10+ lots."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=5)
    price = adapter(product, quantity=3, role="retail", total_lots=10)
    assert price == 100.0


def test_retail_role_always_below_threshold_gets_retail():
    """No wholesale eligibility -> retail."""
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=1)
    price = adapter(product, quantity=2, role="retail", total_lots=2)
    assert price == 100.0


def test_wholesale_above_retail_stale_clamped_to_retail():
    """Defensive: stale payload with wholesale > retail never overcharges.

    The DB CHECK (products_wholesale_price_check) enforces wholesale <= retail,
    but this guard handles a stale in-memory product dict where that invariant
    was violated. min(wholesale, retail) ensures retail wins.
    """
    adapter = make_pricing_adapter()
    product = _make_product("p1", retail=100.0, wholesale=120.0, min_wholesale=3)
    price = adapter(product, quantity=5, role="retail", total_lots=10)
    assert price == 100.0
