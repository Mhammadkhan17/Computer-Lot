from app.utils.ws_manager import get_manager


def broadcast_order_update(order_data):
    manager = get_manager()
    message = {
        "order_id": order_data["order_id"],
        "readable_order_id": order_data["readable_order_id"],
        "total_amount": order_data["total_amount"],
        "customer_name": order_data["customer_name"],
    }
    manager.broadcast("order_update", message)