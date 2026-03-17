"""LLM refinement pass using Claude API to structure CV data."""

from __future__ import annotations

import json

import anthropic

from app.config import settings

SYSTEM_PROMPT = """You are a CV parsing assistant. Given raw CV text and a partial extraction,
produce a structured JSON array of nodes. Each node has a "node_type" and "properties" object.

Valid node_types and their properties:
- education: institution, degree, field_of_study, start_date, end_date, description, location
- work_experience: company, title, start_date, end_date, description, location, company_url
- certification: name, issuing_organization, issue_date, expiry_date, credential_url
- language: name, proficiency (e.g. "Native", "Professional", "B2", "C1")
- publication: title, venue, date, doi, url, abstract
- project: name, role, description, start_date, end_date, url
- skill: name, category (e.g. "Programming", "Framework", "Methodology", "Soft Skill"), proficiency (e.g. "Expert", "Advanced", "Intermediate")
- collaborator: name, email

Rules:
- Use ISO date format (YYYY-MM-DD) when possible, or YYYY-MM, or YYYY
- If end_date is "Present" or "Current", set it to null
- Extract ALL entries, don't skip any
- For skills, extract individual skills (not groups)
- If you detect collaborator names in work or project descriptions, create collaborator nodes
- Return ONLY valid JSON array, no markdown or explanation"""


async def refine_with_llm(raw_text: str, partial_extraction: dict) -> list[dict]:
    """Send CV text + partial extraction to Claude for structured refinement."""
    if not settings.anthropic_api_key:
        # If no API key, return empty — user will add entries manually
        return []

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    user_message = f"""Here is the raw CV text:

---
{raw_text[:8000]}
---

Here is what rule-based extraction found:
{json.dumps(partial_extraction, indent=2, default=str)[:3000]}

Parse this CV into structured nodes. Return a JSON array of objects with "node_type" and "properties"."""

    message = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    response_text = message.content[0].text.strip()

    # Extract JSON from response (handle markdown code blocks)
    if response_text.startswith("```"):
        lines = response_text.split("\n")
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
        response_text = "\n".join(json_lines)

    try:
        nodes = json.loads(response_text)
        if isinstance(nodes, list):
            return nodes
    except json.JSONDecodeError:
        pass

    return []
