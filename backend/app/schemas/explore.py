from pydantic import BaseModel, Field
from typing import Any


class ListingOut(BaseModel):
    lot_id: str
    title: str
    auction_url: str
    current_bid: float | None = None
    msrp: float | None = None
    currency: str = "USD"
    pallet_count: int | None = None
    unit_count: int | None = None
    condition: str | None = None
    source_retailer: str | None = None
    location: str | None = None
    close_time: str | None = None
    image_url: str | None = None
    number_of_bids: int | None = None
    inventory_type: str | None = None


class SourcingRequestCreate(BaseModel):
    listing_url: str
    title: str
    current_bid: float | None = None
    msrp: float | None = None
    pallet_count: int | None = None
    unit_count: int | None = None
    source_retailer: str | None = None
    condition: str | None = None
    location: str | None = None
    quantity_requested: int = Field(default=1, ge=1)
    notes: str = ""


class SourcingRequestOut(BaseModel):
    id: str
    listing_url: str
    title: str
    current_bid: float | None = None
    msrp: float | None = None
    pallet_count: int | None = None
    unit_count: int | None = None
    source_retailer: str | None = None
    condition: str | None = None
    location: str | None = None
    quantity_requested: int
    notes: str
    status: str
    created_at: str
    user_id: str | None = None


class StatusUpdate(BaseModel):
    status: str


class ListingsResponse(BaseModel):
    listings: list[ListingOut]
    total: int
