"""Extract text from PDF, DOCX, and TXT files."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import fitz

logger = logging.getLogger(__name__)


async def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract text based on file extension. Supports PDF, DOCX, TXT."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return await _extract_pdf(file_bytes)
    if ext == ".docx":
        return await _extract_docx(file_bytes)
    if ext in (".txt", ".text"):
        return file_bytes.decode("utf-8", errors="replace")

    raise ValueError(f"Unsupported file type: {ext}")


async def _extract_pdf(pdf_bytes: bytes) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _pdf_sync, pdf_bytes)


def _pdf_sync(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


async def _extract_docx(docx_bytes: bytes) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _docx_sync, docx_bytes)


def _docx_sync(docx_bytes: bytes) -> str:
    from io import BytesIO

    from docx import Document

    doc = Document(BytesIO(docx_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)
