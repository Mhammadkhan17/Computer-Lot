import json
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


manager: "ConnectionManager | None" = None


def get_manager() -> "ConnectionManager":
    global manager
    if manager is None:
        manager = ConnectionManager()
    return manager


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, list[tuple[WebSocket, str]]] = {}

    async def connect(self, ws: WebSocket, user_id: str, role: str) -> None:
        await ws.accept()
        self._connections.setdefault(user_id, []).append((ws, role))

    def disconnect(self, ws: WebSocket, user_id: str) -> None:
        conns = self._connections.get(user_id, [])
        self._connections[user_id] = [(w, r) for w, r in conns if w is not ws]
        if not self._connections[user_id]:
            del self._connections[user_id]

    async def broadcast(self, event_type: str, payload: dict) -> None:
        message = json.dumps({"type": event_type, "payload": payload})
        dead: list[tuple[str, WebSocket]] = []
        for uid, conns in self._connections.items():
            for ws, _role in conns:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append((uid, ws))
        for uid, ws in dead:
            self.disconnect(ws, uid)

    async def broadcast_to_role(self, event_type: str, payload: dict, role: str) -> None:
        message = json.dumps({"type": event_type, "payload": payload})
        dead: list[tuple[str, WebSocket]] = []
        for uid, conns in self._connections.items():
            for ws, r in conns:
                if r != role:
                    continue
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append((uid, ws))
        for uid, ws in dead:
            self.disconnect(ws, uid)

    async def send_to_user(self, event_type: str, payload: dict, user_id: str) -> None:
        conns = self._connections.get(user_id, [])
        if not conns:
            return
        message = json.dumps({"type": event_type, "payload": payload})
        for ws, _role in conns:
            try:
                await ws.send_text(message)
            except Exception:
                self.disconnect(ws, user_id)
