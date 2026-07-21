import pytest

from app.notification import SpyBroadcaster


class TestSpyBroadcaster:
    @pytest.mark.asyncio
    async def test_order_placed_records_call(self):
        spy = SpyBroadcaster()
        await spy.order_placed(
            order_id="order-1",
            readable_order_id=1001,
            total_amount=500.0,
            items=[{"product_id": "p1", "quantity": 5}],
            updated_stock={"p1": 5},
        )
        assert len(spy.calls) == 1
        assert spy.calls[0]["order_id"] == "order-1"
        assert spy.calls[0]["readable_order_id"] == 1001

    @pytest.mark.asyncio
    async def test_order_placed_records_items(self):
        spy = SpyBroadcaster()
        items = [{"product_id": "p1", "title": "Product 1", "quantity_ordered": 5, "unit_price_applied": 100.0}]
        await spy.order_placed("order-1", 1001, 500.0, items, {"p1": 5})
        assert spy.calls[0]["items"] == items

    @pytest.mark.asyncio
    async def test_order_placed_records_updated_stock(self):
        spy = SpyBroadcaster()
        await spy.order_placed("order-1", 1001, 500.0, [], {"p1": 5, "p2": 3})
        assert spy.calls[0]["updated_stock"] == {"p1": 5, "p2": 3}

    @pytest.mark.asyncio
    async def test_multiple_calls_appended(self):
        spy = SpyBroadcaster()
        await spy.order_placed("order-1", 1001, 500.0, [], {})
        await spy.order_placed("order-2", 1002, 300.0, [], {})
        assert len(spy.calls) == 2
        assert spy.calls[0]["order_id"] == "order-1"
        assert spy.calls[1]["order_id"] == "order-2"
