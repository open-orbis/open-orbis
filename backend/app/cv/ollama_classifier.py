"""Classify CV entries using a local Ollama LLM."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

import httpx

from app.config import settings
from app.cv.models import ExtractedNode, ExtractedRelationship, SkippedNode
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

For each skill that is mentioned in the context of a work_experience, project, or education entry,
include a relationship entry linking the experience node (by its index in the nodes array)
to the skill node (by its index in the nodes array). Use type "USED_SKILL".

You MUST return valid JSON in exactly this format:
{
  "cv_owner_name": "Full Name of the person whose CV this is",
  "nodes": [
    {"node_type": "work_experience", "properties": {"company": "...", "title": "...", ...}},
    {"node_type": "skill", "properties": {"name": "Python", "category": "Programming"}},
    ...
  ],
  "relationships": [
    {"from_index": 0, "to_index": 1, "type": "USED_SKILL"},
    ...
  ],
  "unmatched": [
    "Some text that did not fit any category",
    ...
  ]
}

Return ONLY valid JSON. No markdown, no explanation, no code blocks."""


# ── Required fields per node type ──

REQUIRED_FIELDS: dict[str, list[str]] = {
    "skill": ["name"],
    "language": ["name"],
    "work_experience": ["company", "title"],
    "education": ["institution"],
    "certification": ["name"],
    "publication": ["title"],
    "project": ["name"],
    "patent": ["title"],
    "collaborator": ["name"],
}

# ── Date fields that should be normalized ──

DATE_FIELDS = {
    "start_date", "end_date", "date",
    "issue_date", "expiry_date",
    "filing_date", "grant_date",
}

# ── Date normalization ──

_DATE_FORMATS = [
    "%Y-%m-%d",
    "%Y-%m",
    "%Y",
    "%B %Y",
    "%b %Y",
    "%m/%Y",
    "%Y/%m/%d",
    "%Y/%m",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%d %B %Y",
    "%d %b %Y",
    "%B %d, %Y",
    "%b %d, %Y",
]

_MONTH_ONLY_FORMATS = {"%B %Y", "%b %Y", "%m/%Y", "%Y/%m"}


