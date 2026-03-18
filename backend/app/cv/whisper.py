"""Whisper speech-to-text client using local Docker container."""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio using local Whisper ASR service.

    Args:
        audio_bytes: Raw audio data (webm, wav, mp3, etc.)
        filename: Original filename for content-type detection

    Returns:
        Transcribed text string.
    """
    base = settings.whisper_api_url.rstrip("/")

    # Determine content type from filename
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "webm"
    content_types = {
        "webm": "audio/webm",
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "ogg": "audio/ogg",
        "m4a": "audio/mp4",
        "flac": "audio/flac",
    }
    content_type = content_types.get(ext, "audio/webm")

    logger.info("Transcribing audio (%d bytes, %s) via Whisper", len(audio_bytes), ext)

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{base}/asr",
            params={
                "task": "transcribe",
                "language": "en",
                "output": "json",
            },
            files={
                "audio_file": (filename, audio_bytes, content_type),
            },
        )
        resp.raise_for_status()
        data = resp.json()

        text = data.get("text", "").strip()
        logger.info("Whisper transcription: %d characters", len(text))
        return text
