from app.utils.ws_manager import get_manager


async def broadcast_order_update(order_data):
    manager = get_manager()
    message = {
        "order_id": order_data["order_id"],
        "status": "pending_whatsapp",
    }
    await manager.send_to_user("order_status_update", message, order_data["user_id"])