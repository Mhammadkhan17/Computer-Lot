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
from app.schemas.order import OrderItemResponse, StockErrorItem


def _make_token(payload_override=None):
    payload = {
        "sub": "user-123",
        "role": "retail",
        "aud": "authenticated",
        "exp": 9999999999,
        **(payload_override or {}),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _make_profile(role="retail", name="Test User", phone="+1234567890"):
    return {"full_name": name, "phone": phone, "role": role}


def _make_product(pid, retail=100.0, wholesale=80.0, stock=10, min_wholesale=5):
    return {
        "id": pid,
        "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "available_stock_lots": stock,
        "minimum_wholesale_lots": min_wholesale,
    }


@pytest.fixture(autouse=True)
def override_deps():
    mock_supabase = MagicMock()

    def mock_table(name):
        t = MagicMock()
        if name == "profiles":
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _make_profile()
        elif name == "products":
            t.select.return_value.in_.return_value.execute.return_value.data = [_make_product("default")]
        return t

    mock_supabase.table.side_effect = mock_table
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
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


class TestCheckoutRouteIntegration:
    @patch("app.routes.checkout.resolve_all_items")
    @patch("app.routes.checkout.check_availability")
    @patch("app.routes.checkout.run_in_transaction")
    @patch("app.routes.checkout.build_order_link")
    @patch("app.routes.checkout.broadcast_order_update")
    def test_successful_checkout(
        self, mock_broadcast, mock_link, mock_txn, mock_stock, mock_resolve
    ):
        mock_resolve.return_value = [
            OrderItemResponse(
                product_id="default",
                title="Product default",
                quantity_ordered=2,
                unit_price_applied=100.0,
            )
        ]
        mock_stock.return_value = []
        mock_txn.return_value = {
            "order_id": "order-uuid",
            "readable_order_id": 1001,
            "commit": True,
        }
        mock_link.return_value = "https://wa.me/1234567890?text=Test"

        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "default", "quantity": 2}]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["readable_order_id"] == 1001
        assert data["total_amount"] == 200.0
        assert "wa.me" in data["whatsapp_deep_link"]

    def test_checkout_returns_stock_errors(self):
        from app.adapters import stock as stock_adapter
        from app.adapters import pricing as pricing_adapter

        with patch.object(stock_adapter, "check_availability", return_value=[StockErrorItem(product_id="p1", title="Product p1", available=2, requested=5)]):
            with patch.object(pricing_adapter, "resolve_all_items", return_value=[]):
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
        assert len(data["out_of_stock"]) == 1

    def test_profile_not_found_returns_404(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
        app.dependency_overrides[get_supabase] = lambda: mock_supabase

        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "p1", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
        app.dependency_overrides.clear()