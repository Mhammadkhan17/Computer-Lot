import asyncio
import os
import pytest
from unittest.mock import AsyncMock, MagicMock

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")


def _mock_manager():
    mock_manager = MagicMock()
    mock_manager.send_to_user = AsyncMock()
    return mock_manager


def _order_data():
    return {
        "order_id": "o1",
        "readable_order_id": 1001,
        "total_amount": 100.0,
        "customer_name": "Alice",
        "user_id": "u1",
    }


def test_send_to_user_called_for_order_owner(monkeypatch):
    mock_manager = _mock_manager()
    monkeypatch.setattr("app.adapters.notification.get_manager", lambda: mock_manager)

    from app.adapters.notification import broadcast_order_update

    asyncio.run(broadcast_order_update(_order_data()))

    mock_manager.send_to_user.assert_called_once()
    args = mock_manager.send_to_user.call_args
    assert args[0][0] == "order_status_update"
    assert args[0][2] == "u1"


def test_payload_contains_no_pii(monkeypatch):
    mock_manager = _mock_manager()
    monkeypatch.setattr("app.adapters.notification.get_manager", lambda: mock_manager)

    from app.adapters.notification import broadcast_order_update

    asyncio.run(broadcast_order_update(_order_data()))

    payload = mock_manager.send_to_user.call_args[0][1]
    assert payload == {"order_id": "o1", "status": "pending_whatsapp"}
    assert "customer_name" not in payload
    assert "total_amount" not in payload
