import csv
import io

CSV_HEADERS = [
    "title", "sku", "description", "grade", "items_per_lot",
    "retail_price_per_lot", "wholesale_price_per_lot",
    "minimum_wholesale_lots",
    "available_stock_lots", "image_urls", "tags", "hardware_specifications",
]

TEMPLATE_ROW = {
    "title": "Example Product",
    "sku": "EX-001",
    "description": "A sample product description",
    "grade": "Grade_A",
    "items_per_lot": "1",
    "retail_price_per_lot": "199.99",
    "wholesale_price_per_lot": "149.99",
    "minimum_wholesale_lots": "5",
    "available_stock_lots": "20",
    "image_urls": "https://example.com/img1.jpg, https://example.com/img2.jpg",
    "tags": "example, sample, demo",
    "hardware_specifications": '{"key": "value"}',
}


def parse_rows(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def get_headers() -> list[str]:
    return list(CSV_HEADERS)


def get_template_row() -> dict:
    return dict(TEMPLATE_ROW)