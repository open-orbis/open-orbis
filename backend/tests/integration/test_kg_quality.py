"""Integration test: verify KG extraction quality against a baseline.

In CI the baseline is generated from the **main** branch extraction
(via ``generate_baseline.py``), so the test acts as a regression gate.
Locally it falls back to the static golden reference files.

The test exercises the **full production pipeline**: text has already been
extracted from PDF fixtures by the ``cv_fixture`` (via ``pdf_extractor``),
and classification goes through ``classify_entries()`` — the same LLM
fallback chain used in the running application.

The test is parametrized over every ``*_cv.pdf`` (or ``*_cv.txt``) fixture,
so adding a new CV only requires dropping a PDF + golden JSON into ``fixtures/``.

Requires:
    - ``claude`` CLI installed, accessible on PATH, and authenticated
      (either via interactive login / Claude Pro subscription, or via
      ``ANTHROPIC_API_KEY`` environment variable).
"""

from __future__ import annotations

import shutil

import pytest

from app.cv.ollama_classifier import classify_entries
from tests.lib.graph_comparator import ComparisonResult, compare_graphs, format_report

# ── config ───────────────────────────────────────────────────────────

MAX_RETRIES = 2

OVERALL_F1_MIN = 0.70
OVERALL_RECALL_MIN = 0.60
COMPOSITE_MIN = 0.65

PER_TYPE_RECALL_MIN: dict[str, float] = {
    "education": 0.66,
    "work_experience": 0.55,
    "language": 1.00,
    "skill": 0.40,
}


# ── test ─────────────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.asyncio
async def test_kg_extraction_quality(
    cv_fixture: tuple[str, list[dict], list[dict], str],
) -> None:
    """Classify a test CV with the full pipeline and assert quality against baseline."""
    cv_text, baseline_nodes, baseline_rels, cv_name = cv_fixture

    if not shutil.which("claude"):
        pytest.skip("claude CLI not found on PATH — skipping integration test")

    # ── classification via full production pipeline (with retry) ──
    result = None
    for attempt in range(1, MAX_RETRIES + 1):
        result = await classify_entries(cv_text)
        if result.nodes:
            break
        print(
            f"\n[{cv_name}] attempt {attempt}/{MAX_RETRIES}: "
            f"classify_entries returned 0 nodes"
        )

    assert result and result.nodes, (
        f"classify_entries returned zero nodes for {cv_name} "
        f"after {MAX_RETRIES} attempts"
    )

    # Convert to dicts for the comparator
    predicted_nodes = [
        {"node_type": n.node_type, "properties": n.properties} for n in result.nodes
    ]
    predicted_rels = [
        {"from_index": r.from_index, "to_index": r.to_index, "type": r.type}
        for r in result.relationships
    ]

    # Compare against baseline (main branch output or static golden reference)
    comparison: ComparisonResult = compare_graphs(
        predicted_nodes,
        baseline_nodes,
        predicted_relationships=predicted_rels,
        golden_relationships=baseline_rels,
    )

    # Print report (captured by pytest -s and by CI tee)
    report = format_report(comparison)
    print(f"\n[{cv_name}]\n{report}")

    if comparison.composite_score >= COMPOSITE_MIN:
        print(
            f"\nRESULT: PASS (composite={comparison.composite_score:.2f} "
            f">= {COMPOSITE_MIN})"
        )
    else:
        print(
            f"\nRESULT: FAIL (composite={comparison.composite_score:.2f} "
            f"< {COMPOSITE_MIN})"
        )

    # ── assertions ───────────────────────────────────────────────────

    assert comparison.overall_f1 >= OVERALL_F1_MIN, (
        f"[{cv_name}] Overall F1 {comparison.overall_f1:.2f} < {OVERALL_F1_MIN}"
    )
    assert comparison.overall_recall >= OVERALL_RECALL_MIN, (
        f"[{cv_name}] Overall Recall {comparison.overall_recall:.2f} "
        f"< {OVERALL_RECALL_MIN}"
    )
    assert comparison.composite_score >= COMPOSITE_MIN, (
        f"[{cv_name}] Composite score {comparison.composite_score:.2f} "
        f"< {COMPOSITE_MIN}"
    )

    # Per-type recall checks (only for types present in baseline)
    for node_type, min_recall in PER_TYPE_RECALL_MIN.items():
        type_result = comparison.per_type.get(node_type)
        if type_result is None:
            continue  # type not in this CV's baseline, skip
        assert type_result.recall >= min_recall, (
            f"[{cv_name}] {node_type} recall {type_result.recall:.2f} < {min_recall} "
            f"(found {type_result.matched_count}/{type_result.golden_count})"
        )
