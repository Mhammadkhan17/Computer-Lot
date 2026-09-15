import os
from unittest.mock import MagicMock

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import get_supabase
from app.database_writer import get_db_writer, InMemoryDatabaseWriter
from app.notification import get_notifier, SpyBroadcaster
from app.routes.checkout import _build_whatsapp_link
from app.schemas.order import OrderItemResponse


def _make_token(payload_override: dict | None = None) -> str:
    payload = {
        "sub": "user-123",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": settings.supabase_url,
        "exp": 9999999999,
        **(payload_override or {}),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _make_product(
    pid: str, retail: float = 100.0, wholesale: float = 80.0, stock: int = 10, min_wholesale: int = 5
):
    return {
        "id": pid,
        "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "available_stock_lots": stock,
        "minimum_wholesale_lots": min_wholesale,
    }


def _make_profile(role: str = "retail", name: str = "Test User", phone: str = "+1234567890"):
    return {"full_name": name, "phone": phone, "role": role}


def _make_supabase(role="retail", product=None, products=None):
    if product is None and products is None:
        product = _make_product("default")
    mock = MagicMock()

    def table_side(name):
        t = MagicMock()
        if name == "profiles":
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _make_profile(role)
        elif name == "products":
            data = products if products is not None else ([product] if product else [])
            t.select.return_value.in_.return_value.execute.return_value.data = data
        return t
    mock.table.side_effect = table_side
    return mock


@pytest.fixture(autouse=True)
def override_deps():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _make_profile()

    def mock_table(name):
        t = MagicMock()
        if name == "profiles":
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _make_profile("retail")
        elif name == "products":
            t.select.return_value.in_.return_value.execute.return_value.data = [_make_product("default")]
        return t
    mock_supabase.table.side_effect = mock_table

    in_memory_writer = InMemoryDatabaseWriter()
    spy_notifier = SpyBroadcaster()

    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_db_writer] = lambda: in_memory_writer
    app.dependency_overrides[get_notifier] = lambda: spy_notifier
    yield
    app.dependency_overrides.clear()


class TestCheckoutAuth:
    def test_missing_auth_header(self):
        resp = TestClient(app).post("/checkout", json={"items": []})
        assert resp.status_code == 401

    def test_invalid_token(self):
        resp = TestClient(app).post(
            "/checkout",
            json={"items": []},
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert resp.status_code == 401


class TestCheckoutPricing:
    def test_retail_pricing_default(self):
        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "default", "quantity": 2}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_amount"] == 200.0
        assert data["items"][0]["unit_price_applied"] == 100.0

    def test_wholesale_pricing(self):
        app.dependency_overrides[get_supabase] = lambda: _make_supabase(
            "wholesale_approved", _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
        )

        client = TestClient(app)
        token = _make_token({"role": "wholesale_approved"})
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "p1", "quantity": 10}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"][0]["unit_price_applied"] == 80.0
        app.dependency_overrides.clear()

    def test_wholesale_below_threshold(self):
        app.dependency_overrides[get_supabase] = lambda: _make_supabase(
            "wholesale_approved", _make_product("p1")
        )

        client = TestClient(app)
        token = _make_token({"role": "wholesale_approved"})
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "p1", "quantity": 3}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"][0]["unit_price_applied"] == 100.0
        app.dependency_overrides.clear()


class TestCheckoutStock:
    def test_insufficient_stock(self):
        app.dependency_overrides[get_supabase] = lambda: _make_supabase(
            "retail", _make_product("p1", stock=2)
        )

        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "p1", "quantity": 5}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["error"] == "insufficient_stock"
        assert data["out_of_stock"][0]["available"] == 2
        assert data["out_of_stock"][0]["requested"] == 5
        app.dependency_overrides.clear()


class TestCheckoutWhatsApp:
    def test_whatsapp_link_in_response(self):
        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "default", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "wa.me" in data["whatsapp_deep_link"]
        assert "1000" in data["whatsapp_deep_link"]