def _normalize_date(value: str) -> str:
    """Attempt to parse a date string and normalize it to ISO format."""
    if not value or not isinstance(value, str):
        return value
    value = value.strip()
    # Already ISO
    if re.match(r"^\d{4}(-\d{2}(-\d{2})?)?$", value):
        return value
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(value, fmt)
            if fmt in _MONTH_ONLY_FORMATS:
                return dt.strftime("%Y-%m")
            if fmt == "%Y":
                return dt.strftime("%Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value


# ── Classification result ──

@dataclass
class ClassificationResult:
    nodes: list[ExtractedNode] = field(default_factory=list)
    unmatched: list[str] = field(default_factory=list)
    skipped: list[SkippedNode] = field(default_factory=list)
    relationships: list[ExtractedRelationship] = field(default_factory=list)
    truncated: bool = False
    cv_owner_name: str | None = None


MAX_RETRIES = 2
TEXT_LIMIT = 12000


async def classify_entries(raw_text: str) -> ClassificationResult:
    """Send extracted CV text to Ollama for classification.

    Returns a ClassificationResult with nodes, unmatched, skipped, relationships, and truncated flag.
    """
    if not raw_text.strip():
        return ClassificationResult()

    truncated = len(raw_text) > TEXT_LIMIT
    text_for_llm = raw_text[:TEXT_LIMIT]

    user_message = f"""Here is the text extracted from a CV/resume document:

---
{text_for_llm}
---

Parse every entry in this CV into structured nodes. Return JSON with "nodes", "relationships", and "unmatched" arrays."""

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

            cr = _parse_result(result)
            if cr.nodes or cr.unmatched:
                cr.truncated = truncated
                return cr
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

    # Intermediate fallback: rule-based extraction
    logger.warning("Ollama failed — trying rule-based extraction")
    try:
        from app.cv.parser import rule_based_extract, rule_based_to_nodes

        extraction = rule_based_extract(raw_text)
        raw_nodes = rule_based_to_nodes(extraction)
        if raw_nodes:
            nodes: list[ExtractedNode] = []
            skipped: list[SkippedNode] = []
            for item in raw_nodes:
                node_type = item.get("node_type", "")
                properties = item.get("properties", {})
                if node_type not in NODE_TYPE_LABELS:
                    skipped.append(SkippedNode(
                        original=item,
                        reason=f"Unknown node type: '{node_type}'",
                    ))
                    continue
                required = REQUIRED_FIELDS.get(node_type, [])
                missing = [f for f in required if not properties.get(f)]
                if missing:
                    skipped.append(SkippedNode(
                        original=item,
                        reason=f"Missing required fields: {', '.join(missing)}",
                    ))
                    continue
                for key in DATE_FIELDS:
                    if key in properties and properties[key]:
                        properties[key] = _normalize_date(str(properties[key]))
                nodes.append(ExtractedNode(node_type=node_type, properties=properties))
            if nodes:
                logger.info("Rule-based fallback produced %d nodes", len(nodes))
                fallback_name = extraction.get("contact", {}).get("name")
                return ClassificationResult(
                    nodes=nodes, skipped=skipped, truncated=truncated,
                    cv_owner_name=fallback_name,
                )
    except Exception as e:
        logger.warning("Rule-based fallback also failed: %s", e)

    # Final fallback: return everything as unmatched
    logger.error(
        "All %s classification attempts failed — returning as unmatched", provider
    )
    fallback_lines = [
        line.strip()
        for line in raw_text.split("\n")
        if line.strip() and len(line.strip()) > 5
    ]
    return ClassificationResult(
        unmatched=fallback_lines[:50], truncated=truncated,
    )


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


def _parse_result(raw_response: str) -> ClassificationResult:
    """Parse Ollama JSON response into ClassificationResult."""
    text = raw_response.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        json_lines: list[str] = []
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

    # Use raw_decode to find the first valid JSON object
    decoder = json.JSONDecoder()
    parsed = None
    # Try to find a JSON object starting with {
    for i, ch in enumerate(text):
        if ch == "{":
            try:
                parsed, _ = decoder.raw_decode(text, i)
                break
            except json.JSONDecodeError:
                continue

    if parsed is None or not isinstance(parsed, dict):
        logger.warning("Failed to parse Ollama response as JSON")
        return ClassificationResult()

    cv_owner_name = parsed.get("cv_owner_name") or None
    raw_nodes = parsed.get("nodes", [])
    unmatched = parsed.get("unmatched", [])
    raw_rels = parsed.get("relationships", [])

    # Validate nodes — track original-to-filtered index mapping for relationships
    nodes: list[ExtractedNode] = []
    skipped: list[SkippedNode] = []
    original_to_filtered: dict[int, int] = {}
    filtered_idx = 0

    for orig_idx, item in enumerate(raw_nodes):
        if not isinstance(item, dict):
            continue
        node_type = item.get("node_type", "")
        properties = item.get("properties", {})

        if not isinstance(properties, dict):
            skipped.append(SkippedNode(
                original=item,
                reason="Invalid properties format",
            ))
            continue

        if node_type not in NODE_TYPE_LABELS:
            skipped.append(SkippedNode(
                original=item,
                reason=f"Unknown node type: '{node_type}'. Valid types: {', '.join(NODE_TYPE_LABELS.keys())}",
            ))
            continue

        # Required fields validation
        required = REQUIRED_FIELDS.get(node_type, [])
        missing = [f for f in required if not properties.get(f)]
        if missing:
            skipped.append(SkippedNode(
                original=item,
                reason=f"Missing required fields: {', '.join(missing)}",
            ))
            continue

        # Normalize date fields
        for key in DATE_FIELDS:
            if key in properties and properties[key]:
                properties[key] = _normalize_date(str(properties[key]))

        nodes.append(ExtractedNode(node_type=node_type, properties=properties))
        original_to_filtered[orig_idx] = filtered_idx
        filtered_idx += 1

    # Parse relationships with index remapping
    relationships: list[ExtractedRelationship] = []
    for rel in raw_rels:
        if not isinstance(rel, dict):
            continue
        from_idx = rel.get("from_index")
        to_idx = rel.get("to_index")
        rel_type = rel.get("type", "USED_SKILL")
        if (
            isinstance(from_idx, int)
            and isinstance(to_idx, int)
            and from_idx in original_to_filtered
            and to_idx in original_to_filtered
        ):
            relationships.append(ExtractedRelationship(
                from_index=original_to_filtered[from_idx],
                to_index=original_to_filtered[to_idx],
                type=rel_type,
            ))

    # Ensure unmatched items are strings
    unmatched_str = [str(u) for u in unmatched if u]

    return ClassificationResult(
        nodes=nodes,
        unmatched=unmatched_str,
        skipped=skipped,
        relationships=relationships,
        cv_owner_name=cv_owner_name,
    )
