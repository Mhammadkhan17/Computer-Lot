import os
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")


def _make_product(pid, stock, title="Widget"):
    return {"id": pid, "title": title, "available_stock_lots": stock}


def make_stock_adapter():
    from app.adapters.stock import check_availability

    return check_availability


def test_clean_returns_empty_list():
    adapter = make_stock_adapter()
    products = [_make_product("p1", 10)]
    quantities = [{"product_id": "p1", "quantity": 3}]
    result = adapter(products, quantities)
    assert result == []


def test_insufficient_stock_returns_error_for_one_item():
    adapter = make_stock_adapter()
    products = [_make_product("p1", 2)]
    quantities = [{"product_id": "p1", "quantity": 5}]
    result = adapter(products, quantities)
    assert len(result) == 1
    assert result[0].product_id == "p1"
    assert result[0].title == "Widget"
    assert result[0].available == 2
    assert result[0].requested == 5


def test_insufficient_stock_returns_error_for_multiple_items():
    adapter = make_stock_adapter()
    p1 = _make_product("p1", 10)
    p2 = _make_product("p2", 2)
    products = [p1, p2]
    quantities = [
        {"product_id": "p1", "quantity": 3},
        {"product_id": "p2", "quantity": 5},
    ]
    result = adapter(products, quantities)
    assert len(result) == 1
    assert result[0].product_id == "p2"


def test_missing_product_returns_unknown_product_error():
    adapter = make_stock_adapter()
    products = [_make_product("p1", 10)]
    quantities = [{"product_id": "nonexistent", "quantity": 1}]
    result = adapter(products, quantities)
    assert len(result) == 1
    assert result[0].title == "Unknown Product"
    assert result[0].available == 0
    assert result[0].requested == 1


def test_zero_stock_returns_error():
    adapter = make_stock_adapter()
    products = [_make_product("p1", 0)]
    quantities = [{"product_id": "p1", "quantity": 1}]
    result = adapter(products, quantities)
    assert len(result) == 1
    assert result[0].available == 0


def test_exact_stock_match_is_clean():
    adapter = make_stock_adapter()
    products = [_make_product("p1", 5)]
    quantities = [{"product_id": "p1", "quantity": 5}]
    result = adapter(products, quantities)
    assert result == []