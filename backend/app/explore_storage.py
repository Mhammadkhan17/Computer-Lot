import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "sourcing_requests.json"


def _ensure_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        DB_PATH.write_text("[]")


def _read_all() -> list[dict]:
    _ensure_db()
    return json.loads(DB_PATH.read_text())


def _write_all(records: list[dict]):
    _ensure_db()
    DB_PATH.write_text(json.dumps(records, indent=2, default=str))


def create_request(data: dict) -> dict:
    records = _read_all()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": data["user_id"],
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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    records.append(record)
    _write_all(records)
    return record


def get_user_requests(user_id: str) -> list[dict]:
    return [r for r in _read_all() if r["user_id"] == user_id]


def get_all_requests(status: str | None = None) -> list[dict]:
    records = _read_all()
    if status:
        records = [r for r in records if r["status"] == status]
    return records


def update_request_status(request_id: str, new_status: str) -> dict | None:
    records = _read_all()
    for r in records:
        if r["id"] == request_id:
            r["status"] = new_status
            _write_all(records)
            return r
    return None
