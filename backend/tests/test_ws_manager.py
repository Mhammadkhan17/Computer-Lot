import pytest
from unittest.mock import AsyncMock, MagicMock

from app.utils.ws_manager import ConnectionManager


@pytest.fixture
def manager():
    return ConnectionManager()


@pytest.fixture
def mock_ws():
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    return ws


@pytest.mark.asyncio
class TestConnectionManager:
    async def test_connect_stores_connection(self, manager, mock_ws):
        await manager.connect(mock_ws, "user-1", "admin")
        assert "user-1" in manager._connections
        assert len(manager._connections["user-1"]) == 1
        assert manager._connections["user-1"][0] == (mock_ws, "admin")

    async def test_disconnect_removes_connection(self, manager, mock_ws):
        await manager.connect(mock_ws, "user-1", "admin")
        manager.disconnect(mock_ws, "user-1")
        assert "user-1" not in manager._connections

    async def test_disconnect_removes_one_of_many(self, manager):
        ws1, ws2 = AsyncMock(), AsyncMock()
        await manager.connect(ws1, "user-1", "admin")
        await manager.connect(ws2, "user-1", "retail")
        manager.disconnect(ws1, "user-1")
        assert manager._connections["user-1"] == [(ws2, "retail")]

    async def test_broadcast_sends_to_all(self, manager):
        ws1, ws2 = AsyncMock(), AsyncMock()
        await manager.connect(ws1, "user-1", "admin")
        await manager.connect(ws2, "user-2", "retail")

        await manager.broadcast("test_event", {"key": "val"})

        ws1.send_text.assert_called_once_with(
            '{"type": "test_event", "payload": {"key": "val"}}'
        )
        ws2.send_text.assert_called_once_with(
            '{"type": "test_event", "payload": {"key": "val"}}'
        )

    async def test_broadcast_to_role_filters(self, manager):
        ws1, ws2 = AsyncMock(), AsyncMock()
        await manager.connect(ws1, "user-1", "admin")
        await manager.connect(ws2, "user-2", "retail")

        await manager.broadcast_to_role("admin_event", {"admin": True}, role="admin")

        ws1.send_text.assert_called_once_with(
            '{"type": "admin_event", "payload": {"admin": true}}'
        )
        ws2.send_text.assert_not_called()

    async def test_send_to_user_sends_only_to_that_user(self, manager):
        ws1, ws2 = AsyncMock(), AsyncMock()
        await manager.connect(ws1, "user-1", "admin")
        await manager.connect(ws2, "user-2", "admin")

        await manager.send_to_user("personal", {"for": "user-1"}, "user-1")

        ws1.send_text.assert_called_once_with(
            '{"type": "personal", "payload": {"for": "user-1"}}'
        )
        ws2.send_text.assert_not_called()

    async def test_send_to_user_no_connection_does_not_error(self, manager):
        await manager.send_to_user("test", {}, "nonexistent")

    async def test_broadcast_cleans_up_dead_connections(self, manager):
        dead_ws = AsyncMock()
        dead_ws.send_text = AsyncMock(side_effect=Exception("gone"))
        live_ws = AsyncMock()
        await manager.connect(dead_ws, "user-1", "admin")
        await manager.connect(live_ws, "user-2", "admin")

        await manager.broadcast("test", {})

        assert "user-1" not in manager._connections
        assert "user-2" in manager._connections
