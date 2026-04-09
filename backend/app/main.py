import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.auth.router import router as auth_router
from app.config import settings
from app.cv.router import router as cv_router
from app.cv_storage.storage import delete_all_for_user as delete_stored_cvs
from app.drafts.db import delete_all_for_user as delete_user_drafts
from app.drafts.router import router as drafts_router
from app.export.router import router as export_router
from app.graph.neo4j_client import close_driver, get_driver
from app.notes.router import router as notes_router
from app.orbs.router import router as orbs_router
from app.rate_limit import limiter
from app.search.router import router as search_router

logging.basicConfig(level=logging.INFO)


async def _cleanup_expired_accounts(driver):
    """Permanently delete accounts past the 30-day grace period."""
    async with driver.session() as session:
        # Find expired accounts
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
            logging.getLogger(__name__).info(
                "Permanently deleted expired account: %s", user_id
            )
            # Clean up secondary databases
            try:
                delete_stored_cvs(user_id)
            except Exception as e:
                logging.getLogger(__name__).warning(
                    "Failed to delete CV for %s: %s", user_id, e
                )
            try:
                delete_user_drafts(user_id)
            except Exception as e:
                logging.getLogger(__name__).warning(
                    "Failed to delete drafts for %s: %s", user_id, e
                )

    if expired:
        logging.getLogger(__name__).info(
            "Cleaned up %d expired account(s)", len(expired)
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Neo4j connection
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    # Clean up expired accounts on startup
    await _cleanup_expired_accounts(driver)
    yield
    # Shutdown
    await close_driver()


app = FastAPI(title="Orbis API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded. Try again in {exc.detail} seconds."},
    )


app.include_router(auth_router)
app.include_router(orbs_router)
app.include_router(cv_router)
app.include_router(export_router)
app.include_router(notes_router)
app.include_router(drafts_router)
app.include_router(search_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
