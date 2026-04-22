import contextlib
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.config import settings
from app.cv.jobs_router import router as cv_jobs_router
from app.cv.router import router as cv_router
from app.drafts.router import router as drafts_router
from app.export.router import router as export_router
from app.graph.neo4j_client import close_driver, get_driver
from app.ideas.router import router as ideas_router
from app.notes.router import router as notes_router
from app.orbs.router import router as orbs_router
from app.rate_limit import limiter
from app.search.router import router as search_router

# ── Structured JSON logging (Cloud Logging compatible) ──


class _CloudRunFormatter(logging.Formatter):
    """Emit JSON lines that Cloud Logging parses natively."""

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "severity": record.levelname,
                "message": record.getMessage(),
                "module": record.module,
                "timestamp": self.formatTime(record),
            }
        )


def _setup_logging() -> None:
    """Configure structured logging for production, basic for development."""
    if settings.env == "development":
        logging.basicConfig(level=logging.INFO)
    else:
        handler = logging.StreamHandler()
        handler.setFormatter(_CloudRunFormatter())
        logging.basicConfig(level=logging.INFO, handlers=[handler])


_setup_logging()
logger = logging.getLogger(__name__)


# ── Cleanup logic (called via POST /admin/cleanup, not on startup) ──


async def cleanup_expired_accounts() -> int:
    """Permanently delete accounts past the 30-day grace period.

    Called by the POST /admin/cleanup endpoint (triggered by Cloud Scheduler
    in production). NOT called during startup to keep cold starts fast.
    """
    from app.cv_storage.storage import delete_all_for_user as delete_stored_cvs
    from app.drafts.db import delete_all_for_user as delete_user_drafts
    from app.snapshots.db import delete_all_for_user as delete_user_snapshots

    driver = await get_driver()
    async with driver.session() as session:
        result = await session.run(
            """
            MATCH (p:Person)
            WHERE p.deletion_requested_at IS NOT NULL
            AND datetime(p.deletion_requested_at) < datetime() - duration('P30D')
            RETURN p.user_id AS user_id
            """
        )
        expired = [record["user_id"] async for record in result]

        for user_id in expired:
            await session.run(
                "MATCH (p:Person {user_id: $uid})-[*1..]->(n) "
                "WITH DISTINCT n DETACH DELETE n",
                uid=user_id,
            )
            await session.run(
                "MATCH (p:Person {user_id: $uid}) DETACH DELETE p",
                uid=user_id,
            )
            await session.run(
                "CREATE (:DeletionRecord {user_id: $uid, deleted_at: datetime()})",
                uid=user_id,
            )
            logger.info("Permanently deleted expired account: %s", user_id)
            with contextlib.suppress(Exception):
                await delete_stored_cvs(user_id)
            with contextlib.suppress(Exception):
                await delete_user_drafts(user_id)
            with contextlib.suppress(Exception):
                await delete_user_snapshots(user_id)

    if expired:
        logger.info("Cleaned up %d expired account(s)", len(expired))
    return len(expired)


# ── Lifespan ──


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Neo4j connection
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    logger.info("Neo4j connection verified")
    # Initialize PostgreSQL pool (if configured)
    if settings.database_url:
        from app.db.postgres import get_pool

        await get_pool()
        logger.info("PostgreSQL pool initialized")

        from app.cv.jobs_db import cleanup_expired_jobs, ensure_table
        from app.ideas.db import ensure_source_column
        from app.oauth.db import ensure_oauth_schema

        await ensure_table()
        await ensure_source_column()
        await ensure_oauth_schema(await get_pool())
        expired = await cleanup_expired_jobs()
        if expired:
            logger.info("Cleaned up %d expired CV jobs", expired)
    yield
    # Shutdown
    if settings.database_url:
        from app.db.postgres import close_pool

        await close_pool()
    await close_driver()
    logger.info("Shutdown complete")


app = FastAPI(title="Orbis API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

_cors_origins = [settings.frontend_url]
if settings.cors_extra_origins:
    _cors_origins.extend(
        o.strip() for o in settings.cors_extra_origins.split(",") if o.strip()
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)


_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
}


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in _SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    if settings.env != "development":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        )
    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded. Try again in {exc.detail} seconds."},
    )


# In production, Firebase Hosting rewrites /api/** → Cloud Run.
# The /api prefix is NOT stripped, so all routers must be mounted under /api.
# In development, Vite proxies /api/** → localhost:8000 and strips the prefix,
# so we also mount without prefix for backward compatibility.
_API_PREFIX = "/api"

app.include_router(auth_router, prefix=_API_PREFIX)
app.include_router(orbs_router, prefix=_API_PREFIX)
app.include_router(cv_router, prefix=_API_PREFIX)
app.include_router(cv_jobs_router, prefix=_API_PREFIX)
app.include_router(export_router, prefix=_API_PREFIX)
app.include_router(notes_router, prefix=_API_PREFIX)
app.include_router(drafts_router, prefix=_API_PREFIX)
app.include_router(search_router, prefix=_API_PREFIX)
app.include_router(admin_router, prefix=_API_PREFIX)
app.include_router(ideas_router, prefix=_API_PREFIX)

# Also mount without prefix for dev (Vite proxy strips /api)
app.include_router(auth_router)
app.include_router(orbs_router)
app.include_router(cv_router)
app.include_router(cv_jobs_router)
app.include_router(export_router)
app.include_router(notes_router)
app.include_router(drafts_router)
app.include_router(search_router)
app.include_router(admin_router)
app.include_router(ideas_router)


# ── Health endpoints ──


@app.get("/health")
async def health():
    """Liveness probe — process is alive and responsive."""
    return {"status": "ok"}


@app.get("/health/live")
async def health_live():
    """Liveness probe — process is alive and responsive."""
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """Readiness probe — dependencies (Neo4j) are reachable."""
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    return {"status": "ok", "neo4j": "connected"}
