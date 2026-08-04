import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import Client

from app.database import get_user_supabase
from app.rate_limit import limiter
from app.schemas.wholesale import WholesaleApplyRequest, WholesaleApplyResponse
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/wholesale", tags=["wholesale"])

_OK_STATUSES = {"applied", "pending", "approved", "admin"}


@router.post("/apply", response_model=WholesaleApplyResponse)
@limiter.limit("10/minute")
async def apply_for_wholesale(
    request: Request,
    body: WholesaleApplyRequest,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_user_supabase),
):
    resp = supabase.rpc(
        "apply_for_wholesale",
        {"p_company_name": body.company_name, "p_tax_id": body.tax_registration_id or ""},
    ).execute()
    data = resp.data
    if not data or data.get("status") not in _OK_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to apply for wholesale",
        )
    return WholesaleApplyResponse(status=data["status"])
