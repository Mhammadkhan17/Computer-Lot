import logging
from abc import ABC, abstractmethod

from app.utils.ws_manager import get_manager

logger = logging.getLogger(__name__)


class NotificationBroadcaster(ABC):
    @abstractmethod
    async def order_placed(
        self,
        order_id: str,
        readable_order_id: int,
        total_amount: float,
        items: list[dict],
        updated_stock: dict[str, int],
    ) -> None:
        ...


class WebSocketBroadcaster(NotificationBroadcaster):
    async def order_placed(
        self,
        order_id: str,
        readable_order_id: int,
        total_amount: float,
        items: list[dict],
        updated_stock: dict[str, int],
    ) -> None:
        manager = get_manager()
        try:
            await manager.broadcast_to_role(
                "order_status_update",
                {
                    "order_id": order_id,
                    "readable_order_id": readable_order_id,
                    "total_amount": str(total_amount),
                    "status": "pending_whatsapp",
                },
                role="admin",
            )
            for product_id, new_stock in updated_stock.items():
                await manager.broadcast_to_role(
                    "stock_updated",
                    {
                        "product_id": product_id,
                        "available_stock_lots": new_stock,
                    },
                    role="admin",
                )
        except Exception as e:
            logger.warning("WebSocket broadcast failed (fire-and-forget): %s", e)


class SpyBroadcaster(NotificationBroadcaster):
    def __init__(self):
        self.calls: list[dict] = []

    async def order_placed(
        self,
        order_id: str,
        readable_order_id: int,
        total_amount: float,
        items: list[dict],
        updated_stock: dict[str, int],
    ) -> None:
        self.calls.append({
            "order_id": order_id,
            "readable_order_id": readable_order_id,
            "total_amount": total_amount,
            "items": items,
            "updated_stock": dict(updated_stock),
        })


_notifier_instance: NotificationBroadcaster | None = None


def get_notifier() -> NotificationBroadcaster:
    global _notifier_instance
    if _notifier_instance is None:
        _notifier_instance = WebSocketBroadcaster()
    return _notifier_instance
