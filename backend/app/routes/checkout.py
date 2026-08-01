import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from supabase import Client

from app.adapters.order_intake import InsufficientStockError, create as create_order
from app.database import get_supabase
from app.schemas.order import CheckoutRequest, CheckoutResponse, ErrorResponse, StockErrorItem
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/checkout", tags=["checkout"])


@router.post("", response_model=CheckoutResponse | ErrorResponse)
async def create_checkout(
    checkout_req: CheckoutRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    user_id = user["sub"]
    try:
        return await create_order(checkout_req, supabase, user_id)
    except InsufficientStockError as e:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                error="insufficient_stock",
                out_of_stock=[
                    StockErrorItem(
                        product_id=err.product_id,
                        title=err.title,
                        available=err.available,
                        requested=err.requested,
                    )
                    for err in e.stock_errors
                ],
            ).model_dump(),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected checkout error")
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(error="internal_error", detail=str(e)).model_dump(),
        )