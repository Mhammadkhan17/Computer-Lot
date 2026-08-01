from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CheckoutItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=1000)

    @field_validator("product_id")
    @classmethod
    def validate_product_id(cls, value: str) -> str:
        try:
            UUID(value)
        except ValueError:
            raise ValueError("product_id must be a valid UUID")
        return value


class CheckoutRequest(BaseModel):
    items: list[CheckoutItem] = Field(min_length=1, max_length=50)


class OrderItemResponse(BaseModel):
    product_id: str
    title: str
    quantity_ordered: int
    unit_price_applied: float


class CheckoutResponse(BaseModel):
    order_id: str
    readable_order_id: int
    total_amount: float
    whatsapp_deep_link: str
    items: list[OrderItemResponse]


class StockErrorItem(BaseModel):
    product_id: str
    title: str
    available: int
    requested: int


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    out_of_stock: list[StockErrorItem] | None = None


class OrderStatusUpdate(BaseModel):
    status: str
