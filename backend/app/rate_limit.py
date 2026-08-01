import jwt
from fastapi import Request
from slowapi import Limiter

from app.config import settings


def _rate_limit_key(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):]
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    ip = request.client.host if request.client else "unknown"
    return f"ip:{ip}"


limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=["60/minute"],
    in_memory_fallback_enabled=True,
)
