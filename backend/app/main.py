import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.config import settings
from app.cv.router import router as cv_router
from app.export.router import router as export_router
from app.graph.neo4j_client import close_driver, get_driver
from app.messages.router import router as messages_router
from app.notes.router import router as notes_router
from app.orbs.router import router as orbs_router
from app.search.router import router as search_router
from app.analytics.middleware import AnalyticsMiddleware
from app.analytics.posthog_client import init_posthog, shutdown_posthog
from app.admin.router import router as admin_router
from app.admin.db import init_admin_db, close_admin_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Neo4j connection
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    init_posthog()
    try:
        await init_admin_db()
    except Exception:
        logger.warning("Admin DB not available — admin features disabled")
    yield
    # Shutdown
    await close_admin_db()
    shutdown_posthog()
    await close_driver()


app = FastAPI(title="Orbis API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AnalyticsMiddleware)

app.include_router(auth_router)
app.include_router(orbs_router)
app.include_router(cv_router)
app.include_router(export_router)
app.include_router(messages_router)
app.include_router(notes_router)
app.include_router(search_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
