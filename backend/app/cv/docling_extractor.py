"""PDF text extraction using PyMuPDF."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path

import fitz

logger = logging.getLogger(__name__)


async def extract_text(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyMuPDF."""
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)  # noqa: SIM115
    try:
        tmp.write(pdf_bytes)
        tmp.flush()
        tmp_path = tmp.name
        tmp.close()

        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, _extract, tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if not text or not text.strip():
        raise RuntimeError("PyMuPDF failed to extract text from PDF")

    logger.info("PDF extraction complete: %d characters", len(text))
    return text


def _extract(file_path: str) -> str:
    """Extract plain text from all pages."""
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text
