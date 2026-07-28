import os
import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "true")


def test_successful_transaction_commits():
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.fetchone.side_effect = [
        ("order-uuid", 1001),
        (True,),
        (True,),
    ]
    mock_conn.cursor.return_value = mock_cursor

    with patch("app.adapters.txn._get_db_connection", return_value=mock_conn):
        from app.adapters.txn import run_in_transaction

        order_data = {"user_id": "u1", "customer_name": "Alice", "customer_phone": "+123", "total_amount": 100.0}
        items = [{"product_id": "p1", "title": "Widget", "quantity_ordered": 2, "unit_price_applied": 50.0}]

        result = run_in_transaction(order_data, items)
        assert result["commit"] is True
        assert result["readable_order_id"] == 1001
    mock_conn.commit.assert_called_once()
    mock_conn.close.assert_called_once()


def test_failed_stock_decrement_rolls_back():
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.fetchone.side_effect = [
        ("order-uuid", 1001),
        (False,),
    ]
    mock_conn.cursor.return_value = mock_cursor

    with patch("app.adapters.txn._get_db_connection", return_value=mock_conn):
        from app.adapters.txn import run_in_transaction

        order_data = {"user_id": "u1", "customer_name": "Alice", "customer_phone": "+123", "total_amount": 100.0}
        items = [{"product_id": "p1", "title": "Widget", "quantity_ordered": 2, "unit_price_applied": 50.0}]

        with pytest.raises(HTTPException):
            run_in_transaction(order_data, items)
    mock_conn.rollback.assert_called_once()
    mock_conn.close.assert_called_once()


def test_db_error_rolls_back():
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.execute.side_effect = RuntimeError("DB connection lost")
    mock_conn.cursor.return_value = mock_cursor

    with patch("app.adapters.txn._get_db_connection", return_value=mock_conn):
        from app.adapters.txn import run_in_transaction

        order_data = {"user_id": "u1", "customer_name": "Alice", "customer_phone": "+123", "total_amount": 100.0}
        items = []

        with pytest.raises(HTTPException):
            run_in_transaction(order_data, items)
    mock_conn.rollback.assert_called_once()
    mock_conn.close.assert_called_once()