import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")

import jwt
import pytest
from fastapi import HTTPException

from app.config import settings
from app.utils.security import _verify_jwt_locally, verify_jwt


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


class TestLocalJwtFallback:
    """L-R3-1: the local fallback must fail closed on role/aud/iss claims."""

    def test_accepts_token_with_valid_claims(self):
        payload = _verify_jwt_locally(_make_token())
        assert payload["sub"] == "user-123"

    def test_accepts_token_with_auth_v1_issuer(self):
        token = _make_token({"iss": f"{settings.supabase_url}/auth/v1"})
        payload = _verify_jwt_locally(token)
        assert payload["sub"] == "user-123"

    def test_rejects_missing_iss(self):
        payload = {
            "sub": "user-123",
            "role": "authenticated",
            "aud": "authenticated",
            "exp": 9999999999,
        }
        token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
        with pytest.raises(HTTPException) as exc:
            _verify_jwt_locally(token)
        assert exc.value.status_code == 401

    def test_rejects_wrong_iss(self):
        token = _make_token({"iss": "https://evil.example.com"})
        with pytest.raises(HTTPException) as exc:
            _verify_jwt_locally(token)
        assert exc.value.status_code == 401

    def test_rejects_wrong_aud(self):
        token = _make_token({"aud": "service_role"})
        with pytest.raises(HTTPException) as exc:
            _verify_jwt_locally(token)
        assert exc.value.status_code == 401

    def test_rejects_wrong_role(self):
        token = _make_token({"role": "admin"})
        with pytest.raises(HTTPException) as exc:
            _verify_jwt_locally(token)
        assert exc.value.status_code == 401

    def test_rejects_service_role_token(self):
        token = _make_token({"role": "service_role", "aud": "service_role"})
        with pytest.raises(HTTPException) as exc:
            _verify_jwt_locally(token)
        assert exc.value.status_code == 401

    def test_rejects_bad_signature(self):
        token = jwt.encode(
            {"sub": "user-123", "role": "authenticated", "aud": "authenticated",
             "iss": settings.supabase_url, "exp": 9999999999},
            "wrong-secret",
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc:
            _verify_jwt_locally(token)
        assert exc.value.status_code == 401


class TestVerifyJwtFallbackPath:
    """verify_jwt must route through _verify_jwt_locally when the Auth server
    is unreachable, and still reject invalid-claim tokens."""

    def test_unreachable_auth_server_uses_local_fallback(self, monkeypatch):
        import httpx

        def _raise(*args, **kwargs):
            raise httpx.RequestError("boom", request=None)

        monkeypatch.setattr(httpx.AsyncClient, "get", _raise)
        payload = __import__("asyncio").run(verify_jwt(_make_token()))
        assert payload["sub"] == "user-123"

    def test_unreachable_auth_server_still_rejects_bad_claims(self, monkeypatch):
        import asyncio
        import httpx

        def _raise(*args, **kwargs):
            raise httpx.RequestError("boom", request=None)

        monkeypatch.setattr(httpx.AsyncClient, "get", _raise)
        with pytest.raises(HTTPException) as exc:
            asyncio.run(verify_jwt(_make_token({"role": "admin"})))
        assert exc.value.status_code == 401
