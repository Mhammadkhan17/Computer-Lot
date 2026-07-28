import json


def normalize_row(row: dict) -> dict:
    images = _parse_list(row.get("image_urls"))
    tags = _parse_list(row.get("tags"))
    specs = _parse_json(row.get("hardware_specifications"))

    return {
        "title": row["title"],
        "sku": row["sku"],
        "description": row.get("description"),
        "grade": row.get("grade", "Grade_A"),
        "items_per_lot": row.get("items_per_lot", 1),
        "retail_price_per_lot": row["retail_price_per_lot"],
        "wholesale_price_per_lot": row["wholesale_price_per_lot"],
        "minimum_wholesale_lots": row.get("minimum_wholesale_lots", 5),
        "available_stock_lots": row["available_stock_lots"],
        "images": images,
        "tags": tags,
        "hardware_specifications": specs,
    }


def _parse_list(raw: str | None) -> list[str] | None:
    if not raw or not raw.strip():
        return None
    return [s.strip() for s in raw.split(",") if s.strip()]


def _parse_json(raw: str | None) -> dict:
    if not raw or not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}