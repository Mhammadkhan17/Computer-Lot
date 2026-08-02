import asyncio
import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-0123456789abcdef0123456789abcdef")
os.environ.setdefault("MERCHANT_PHONE", "1234567890")
os.environ.setdefault("DEBUG", "false")

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import get_service_role_supabase, get_user_supabase
from app.schemas.order import CheckoutRequest, CheckoutResponse, OrderItemResponse, StockErrorItem


def _make_profile(role="retail", name="Test User", phone="+1234567890"):
    return {"full_name": name, "phone": phone, "role": role}


def _make_product(pid, retail=100.0, wholesale=80.0, stock=10, min_wholesale=5):
    return {
        "id": pid,
        "title": f"Product {pid}",
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "available_stock_lots": stock,
        "minimum_wholesale_lots": min_wholesale,
    }


def _mock_supabase_client():
    mock_supabase = MagicMock()

    def mock_table(name):
        t = MagicMock()
        if name == "profiles":
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _make_profile()
        elif name == "products":
            t.select.return_value.in_.return_value.execute.return_value.data = [_make_product("00000000-0000-0000-0000-000000000001")]
        return t

    mock_supabase.table.side_effect = mock_table
    return mock_supabase


@pytest.fixture(autouse=True)
def override_deps():
    mock_supabase = _mock_supabase_client()
    app.dependency_overrides[get_user_supabase] = lambda: mock_supabase
    app.dependency_overrides[get_service_role_supabase] = lambda: mock_supabase
    yield
    app.dependency_overrides.clear()


class TestAssertOpenOrderCap:
    def test_cap_raises_when_at_limit(self):
        from app.adapters.order_intake import _assert_open_order_cap

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "x"}
        ] * 20

        with pytest.raises(HTTPException) as exc:
            _assert_open_order_cap(mock_supabase, "user-123")
        assert exc.value.status_code == 400
        assert "20" in exc.value.detail

    def test_cap_passes_below_limit(self):
        from app.adapters.order_intake import _assert_open_order_cap

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "x"}
        ] * 5
        _assert_open_order_cap(mock_supabase, "user-123")

    def test_cap_raises_when_exceeds_limit(self):
        from app.adapters.order_intake import _assert_open_order_cap

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "x"}
        ] * 21

        with pytest.raises(HTTPException) as exc:
            _assert_open_order_cap(mock_supabase, "user-123")
        assert exc.value.status_code == 400


class TestFetchProfile:
    def test_profile_found(self):
        from app.adapters.order_intake import _fetch_profile

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _make_profile()

        result = _fetch_profile(mock_supabase, "user-123")
        assert result["full_name"] == "Test User"
        assert result["role"] == "retail"

    def test_profile_not_found_raises_404(self):
        from app.adapters.order_intake import _fetch_profile

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

        with pytest.raises(HTTPException) as exc:
            _fetch_profile(mock_supabase, "user-123")
        assert exc.value.status_code == 404


class TestFetchProducts:
    def test_fetches_products_by_ids(self):
        from app.adapters.order_intake import _fetch_products

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value.data = [
            _make_product("00000000-0000-0000-0000-000000000001", stock=5),
            _make_product("00000000-0000-0000-0000-000000000002", stock=3),
        ]

        result = _fetch_products(
            mock_supabase,
            ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"],
        )
        assert len(result) == 2
        assert result["00000000-0000-0000-0000-000000000001"]["title"] == "Product 00000000-0000-0000-0000-000000000001"

    def test_empty_result_returns_empty_dict(self):
        from app.adapters.order_intake import _fetch_products

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []

        result = _fetch_products(mock_supabase, ["nonexistent"])
        assert result == {}

    def test_http2_error_retries_then_raises_503(self):
        import httpx

        from app.adapters.order_intake import _fetch_products

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.side_effect = [
            httpx.RemoteProtocolError("HTTP/2 error"),
            httpx.RemoteProtocolError("HTTP/2 error on retry"),
        ]

        with pytest.raises(HTTPException) as exc:
            _fetch_products(mock_supabase, ["00000000-0000-0000-0000-000000000001"])
        assert exc.value.status_code == 503


