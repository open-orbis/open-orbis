"""Voice onboarding endpoints: transcribe audio + classify with Ollama."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.cv import counter
from app.cv.models import ExtractedData
from app.cv.ollama_classifier import classify_entries
from app.cv.whisper import transcribe_audio
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["cv-voice"])


class TranscribeResponse(BaseModel):
    text: str


class ClassifyRequest(BaseModel):
    text: str


@router.post("/voice-transcribe", response_model=TranscribeResponse)
async def voice_transcribe(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Transcribe an audio recording using local Whisper."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No audio file provided")

    audio_bytes = await file.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file too small")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25MB)")

    try:
        text = await transcribe_audio(audio_bytes, file.filename or "audio.webm")
        if not text:
            return TranscribeResponse(text="")
        return TranscribeResponse(text=text)
    except Exception as e:
        logger.error("Whisper transcription failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}",
        ) from e


@router.post("/voice-classify", response_model=ExtractedData)
async def voice_classify(
    payload: ClassifyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Classify transcribed voice text into graph entries using Ollama."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="No text to classify")

    counter.increment()
    try:
        result = await classify_entries(payload.text)
        return ExtractedData(
            nodes=result.nodes,
            unmatched=result.unmatched,
            skipped_nodes=result.skipped,
            relationships=result.relationships,
            truncated=result.truncated,
        )
    except Exception as e:
        logger.error("Voice classification failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Classification failed: {str(e)}",
        ) from e
    finally:
        counter.decrement()
