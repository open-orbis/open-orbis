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

    # CV extraction is a structured classification task. Three knobs,
    # all safe under Vertex AI's response-config restrictions:
    #   - temperature=0.0: variance hurts the extraction-quality benchmark.
    #   - seed=42: with temperature=0, pinning seed makes repeat runs on
    #     the same input bit-identical. Useful for A/B testing prompts.
    #   - max_output_tokens=16384: dense CVs peak around 8-12k tokens;
    #     16k keeps headroom without letting a pathological loop burn
    #     the full 65k ceiling.
    # NOTE: we intentionally do NOT set response_mime_type or
    # response_schema. Vertex AI's response_schema has a restricted
    # JSON Schema subset that does not support additionalProperties=true
    # (needed by our ExtractedNode.properties: dict field). Enabling
    # response_schema causes Vertex to silently return empty text
    # despite an HTTP 200 — see v0.1.0-alpha.13 incident. The existing
    # prompt-based JSON instructions in ollama_classifier.SYSTEM_PROMPT
    # are sufficient; the downstream parser already handles markdown
    # fences via json.JSONDecoder.raw_decode().
    config = GenerateContentConfig(
        system_instruction=system_prompt,
        max_output_tokens=16384,
        temperature=0.0,
        seed=42,
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
