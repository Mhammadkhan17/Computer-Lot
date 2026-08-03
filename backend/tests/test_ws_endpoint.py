import jwt
import pytest
from starlette.websockets import WebSocketDisconnect
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from app.main import app
from app.config import settings
from app.utils.ws_manager import get_manager


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


def _ws_headers(token: str) -> dict:
    return {"Sec-WebSocket-Protocol": token}


def _mock_profile_client(role: str) -> MagicMock:
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "role": role
    }
    return mock_client


class TestWebSocketEndpoint:
    def test_accepts_valid_token(self, monkeypatch):
        token = _make_token()
        monkeypatch.setattr("app.routes.ws.get_user_supabase", lambda token: _mock_profile_client("retail"))
        client = TestClient(app)
        with client.websocket_connect("/ws", headers=_ws_headers(token)) as ws:
            assert ws

    def test_registers_connection_in_manager(self, monkeypatch):
        m = get_manager()
        token = _make_token({"sub": "ws-test-user"})
        monkeypatch.setattr("app.routes.ws.get_user_supabase", lambda token: _mock_profile_client("admin"))

        client = TestClient(app)
        with client.websocket_connect("/ws", headers=_ws_headers(token)):
            assert "ws-test-user" in m._connections
            conns = m._connections["ws-test-user"]
            assert len(conns) == 1
            _, role = conns[0]
            assert role == "admin"

    def test_rejects_invalid_token(self):
        client = TestClient(app)
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect("/ws", headers=_ws_headers("bad-token")):
                pass
        assert exc.value.code == 4001

    def test_rejects_missing_token(self):
        client = TestClient(app)
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect("/ws"):
                pass
        assert exc.value.code == 4001

    def test_cleanup_on_disconnect(self, monkeypatch):
        m = get_manager()
        token = _make_token({"sub": "cleanup-test"})
        monkeypatch.setattr("app.routes.ws.get_user_supabase", lambda token: _mock_profile_client("retail"))

        client = TestClient(app)
        with client.websocket_connect("/ws", headers=_ws_headers(token)):
            pass  # exits context manager -> closes connection

        assert "cleanup-test" not in m._connections
