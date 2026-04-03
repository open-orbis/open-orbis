"""LLM Whisperer client for PDF text extraction with table detection."""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

WHISPER_TIMEOUT = 120  # seconds max to wait for processing
POLL_INTERVAL = 2  # seconds between status checks


async def extract_text(pdf_bytes: bytes) -> str:
    """Extract text from a PDF using LLM Whisperer API v2.

    Sends PDF bytes, polls for completion, retrieves extracted text.
    Uses high_quality mode with table line marking enabled.
    """
    base = settings.llmwhisperer_api_url.rstrip("/")
    headers = {"unstract-key": settings.llmwhisperer_api_key}

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Submit PDF for processing
        logger.info("Submitting PDF to LLM Whisperer (%d bytes)", len(pdf_bytes))
        submit_resp = await client.post(
            f"{base}/whisper",
            params={
                "mode": "high_quality",
                "mark_vertical_lines": True,
                "mark_horizontal_lines": True,
                "output_mode": "layout_preserving",
            },
            headers={**headers, "Content-Type": "application/octet-stream"},
            content=pdf_bytes,
        )
        if submit_resp.status_code != 202:
            logger.error(
                "LLM Whisperer submit failed: HTTP %d — %s",
                submit_resp.status_code,
                submit_resp.text[:500],
            )
        submit_resp.raise_for_status()
        whisper_hash = submit_resp.json().get("whisper_hash")

        if not whisper_hash:
            raise RuntimeError("LLM Whisperer did not return a whisper_hash")

        logger.info("Whisper hash: %s — polling for completion", whisper_hash)

        # Step 2: Poll for status
        elapsed = 0
        while elapsed < WHISPER_TIMEOUT:
            status_resp = await client.get(
                f"{base}/whisper-status",
                params={"whisper_hash": whisper_hash},
                headers=headers,
            )
            status_resp.raise_for_status()
            status_data = status_resp.json()
            status = status_data.get("status", "")

            if status == "processed":
                break
            elif status == "error":
                detail = status_data.get("message", "Unknown error")
                raise RuntimeError(f"LLM Whisperer processing error: {detail}")
            elif status in ("accepted", "processing"):
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
            else:
                # Unknown status, wait and retry
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL

        if elapsed >= WHISPER_TIMEOUT:
            logger.error(
                "LLM Whisperer timed out after %ds (hash: %s)",
                WHISPER_TIMEOUT,
                whisper_hash,
            )
            raise TimeoutError(
                f"LLM Whisperer did not finish within {WHISPER_TIMEOUT}s"
            )

        # Step 3: Retrieve extracted text
        retrieve_resp = await client.get(
            f"{base}/whisper-retrieve",
            params={"whisper_hash": whisper_hash},
            headers=headers,
        )
        if retrieve_resp.status_code != 200:
            logger.error(
                "LLM Whisperer retrieve failed: HTTP %d — %s",
                retrieve_resp.status_code,
                retrieve_resp.text[:500],
            )
        retrieve_resp.raise_for_status()
        result = retrieve_resp.json()

        extracted_text = result.get("result_text", "")
        logger.info(
            "LLM Whisperer extraction complete: %d characters", len(extracted_text)
        )
        return extracted_text
