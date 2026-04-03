"""Rule-based CV text extraction and initial structuring."""

from __future__ import annotations

import re
from pathlib import Path

import fitz  # PyMuPDF
from docx import Document


def extract_text_from_pdf(file_path: str) -> str:
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


def extract_text_from_docx(file_path: str) -> str:
    doc = Document(file_path)
    return "\n".join(p.text for p in doc.paragraphs)


def extract_text(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


# Section header patterns (common CV section names)
SECTION_PATTERNS = {
    "education": re.compile(
        r"(?i)^[\s]*(?:education|academic|studies|qualifications|formazione)",
        re.MULTILINE,
    ),
    "work_experience": re.compile(
        r"(?i)^[\s]*(?:work\s*experience|experience|employment|professional\s*experience|"
        r"esperienza|lavoro)",
        re.MULTILINE,
    ),
    "skill": re.compile(
        r"(?i)^[\s]*(?:skills|technical\s*skills|competenze|abilità)", re.MULTILINE
    ),
    "certification": re.compile(
        r"(?i)^[\s]*(?:certifications?|licenses?|certificazioni)", re.MULTILINE
    ),
    "language": re.compile(r"(?i)^[\s]*(?:languages?|lingue)", re.MULTILINE),
    "publication": re.compile(
        r"(?i)^[\s]*(?:publications?|papers?|pubblicazioni)", re.MULTILINE
    ),
    "project": re.compile(r"(?i)^[\s]*(?:projects?|progetti)", re.MULTILINE),
}

DATE_PATTERN = re.compile(
    r"(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\s*\d{4}\b|\b\d{4}\b|\b\d{1,2}/\d{4}\b)"
)

EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_PATTERN = re.compile(r"[\+]?[\d\s\-().]{7,15}")
URL_PATTERN = re.compile(r"https?://[^\s]+")
NAME_PATTERN = re.compile(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)")


def rule_based_extract(text: str) -> dict:
    """First-pass rule-based extraction. Returns partial structured data."""
    result: dict = {
        "raw_text": text,
        "contact": {},
        "sections": {},
    }

    # Extract contact info from top of CV
    lines = text.strip().split("\n")
    header_text = "\n".join(lines[:10])

    name_match = NAME_PATTERN.search(header_text)
    if name_match:
        result["contact"]["name"] = name_match.group(1)

    emails = EMAIL_PATTERN.findall(header_text)
    if emails:
        result["contact"]["email"] = emails[0]

    urls = URL_PATTERN.findall(header_text)
    for url in urls:
        url_lower = url.lower()
        if "linkedin" in url_lower:
            result["contact"]["linkedin_url"] = url
        elif "scholar.google" in url_lower:
            result["contact"]["scholar_url"] = url
        else:
            result["contact"]["website_url"] = url

    # Identify section boundaries
    section_positions: list[tuple[int, str]] = []
    for section_type, pattern in SECTION_PATTERNS.items():
        for match in pattern.finditer(text):
            section_positions.append((match.start(), section_type))

    section_positions.sort(key=lambda x: x[0])

    # Extract section texts
    for i, (pos, section_type) in enumerate(section_positions):
        end = (
            section_positions[i + 1][0] if i + 1 < len(section_positions) else len(text)
        )
        section_text = text[pos:end].strip()
        result["sections"][section_type] = section_text

    # Extract dates found
    result["dates_found"] = DATE_PATTERN.findall(text)

    return result


def rule_based_to_nodes(extraction: dict) -> list[dict]:
    """Convert rule-based extraction into structured nodes (fallback when no LLM)."""
    nodes: list[dict] = []

    for section_type, section_text in extraction.get("sections", {}).items():
        # Remove the section header line
        lines = section_text.strip().split("\n")
        if lines:
            lines = lines[1:]  # skip header

        content = "\n".join(lines).strip()
        if not content:
            continue

        if section_type == "skill":
            # Split skills by comma, semicolon, bullet, or newline
            raw_skills = re.split(r"[,;\n•·▪\-–—]", content)
            for skill in raw_skills:
                skill = skill.strip().strip(".")
                if skill and len(skill) > 1 and len(skill) < 60:
                    nodes.append(
                        {
                            "node_type": "skill",
                            "properties": {"name": skill},
                        }
                    )

        elif section_type == "language":
            # Each line or comma-separated item is a language
            items = re.split(r"[,;\n•·▪\-–—]", content)
            for item in items:
                item = item.strip()
                if not item or len(item) < 2:
                    continue
                # Try to split "English (C1)" or "English - Native"
                match = re.match(r"(.+?)\s*[\(\-–:]\s*(.+?)[\)]?\s*$", item)
                if match:
                    nodes.append(
                        {
                            "node_type": "language",
                            "properties": {
                                "name": match.group(1).strip(),
                                "proficiency": match.group(2).strip(),
                            },
                        }
                    )
                else:
                    nodes.append(
                        {
                            "node_type": "language",
                            "properties": {"name": item},
                        }
                    )

        elif section_type in (
            "education",
            "work_experience",
            "certification",
            "publication",
            "project",
        ):
            # Create one node per paragraph block (separated by double newline or significant gap)
            blocks = re.split(r"\n\s*\n|\n(?=[A-Z])", content)
            for block in blocks:
                block = block.strip()
                if not block or len(block) < 5:
                    continue
                block_lines = [
                    line.strip() for line in block.split("\n") if line.strip()
                ]
                if not block_lines:
                    continue

                # Extract dates from this block
                dates = DATE_PATTERN.findall(block)
                props: dict = {}

                if section_type == "education":
                    props["institution"] = block_lines[0] if block_lines else ""
                    if len(block_lines) > 1:
                        props["degree"] = block_lines[1]
                    if len(block_lines) > 2:
                        props["description"] = " ".join(block_lines[2:])
                elif section_type == "work_experience":
                    props["company"] = block_lines[0] if block_lines else ""
                    if len(block_lines) > 1:
                        props["title"] = block_lines[1]
                    if len(block_lines) > 2:
                        props["description"] = " ".join(block_lines[2:])
                elif section_type == "certification":
                    props["name"] = block_lines[0] if block_lines else ""
                    if len(block_lines) > 1:
                        props["issuing_organization"] = block_lines[1]
                elif section_type == "publication":
                    props["title"] = block_lines[0] if block_lines else ""
                    if len(block_lines) > 1:
                        props["venue"] = block_lines[1]
                elif section_type == "project":
                    props["name"] = block_lines[0] if block_lines else ""
                    if len(block_lines) > 1:
                        props["description"] = " ".join(block_lines[1:])

                if len(dates) >= 1:
                    props["start_date"] = dates[0]
                if len(dates) >= 2:
                    props["end_date"] = dates[1]

                # Extract URLs from block
                urls = URL_PATTERN.findall(block)
                if urls:
                    url_key = (
                        "company_url" if section_type == "work_experience" else "url"
                    )
                    props[url_key] = urls[0]

                nodes.append({"node_type": section_type, "properties": props})

    return nodes
