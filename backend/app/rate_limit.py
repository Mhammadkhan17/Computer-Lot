import jwt
from fastapi import Request
from slowapi import Limiter

from app.config import settings

# ============================================================
# M-R3-3 (security review round 3): deployment model for the rate limiter.
#
# The limiter storage is IN-MEMORY and therefore PER-PROCESS. This is a
# deliberate single-process deployment assumption: `uvicorn main:app`
# (one worker, no --workers N, no gunicorn/load-balancer fan-out). Under
# any multi-worker / multi-replica deployment the per-user limits
# (10/minute checkout, 30/minute admin) multiply by the worker count and
# the anti-spam intent is NOT honored.
#
# => BEFORE any horizontal scaling: add a shared storage backend (e.g.
#    Upstash Redis per AGENTS.md) and key by `user:{sub}` as today.
#    See security-todo.txt "M-R3-3 rate limiter storage" for details.
#
# The IP fallback only applies to unauthenticated requests; every
# sensitive endpoint requires a JWT (Bearer), so client.host behind a
# proxy is a secondary concern only.
# ============================================================


def _rate_limit_key(request: Request) -> str:
    """Key the limiter by the authenticated user's JWT sub, else by IP.

    The JWT decode here only needs the `sub` for bucketing; signature and
    claim verification are the responsibility of `verify_jwt` (security.py).
    """
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
