from app.utils.ws_manager import get_manager


async def broadcast_order_update(order_data):
    manager = get_manager()
    message = {
        "order_id": order_data["order_id"],
        "readable_order_id": order_data["readable_order_id"],
        "total_amount": order_data["total_amount"],
        "customer_name": order_data["customer_name"],
    }
    await manager.broadcast("order_status_update", message)