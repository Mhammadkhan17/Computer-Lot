from pydantic import BaseModel

from app.schemas.order import OrderStatusUpdate


class AdminActionResponse(BaseModel):
    status: str
    message: str | None = None
