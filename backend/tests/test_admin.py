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
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import get_service_role_supabase, get_supabase, get_user_supabase
from app.utils.ws_manager import get_manager


def _make_token(payload_override: dict | None = None) -> str:
    # The JWT role claim must be "authenticated" (L-R3-1 fail-closed local
    # verification). Admin authority comes from the profiles table row that
    # the route fetches via get_user_supabase, not from the JWT role claim.
    payload = {
        "sub": "admin-user",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": settings.supabase_url,
        "exp": 9999999999,
        **(payload_override or {}),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _make_profile(role: str = "admin", name: str = "Admin", phone: str = "+1234567890"):
    return {"id": "admin-user", "full_name": name, "phone": phone, "role": role}


mock_supabase: MagicMock | None = None
products_table_mock: MagicMock | None = None

profile_store: dict[str, dict] = {
    "admin-user": _make_profile("admin"),
    "retail-user": _make_profile("retail", name="Retail"),
    "wholesale-user": _make_profile("wholesale_approved", name="Wholesale"),
}


@pytest.fixture(autouse=True)
def override_deps():
    global mock_supabase, products_table_mock
    mock_supabase = MagicMock()
    products_table_mock = MagicMock()

    def rpc_side(function_name, params):
        r = MagicMock()
        if function_name in ("admin_set_profile_role", "admin_cancel_order"):
            if function_name == "admin_cancel_order":
                r.execute.return_value.data = {
                    "status": "cancelled",
                    "order_id": "order-789",
                    "readable_order_id": 42,
                    "user_id": "retail-user",
                }
            else:
                r.execute.return_value.data = {"status": "updated"}
        elif function_name == "expire_pending_orders":
            r.execute.return_value.data = {"expired": 3}
        return r

    mock_supabase.rpc.side_effect = rpc_side

    def mock_table(name):
        t = MagicMock()
        if name == "products":
            return products_table_mock
        if name == "profiles":
            def select_side(*args, **kwargs):
                q = MagicMock()
                q.single.return_value.execute.return_value.data = None

                def eq_side(col, val):
                    profile = profile_store.get(val, _make_profile("retail", name="Unknown"))
                    q2 = MagicMock()
                    q2.single.return_value.execute.return_value.data = profile
                    return q2
                q.eq.side_effect = eq_side
                return q
            t.select.side_effect = select_side
        elif name == "order_items":
            t.select.return_value.eq.return_value.execute.return_value.data = [
                {"product_id": "prod-1", "quantity_ordered": 3},
                {"product_id": "prod-2", "quantity_ordered": 2},
            ]
        return t
    mock_supabase.table.side_effect = mock_table

    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_service_role_supabase] = lambda: mock_supabase
    yield
    app.dependency_overrides.clear()


AUTH_HEADER = {"Authorization": f"Bearer {_make_token()}"}


