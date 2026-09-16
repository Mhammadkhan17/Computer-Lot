import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from supabase import Client

from app.config import settings
from app.database import get_supabase
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
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["explore"])
limiter = Limiter(key_func=get_remote_address)

BSTOCK_API = "https://search.bstock.com/v1/all-listings/listings"
TARGET_CATEGORIES = {"electronics", "cell phones", "office supplies & equipment", "small appliances", "mixed lots"}


def _assert_admin(user: dict, supabase: Client) -> None:
    user_id = user["sub"]
    profile_resp = supabase.table("profiles").select("role").eq("id", user_id).execute()
    rows = profile_resp.data or []
    if not rows or rows[0].get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def _in_target_category(listing: dict) -> bool:
    categories = [c.lower() for c in (listing.get("categories") or [])]
    return any(c in TARGET_CATEGORIES for c in categories)


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
@limiter.limit("10/minute")
async def get_listings(
    request: Request,
    search: str = Query("", max_length=200),
    max_results: int = Query(50, ge=1, le=200),
):
    params = {"sortBy": "endTime", "sortOrder": "asc", "offset": 0, "limit": 100}
    if search:
        params["q"] = search

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(BSTOCK_API, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("B-Stock API unreachable: %s", e)
        return ListingsResponse(listings=[], total=0, error="Unable to fetch live listings from B-Stock. Please try again later.")

    raw = data.get("listings", [])
    filtered = [l for l in raw if _in_target_category(l)]

    filtered.sort(key=lambda l: l.get("endTime") or "")
    listings = [_normalize(l) for l in filtered[:max_results]]

    return ListingsResponse(listings=listings, total=len(listings))


@router.post("/explore/requests", status_code=201)
@limiter.limit("5/minute")
async def create_sourcing_request(
    request: Request,
    body: SourcingRequestCreate,
    user: dict = Depends(get_current_user),
):
    record = create_request({
        "user_id": user["sub"],
        "user_email": user.get("email", ""),
        **body.model_dump(),
    })
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
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)
    return get_all_requests(status_filter or None)


@router.patch("/admin/explore/requests/{request_id}/status")
async def change_request_status(
    request_id: str,
    body: StatusUpdate,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    _assert_admin(user, supabase)
    valid = {"pending", "contacted", "declined"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    result = update_request_status(request_id, body.status)
    if not result:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"id": result["id"], "status": result["status"]}
