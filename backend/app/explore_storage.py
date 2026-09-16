from supabase import Client

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        from app.database import get_service_role_supabase
        _client = get_service_role_supabase()
    return _client


def create_request(data: dict) -> dict:
    client = _get_client()
    result = client.table("sourcing_requests").insert({
        "user_id": data["user_id"],
        "user_email": data.get("user_email"),
        "phone": data.get("phone") or None,
        "listing_url": data["listing_url"],
        "title": data["title"],
        "current_bid": float(data["current_bid"]) if data.get("current_bid") else None,
        "msrp": float(data["msrp"]) if data.get("msrp") else None,
        "pallet_count": data.get("pallet_count"),
        "unit_count": data.get("unit_count"),
        "source_retailer": data.get("source_retailer"),
        "condition": data.get("condition"),
        "location": data.get("location"),
        "quantity_requested": data.get("quantity_requested", 1),
        "notes": data.get("notes", ""),
        "status": "pending",
    }).execute()
    return result.data[0] if result.data else {}


def get_user_requests(user_id: str) -> list[dict]:
    client = _get_client()
    result = (
        client.table("sourcing_requests")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_all_requests(status: str | None = None) -> list[dict]:
    client = _get_client()
    query = client.table("sourcing_requests").select("*")
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


def update_request_status(request_id: str, new_status: str) -> dict | None:
    client = _get_client()
    result = (
        client.table("sourcing_requests")
        .update({"status": new_status})
        .eq("id", request_id)
        .execute()
    )
    return result.data[0] if result.data else None
