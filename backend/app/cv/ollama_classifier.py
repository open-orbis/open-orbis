"""Classify CV entries using a local Ollama LLM."""

from __future__ import annotations

import json
import logging
import re

import httpx

from app.config import settings
from app.cv.models import ExtractedNode
from app.graph.queries import NODE_TYPE_LABELS

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a CV/resume parsing assistant. Given raw text extracted from a CV document,
identify and classify every entry into structured nodes.

Each node must have a "node_type" and a "properties" object.

Valid node_types and their expected properties:

- work_experience:
    company (string), title (string), start_date (string, ISO: YYYY-MM-DD or YYYY-MM or YYYY),
    end_date (string or null if current), description (string), location (string), company_url (string)

- education:
    institution (string), degree (string), field_of_study (string),
    start_date (string), end_date (string or null), description (string), location (string)

- skill:
    name (string), category (one of: "Programming", "Framework", "Tool", "Methodology", "Soft Skill", "Other"),
    proficiency (one of: "Expert", "Advanced", "Intermediate", "Beginner" or null)

- language:
    name (string), proficiency (e.g. "Native", "Professional", "B2", "C1")

- certification:
    name (string), issuing_organization (string), issue_date (string), expiry_date (string or null),
    credential_url (string or null)

- publication:
    title (string), venue (string), date (string), doi (string or null),
    url (string or null), abstract (string or null)

- project:
    name (string), role (string), description (string),
    start_date (string), end_date (string or null), url (string or null)

- patent:
    title (string), patent_number (string or null), filing_date (string or null),
    grant_date (string or null), status (string or null), description (string or null),
    url (string or null)

- collaborator:
    name (string), email (string or null)

Rules:
- Use ISO date format when possible (YYYY-MM-DD, YYYY-MM, or YYYY)
- If end_date is "Present", "Current", or ongoing, set it to null
- Extract ALL entries you can find — do not skip any
- For skills, extract individual skills (not groups)
- If something does not clearly fit any node_type, put the raw text in the "unmatched" array

You MUST return valid JSON in exactly this format:
{
  "nodes": [
    {"node_type": "work_experience", "properties": {"company": "...", "title": "...", ...}},
    {"node_type": "skill", "properties": {"name": "Python", "category": "Programming"}},
    ...
  ],
  "unmatched": [
    "Some text that did not fit any category",
    ...
  ]
}

Return ONLY valid JSON. No markdown, no explanation, no code blocks."""


MAX_RETRIES = 2


async def classify_entries(
    raw_text: str,
) -> tuple[list[ExtractedNode], list[str]]:
    """Send extracted CV text to Ollama for classification.

    Returns:
        (classified_nodes, unmatched_texts)
    """
    if not raw_text.strip():
        return [], []

    # Truncate very long texts to stay within model context
    text_for_llm = raw_text[:12000]

    user_message = f"""Here is the text extracted from a CV/resume document:

---
{text_for_llm}
---

Parse every entry in this CV into structured nodes. Return JSON with "nodes" and "unmatched" arrays."""

    provider = settings.llm_provider

    for attempt in range(MAX_RETRIES):
        try:
            if provider == "claude":
                from app.cv.claude_classifier import call_claude

                result = await call_claude(
                    system_prompt=SYSTEM_PROMPT,
                    user_message=user_message,
                    model=settings.claude_model or None,
                )
            else:
                result = await _call_ollama(user_message)

            nodes, unmatched = _parse_result(result)
            if nodes or unmatched:
                return nodes, unmatched
            logger.warning(
                "%s returned empty result, attempt %d", provider, attempt + 1
            )
        except Exception as e:
            logger.warning(
                "%s classification attempt %d failed: %s",
                provider,
                attempt + 1,
                e,
            )

    # Final fallback: return everything as unmatched
    logger.error(
        "All %s classification attempts failed — returning as unmatched", provider
    )
    fallback_lines = [
        line.strip()
        for line in raw_text.split("\n")
        if line.strip() and len(line.strip()) > 5
    ]
    return [], fallback_lines[:50]


async def _call_ollama(user_message: str) -> str:
    """Make a chat completion request to Ollama."""
    url = f"{settings.ollama_base_url}/api/chat"

    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")


def _parse_result(raw_response: str) -> tuple[list[ExtractedNode], list[str]]:
    """Parse Ollama JSON response into ExtractedNode list + unmatched strings."""
    text = raw_response.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        json_lines = []
        in_block = False
        for line in lines:
            if line.startswith("```") and not in_block:
                in_block = True
                continue
            elif line.startswith("```") and in_block:
                break
            elif in_block:
                json_lines.append(line)
        text = "\n".join(json_lines)

    # Try to find JSON object in the response
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        text = match.group(0)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Failed to parse Ollama response as JSON")
        return [], []

    if not isinstance(parsed, dict):
        return [], []

    raw_nodes = parsed.get("nodes", [])
    unmatched = parsed.get("unmatched", [])

    # Validate nodes
    nodes: list[ExtractedNode] = []
    for item in raw_nodes:
        if not isinstance(item, dict):
            continue
        node_type = item.get("node_type", "")
        properties = item.get("properties", {})
        if node_type in NODE_TYPE_LABELS and isinstance(properties, dict):
            nodes.append(ExtractedNode(node_type=node_type, properties=properties))
        else:
            # Invalid type — add to unmatched
            desc = json.dumps(item, default=str)
            unmatched.append(desc)

    # Ensure unmatched items are strings
    unmatched_str = [str(u) for u in unmatched if u]

    return nodes, unmatched_str
