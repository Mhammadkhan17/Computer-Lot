import jwt
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from app.main import app
from app.config import settings
from app.database import get_user_supabase


def _make_token(payload_override: dict | None = None) -> str:
    payload = {
        "sub": "retail-user",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": settings.supabase_url,
        "exp": 9999999999,
        **(payload_override or {}),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


AUTH_HEADER = {"Authorization": f"Bearer {_make_token()}"}

mock_supabase: MagicMock | None = None
rpc_status: dict[str, str] = {}


@pytest.fixture(autouse=True)
def override_deps():
    global mock_supabase
    mock_supabase = MagicMock()
    rpc_status["result"] = "applied"

    def rpc_side(function_name, params):
        r = MagicMock()
        if function_name == "apply_for_wholesale":
            r.execute.return_value.data = {"status": rpc_status["result"]}
        return r

    mock_supabase.rpc.side_effect = rpc_side
    app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
    yield
    app.dependency_overrides.clear()


class TestWholesaleApply:
    def test_retail_apply_returns_applied(self):
        rpc_status["result"] = "applied"
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading", "tax_registration_id": "TAX-123"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "applied"
        assert mock_supabase.rpc.called
        fn, params = mock_supabase.rpc.call_args.args
        assert fn == "apply_for_wholesale"
        assert params["p_company_name"] == "Acme Trading"
        assert params["p_tax_id"] == "TAX-123"

    def test_approved_user_rechecks_returns_approved(self):
        rpc_status["result"] = "approved"
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_rpc_error_returns_400(self):
        rpc_status["result"] = "error"
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading"},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 400

    def test_missing_auth_returns_401(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme Trading"},
        )
        assert resp.status_code == 401

    def test_missing_company_name_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422

    def test_blank_company_name_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "   "},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422

    def test_company_name_too_long_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "A" * 256},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422

    def test_tax_id_too_long_returns_422(self):
        resp = TestClient(app).post(
            "/wholesale/apply",
            json={"company_name": "Acme", "tax_registration_id": "T" * 101},
            headers=AUTH_HEADER,
        )
        assert resp.status_code == 422
