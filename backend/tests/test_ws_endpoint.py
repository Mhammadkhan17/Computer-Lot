import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.utils.ws_manager import get_manager


def _make_token(payload_override: dict | None = None) -> str:
    payload = {
        "sub": "user-123",
        "role": "admin",
        "aud": "authenticated",
        "exp": 9999999999,
        **(payload_override or {}),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


class TestWebSocketEndpoint:
    def test_accepts_valid_token(self):
        token = _make_token()
        client = TestClient(app)
        with client.websocket_connect(f"/ws?token={token}") as ws:
            assert ws

    def test_registers_connection_in_manager(self):
        m = get_manager()
        token = _make_token({"sub": "ws-test-user", "role": "admin"})
        client = TestClient(app)
        with client.websocket_connect(f"/ws?token={token}"):
            assert "ws-test-user" in m._connections
            conns = m._connections["ws-test-user"]
            assert len(conns) == 1
            _, role = conns[0]
            assert role == "admin"

    def test_rejects_invalid_token(self):
        client = TestClient(app)
        with pytest.raises(Exception):
            with client.websocket_connect("/ws?token=bad-token"):
                pass

    def test_cleanup_on_disconnect(self):
        m = get_manager()
        token = _make_token({"sub": "cleanup-test", "role": "retail"})
        client = TestClient(app)
        with client.websocket_connect(f"/ws?token={token}"):
            pass  # exits context manager → closes connection

        assert "cleanup-test" not in m._connections
