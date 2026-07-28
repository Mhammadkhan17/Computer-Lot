import os
import pytest
from unittest.mock import MagicMock

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "true")


def test_broadcast_calls_manager(monkeypatch):
    mock_manager = MagicMock()
    monkeypatch.setattr("app.adapters.notification.get_manager", lambda: mock_manager)

    from app.adapters.notification import broadcast_order_update

    order_data = {"order_id": "o1", "readable_order_id": 1001, "total_amount": 100.0, "customer_name": "Alice"}
    broadcast_order_update(order_data)

    mock_manager.broadcast.assert_called_once()
    call_args = mock_manager.broadcast.call_args
    assert call_args[0][0] == "order_update"


def test_broadcast_contains_order_id(monkeypatch):
    mock_manager = MagicMock()
    monkeypatch.setattr("app.adapters.notification.get_manager", lambda: mock_manager)

    from app.adapters.notification import broadcast_order_update

    order_data = {"order_id": "o1", "readable_order_id": 1001, "total_amount": 100.0, "customer_name": "Alice"}
    broadcast_order_update(order_data)

    payload = mock_manager.broadcast.call_args[0][1]
    assert payload["order_id"] == "o1"
    assert payload["readable_order_id"] == 1001