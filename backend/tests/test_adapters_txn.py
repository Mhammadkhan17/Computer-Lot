import os
import pytest
from fastapi import HTTPException
from types import SimpleNamespace
from unittest.mock import MagicMock

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "true")


def _mock_supabase(data):
    rpc_mock = MagicMock()
    rpc_mock.execute.return_value = MagicMock(data=data)
    supabase = MagicMock()
    supabase.rpc.return_value = rpc_mock
    return supabase


def _order_data():
    return {"user_id": "u1", "customer_name": "Alice", "customer_phone": "+123", "total_amount": 100.0}


def _items():
    return [
        SimpleNamespace(product_id="p1", quantity_ordered=2, unit_price_applied=50.0),
    ]


def test_successful_transaction_calls_create_order_rpc():
    from app.adapters.txn import run_in_transaction

    supabase = _mock_supabase({"order_id": "o1", "readable_order_id": 1001, "commit": True})

    result = run_in_transaction(supabase, _order_data(), _items())

    assert result["commit"] is True
    assert result["readable_order_id"] == 1001
    supabase.rpc.assert_called_once()
    kwargs = supabase.rpc.call_args[0][1]
    assert kwargs["p_user_id"] == "u1"
    assert kwargs["p_customer_name"] == "Alice"
    assert kwargs["p_items"] == [
        {"product_id": "p1", "quantity_ordered": 2, "unit_price_applied": "50.0"}
    ]


def test_failed_response_raises_http_500():
    from app.adapters.txn import run_in_transaction

    supabase = _mock_supabase(None)

    with pytest.raises(HTTPException) as exc:
        run_in_transaction(supabase, _order_data(), _items())
    assert exc.value.status_code == 500


def test_rpc_error_raises_http_500():
    from app.adapters.txn import run_in_transaction

    supabase = MagicMock()
    supabase.rpc.side_effect = RuntimeError("RPC failed")

    with pytest.raises(HTTPException) as exc:
        run_in_transaction(supabase, _order_data(), _items())
    assert exc.value.status_code == 500
