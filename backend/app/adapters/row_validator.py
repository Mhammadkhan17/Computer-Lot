VALID_GRADES = {"Grade_A", "Grade_B", "Grade_C", "For_Parts"}


def validate_row(row: dict) -> tuple[dict, list[str]]:
    errs: list[str] = []

    title = row.get("title", "").strip()
    if not title:
        errs.append("Missing title")

    sku = row.get("sku", "").strip()
    if not sku:
        errs.append("Missing SKU")

    grade = row.get("grade", "").strip()
    if grade and grade not in VALID_GRADES:
        errs.append(f"Invalid grade '{grade}'")

    retail, retail_err = _parse_float(row.get("retail_price_per_lot", ""), "retail price")
    if retail_err:
        errs.append(retail_err)

    wholesale, wholesale_err = _parse_float(row.get("wholesale_price_per_lot", ""), "wholesale price")
    if wholesale_err:
        errs.append(wholesale_err)

    stock = None
    stock_raw = row.get("available_stock_lots", "0")
    try:
        stock = int(stock_raw)
    except (ValueError, TypeError):
        pass
    if stock is None:
        errs.append("Missing or invalid stock count")
    elif stock < 0:
        errs.append("Stock must be >= 0")

    if errs:
        return {}, errs

    items_per_lot = 1
    default_1, _ = _parse_int(row.get("items_per_lot", "").strip() or "1", "items per lot")
    if default_1 is not None:
        items_per_lot = default_1

    min_wholesale = 5
    default_5, _ = _parse_int(row.get("minimum_wholesale_lots", "").strip() or "5", "minimum wholesale lots")
    if default_5 is not None:
        min_wholesale = default_5

    return {
        "title": title,
        "sku": sku,
        "description": row.get("description", "").strip() or None,
        "grade": grade or "Grade_A",
        "items_per_lot": items_per_lot,
        "retail_price_per_lot": retail,
        "wholesale_price_per_lot": wholesale,
        "minimum_wholesale_lots": min_wholesale,
        "available_stock_lots": stock,
    }, []


def _parse_float(raw: str, label: str) -> tuple[float | None, str | None]:
    try:
        val = float(raw)
        if val <= 0:
            return None, f"{label} must be > 0"
        return val, None
    except (ValueError, TypeError):
        return None, f"Missing or invalid {label}"


def _parse_int(raw: str, label: str) -> tuple[int | None, str | None]:
    try:
        return int(raw), None
    except (ValueError, TypeError):
        return None, f"Missing or invalid {label}"