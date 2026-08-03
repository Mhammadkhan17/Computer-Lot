from app.schemas.order import OrderItemResponse


def resolve_price(product: dict, quantity: int, role: str, total_lots: int) -> float:
    """Resolve the unit price for one line item under the three-tier rule.

    Authoritative pricing rule (see docs/superpowers/specs/2026-08-03-three-tier-pricing-design.md).
    Resolved in this order for each line item:
      1. quantity < minimum_wholesale_lots        -> retail_price_per_lot
      2. role == "wholesale_approved" (any size)  -> approved_price_per_lot
      3. total_lots >= 10 (any role, incl. admin) -> wholesale_price_per_lot
      4. otherwise                                -> retail_price_per_lot

    ``approved_price_per_lot`` is NOT NULL in the DB (migration 009), but the
    key may be absent in test fixtures or stale product payloads; in that case
    we defensively fall back to the wholesale price (the documented backfill
    value). As a mirror of the DB CHECK, an approved price above wholesale
    (bad config) is ignored in favor of wholesale rather than overcharged.
    """
    if quantity < product["minimum_wholesale_lots"]:
        return float(product["retail_price_per_lot"])

    if role == "wholesale_approved":
        approved = product.get("approved_price_per_lot")
        if approved is not None:
            approved_float = float(approved)
            if approved_float <= float(product["wholesale_price_per_lot"]):
                return approved_float
        # Key absent (fixtures) or approved > wholesale (config error):
        # fall back to wholesale — matches the DB CHECK / backfill semantics.
        return float(product["wholesale_price_per_lot"])

    if total_lots >= 10:
        return float(product["wholesale_price_per_lot"])

    return float(product["retail_price_per_lot"])


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