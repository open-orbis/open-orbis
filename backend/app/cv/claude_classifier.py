"""Call Claude for CV classification — via Vertex AI (production) or CLI (local dev)."""

from __future__ import annotations

import asyncio
import json
import logging

logger = logging.getLogger(__name__)


async def call_claude(
    system_prompt: str,
    user_message: str,
    model: str | None = None,
    timeout: int | None = None,
) -> dict:
    """Call Claude and return response with usage metadata.

    Dispatches to Vertex AI or CLI based on ``settings.llm_provider``:
    - ``vertex``: uses ``AnthropicVertex`` SDK (production, no API key needed)
    - ``cli``: uses ``claude -p`` subprocess (local dev, uses subscription)

    Returns a dict with keys:
        content (str): The result text from Claude.
        cost_usd (float | None): Cost in USD if available.
        duration_ms (int | None): Duration in milliseconds if available.
        input_tokens (int | None): Input token count if available.
        output_tokens (int | None): Output token count if available.
    """
    from app.config import settings

    if settings.llm_provider == "cli":
        return await _call_claude_cli(system_prompt, user_message, model, timeout)
    else:
        return await _call_claude_vertex(system_prompt, user_message, model, timeout)


async def _call_claude_vertex(
    system_prompt: str,
    user_message: str,
    model: str | None = None,
    timeout: int | None = None,
) -> dict:
    """Call Claude via Vertex AI using the Anthropic SDK."""
    from anthropic import AnthropicVertex

    from app.config import settings

    if timeout is None:
        timeout = settings.llm_timeout_seconds
    if model is None:
        model = settings.claude_model

    # Vertex AI model IDs don't use the same format as Anthropic API.
    # Map common names to Vertex AI model IDs.
    vertex_model_map = {
        "claude-opus-4-6": "claude-opus-4-6",
        "claude-sonnet-4-6": "claude-sonnet-4-6",
    }
    vertex_model = vertex_model_map.get(model, model)

    client = AnthropicVertex(
        region=settings.vertex_region,
        project_id=settings.gcp_project_id,
    )

    logger.info(
        "Calling Claude via Vertex AI: model=%s, region=%s",
        vertex_model,
        settings.vertex_region,
    )

    message = await asyncio.to_thread(
        client.messages.create,
        model=vertex_model,
        max_tokens=8192,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    content = message.content[0].text if message.content else ""
    logger.info("Claude Vertex AI response received (%d chars)", len(content))

    return {
        "content": content,
        "cost_usd": None,
        "duration_ms": None,
        "input_tokens": message.usage.input_tokens,
        "output_tokens": message.usage.output_tokens,
    }


async def _call_claude_cli(
    system_prompt: str,
    user_message: str,
    model: str | None = None,
    timeout: int | None = None,
) -> dict:
    """Call Claude Code CLI in print mode (local dev, uses subscription)."""
    from app.config import settings

    if timeout is None:
        timeout = settings.llm_timeout_seconds

    cmd = ["claude", "-p", "--output-format", "json"]

    if model:
        cmd.extend(["--model", model])

    cmd.extend(["--system-prompt", system_prompt])

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(input=user_message.encode("utf-8")),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        process.kill()
        logger.error("Claude CLI timed out after %ds", timeout)
        raise RuntimeError(f"Claude CLI timed out after {timeout}s") from None

    if process.returncode != 0:
        error_msg = stderr.decode("utf-8", errors="replace").strip()
        logger.error(
            "Claude CLI failed (code %d): %s", process.returncode, error_msg[:500]
        )
        raise RuntimeError(
            f"Claude CLI exited with code {process.returncode}: {error_msg}"
        )

    output = stdout.decode("utf-8").strip()
    logger.info("Claude CLI response received (%d chars)", len(output))

    try:
        envelope = json.loads(output)
        return {
            "content": envelope.get("result", ""),
            "cost_usd": envelope.get("cost_usd"),
            "duration_ms": envelope.get("duration_ms"),
            "input_tokens": envelope.get("input_tokens"),
            "output_tokens": envelope.get("output_tokens"),
        }
    except json.JSONDecodeError:
        logger.warning(
            "Claude CLI output is not JSON, returning raw (%d chars)", len(output)
        )
        return {
            "content": output,
            "cost_usd": None,
            "duration_ms": None,
            "input_tokens": None,
            "output_tokens": None,
        }
