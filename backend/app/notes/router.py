"""Enhance draft notes using LLM for CV-quality node creation."""

from __future__ import annotations

import json
import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.graph.llm_usage import record_llm_usage
from app.graph.queries import NODE_TYPE_LABELS
from app.notes.models import EnhanceNoteRequest, EnhanceNoteResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])

ENHANCE_SYSTEM_PROMPT = """You are a CV/resume writing assistant. Given a quick, informal note written by a user, transform it into a professional CV entry.

Your tasks:
1. DETECT the most appropriate node_type for this note
2. TRANSLATE all output text to: {target_language}
3. IMPROVE the description to be professional, concise CV-quality text suitable for a resume/CV
4. EXTRACT any structured information (dates, company names, titles, locations, institutions, etc.) into the appropriate fields
5. IDENTIFY which of the provided existing skills are relevant to this note entry

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
    grant_date (string or null), description (string or null), url (string or null)

- collaborator:
    name (string), email (string or null)

Rules:
- Use ISO date format (YYYY-MM-DD, YYYY-MM, or YYYY)
- If end_date is "Present", "Current", or ongoing, set it to null
- Only populate fields that are clearly mentioned or inferable from the note
- The description should be professional and suitable for a CV, written in {target_language}
- Do not invent information that is not in the note

{existing_skills_section}

Return ONLY valid JSON in this exact format:
{{
  "node_type": "work_experience",
  "properties": {{
    "company": "...",
    "title": "...",
    "description": "..."
  }},
  "suggested_skill_uids": ["uid1", "uid2"]
}}

Return ONLY valid JSON. No markdown, no explanation, no code blocks."""


def _normalize_date(value: str) -> str:
    """Normalize a date string to YYYY-MM-DD for HTML date inputs.

    Handles partial formats like YYYY or YYYY-MM by padding with -01.
    """
    value = value.strip()
    # Already full ISO date
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return value
    # YYYY-MM -> YYYY-MM-01
    if re.match(r"^\d{4}-\d{2}$", value):
        return f"{value}-01"
    # YYYY -> YYYY-01-01
    if re.match(r"^\d{4}$", value):
        return f"{value}-01-01"
    return value


def _build_prompt(req: EnhanceNoteRequest) -> tuple[str, str]:
    """Build system prompt and user message for the LLM."""
    if req.existing_skills:
        skills_list = "\n".join(
            f'  - uid: "{s.uid}", name: "{s.name}"' for s in req.existing_skills
        )
        existing_skills_section = (
            f"The user has these existing skill nodes in their graph:\n{skills_list}\n\n"
            'If any of these skills are relevant to this note, include their uid in "suggested_skill_uids".'
        )
    else:
        existing_skills_section = 'The user has no existing skill nodes. Leave "suggested_skill_uids" as an empty array.'

    system_prompt = ENHANCE_SYSTEM_PROMPT.format(
        target_language=req.target_language,
        existing_skills_section=existing_skills_section,
    )

    user_message = f"Here is the user's quick note:\n\n{req.text}"

    return system_prompt, user_message


def _parse_enhance_result(  # noqa: C901
    raw: str, valid_skill_uids: set[str]
) -> EnhanceNoteResponse:
    """Parse LLM response into EnhanceNoteResponse."""
    text = raw.strip()

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

    # Parse JSON — find first valid object
    decoder = json.JSONDecoder()
    parsed = None
    for i, ch in enumerate(text):
        if ch == "{":
            try:
                parsed, _ = decoder.raw_decode(text, i)
                break
            except json.JSONDecodeError:
                continue

    if parsed is None or not isinstance(parsed, dict):
        raise ValueError("Failed to parse LLM response as JSON")

    node_type = parsed.get("node_type", "work_experience")
    if node_type not in NODE_TYPE_LABELS:
        node_type = "work_experience"

    properties = parsed.get("properties", {})
    if not isinstance(properties, dict):
        properties = {}

    # Remove null/empty values
    properties = {k: v for k, v in properties.items() if v is not None and v != ""}

    # Normalize date fields to YYYY-MM-DD for HTML date inputs
    _DATE_KEYS = {
        "start_date",
        "end_date",
        "date",
        "issue_date",
        "expiry_date",
        "filing_date",
        "grant_date",
    }
    for key in _DATE_KEYS:
        if key in properties and isinstance(properties[key], str):
            properties[key] = _normalize_date(properties[key])

    # Filter suggested skills to only valid existing uids
    raw_skills = parsed.get("suggested_skill_uids", [])
    suggested = [uid for uid in raw_skills if uid in valid_skill_uids]

    return EnhanceNoteResponse(
        node_type=node_type,
        properties=properties,
        suggested_skill_uids=suggested,
    )


@router.post("/enhance", response_model=EnhanceNoteResponse)
async def enhance_note(
    req: EnhanceNoteRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Enhance a draft note using LLM: translate, improve, extract fields, suggest links."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Note text is empty")

    system_prompt, user_message = _build_prompt(req)
    valid_skill_uids = {s.uid for s in req.existing_skills}

    provider = settings.llm_provider

    try:
        if provider == "claude":
            from app.cv.claude_classifier import call_claude

            claude_resp = await call_claude(
                system_prompt=system_prompt,
                user_message=user_message,
                model=settings.claude_model or None,
            )
            result = claude_resp["content"]
            llm_usage = {
                "cost_usd": claude_resp.get("cost_usd"),
                "duration_ms": claude_resp.get("duration_ms"),
                "input_tokens": claude_resp.get("input_tokens"),
                "output_tokens": claude_resp.get("output_tokens"),
            }
        else:
            result = await _call_ollama(system_prompt, user_message)
            llm_usage = {}

        await record_llm_usage(
            db=db,
            user_id=current_user["user_id"],
            endpoint="note_enhance",
            llm_provider=provider,
            llm_model=settings.claude_model
            if provider == "claude"
            else settings.ollama_model,
            cost_usd=llm_usage.get("cost_usd"),
            duration_ms=llm_usage.get("duration_ms"),
            input_tokens=llm_usage.get("input_tokens"),
            output_tokens=llm_usage.get("output_tokens"),
        )

        return _parse_enhance_result(result, valid_skill_uids)
    except ValueError as e:
        logger.error("Failed to parse enhance result: %s", e)
        raise HTTPException(
            status_code=502, detail="Failed to parse LLM response"
        ) from None
    except Exception as e:
        logger.error("Note enhance failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=502, detail=f"LLM processing failed: {str(e)}"
        ) from None


async def _call_ollama(system_prompt: str, user_message: str) -> str:
    """Make a chat completion request to Ollama."""
    url = f"{settings.ollama_base_url}/api/chat"
    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")
