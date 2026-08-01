import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import get_user_supabase
from app.utils.security import verify_jwt
from app.utils.ws_manager import get_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    subprotocols = ws.headers.get("sec-websocket-protocol", "")
    token = next((p.strip() for p in subprotocols.split(",") if p.strip()), "")
    if not token:
        await ws.close(code=4001)
        return

    try:
        payload = await verify_jwt(token)
    except Exception:
        await ws.close(code=4001)
        return

    user_id = payload["sub"]

    role = "retail"
    try:
        supabase = get_user_supabase(token)
        profile_resp = (
            supabase.table("profiles")
            .select("role")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if profile_resp.data and profile_resp.data.get("role"):
            role = profile_resp.data["role"]
    except Exception:
        logger.warning("WS profile lookup failed for user %s; defaulting to retail", str(user_id)[:8])

    mgr = get_manager()
    await mgr.connect(ws, user_id, role, subprotocol=token)

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        mgr.disconnect(ws, user_id)
