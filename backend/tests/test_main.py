import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")

import pytest

from app.main import parse_cors_origins


def test_parse_cors_origins_accepts_origin_list():
    assert parse_cors_origins("http://localhost:3000, https://app.example.com") == [
        "http://localhost:3000",
        "https://app.example.com",
    ]


def test_parse_cors_origins_strips_whitespace():
    assert parse_cors_origins(" http://localhost:3000 ,  https://app.example.com ") == [
        "http://localhost:3000",
        "https://app.example.com",
    ]


def test_parse_cors_origins_rejects_wildcard():
    with pytest.raises(ValueError, match=r"\*"):
        parse_cors_origins("*")


def test_parse_cors_origins_rejects_empty():
    with pytest.raises(ValueError):
        parse_cors_origins("  ,  ")
