"""Call Gemini Pro via Vertex AI for CV classification."""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


async def call_gemini(
    system_prompt: str,
    user_message: str,
    model: str | None = None,
    timeout: int | None = None,
) -> dict:
    """Call Gemini Pro via Vertex AI and return response with usage metadata.

    Uses the ``google-genai`` SDK which authenticates via Application Default
    Credentials (ADC). In Cloud Run this is provided automatically by the
    service account via Workload Identity — no API key needed.

    Returns a dict with keys:
        content (str): The result text from Gemini.
        cost_usd (float | None): Always None (billing is via GCP).
        duration_ms (int | None): Always None.
        input_tokens (int | None): Input token count if available.
        output_tokens (int | None): Output token count if available.
    """
    from google import genai
    from google.genai.types import GenerateContentConfig

    from app.config import settings

    if timeout is None:
        timeout = settings.llm_timeout_seconds
    if model is None:
        model = settings.gemini_model

    client = genai.Client(
        vertexai=True,
        project=settings.gcp_project_id,
        location=settings.vertex_region,
    )

    config = GenerateContentConfig(
        system_instruction=system_prompt,
        max_output_tokens=65536,
    )

    logger.info(
        "Calling Gemini via Vertex AI: model=%s, region=%s",
        model,
        settings.vertex_region,
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=user_message,
        config=config,
    )

    content = response.text or ""
    logger.info("Gemini Vertex AI response received (%d chars)", len(content))

    input_tokens = None
    output_tokens = None
    if response.usage_metadata:
        input_tokens = response.usage_metadata.prompt_token_count
        output_tokens = response.usage_metadata.candidates_token_count

    return {
        "content": content,
        "cost_usd": None,
        "duration_ms": None,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
