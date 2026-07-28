import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "true")

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import get_supabase
from app.utils.ws_manager import get_manager


def _make_token(payload_override: dict | None = None) -> str:
    payload = {
        "sub": "admin-user",
        "role": "admin",
        "aud": "authenticated",
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
        token = _make_token({"sub": "retail-user", "role": "retail"})
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
        token = _make_token({"sub": "retail-user", "role": "retail"})
        resp = TestClient(app).post(
            "/admin/profiles/user-456/reject",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestAdminOrderStatus:
    @patch("app.adapters.db.get_raw_connection")
    def test_update_order_status(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = ("order-789", "retail-user", 42)
        mock_conn.cursor.return_value = mock_cursor
        mock_get_db.return_value = mock_conn

        resp = TestClient(app).patch(
            "/admin/orders/order-789/status",
            json={"status": "completed"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "updated"

    @patch("app.adapters.db.get_raw_connection")
    def test_cancel_order_restocks_items(self, mock_get_db):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = ("order-789", "retail-user", 42)
        mock_conn.cursor.return_value = mock_cursor
        mock_get_db.return_value = mock_conn

        resp = TestClient(app).patch(
            "/admin/orders/order-789/status",
            json={"status": "cancelled"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "updated"

    def test_update_status_rejects_non_admin(self):
        token = _make_token({"sub": "retail-user", "role": "retail"})
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


class TestAdminProducts:
    def test_import_rejects_non_admin(self):
        token = _make_token({"sub": "retail-user", "role": "retail"})
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
