import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import jwt
from jwt.exceptions import PyJWTError

from app.config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


async def verify_jwt(token: str) -> dict:
    """Verify JWT by calling Supabase Auth server (recommended approach)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {token}",
                },
            )
            if resp.status_code == 200:
                user_data = resp.json()
                logger.info("JWT verified via Auth server for user: %s", user_data.get("id"))
                return {
                    "sub": user_data.get("id"),
                    "email": user_data.get("email"),
                    "role": user_data.get("role", "authenticated"),
                }
            logger.warning(
                "Auth server rejected token: %s %s",
                resp.status_code,
                resp.text[:200],
            )
    except httpx.RequestError as e:
        logger.warning("Auth server unreachable, falling back to local verification: %s", e)
        return _verify_jwt_locally(token)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )


def _verify_jwt_locally(token: str) -> dict:
    """Fallback JWT verification using the shared secret."""
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        logger.info("JWT verified locally for user: %s", payload.get("sub"))
        return payload
    except PyJWTError as e:
        logger.error("Local JWT verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    if credentials is None:
        logger.warning("Missing authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )
    return await verify_jwt(credentials.credentials)


def check_role(payload: dict, required_role: str) -> bool:
    role = payload.get("role", "retail")
    return role == required_role or role == "admin"
