"""Generate baseline KG extractions by running the current pipeline.

Usage (from ``backend/`` directory):

    python -m tests.integration.generate_baseline [OUTPUT_DIR]

Discovers every ``*_cv.txt`` fixture and produces a corresponding
``<name>_baseline.json`` in *OUTPUT_DIR*.

The model is read from the ``KG_TEST_MODEL`` env-var (default: claude-opus-4-6).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from app.cv.claude_classifier import call_claude
from app.cv.ollama_classifier import SYSTEM_PROMPT, _parse_result

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
MAX_RETRIES = 2


def _build_user_message(cv_text: str) -> str:
    text_for_llm = cv_text[:12000]
    return (
        "Here is the text extracted from a CV/resume document:\n\n"
        f"---\n{text_for_llm}\n---\n\n"
        "Parse every entry in this CV into structured nodes. "
        'Return JSON with "nodes" and "unmatched" arrays.'
    )


async def generate_one(cv_path: Path, output_path: Path, model: str) -> None:
    cv_text = cv_path.read_text(encoding="utf-8")
    user_message = _build_user_message(cv_text)

    nodes = None
    for attempt in range(1, MAX_RETRIES + 1):
        raw_response = await call_claude(
            system_prompt=SYSTEM_PROMPT,
            user_message=user_message,
            model=model,
        )

        result = _parse_result(raw_response)
        if result.nodes:
            nodes = result.nodes
            unmatched = result.unmatched or []
            break

        print(
            f"  WARNING: attempt {attempt}/{MAX_RETRIES} returned 0 nodes "
            f"for {cv_path.name}. Raw response (first 500 chars):",
            file=sys.stderr,
        )
        print(f"  {raw_response[:500]}", file=sys.stderr)

    if not nodes:
        print(f"ERROR: extraction produced zero nodes for {cv_path.name} "
              f"after {MAX_RETRIES} attempts", file=sys.stderr)
        sys.exit(1)

    data = {
        "nodes": [
            {"node_type": n.node_type, "properties": n.properties} for n in nodes
        ],
        "unmatched": unmatched,
    }

    output_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  {output_path.name}: {len(nodes)} nodes")


async def generate_all(output_dir: str, model: str) -> None:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cv_files = sorted(FIXTURES_DIR.glob("*_cv.txt"))
    if not cv_files:
        print("ERROR: no *_cv.txt fixtures found", file=sys.stderr)
        sys.exit(1)

    print(f"Generating baselines for {len(cv_files)} CV(s) …")
    for cv_path in cv_files:
        name = cv_path.stem.removesuffix("_cv")
        await generate_one(cv_path, out / f"{name}_baseline.json", model)

    print("Done.")


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "baselines"
    mdl = os.environ.get("KG_TEST_MODEL", "claude-opus-4-6")
    asyncio.run(generate_all(out_dir, mdl))
