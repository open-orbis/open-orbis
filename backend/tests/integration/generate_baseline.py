"""Generate baseline KG extractions using the full production pipeline.

Usage (from ``backend/`` directory):

    python -m tests.integration.generate_baseline [OUTPUT_DIR]

Discovers every ``*_cv.pdf`` fixture (falling back to ``*_cv.txt``),
extracts text via ``docling_extractor`` (PyMuPDF), classifies entries
via ``classify_entries()`` (the same LLM fallback chain used in production),
and produces a corresponding ``<name>_baseline.json`` in *OUTPUT_DIR*.

Extracted text is cached in *OUTPUT_DIR*/text_cache/ so that the subsequent
test run can skip re-extraction of the same PDFs.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from app.cv.docling_extractor import extract_text
from app.cv.ollama_classifier import classify_entries

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
MAX_RETRIES = 2


async def generate_one(
    cv_path: Path,
    output_path: Path,
    text_cache_dir: Path,
) -> None:
    name = cv_path.stem

    # ── text extraction (PDF-first, .txt fallback) ──
    if cv_path.suffix == ".pdf":
        cache_path = text_cache_dir / f"{name}.txt"
        if cache_path.exists():
            cv_text = cache_path.read_text(encoding="utf-8")
            print(f"  {name}: using cached text ({len(cv_text)} chars)")
        else:
            pdf_bytes = cv_path.read_bytes()
            cv_text = await extract_text(pdf_bytes)
            cache_path.write_text(cv_text, encoding="utf-8")
            print(f"  {name}: extracted {len(cv_text)} chars from PDF")
    else:
        cv_text = cv_path.read_text(encoding="utf-8")
        print(f"  {name}: loaded {len(cv_text)} chars from TXT")

    # ── classification via full production pipeline ──
    result = None
    for attempt in range(1, MAX_RETRIES + 1):
        result = await classify_entries(cv_text)
        if result.nodes:
            break
        print(
            f"  WARNING: attempt {attempt}/{MAX_RETRIES} returned 0 nodes "
            f"for {cv_path.name}",
            file=sys.stderr,
        )

    if not result or not result.nodes:
        print(
            f"ERROR: extraction produced zero nodes for {cv_path.name} "
            f"after {MAX_RETRIES} attempts",
            file=sys.stderr,
        )
        sys.exit(1)

    data = {
        "nodes": [
            {"node_type": n.node_type, "properties": n.properties} for n in result.nodes
        ],
        "relationships": [
            {
                "from_index": r.from_index,
                "to_index": r.to_index,
                "type": r.type,
            }
            for r in result.relationships
        ],
        "unmatched": result.unmatched,
    }

    output_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(
        f"  {output_path.name}: {len(result.nodes)} nodes, "
        f"{len(result.relationships)} relationships"
    )


def _discover_cv_fixtures() -> list[Path]:
    """Return CV fixture paths, preferring PDF over TXT."""
    pdf_files = {p.stem.removesuffix("_cv"): p for p in FIXTURES_DIR.glob("*_cv.pdf")}
    txt_files = {p.stem.removesuffix("_cv"): p for p in FIXTURES_DIR.glob("*_cv.txt")}
    all_names = sorted(set(pdf_files) | set(txt_files))
    return [pdf_files.get(n) or txt_files[n] for n in all_names]


async def generate_all(output_dir: str) -> None:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    text_cache_dir = out / "text_cache"
    text_cache_dir.mkdir(parents=True, exist_ok=True)

    cv_files = _discover_cv_fixtures()
    if not cv_files:
        print("ERROR: no *_cv.pdf or *_cv.txt fixtures found", file=sys.stderr)
        sys.exit(1)

    print(f"Generating baselines for {len(cv_files)} CV(s) …")
    for cv_path in cv_files:
        name = cv_path.stem.removesuffix("_cv")
        await generate_one(cv_path, out / f"{name}_baseline.json", text_cache_dir)

    print("Done.")


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "baselines"
    asyncio.run(generate_all(out_dir))
