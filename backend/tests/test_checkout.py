import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "true")

import jwt
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import get_supabase
from app.routes.checkout import _build_whatsapp_link
from app.schemas.order import OrderItemResponse


def _make_token(payload_override: dict | None = None) -> str:
    payload = {
        "sub": "user-123",
        "role": "retail",
        "aud": "authenticated",
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

    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    yield
    app.dependency_overrides.clear()


def _mock_db(mock_conn, readable_order_id=1001, dec_results=None):
    mock_cursor = MagicMock()
    if dec_results is None:
        dec_results = [(True,)]
    mock_cursor.fetchone.side_effect = [
        ("order-uuid", readable_order_id),
        *dec_results,
    ]
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    return mock_conn


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
    @patch("app.routes.checkout._get_db_connection")
    def test_retail_pricing_default(self, mock_get_db):
        mock_conn = MagicMock()
        _mock_db(mock_conn, 1001)
        mock_get_db.return_value = mock_conn

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

    @patch("app.routes.checkout._get_db_connection")
    def test_wholesale_pricing(self, mock_get_db):
        app.dependency_overrides[get_supabase] = lambda: _make_supabase("wholesale_approved", _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3))

        mock_conn = MagicMock()
        _mock_db(mock_conn, 1002)
        mock_get_db.return_value = mock_conn

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

    @patch("app.routes.checkout._get_db_connection")
    def test_wholesale_below_threshold(self, mock_get_db):
        app.dependency_overrides[get_supabase] = lambda: _make_supabase("wholesale_approved", _make_product("p1"))

        mock_conn = MagicMock()
        _mock_db(mock_conn, 1003)
        mock_get_db.return_value = mock_conn

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
        app.dependency_overrides[get_supabase] = lambda: _make_supabase("retail", _make_product("p1", stock=2))

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
    @patch("app.routes.checkout._get_db_connection")
    def test_whatsapp_link_in_response(self, mock_get_db):
        mock_conn = MagicMock()
        _mock_db(mock_conn, 2001)
        mock_get_db.return_value = mock_conn

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
        assert "2001" in data["whatsapp_deep_link"]


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


class TestCheckoutEdgeCases:
    @patch("app.routes.checkout._get_db_connection")
    def test_multiple_items_mixed_pricing(self, mock_get_db):
        p1 = _make_product("p1", retail=100.0, wholesale=80.0, min_wholesale=3)
        p2 = _make_product("p2", retail=50.0, wholesale=30.0, min_wholesale=10)
        app.dependency_overrides[get_supabase] = lambda: _make_supabase(
            "wholesale_approved", products=[p1, p2]
        )

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [
            ("order-uuid", 2002),
            (True,),
            (True,),
        ]
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_get_db.return_value = mock_conn

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

    @patch("app.routes.checkout._get_db_connection")
    def test_partial_stock_failure(self, mock_get_db):
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

    @patch("app.routes.checkout._get_db_connection")
    def test_empty_cart(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [("order-uuid", 9999)]
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_get_db.return_value = mock_conn

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

    @patch("app.routes.checkout._get_db_connection")
    def test_db_transaction_failure_returns_500(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = RuntimeError("Connection lost")
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_get_db.return_value = mock_conn

        token = _make_token()
        resp = TestClient(app).post(
            "/checkout",
            json={"items": [{"product_id": "default", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 500
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
