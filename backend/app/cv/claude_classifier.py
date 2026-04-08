"""Classify CV entries using Claude Code CLI (subscription-based, no API key needed)."""

from __future__ import annotations

import asyncio
import json
import logging

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

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(input=user_message.encode("utf-8")),
            timeout=1800,  # 30 minutes
        )
    except asyncio.TimeoutError:
        process.kill()
        logger.error("Claude CLI timed out after 30 minutes")
        raise RuntimeError("Claude CLI timed out after 30 minutes") from None

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
        return envelope.get("result", "")
    except json.JSONDecodeError:
        logger.warning(
            "Claude CLI output is not JSON, returning raw (%d chars)", len(output)
        )
        return output
