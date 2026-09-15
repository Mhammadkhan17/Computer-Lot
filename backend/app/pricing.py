import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

MIN_WHOLESALE_TOTAL_LOTS = 10


@dataclass
class PricedItem:
    product_id: str
    title: str
    quantity_ordered: int
    unit_price_applied: float
    pricing_tier: str


@dataclass
class PricingResult:
    items: list[PricedItem]
    total_amount: float
    total_lots: int


def compute_line_item_prices(
    items: list[dict],
    profile: dict,
    products_map: dict[str, dict],
) -> PricingResult:
    total_lots = 0
    for item in items:
        product = products_map.get(item["product_id"])
        if product:
            total_lots += item["quantity"]

    is_wholesale = (
        profile.get("role") == "wholesale_approved"
        and total_lots >= MIN_WHOLESALE_TOTAL_LOTS
    )

    priced_items: list[PricedItem] = []
    total_amount = 0.0

    for item in items:
        product = products_map.get(item["product_id"])
        title = product["title"] if product else "Unknown Product"

        if is_wholesale and product and item["quantity"] >= product["minimum_wholesale_lots"]:
            price = float(product["wholesale_price_per_lot"])
            tier = "wholesale"
        else:
            price = float(product["retail_price_per_lot"]) if product else 0.0
            tier = "retail"

        priced_items.append(PricedItem(
            product_id=item["product_id"],
            title=title,
            quantity_ordered=item["quantity"],
            unit_price_applied=price,
            pricing_tier=tier,
        ))
        total_amount += price * item["quantity"]

    return PricingResult(
        items=priced_items,
        total_amount=total_amount,
        total_lots=total_lots,
    )
