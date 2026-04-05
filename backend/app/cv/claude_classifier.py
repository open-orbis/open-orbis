"""Classify CV entries using Claude Code CLI (subscription-based, no API key needed)."""

from __future__ import annotations

import asyncio
import json
import logging

from app.analytics.event_bus import emit as emit_event

logger = logging.getLogger(__name__)


async def call_claude(
    system_prompt: str,
    user_message: str,
    model: str | None = None,
) -> str:
    """Call Claude Code CLI in print mode and return the response text.

    Uses the ``claude -p`` non-interactive mode which leverages the user's
    Claude subscription (no API key required).
    """
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

    stdout, stderr = await process.communicate(input=user_message.encode("utf-8"))

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

    # --output-format json wraps the result in a JSON envelope
    # with fields like: result, cost_usd, duration_ms, etc.
    try:
        envelope = json.loads(output)
        emit_event(
            "llm_usage",
            {
                "operation": "cv_classification",
                "model": model or "claude-opus-4-6",
                "provider": "anthropic",
                "input_tokens": envelope.get("tokens_in", 0),
                "output_tokens": envelope.get("tokens_out", 0),
                "cost_usd": envelope.get("cost_usd", 0),
                "latency_ms": envelope.get("duration_ms", 0),
            },
        )
        return envelope.get("result", "")
    except json.JSONDecodeError:
        emit_event(
            "llm_usage",
            {
                "operation": "cv_classification",
                "model": model or "claude-opus-4-6",
                "provider": "anthropic",
                "input_tokens": 0,
                "output_tokens": 0,
                "cost_usd": 0,
                "latency_ms": 0,
            },
        )
        logger.warning(
            "Claude CLI output is not JSON, returning raw (%d chars)", len(output)
        )
        return output
