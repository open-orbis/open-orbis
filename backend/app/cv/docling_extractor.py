"""PDF text extraction using Docling (local, free) with PyMuPDF fallback."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


async def extract_text(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using Docling, falling back to PyMuPDF.

    Docling produces layout-preserving Markdown output (tables, headings,
    structure) which works well as input for LLM classification.
    Falls back to PyMuPDF plain-text extraction when Docling fails.
    """
    text = ""

    # Write bytes to a temp file (Docling needs a file path)
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)  # noqa: SIM115
    try:
        tmp.write(pdf_bytes)
        tmp.flush()
        tmp_path = tmp.name
        tmp.close()

        # Try Docling first
        try:
            text = await _extract_with_docling(tmp_path)
        except Exception as exc:
            logger.warning("Docling extraction failed, falling back to PyMuPDF: %s", exc)
            text = _extract_with_pymupdf(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if not text or not text.strip():
        raise RuntimeError("Both Docling and PyMuPDF failed to extract text from PDF")

    logger.info("PDF extraction complete: %d characters", len(text))
    return text


async def _extract_with_docling(file_path: str) -> str:
    """Run Docling DocumentConverter in a thread executor (CPU-bound)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _docling_sync, file_path)


def _docling_sync(file_path: str) -> str:
    """Synchronous Docling conversion — runs in executor thread."""
    from docling.document_converter import DocumentConverter

    converter = DocumentConverter()
    result = converter.convert(file_path)
    text = result.document.export_to_markdown()

    if not text or not text.strip():
        raise RuntimeError("Docling returned empty text")

    logger.info("Docling extracted %d characters (Markdown)", len(text))
    return text


def _extract_with_pymupdf(file_path: str) -> str:
    """Fallback: extract plain text with PyMuPDF (fitz)."""
    import fitz

    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()

    logger.info("PyMuPDF fallback extracted %d characters", len(text))
    return text
