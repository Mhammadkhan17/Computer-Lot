import asyncio
import logging

import httpx
from fastapi import HTTPException, status
from supabase import Client

from app.adapters.notification import broadcast_order_update
from app.adapters.pricing import resolve_all_items
from app.adapters.stock import check_availability
from app.adapters.txn import run_in_transaction
from app.adapters.whatsapp import build_order_link
from app.schemas.order import CheckoutRequest, CheckoutResponse, ErrorResponse, StockErrorItem

logger = logging.getLogger(__name__)


class InsufficientStockError(Exception):
    def __init__(self, stock_errors: list[StockErrorItem]) -> None:
        self.stock_errors = stock_errors
        super().__init__("insufficient_stock")


def _fetch_profile(supabase: Client, user_id: str) -> dict:
    resp = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return resp.data


def _fetch_products(supabase: Client, product_ids: list[str]) -> dict[str, dict]:
    try:
        resp = supabase.table("products").select("*").in_("id", product_ids).execute()
    except httpx.RemoteProtocolError as exc:
        logger.warning("HTTP/2 connection error fetching products, retrying once: %s", exc)
        try:
            resp = supabase.table("products").select("*").in_("id", product_ids).execute()
        except httpx.RemoteProtocolError as exc2:
            logger.error("HTTP/2 connection error fetching products on retry: %s", exc2)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service temporarily unavailable, please try again",
            ) from exc2
    products_list = resp.data or []
    return {p["id"]: p for p in products_list}


def _validate_stock(products_map: dict[str, dict], checkout_req: CheckoutRequest) -> list[dict]:
    quantities = [
        {"product_id": item.product_id, "quantity": item.quantity}
        for item in checkout_req.items
    ]
    products_list = list(products_map.values())
    return check_availability(products_list, quantities)


def _resolve_pricing(
    products_map: dict[str, dict],
    checkout_req: CheckoutRequest,
    role: str,
    total_lots: int,
) -> list:
    quantities = [
        {"product_id": item.product_id, "quantity": item.quantity}
        for item in checkout_req.items
    ]
    return resolve_all_items(products_map, quantities, role, total_lots)


def _build_order_data(customer_name: str, customer_phone: str, total_amount: float, user_id: str) -> dict:
    return {
        "user_id": user_id,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "total_amount": total_amount,
    }


async def create(checkout_req: CheckoutRequest, supabase: Client, user_id: str) -> CheckoutResponse:
    profile = _fetch_profile(supabase, user_id)
    customer_name = profile.get("full_name", "Unknown")
    customer_phone = profile.get("phone") or ""
    role = profile.get("role", "retail")

    product_ids = [item.product_id for item in checkout_req.items]
    products_map = _fetch_products(supabase, product_ids)

    stock_errors = _validate_stock(products_map, checkout_req)
    if stock_errors:
        raise InsufficientStockError(stock_errors)

    total_lots = sum(item.quantity for item in checkout_req.items)
    resolved_items = _resolve_pricing(products_map, checkout_req, role, total_lots)

    total_amount = sum(item.unit_price_applied * item.quantity_ordered for item in resolved_items)

    order_data = _build_order_data(customer_name, customer_phone, total_amount, user_id)
    txn_result = await asyncio.to_thread(run_in_transaction, supabase, order_data, resolved_items)
    order_id = txn_result["order_id"]
    readable_order_id = txn_result["readable_order_id"]

    whatsapp_link = build_order_link(readable_order_id, customer_name, total_amount, resolved_items)

    await broadcast_order_update({
        "order_id": order_id,
        "readable_order_id": readable_order_id,
        "total_amount": total_amount,
        "customer_name": customer_name,
    })

    return CheckoutResponse(
        order_id=order_id,
        readable_order_id=readable_order_id,
        total_amount=total_amount,
        whatsapp_deep_link=whatsapp_link,
        items=resolved_items,
    )