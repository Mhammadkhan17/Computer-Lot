import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.utils.security import verify_jwt
from app.utils.ws_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)) -> None:
    try:
        payload = verify_jwt(token)
    except Exception:
        await ws.close(code=4001)
        return

    user_id = payload["sub"]
    role = payload.get("role", "retail")
    mgr = get_manager()
    await mgr.connect(ws, user_id, role)

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        mgr.disconnect(ws, user_id)
