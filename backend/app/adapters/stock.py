from app.schemas.order import StockErrorItem


class InsufficientStockError(Exception):
    def __init__(self, stock_errors: list[StockErrorItem]) -> None:
        self.stock_errors = stock_errors
        super().__init__("insufficient_stock")


def check_availability(products, quantities):
    products_by_id = {p["id"]: p for p in products}
    errors = []
    for qty_entry in quantities:
        product = products_by_id.get(qty_entry["product_id"])
        if product is None:
            errors.append(
                StockErrorItem(
                    product_id=qty_entry["product_id"],
                    title="Unknown Product",
                    available=0,
                    requested=qty_entry["quantity"],
                )
            )
            continue
        if product["available_stock_lots"] < qty_entry["quantity"]:
            errors.append(
                StockErrorItem(
                    product_id=qty_entry["product_id"],
                    title=product["title"],
                    available=product["available_stock_lots"],
                    requested=qty_entry["quantity"],
                )
            )
    return errors