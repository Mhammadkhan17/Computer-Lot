import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")

from app.schemas.order import OrderItemResponse


def make_whatsapp_adapter():
    from app.adapters.whatsapp import build_order_link

    return build_order_link


def _make_item(product_id, title, quantity, unit_price):
    return OrderItemResponse(
        product_id=product_id,
        title=title,
        quantity_ordered=quantity,
        unit_price_applied=unit_price,
    )


def test_link_contains_order_id():
    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 2, 50.0)]
    link = adapter(readable_order_id=42, customer_name="Alice", total_amount=100.0, items=items)
    assert "42" in link


def test_link_contains_customer_name():
    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 2, 50.0)]
    link = adapter(readable_order_id=42, customer_name="Alice", total_amount=100.0, items=items)
    assert "Alice" in link


def test_link_contains_total_amount():
    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 2, 50.0)]
    link = adapter(readable_order_id=42, customer_name="Alice", total_amount=100.0, items=items)
    assert "100.00" in link


def test_link_contains_item_details():
    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 2, 50.0)]
    link = adapter(readable_order_id=42, customer_name="Alice", total_amount=100.0, items=items)
    assert "2x Widget" in link or "Widget" in link


def test_link_uses_whatsapp_url():
    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 2, 50.0)]
    link = adapter(readable_order_id=42, customer_name="Alice", total_amount=100.0, items=items)
    assert "wa.me" in link


def test_link_uses_configured_merchant_phone(monkeypatch):
    from app import config as config_module
    original = config_module.settings.merchant_phone
    monkeypatch.setattr(config_module.settings, "merchant_phone", "5551234")

    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 1, 50.0)]
    link = adapter(readable_order_id=1, customer_name="Bob", total_amount=50.0, items=items)
    assert "5551234" in link
    monkeypatch.setattr(config_module.settings, "merchant_phone", original)


def test_link_sanitizes_customer_name_newlines():
    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 1, 50.0)]
    link = adapter(
        readable_order_id=1,
        customer_name="Alice\nBcc: evil@example.com",
        total_amount=50.0,
        items=items,
    )
    assert "Bcc:" not in link
    assert "Alice" in link


def test_link_sanitizes_title_control_chars():
    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget\t\nMalware", 1, 50.0)]
    link = adapter(readable_order_id=1, customer_name="Alice", total_amount=50.0, items=items)
    assert "\t" not in link
    assert "\n" not in link
    assert "Widget%20Malware" in link


def test_link_contains_receipt_url(monkeypatch):
    from app import config as config_module
    original = config_module.settings.frontend_url
    monkeypatch.setattr(config_module.settings, "frontend_url", "http://localhost:3000")

    adapter = make_whatsapp_adapter()
    items = [_make_item("p1", "Widget", 1, 50.0)]
    link = adapter(readable_order_id=99, customer_name="Bob", total_amount=50.0, items=items)
    assert "receipts/99" in link
    monkeypatch.setattr(config_module.settings, "frontend_url", original)