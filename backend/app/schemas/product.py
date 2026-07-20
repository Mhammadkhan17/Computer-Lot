from pydantic import BaseModel


class RowImportError(BaseModel):
    row: int
    sku: str
    reason: str


class ProductImportResponse(BaseModel):
    inserted: int
    errors: list[RowImportError]
    total_rows: int