class TestAdminApprove:
    def test_approve_updates_role(self):
        m = get_manager()
        resp = TestClient(app).post("/admin/profiles/user-456/approve", headers=AUTH_HEADER)
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_approve_rejects_non_admin(self):
        token = _make_token({"sub": "retail-user"})
        resp = TestClient(app).post(
            "/admin/profiles/user-456/approve",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestAdminReject:
    def test_reject_updates_role(self):
        resp = TestClient(app).post("/admin/profiles/user-456/reject", headers=AUTH_HEADER)
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"

    def test_reject_rejects_non_admin(self):
        token = _make_token({"sub": "retail-user"})
        resp = TestClient(app).post(
            "/admin/profiles/user-456/reject",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestAdminOrderStatus:
    def test_update_order_status(self):
        mock_order_result = [{"user_id": "retail-user", "readable_order_id": 42}]
        mock_update_result = [{"id": "order-789", "user_id": "retail-user", "readable_order_id": 42}]
        mock_supabase = MagicMock()

        def table_side_effect(name):
            if name == "profiles":
                t = MagicMock()
                t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "role": "admin"
                }
                return t
            elif name == "orders":
                t = MagicMock()
                t.select.return_value.eq.return_value.execute.return_value.data = mock_order_result
                t.update.return_value.eq.return_value.execute.return_value.data = mock_update_result
                return t
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        try:
            resp = TestClient(app).patch(
                "/admin/orders/order-789/status",
                json={"status": "completed"},
                headers=AUTH_HEADER,
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "updated"
        finally:
            app.dependency_overrides.clear()

    def test_cancel_order_restocks_items_via_rpc(self):
        mock_supabase = MagicMock()

        def table_side_effect(name):
            if name == "profiles":
                t = MagicMock()
                t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "role": "admin"
                }
                return t
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        cancel_rpc = MagicMock()
        cancel_rpc.execute.return_value.data = {
            "status": "cancelled",
            "order_id": "order-789",
            "readable_order_id": 42,
            "user_id": "retail-user",
        }
        mock_supabase.rpc.return_value = cancel_rpc

        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        try:
            resp = TestClient(app).patch(
                "/admin/orders/order-789/status",
                json={"status": "cancelled"},
                headers=AUTH_HEADER,
            )
            assert resp.status_code == 200
            assert resp.json()["status"] == "updated"
            mock_supabase.rpc.assert_called_once_with(
                "admin_cancel_order", {"p_order_id": "order-789"}
            )
        finally:
            app.dependency_overrides.clear()

    def test_update_status_rejects_non_admin(self):
        token = _make_token({"sub": "retail-user"})
        resp = TestClient(app).patch(
            "/admin/orders/order-789/status",
            json={"status": "completed"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_update_status_requires_valid_status(self):
        resp = TestClient(app).patch(
            "/admin/orders/order-789/status",
            json={"status": "invalid_status"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422


class TestAdminOrderStatusStateMachine:
    """H-R3-1: the status route must enforce the order state machine so a
    cancelled order stays terminal and a completed order cannot be reopened
    (which would re-open an order whose stock was already restored)."""

    def _patch(self, order_status: str, new_status: str, token=None):
        mock_supabase = MagicMock()
        mock_supabase.rpc.return_value.execute.return_value.data = {
            "status": "cancelled",
            "readable_order_id": 42,
            "user_id": "retail-user",
        }

        def table_side_effect(name):
            if name == "profiles":
                t = MagicMock()
                t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "role": "admin"
                }
                return t
            if name == "orders":
                t = MagicMock()
                t.select.return_value.eq.return_value.execute.return_value.data = [
                    {"user_id": "retail-user", "readable_order_id": 42, "status": order_status}
                ]
                t.update.return_value.eq.return_value.execute.return_value.data = [
                    {"id": "order-789", "status": new_status}
                ]
                return t
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        try:
            return TestClient(app).patch(
                "/admin/orders/order-789/status",
                json={"status": new_status},
                headers=AUTH_HEADER,
            )
        finally:
            app.dependency_overrides.clear()

    def test_cancelled_order_is_terminal(self):
        resp = self._patch("cancelled", "processing")
        assert resp.status_code == 409
        assert "terminal" in resp.json()["detail"]

    def test_completed_order_cannot_reopen(self):
        for target in ("pending_whatsapp", "processing"):
            resp = self._patch("completed", target)
            assert resp.status_code == 409
            assert "reopen" in resp.json()["detail"]

    def test_completed_to_cancelled_allowed(self):
        resp = self._patch("completed", "cancelled")
        assert resp.status_code == 200

    def test_pending_to_processing_allowed(self):
        resp = self._patch("pending_whatsapp", "processing")
        assert resp.status_code == 200

    def test_cancel_rpc_reports_already_cancelled_or_missing(self):
        mock_supabase = MagicMock()
        mock_supabase.rpc.return_value.execute.return_value.data = {
            "status": "already_cancelled_or_missing",
            "order_id": "order-789",
        }
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
            "role": "admin"
        }
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        try:
            resp = TestClient(app).patch(
                "/admin/orders/order-789/status",
                json={"status": "cancelled"},
                headers=AUTH_HEADER,
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 409
        assert "already" in resp.json()["detail"].lower()

    def test_cancel_rpc_reports_not_found(self):
        mock_supabase = MagicMock()
        mock_supabase.rpc.return_value.execute.return_value.data = {"status": "not_found"}
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
            "role": "admin"
        }
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        try:
            resp = TestClient(app).patch(
                "/admin/orders/order-789/status",
                json={"status": "cancelled"},
                headers=AUTH_HEADER,
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 404

    def test_non_admin_cannot_reach_cancel_rpc(self):
        """M-R3-1: a non-admin is denied at the route before any RPC call."""
        mock_supabase = MagicMock()
        rpc_mock = MagicMock()
        mock_supabase.rpc = rpc_mock
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        token = _make_token({"sub": "retail-user"})
        try:
            resp = TestClient(app).patch(
                "/admin/orders/order-789/status",
                json={"status": "cancelled"},
                headers={"Authorization": f"Bearer {token}"},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 403
        rpc_mock.assert_not_called()

    def test_non_admin_cannot_reach_expire_rpc(self):
        """M-R3-1: expire_pending_orders is admin-only at the route."""
        mock_supabase = MagicMock()
        rpc_mock = MagicMock()
        mock_supabase.rpc = rpc_mock
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        token = _make_token({"sub": "retail-user"})
        try:
            resp = TestClient(app).post(
                "/admin/expire-orders",
                json={"older_than_hours": 24},
                headers={"Authorization": f"Bearer {token}"},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 403
        rpc_mock.assert_not_called()

    def test_non_admin_cannot_reach_role_rpc(self):
        """M-R3-1: admin_set_profile_role is admin-only at the route."""
        mock_supabase = MagicMock()
        rpc_mock = MagicMock()
        mock_supabase.rpc = rpc_mock
        app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
        token = _make_token({"sub": "retail-user"})
        try:
            resp = TestClient(app).post(
                "/admin/profiles/user-456/approve",
                headers={"Authorization": f"Bearer {token}"},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 403
        rpc_mock.assert_not_called()


class TestAdminExpireOrders:
    def test_expire_orders_calls_rpc(self):
        resp = TestClient(app).post(
            "/admin/expire-orders",
            json={"older_than_hours": 24},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        assert resp.json()["expired"] == 3

    def test_expire_orders_defaults_to_24h(self):
        resp = TestClient(app).post("/admin/expire-orders", json={}, headers=AUTH_HEADER)
        assert resp.status_code == 200
        assert resp.json()["expired"] == 3

    def test_expire_orders_rejects_non_admin(self):
        token = _make_token({"sub": "retail-user"})
        resp = TestClient(app).post("/admin/expire-orders", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403


class TestAdminRateLimit:
    def test_admin_mutation_rate_limited_per_user(self):
        from app.main import limiter

        limiter.enabled = True
        try:
            client = TestClient(app)
            statuses = [
                client.post("/admin/profiles/user-456/approve", headers=AUTH_HEADER).status_code
                for _ in range(31)
            ]
            assert statuses[:30] == [200] * 30
            assert statuses[30] == 429
        finally:
            limiter.enabled = False


class TestAdminProducts:
    def test_import_rejects_non_admin(self):
        token = _make_token({"sub": "retail-user"})
        resp = TestClient(app).post(
            "/admin/products/import",
            files={"file": ("test.csv", b"title,sku\n", "text/csv")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_template_returns_csv(self):
        resp = TestClient(app).get("/admin/products/template", headers=AUTH_HEADER)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/csv; charset=utf-8"
        body = resp.text
        assert "title" in body
        assert "sku" in body
        assert "retail_price_per_lot" in body
        assert "Example Product" in body

    def test_import_valid_csv(self):
        csv_content = (
            "title,sku,retail_price_per_lot,wholesale_price_per_lot,available_stock_lots\n"
            "Test CPU,CPU-100,150.00,120.00,10\n"
            "Test RAM,RAM-200,80.00,65.00,5\n"
        )
        resp = TestClient(app).post(
            "/admin/products/import",
            files={"file": ("products.csv", csv_content.encode(), "text/csv")},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["inserted"] == 2
        assert data["total_rows"] == 2
        assert data["errors"] == []

    def test_import_invalid_csv_returns_row_errors(self):
        csv_content = (
            "title,sku,retail_price_per_lot,wholesale_price_per_lot,available_stock_lots\n"
            ",CPU-100,150.00,120.00,10\n"
            "Only Title,,100.00,80.00,5\n"
        )
        resp = TestClient(app).post(
            "/admin/products/import",
            files={"file": ("bad.csv", csv_content.encode(), "text/csv")},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["inserted"] == 0
        assert data["total_rows"] == 2
        assert len(data["errors"]) == 2
        for err in data["errors"]:
            assert "row" in err
            assert "sku" in err
            assert "reason" in err

    def test_import_empty_file_returns_error(self):
        resp = TestClient(app).post(
            "/admin/products/import",
            files={"file": ("empty.csv", b"", "text/csv")},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    def test_import_calls_supabase_insert(self):
        global products_table_mock
        csv_content = (
            "title,sku,retail_price_per_lot,wholesale_price_per_lot,available_stock_lots\n"
            "Verified CPU,CPU-999,199.99,149.99,10\n"
        )
        resp = TestClient(app).post(
            "/admin/products/import",
            files={"file": ("verify.csv", csv_content.encode(), "text/csv")},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        assert resp.json()["inserted"] == 1
        products_table_mock.insert.assert_called_once()
        call_args = products_table_mock.insert.call_args[0][0]
        assert call_args["title"] == "Verified CPU"
        assert call_args["sku"] == "CPU-999"
        assert call_args["retail_price_per_lot"] == 199.99
        assert call_args["wholesale_price_per_lot"] == 149.99
        assert call_args["available_stock_lots"] == 10
