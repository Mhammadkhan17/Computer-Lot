import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")

import jwt
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import get_service_role_supabase, get_supabase, get_user_supabase
from app.schemas.order import OrderItemResponse, StockErrorItem


def _make_token(payload_override=None):
    payload = {
        "sub": "user-123",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": settings.supabase_url,
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


def _mock_supabase_client():
    mock_supabase = MagicMock()

    def mock_table(name):
        t = MagicMock()
        if name == "profiles":
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _make_profile()
        elif name == "products":
            t.select.return_value.in_.return_value.execute.return_value.data = [_make_product("00000000-0000-0000-0000-000000000001")]
        return t

    mock_supabase.table.side_effect = mock_table
    return mock_supabase


@pytest.fixture(autouse=True)
def override_deps():
    mock_supabase = _mock_supabase_client()
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_service_role_supabase] = lambda: mock_supabase
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


class TestCheckoutInputValidation:
    def _post(self, payload):
        return TestClient(app).post(
            "/checkout",
            json=payload,
            headers={"Authorization": f"Bearer {_make_token()}"},
        )

    def test_empty_items_rejected(self):
        assert self._post({"items": []}).status_code == 422

    def test_too_many_items_rejected(self):
        items = [{"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 1}] * 51
        assert self._post({"items": items}).status_code == 422

    def test_zero_quantity_rejected(self):
        items = [{"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 0}]
        assert self._post({"items": items}).status_code == 422

    def test_quantity_above_max_rejected(self):
        items = [{"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 1001}]
        assert self._post({"items": items}).status_code == 422

    def test_non_uuid_product_id_rejected(self):
        items = [{"product_id": "not-a-uuid", "quantity": 1}]
        resp = self._post({"items": items})
        assert resp.status_code == 422
        assert "product_id" in resp.text


class TestCheckoutRouteIntegration:
    @patch("app.adapters.order_intake.resolve_all_items")
    @patch("app.adapters.order_intake.check_availability")
    @patch("app.adapters.order_intake.run_in_transaction")
    @patch("app.adapters.order_intake.build_order_link")
    @patch("app.adapters.order_intake.broadcast_order_update")
    def test_successful_checkout(
        self, mock_broadcast, mock_link, mock_txn, mock_stock, mock_resolve
    ):
        mock_resolve.return_value = [
            OrderItemResponse(
                product_id="00000000-0000-0000-0000-000000000001",
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
            json={"items": [{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 2}]},
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

        with patch.object(stock_adapter, "check_availability", return_value=[StockErrorItem(product_id="00000000-0000-0000-0000-000000000002", title="Product p1", available=2, requested=5)]):
            with patch.object(pricing_adapter, "resolve_all_items", return_value=[]):
                client = TestClient(app)
                token = _make_token()
                resp = client.post(
                    "/checkout",
                    json={"items": [{"product_id": "00000000-0000-0000-0000-000000000002", "quantity": 5}]},
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert resp.status_code == 400
        data = resp.json()
        assert data["error"] == "insufficient_stock"
        assert len(data["out_of_stock"]) == 1

    @patch("app.adapters.order_intake.resolve_all_items")
    @patch("app.adapters.order_intake.check_availability")
    @patch("app.adapters.order_intake.run_in_transaction")
    def test_checkout_maps_rpc_insufficient_stock_to_400(self, mock_txn, mock_stock, mock_resolve):
        from app.adapters.stock import InsufficientStockError

        mock_stock.return_value = []
        mock_resolve.return_value = []
        mock_txn.side_effect = InsufficientStockError(
            [StockErrorItem(product_id="00000000-0000-0000-0000-000000000002", title="Product p1", available=2, requested=5)]
        )

        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "00000000-0000-0000-0000-000000000002", "quantity": 5}]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 400
        data = resp.json()
        assert data["error"] == "insufficient_stock"
        assert data["out_of_stock"][0]["product_id"] == "00000000-0000-0000-0000-000000000002"

    @patch("app.routes.checkout.create_order")
    def test_unexpected_error_returns_generic_500(self, mock_create):
        mock_create.side_effect = RuntimeError("secret internal detail: db password exposed")

        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 500
        data = resp.json()
        assert data["error"] == "internal_error"
        assert "secret" not in resp.text
        assert "password" not in resp.text

    def test_profile_not_found_returns_404(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase

        client = TestClient(app)
        token = _make_token()
        resp = client.post(
            "/checkout",
            json={"items": [{"product_id": "00000000-0000-0000-0000-000000000002", "quantity": 1}]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
        app.dependency_overrides.clear()


class TestCheckoutOpenOrderCap:
    def test_cap_raises_when_at_limit(self):
        from fastapi import HTTPException

        from app.adapters.order_intake import _assert_open_order_cap

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "x"}
        ] * 20

        with pytest.raises(HTTPException) as exc:
            _assert_open_order_cap(mock_supabase, "user-123")
        assert exc.value.status_code == 400
        assert "20" in exc.value.detail

    def test_cap_passes_below_limit(self):
        from app.adapters.order_intake import _assert_open_order_cap

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "x"}
        ] * 5
        _assert_open_order_cap(mock_supabase, "user-123")

    def test_checkout_returns_400_when_cap_exceeded(self):
        from fastapi import HTTPException

        from app.adapters import order_intake

        with patch.object(
            order_intake,
            "_assert_open_order_cap",
            side_effect=HTTPException(status_code=400, detail="Too many open pending orders"),
        ):
            client = TestClient(app)
            token = _make_token()
            resp = client.post(
                "/checkout",
                json={"items": [{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 1}]},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 400
        assert "Too many open pending orders" in resp.json()["detail"]


class TestCheckoutRateLimit:
    def test_checkout_rate_limited_per_user(self):
        from app.main import limiter

        limiter.enabled = True
        try:
            with (
                patch("app.adapters.order_intake.resolve_all_items", return_value=[]),
                patch("app.adapters.order_intake.check_availability", return_value=[]),
                patch("app.adapters.order_intake.run_in_transaction", return_value={"order_id": "o", "readable_order_id": 1, "commit": True}),
                patch("app.adapters.order_intake.build_order_link", return_value="https://wa.me/123"),
                patch("app.adapters.order_intake.broadcast_order_update"),
            ):
                client = TestClient(app)
                token = _make_token()
                headers = {"Authorization": f"Bearer {token}"}
                statuses = [
                    client.post("/checkout", json={"items": [{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 1}]}, headers=headers).status_code
                    for _ in range(11)
                ]
                assert statuses[:10] == [200] * 10
                assert statuses[10] == 429
        finally:
            limiter.enabled = False