class TestCreateOrder:
    @pytest.mark.asyncio
    @patch("app.adapters.order_intake.broadcast_order_update")
    @patch("app.adapters.order_intake.build_order_link")
    @patch("app.adapters.order_intake.run_in_transaction")
    @patch("app.adapters.order_intake.check_availability")
    @patch("app.adapters.order_intake.resolve_all_items")
    async def test_successful_order_creation(
        self, mock_resolve, mock_stock, mock_txn, mock_link, mock_broadcast
    ):
        from app.adapters.order_intake import create

        mock_stock.return_value = []
        mock_resolve.return_value = [
            OrderItemResponse(
                product_id="00000000-0000-0000-0000-000000000001",
                title="Product default",
                quantity_ordered=2,
                unit_price_applied=100.0,
            )
        ]
        mock_txn.return_value = {
            "order_id": "order-uuid",
            "readable_order_id": 1001,
            "commit": True,
        }
        mock_link.return_value = "https://wa.me/1234567890?text=Test"
        mock_broadcast.return_value = None

        checkout_req = CheckoutRequest(
            items=[{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 2}],
        )
        supabase = _mock_supabase_client()
        tx_supabase = _mock_supabase_client()

        result = await create(checkout_req, supabase, tx_supabase, "user-123")

        assert isinstance(result, CheckoutResponse)
        assert result.readable_order_id == 1001
        assert result.total_amount == 200.0
        assert "wa.me" in result.whatsapp_deep_link

    @pytest.mark.asyncio
    @patch("app.adapters.order_intake.broadcast_order_update")
    @patch("app.adapters.order_intake.build_order_link")
    @patch("app.adapters.order_intake.run_in_transaction")
    @patch("app.adapters.order_intake.check_availability")
    @patch("app.adapters.order_intake.resolve_all_items")
    async def test_checkout_returns_stock_errors(
        self, mock_resolve, mock_stock, mock_txn, mock_link, mock_broadcast
    ):
        from app.adapters.order_intake import create
        from app.adapters.stock import InsufficientStockError

        mock_stock.return_value = [
            StockErrorItem(
                product_id="00000000-0000-0000-0000-000000000002",
                title="Product p1",
                available=2,
                requested=5,
            )
        ]
        mock_resolve.return_value = []

        checkout_req = CheckoutRequest(
            items=[{"product_id": "00000000-0000-0000-0000-000000000002", "quantity": 5}],
        )
        supabase = _mock_supabase_client()
        tx_supabase = _mock_supabase_client()

        with pytest.raises(InsufficientStockError):
            await create(checkout_req, supabase, tx_supabase, "user-123")

    @pytest.mark.asyncio
    @patch("app.adapters.order_intake._assert_open_order_cap")
    @patch("app.adapters.order_intake.broadcast_order_update")
    @patch("app.adapters.order_intake.build_order_link")
    @patch("app.adapters.order_intake.run_in_transaction")
    @patch("app.adapters.order_intake.check_availability")
    @patch("app.adapters.order_intake.resolve_all_items")
    async def test_open_order_cap_enforced(
        self, mock_resolve, mock_stock, mock_txn, mock_link, mock_broadcast, mock_cap
    ):
        from app.adapters.order_intake import create
        from fastapi import HTTPException

        mock_cap.side_effect = HTTPException(status_code=400, detail="Too many open pending orders")
        mock_stock.return_value = []
        mock_resolve.return_value = []

        checkout_req = CheckoutRequest(
            items=[{"product_id": "00000000-0000-0000-0000-000000000001", "quantity": 1}],
        )
        supabase = _mock_supabase_client()
        tx_supabase = _mock_supabase_client()

        with pytest.raises(HTTPException) as exc:
            await create(checkout_req, supabase, tx_supabase, "user-123")
        assert exc.value.status_code == 400