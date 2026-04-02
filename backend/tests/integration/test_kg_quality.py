"""Integration test: verify KG extraction quality against a baseline.

In CI the baseline is generated from the **main** branch extraction
(via ``generate_baseline.py``), so the test acts as a regression gate.
Locally it falls back to the static golden reference files.

The test is parametrized over every ``*_cv.txt`` fixture, so adding a
new CV only requires dropping a text + golden JSON into ``fixtures/``.

Requires:
    - ``claude`` CLI installed, accessible on PATH, and authenticated
      (either via interactive login / Claude Pro subscription, or via
      ``ANTHROPIC_API_KEY`` environment variable).

The model defaults to ``claude-opus-4-6`` (same as production) but can
be overridden via the ``KG_TEST_MODEL`` environment variable.
"""

from __future__ import annotations

import os
import shutil

import pytest

from app.cv.claude_classifier import call_claude
from app.cv.ollama_classifier import SYSTEM_PROMPT, _parse_result
from tests.lib.graph_comparator import ComparisonResult, compare_graphs, format_report

# ── thresholds ───────────────────────────────────────────────────────

OVERALL_F1_MIN = 0.70
OVERALL_RECALL_MIN = 0.60
COMPOSITE_MIN = 0.65

PER_TYPE_RECALL_MIN: dict[str, float] = {
    "education": 0.66,
    "work_experience": 0.55,
    "language": 1.00,
    "skill": 0.40,
}


# ── helpers ──────────────────────────────────────────────────────────


def _build_user_message(cv_text: str) -> str:
    """Build the user message exactly as ``classify_entries`` does."""
    text_for_llm = cv_text[:12000]
    return (
        "Here is the text extracted from a CV/resume document:\n\n"
        f"---\n{text_for_llm}\n---\n\n"
        "Parse every entry in this CV into structured nodes. "
        'Return JSON with "nodes" and "unmatched" arrays.'
    )


# ── test ─────────────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.asyncio
async def test_kg_extraction_quality(
    cv_fixture: tuple[str, list[dict], str],
) -> None:
    """Classify a test CV with Claude CLI and assert quality against baseline."""
    cv_text, baseline_nodes, cv_name = cv_fixture

    if not shutil.which("claude"):
        pytest.skip("claude CLI not found on PATH — skipping integration test")

    model = os.environ.get("KG_TEST_MODEL", "claude-opus-4-6")

    # Call Claude CLI (same code path as production)
    user_message = _build_user_message(cv_text)
    raw_response = await call_claude(
        system_prompt=SYSTEM_PROMPT,
        user_message=user_message,
        model=model,
    )

    # Parse with production parser
    nodes, unmatched = _parse_result(raw_response)
    assert nodes, f"Claude returned zero classified nodes for {cv_name}"

    # Convert ExtractedNode to dicts for the comparator
    predicted = [{"node_type": n.node_type, "properties": n.properties} for n in nodes]

    # Compare against baseline (main branch output or static golden reference)
    result: ComparisonResult = compare_graphs(predicted, baseline_nodes)

    # Print report (captured by pytest -s and by CI tee)
    report = format_report(result)
    print(f"\n[{cv_name}]\n{report}")

    if result.composite_score >= COMPOSITE_MIN:
        print(f"\nRESULT: PASS (composite={result.composite_score:.2f} >= {COMPOSITE_MIN})")
    else:
        print(f"\nRESULT: FAIL (composite={result.composite_score:.2f} < {COMPOSITE_MIN})")

    # ── assertions ───────────────────────────────────────────────────

    assert result.overall_f1 >= OVERALL_F1_MIN, (
        f"[{cv_name}] Overall F1 {result.overall_f1:.2f} < {OVERALL_F1_MIN}"
    )
    assert result.overall_recall >= OVERALL_RECALL_MIN, (
        f"[{cv_name}] Overall Recall {result.overall_recall:.2f} < {OVERALL_RECALL_MIN}"
    )
    assert result.composite_score >= COMPOSITE_MIN, (
        f"[{cv_name}] Composite score {result.composite_score:.2f} < {COMPOSITE_MIN}"
    )

    # Per-type recall checks (only for types present in baseline)
    for node_type, min_recall in PER_TYPE_RECALL_MIN.items():
        type_result = result.per_type.get(node_type)
        if type_result is None:
            continue  # type not in this CV's baseline, skip
        assert type_result.recall >= min_recall, (
            f"[{cv_name}] {node_type} recall {type_result.recall:.2f} < {min_recall} "
            f"(found {type_result.matched_count}/{type_result.golden_count})"
        )
