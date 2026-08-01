from pydantic import BaseModel, Field

from app.schemas.order import OrderStatusUpdate


class AdminActionResponse(BaseModel):
    status: str
    message: str | None = None


class ExpireOrdersRequest(BaseModel):
    older_than_hours: int = Field(default=24, gt=0, le=720)
