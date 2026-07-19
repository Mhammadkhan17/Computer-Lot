from pydantic import BaseModel, Field


class CheckoutItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)


class CheckoutRequest(BaseModel):
    items: list[CheckoutItem]


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
    out_of_stock: list[StockErrorItem] | None = None


class OrderStatusUpdate(BaseModel):
    status: str
