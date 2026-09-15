import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request as StarletteRequest

from app.config import settings
from app.rate_limit import limiter
from app.routes.admin import router as admin_router
from app.routes.wholesale import router as wholesale_router
from app.routes.checkout import router as checkout_router
from app.routes.explore import router as explore_router
from app.routes.ws import router as ws_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def parse_cors_origins(raw: str) -> list[str]:
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if not origins:
        raise ValueError("cors_origins must contain at least one origin")
    if "*" in origins:
        raise ValueError("cors_origins must not contain '*' when allow_credentials=True")
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(SlowAPIMiddleware)

app.include_router(admin_router)
app.include_router(wholesale_router)
app.include_router(checkout_router)
app.include_router(explore_router)
app.include_router(ws_router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    if not isinstance(request, StarletteRequest):
        raise exc
    return JSONResponse(
        status_code=500,
        content={"detail": "Unexpected error, please retry"},
    )


@app.get("/")
def root():
    return {"app": settings.app_name, "docs": "/docs", "health": "/health"}


@app.get("/health")
def health_check():
    return {"status": "ok"}
