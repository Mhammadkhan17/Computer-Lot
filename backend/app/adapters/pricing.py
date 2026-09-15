from app.schemas.order import OrderItemResponse


def resolve_price(product: dict, quantity: int, role: str, total_lots: int) -> float:
    """Resolve the unit price for one line item under the two-tier rule.

    Authoritative pricing rule (ADR-001, post reversion from three-tier):
      1. quantity < minimum_wholesale_lots        -> retail_price_per_lot
      2. total_lots >= 10 (any role, incl. admin) -> wholesale_price_per_lot
      3. otherwise                                -> retail_price_per_lot

    The role parameter is retained for backward compatibility with
    order_intake.resolve_all_items() but does not alter pricing.
    """
    retail = float(product["retail_price_per_lot"])
    wholesale = float(product["wholesale_price_per_lot"])

    if quantity < product["minimum_wholesale_lots"]:
        return retail

    if total_lots >= 10:
        return min(wholesale, retail)

    return retail


def resolve_all_items(products_map: dict[str, dict], checkout_items: list[dict], role: str, total_lots: int) -> list[OrderItemResponse]:
    resolved = []
    for item in checkout_items:
        product = products_map.get(item["product_id"])
        if product is None:
            continue
        unit_price = resolve_price(product, item["quantity"], role, total_lots)
        resolved.append(
            OrderItemResponse(
                product_id=item["product_id"],
                title=product["title"],
                quantity_ordered=item["quantity"],
                unit_price_applied=unit_price,
            )
        )
    return resolved