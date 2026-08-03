import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")

import jwt
from starlette.requests import Request

from app.config import settings
from app.rate_limit import _rate_limit_key, limiter


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


class TestRateLimitKey:
    """M-R3-3: the limiter is keyed per-user by JWT sub (stable across
    requests for the same user), falling back to IP only when there is no
    usable bearer token."""

    def test_keys_by_user_sub(self):
        req = Request(
            {"type": "http", "headers": [(b"authorization", f"Bearer {_make_token()}".encode())]}
        )
        assert _rate_limit_key(req) == "user:user-123"

    def test_key_is_stable_for_same_user(self):
        req = Request(
            {"type": "http", "headers": [(b"authorization", f"Bearer {_make_token()}".encode())]}
        )
        assert _rate_limit_key(req) == _rate_limit_key(req)

    def test_different_users_get_different_keys(self):
        req_a = Request(
            {"type": "http", "headers": [(b"authorization", f"Bearer {_make_token({'sub': 'aaa'})}".encode())]}
        )
        req_b = Request(
            {"type": "http", "headers": [(b"authorization", f"Bearer {_make_token({'sub': 'bbb'})}".encode())]}
        )
        assert _rate_limit_key(req_a) == "user:aaa"
        assert _rate_limit_key(req_b) == "user:bbb"
        assert _rate_limit_key(req_a) != _rate_limit_key(req_b)

    def test_falls_back_to_ip_without_token(self):
        req = Request({"type": "http", "headers": [], "client": ("203.0.113.7", 1234)})
        assert _rate_limit_key(req) == "ip:203.0.113.7"

    def test_falls_back_to_ip_for_invalid_token(self):
        req = Request(
            {
                "type": "http",
                "headers": [(b"authorization", b"Bearer not-a-valid-jwt")],
                "client": ("203.0.113.8", 1234),
            }
        )
        assert _rate_limit_key(req) == "ip:203.0.113.8"


class TestLimiterConfig:
    """M-R3-3: documents the deliberate single-process (in-memory) storage
    decision. These assertions pin the config keys so a future change
    (e.g. Redis) is deliberate and reviewed. Note: slowapi exposes these as
    private attributes (Limiter._in_memory_fallback_enabled etc.)."""

    def test_limiter_uses_in_memory_fallback(self):
        assert limiter._in_memory_fallback_enabled is True

    def test_limiter_has_default_limits(self):
        limits = [
            str(limit.limit)
            for group in (limiter._default_limits or [])
            for limit in list(group)
        ]
        assert any("60 per" in item for item in limits)

    def test_limiter_key_func_is_rate_limit_key(self):
        assert limiter._key_func is _rate_limit_key
