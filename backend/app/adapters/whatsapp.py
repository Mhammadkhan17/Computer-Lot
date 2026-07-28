from urllib.parse import quote

from app.config import settings


def build_order_link(readable_order_id, customer_name, total_amount, items):
    lines = [
        f"New Order #{readable_order_id}",
        f"Customer: {customer_name}",
        "Items:",
    ]
    for item in items:
        lines.append(
            f"- {item['quantity_ordered']}x {item['title']} "
            f"= ${item['unit_price_applied']:.2f} each"
        )
    lines.append(f"Total: ${total_amount:.2f}")
    lines.append(f"View order: {settings.frontend_url}/receipts/{readable_order_id}")
    message = "\n".join(lines)
    return f"https://wa.me/{settings.merchant_phone}?text={quote(message)}"