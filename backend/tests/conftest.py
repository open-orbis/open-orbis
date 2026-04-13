"""Shared pytest configuration and fixtures."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Auto-discover CV fixtures: prefer *_cv.pdf, fallback to *_cv.txt.
_pdf_names = sorted(p.stem.removesuffix("_cv") for p in FIXTURES_DIR.glob("*_cv.pdf"))
_txt_only_names = sorted(
    p.stem.removesuffix("_cv")
    for p in FIXTURES_DIR.glob("*_cv.txt")
    if p.stem.removesuffix("_cv") not in _pdf_names
)
CV_NAMES = _pdf_names + _txt_only_names


def _extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract text from a PDF file using docling_extractor (PyMuPDF).

    Mirrors the production flow: ``docling_extractor.extract_text(pdf_bytes)``.
    Supports optional caching via ``KG_TEXT_CACHE_DIR`` to avoid re-extracting
    the same PDF across baseline generation and test runs.
    """
    cache_dir = os.environ.get("KG_TEXT_CACHE_DIR")
    cache_path = None
    if cache_dir:
        cache_path = Path(cache_dir) / f"{pdf_path.stem}.txt"
        if cache_path.exists():
            return cache_path.read_text(encoding="utf-8")

    from app.cv.docling_extractor import extract_text

    pdf_bytes = pdf_path.read_bytes()
    text = asyncio.get_event_loop().run_until_complete(extract_text(pdf_bytes))

    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(text, encoding="utf-8")

    return text


@pytest.fixture(params=CV_NAMES)
def cv_fixture(request) -> tuple[str, list[dict], list[dict], str]:
    """Yield (cv_text, baseline_nodes, baseline_relationships, cv_name).

    PDF fixtures are preferred: text is extracted via ``docling_extractor``
    to exercise the full production pipeline.  Falls back to ``.txt`` if no
    PDF exists.

    In CI ``KG_BASELINE_DIR`` points to a directory of JSON files generated
    from the **main** branch (one per CV).  Locally it falls back to the
    static golden reference so the test can run without extra setup.
    """
    name: str = request.param

    # ── text extraction (PDF-first, .txt fallback) ──
    pdf_path = FIXTURES_DIR / f"{name}_cv.pdf"
    txt_path = FIXTURES_DIR / f"{name}_cv.txt"

    if pdf_path.exists():
        cv_text = _extract_text_from_pdf(pdf_path)
    elif txt_path.exists():
        cv_text = txt_path.read_text(encoding="utf-8")
    else:
        pytest.skip(f"No CV fixture for {name}")

    # ── baseline loading ──
    baseline_dir = os.environ.get("KG_BASELINE_DIR")
    if baseline_dir:
        path = Path(baseline_dir) / f"{name}_baseline.json"
    else:
        path = FIXTURES_DIR / f"{name}_golden.json"

    if not path.exists():
        pytest.skip(f"No baseline for {name} at {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    nodes = data["nodes"]
    relationships = data.get("relationships", [])

    return cv_text, nodes, relationships, name