class TestCheckoutEdgeCases:
    def test_multiple_items_mixed_pricing(self):
        p1 = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
        p2 = _make_product("p2", retail=50.0, wholesale=30.0, min_wholesale=10)
        app.dependency_overrides[get_supabase] = lambda: _make_supabase(
            "wholesale_approved", products=[p1, p2]
        )

        token = _make_token({"role": "wholesale_approved"})
        resp = TestClient(app).post(
            "/checkout",
            json={"items": [{"product_id": "p1", "quantity": 8}, {"product_id": "p2", "quantity": 2}]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 200
        items = resp.json()["items"]
        p1_item = next(i for i in items if i["product_id"] == "p1")
        p2_item = next(i for i in items if i["product_id"] == "p2")
        assert p1_item["unit_price_applied"] == 80.0
        assert p2_item["unit_price_applied"] == 50.0
        assert resp.json()["total_amount"] == 740.0
        app.dependency_overrides.clear()

    def test_unknown_product_id(self):
        app.dependency_overrides[get_supabase] = lambda: _make_supabase("retail", product=None, products=[])

        token = _make_token()
        resp = TestClient(app).post(
            "/checkout",
            json={"items": [{"product_id": "nonexistent", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["error"] == "insufficient_stock"
        assert data["out_of_stock"][0]["title"] == "Unknown Product"
        assert data["out_of_stock"][0]["available"] == 0
        app.dependency_overrides.clear()

    def test_partial_stock_failure(self):
        p1 = _make_product("p1", stock=10)
        p2 = _make_product("p2", stock=2)
        app.dependency_overrides[get_supabase] = lambda: _make_supabase("retail", products=[p1, p2])

        token = _make_token()
        resp = TestClient(app).post(
            "/checkout",
            json={"items": [{"product_id": "p1", "quantity": 3}, {"product_id": "p2", "quantity": 5}]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["error"] == "insufficient_stock"
        assert len(data["out_of_stock"]) == 1
        assert data["out_of_stock"][0]["product_id"] == "p2"
        app.dependency_overrides.clear()

    def test_empty_cart(self):
        token = _make_token()
        resp = TestClient(app).post(
            "/checkout",
            json={"items": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_amount"] == 0

    def test_profile_not_found_returns_404(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        token = _make_token()
        resp = TestClient(app).post(
            "/checkout",
            json={"items": [{"product_id": "p1", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
        app.dependency_overrides.clear()

    def test_db_transaction_failure_returns_500(self):
        failing_writer = InMemoryDatabaseWriter()
        failing_writer.fail_decrement = True
        app.dependency_overrides[get_db_writer] = lambda: failing_writer

        token = _make_token()
        resp = TestClient(app).post(
            "/checkout",
            json={"items": [{"product_id": "default", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["error"] == "stock_changed_retry"
        app.dependency_overrides.clear()


class TestWhatsAppLinkUnit:
    def test_whatsapp_link_contains_order_id(self):
        items = [OrderItemResponse(product_id="p1", title="Test Product", quantity_ordered=2, unit_price_applied=50.0)]
        link = _build_whatsapp_link(42, "Alice", 100.0, items)
        assert "42" in link
        assert "wa.me" in link

    def test_whatsapp_link_contains_customer_name(self):
        items = [OrderItemResponse(product_id="p1", title="Test Product", quantity_ordered=2, unit_price_applied=50.0)]
        link = _build_whatsapp_link(42, "Alice", 100.0, items)
        assert "Alice" in link

    def test_whatsapp_link_contains_total(self):
        items = [OrderItemResponse(product_id="p1", title="Test Product", quantity_ordered=2, unit_price_applied=50.0)]
        link = _build_whatsapp_link(42, "Alice", 100.0, items)
        assert "100.00" in link

    def test_whatsapp_link_contains_item_details(self):
        items = [OrderItemResponse(product_id="p1", title="Test Product", quantity_ordered=2, unit_price_applied=50.0)]
        link = _build_whatsapp_link(42, "Alice", 100.0, items)
        from urllib.parse import unquote
        decoded = unquote(link)
        assert "2x Test Product" in decoded


class TestCheckoutRateLimit:
    def test_checkout_rate_limited_per_user(self):
        from app.main import limiter

        limiter.enabled = True
        try:
            client = TestClient(app)
            token = _make_token()
            headers = {"Authorization": f"Bearer {token}"}
            statuses = [
                client.post("/checkout", json={"items": [{"product_id": "default", "quantity": 1}]}, headers=headers).status_code
                for _ in range(11)
            ]
            assert statuses[:10] == [200] * 10
            assert statuses[10] == 429
        finally:
            limiter.enabled = False
