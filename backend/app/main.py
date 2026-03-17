from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.config import settings
from app.cv.router import router as cv_router
from app.export.router import router as export_router
from app.graph.neo4j_client import close_driver, get_driver
from app.orbs.router import router as orbs_router
from app.messages.router import router as messages_router
from app.search.router import router as search_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Neo4j connection
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    yield
    # Shutdown
    await close_driver()


app = FastAPI(title="Orbis API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(orbs_router)
app.include_router(cv_router)
app.include_router(export_router)
app.include_router(messages_router)
app.include_router(search_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe_audio():
    """Placeholder transcription endpoint.

    In production, this would use Whisper or a cloud speech-to-text API.
    For now, the Web Speech API handles transcription client-side in Chrome.
    This endpoint exists as a fallback for non-Chrome browsers.
    """
    return {"text": "", "error": "Transcription service not configured. Use Chrome for voice notes with real-time transcription."}
