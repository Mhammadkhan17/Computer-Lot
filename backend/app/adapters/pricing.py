from app.schemas.order import OrderItemResponse


def resolve_price(product, quantity, role, total_lots):
    is_wholesale = role == "wholesale_approved" and total_lots >= 10
    if is_wholesale and quantity >= product["minimum_wholesale_lots"]:
        unit_price = float(product["wholesale_price_per_lot"])
    else:
        unit_price = float(product["retail_price_per_lot"])
    return unit_price


def resolve_all_items(products_map, checkout_items, role, total_lots):
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