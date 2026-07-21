import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.explore_storage import (
    create_request,
    get_all_requests,
    get_user_requests,
    update_request_status,
)
from app.schemas.explore import (
    ListingOut,
    ListingsResponse,
    SourcingRequestCreate,
    SourcingRequestOut,
    StatusUpdate,
)
from app.utils.security import check_role, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["explore"])

BSTOCK_API = "https://search.bstock.com/v1/all-listings/listings"
HARDWARE_KEYWORDS = [
    "computer", "laptop", "desktop", "monitor", "server",
    "hard drive", "ssd", "ram", "motherboard", "cpu",
    "graphics card", "gpu", "networking", "router", "switch",
    "peripheral", "keyboard", "mouse", "tablet", "ipad",
    "macbook", "thinkpad", "chromebook", "workstation",
    "notebook", "all-in-one", "apple", "microsoft surface",
    "access point", "firewall", "nas", "raid", "docking",
]
TARGET_CATEGORIES = {"Electronics", "Cell Phones", "Office Supplies & Equipment"}


def _is_hardware_listing(listing: dict) -> bool:
    title = (listing.get("title") or "").lower()
    categories = [c.lower() for c in (listing.get("categories") or [])]
    cat_match = any(c in TARGET_CATEGORIES for c in categories)
    kw_match = any(kw in title for kw in HARDWARE_KEYWORDS)
    return cat_match or kw_match


def _normalize(listing: dict) -> ListingOut:
    return ListingOut(
        lot_id=listing.get("lotId") or listing.get("id", ""),
        title=listing.get("title", ""),
        auction_url=listing.get("auctionUrl", ""),
        current_bid=listing.get("winningBidAmount"),
        msrp=listing.get("retailPrice"),
        currency=listing.get("currency", "USD"),
        pallet_count=listing.get("palletCount"),
        unit_count=listing.get("units"),
        condition=listing.get("displayedCondition") or listing.get("condition", [None])[0],
        source_retailer=listing.get("storefrontName"),
        location=listing.get("region"),
        close_time=listing.get("endTime"),
        image_url=listing.get("primaryImageUrl"),
        number_of_bids=listing.get("numberOfBids"),
        inventory_type=listing.get("inventoryType"),
    )


@router.get("/explore/listings", response_model=ListingsResponse)
async def get_listings(
    search: str = Query("", max_length=200),
    max_results: int = Query(50, ge=1, le=200),
):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                BSTOCK_API,
                params={"sortBy": "endTime", "sortOrder": "asc", "offset": 0, "limit": 100},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("B-Stock API unreachable: %s", e)
        return ListingsResponse(listings=[], total=0)

    raw = data.get("listings", [])
    filtered = [l for l in raw if _is_hardware_listing(l)]

    if search:
        q = search.lower()
        filtered = [
            l for l in filtered
            if q in (l.get("title") or "").lower()
            or q in (l.get("storefrontName") or "").lower()
        ]

    filtered.sort(key=lambda l: l.get("endTime") or "")
    listings = [_normalize(l) for l in filtered[:max_results]]

    return ListingsResponse(listings=listings, total=len(listings))


@router.post("/explore/requests", status_code=201)
async def create_sourcing_request(
    body: SourcingRequestCreate,
    user: dict = Depends(get_current_user),
):
    record = create_request({"user_id": user["sub"], **body.model_dump()})
    return {"id": record["id"]}


@router.get("/explore/requests", response_model=list[SourcingRequestOut])
async def list_my_requests(
    user: dict = Depends(get_current_user),
):
    return get_user_requests(user["sub"])


@router.get("/admin/explore/requests", response_model=list[SourcingRequestOut])
async def list_all_requests(
    status_filter: str = Query("", alias="status"),
    user: dict = Depends(get_current_user),
):
    if not check_role(user, "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return get_all_requests(status_filter or None)


@router.patch("/admin/explore/requests/{request_id}/status")
async def change_request_status(
    request_id: str,
    body: StatusUpdate,
    user: dict = Depends(get_current_user),
):
    if not check_role(user, "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    valid = {"pending", "contacted", "declined"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    result = update_request_status(request_id, body.status)
    if not result:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"id": result["id"], "status": result["status"]}
