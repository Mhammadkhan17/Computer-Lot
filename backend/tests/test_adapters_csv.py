import os
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")


def test_parse_rows_valid_csv():
    from app.adapters.csv_parser import parse_rows

    content = b"title,sku\nWidget A,WA-001\nWidget B,WB-002\n"
    rows = parse_rows(content)
    assert len(rows) == 2
    assert rows[0]["title"] == "Widget A"
    assert rows[0]["sku"] == "WA-001"
    assert rows[1]["title"] == "Widget B"
    assert rows[1]["sku"] == "WB-002"


def test_parse_rows_empty_content():
    from app.adapters.csv_parser import parse_rows

    rows = parse_rows(b"")
    assert rows == []


def test_parse_rows_only_header():
    from app.adapters.csv_parser import parse_rows

    rows = parse_rows(b"title,sku\n")
    assert rows == []


def test_get_headers():
    from app.adapters.csv_parser import get_headers

    headers = get_headers()
    assert "title" in headers
    assert "sku" in headers
    assert "retail_price_per_lot" in headers
    assert "approved_price_per_lot" not in headers


def test_get_template_row():
    from app.adapters.csv_parser import get_template_row

    row = get_template_row()
    assert row["title"] == "Example Product"
    assert row["sku"] == "EX-001"
    assert row["grade"] == "Grade_A"
    assert "approved_price_per_lot" not in row


def test_validate_row_valid():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "grade": "Grade_A",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
        "items_per_lot": "1",
        "minimum_wholesale_lots": "5",
    }
    validated, errs = validate_row(row)
    assert errs == []
    assert validated["title"] == "Widget"
    assert validated["sku"] == "WD-001"
    assert validated["retail_price_per_lot"] == 100.0
    assert validated["wholesale_price_per_lot"] == 80.0
    assert validated["available_stock_lots"] == 10


def test_validate_row_missing_title():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "",
        "sku": "WD-001",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
    }
    validated, errs = validate_row(row)
    assert "Missing title" in errs


def test_validate_row_missing_sku():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "Widget",
        "sku": "",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
    }
    validated, errs = validate_row(row)
    assert "Missing SKU" in errs


def test_validate_row_invalid_grade():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "grade": "Invalid",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
    }
    validated, errs = validate_row(row)
    assert any("Invalid grade" in e for e in errs)


def test_validate_row_negative_price():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "retail_price_per_lot": "-10",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
    }
    validated, errs = validate_row(row)
    assert any("retail price" in e.lower() for e in errs)


def test_validate_row_defaults():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
    }
    validated, errs = validate_row(row)
    assert errs == []
    assert validated["grade"] == "Grade_A"
    assert validated["items_per_lot"] == 1
    assert validated["minimum_wholesale_lots"] == 5


def test_validate_row_empty_returns_errors():
    from app.adapters.row_validator import validate_row

    validated, errs = validate_row({})
    assert len(errs) >= 2
    assert "Missing title" in errs
    assert "Missing SKU" in errs


def test_validate_row_zero_items_per_lot():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
        "items_per_lot": "0",
    }
    validated, errs = validate_row(row)
    assert any("items per lot" in e.lower() for e in errs)


def test_validate_row_negative_min_wholesale():
    from app.adapters.row_validator import validate_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "80.00",
        "available_stock_lots": "10",
        "minimum_wholesale_lots": "-3",
    }
    validated, errs = validate_row(row)
    assert any("minimum wholesale lots" in e.lower() for e in errs)


def test_normalize_row_basic():
    from app.adapters.row_normalizer import normalize_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "retail_price_per_lot": 100.0,
        "wholesale_price_per_lot": 80.0,
        "available_stock_lots": 10,
    }
    result = normalize_row(row)
    assert result["title"] == "Widget"
    assert result["sku"] == "WD-001"
    assert result["images"] is None
    assert result["tags"] is None
    assert result["hardware_specifications"] == {}


def test_normalize_row_with_optional_fields():
    from app.adapters.row_normalizer import normalize_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "retail_price_per_lot": 100.0,
        "wholesale_price_per_lot": 80.0,
        "available_stock_lots": 10,
        "image_urls": "https://example.com/img1.jpg, https://example.com/img2.jpg",
        "tags": "widget, hardware, demo",
        "hardware_specifications": '{"core_count": 8}',
    }
    result = normalize_row(row)
    assert result["images"] == ["https://example.com/img1.jpg", "https://example.com/img2.jpg"]
    assert result["tags"] == ["widget", "hardware", "demo"]
    assert result["hardware_specifications"] == {"core_count": 8}


def test_normalize_row_empty_optional_fields():
    from app.adapters.row_normalizer import normalize_row

    row = {
        "title": "Widget",
        "sku": "WD-001",
        "retail_price_per_lot": 100.0,
        "wholesale_price_per_lot": 80.0,
        "available_stock_lots": 10,
        "image_urls": "",
        "tags": "",
        "hardware_specifications": "",
    }
    result = normalize_row(row)
    assert result["images"] is None
    assert result["tags"] is None
    assert result["hardware_specifications"] == {}


def test_product_inserter_count(monkeypatch):
    mock_supabase = MagicMock()
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table

    from app.adapters.product_inserter import insert_products

    rows = [
        {"title": "Widget A", "sku": "WA-001", "retail_price_per_lot": 100.0, "wholesale_price_per_lot": 80.0, "available_stock_lots": 10},
        {"title": "Widget B", "sku": "WB-002", "retail_price_per_lot": 50.0, "wholesale_price_per_lot": 30.0, "available_stock_lots": 5},
    ]
    count = insert_products(mock_supabase, rows)
    assert count == 2
    assert mock_table.insert.call_count == 2


def test_validate_row_wholesale_above_retail_rejected():
    """Mirror of the products_wholesale_price_check DB CHECK (migration 010)."""
    from app.adapters.row_validator import validate_row

    row = {
        "title": "T",
        "sku": "SKU-1",
        "grade": "Grade_A",
        "retail_price_per_lot": "100.00",
        "wholesale_price_per_lot": "120.00",
        "available_stock_lots": "10",
    }
    _, errs = validate_row(row)
    assert any("wholesale price must be <= retail price" in e.lower() for e in errs)
