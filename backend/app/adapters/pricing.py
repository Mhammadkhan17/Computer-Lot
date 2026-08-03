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
    value). Mirrors of the DB CHECKs (products_approved_price_check, migration
    009, and products_wholesale_price_check, migration 010): bad config
    (approved > wholesale or wholesale > retail) is never passed through to the
    customer — we clamp to the retail price rather than overcharge.
    """
    retail = float(product["retail_price_per_lot"])
    wholesale = float(product["wholesale_price_per_lot"])

    if quantity < product["minimum_wholesale_lots"]:
        return retail

    if role == "wholesale_approved":
        approved = product.get("approved_price_per_lot")
        if approved is not None:
            approved_float = float(approved)
            if approved_float <= wholesale:
                return min(approved_float, retail)
        # Key absent (fixtures) or approved > wholesale (config error):
        # fall back to wholesale, still never above retail.
        return min(wholesale, retail)

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