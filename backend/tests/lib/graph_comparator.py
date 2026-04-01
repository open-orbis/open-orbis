"""Fuzzy graph comparison for LLM-extracted knowledge graphs.

Compares predicted nodes against a golden reference using token-level
Jaccard similarity with SequenceMatcher fallback.  Produces per-type
and overall precision / recall / F1 plus a property-similarity score.
"""

from __future__ import annotations

import re
import string
from collections import defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher

# Key properties used to *identify* a node of each type.
KEY_PROPERTIES: dict[str, list[str]] = {
    "education": ["institution", "degree"],
    "work_experience": ["company", "title"],
    "skill": ["name"],
    "language": ["name"],
    "certification": ["name"],
    "publication": ["title"],
    "project": ["name"],
    "patent": ["title"],
    "collaborator": ["name"],
}

MATCH_THRESHOLD = 0.4


# ── dataclasses ──────────────────────────────────────────────────────


@dataclass
class TypeResult:
    node_type: str
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    mean_property_similarity: float = 0.0
    predicted_count: int = 0
    golden_count: int = 0
    matched_count: int = 0


@dataclass
class ComparisonResult:
    overall_precision: float = 0.0
    overall_recall: float = 0.0
    overall_f1: float = 0.0
    mean_property_similarity: float = 0.0
    composite_score: float = 0.0
    per_type: dict[str, TypeResult] = field(default_factory=dict)


# ── similarity helpers ───────────────────────────────────────────────

_PUNCT_TABLE = str.maketrans("", "", string.punctuation)


def _tokenize(text: str) -> set[str]:
    """Lowercase, strip punctuation, split on whitespace."""
    return set(text.lower().translate(_PUNCT_TABLE).split())


def property_similarity(a: str | None, b: str | None) -> float:
    """Return similarity between two property values (0..1)."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    a_str, b_str = str(a).strip(), str(b).strip()
    if not a_str and not b_str:
        return 1.0
    if not a_str or not b_str:
        return 0.0

    tokens_a = _tokenize(a_str)
    tokens_b = _tokenize(b_str)

    if not tokens_a or not tokens_b:
        return SequenceMatcher(None, a_str.lower(), b_str.lower()).ratio()

    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    jaccard = len(intersection) / len(union)

    if jaccard < 0.3:
        return max(jaccard, SequenceMatcher(None, a_str.lower(), b_str.lower()).ratio())
    return jaccard


def node_similarity(
    predicted: dict, golden: dict, node_type: str
) -> float:
    """Similarity between two nodes based on key properties for *node_type*."""
    keys = KEY_PROPERTIES.get(node_type, [])
    if not keys:
        return 0.0

    pred_props = predicted.get("properties", {})
    gold_props = golden.get("properties", {})

    scores = []
    for key in keys:
        scores.append(property_similarity(pred_props.get(key), gold_props.get(key)))

    return sum(scores) / len(scores) if scores else 0.0


# ── full-property similarity for matched pairs ──────────────────────


def _matched_property_similarity(predicted: dict, golden: dict) -> float:
    """Average property similarity across all golden properties."""
    pred_props = predicted.get("properties", {})
    gold_props = golden.get("properties", {})

    if not gold_props:
        return 1.0

    scores = []
    for key, gold_val in gold_props.items():
        pred_val = pred_props.get(key)
        scores.append(property_similarity(pred_val, gold_val))

    return sum(scores) / len(scores) if scores else 0.0


# ── greedy matching ──────────────────────────────────────────────────


def _greedy_match(
    predicted_nodes: list[dict],
    golden_nodes: list[dict],
    node_type: str,
) -> list[tuple[int, int, float]]:
    """Return list of (pred_idx, gold_idx, similarity) matches.

    Greedy: sort all pairs by similarity descending, assign greedily.
    """
    pairs: list[tuple[float, int, int]] = []
    for pi, pred in enumerate(predicted_nodes):
        for gi, gold in enumerate(golden_nodes):
            sim = node_similarity(pred, gold, node_type)
            pairs.append((sim, pi, gi))

    pairs.sort(key=lambda x: x[0], reverse=True)

    used_pred: set[int] = set()
    used_gold: set[int] = set()
    matches: list[tuple[int, int, float]] = []

    for sim, pi, gi in pairs:
        if sim < MATCH_THRESHOLD:
            break
        if pi in used_pred or gi in used_gold:
            continue
        matches.append((pi, gi, sim))
        used_pred.add(pi)
        used_gold.add(gi)

    return matches


# ── per-type comparison ──────────────────────────────────────────────


def match_nodes_by_type(
    predicted_nodes: list[dict],
    golden_nodes: list[dict],
    node_type: str,
) -> TypeResult:
    """Compare predicted vs golden nodes for a single node_type."""
    result = TypeResult(
        node_type=node_type,
        predicted_count=len(predicted_nodes),
        golden_count=len(golden_nodes),
    )

    if not golden_nodes and not predicted_nodes:
        result.precision = 1.0
        result.recall = 1.0
        result.f1 = 1.0
        result.mean_property_similarity = 1.0
        return result

    if not golden_nodes:
        return result  # precision=0, recall undefined but 0

    if not predicted_nodes:
        return result  # recall=0

    matches = _greedy_match(predicted_nodes, golden_nodes, node_type)
    result.matched_count = len(matches)

    result.precision = len(matches) / len(predicted_nodes) if predicted_nodes else 0.0
    result.recall = len(matches) / len(golden_nodes) if golden_nodes else 0.0

    if result.precision + result.recall > 0:
        result.f1 = (
            2 * result.precision * result.recall / (result.precision + result.recall)
        )

    # property similarity for matched pairs
    prop_sims = []
    for pi, gi, _ in matches:
        prop_sims.append(
            _matched_property_similarity(predicted_nodes[pi], golden_nodes[gi])
        )
    result.mean_property_similarity = (
        sum(prop_sims) / len(prop_sims) if prop_sims else 0.0
    )

    return result


# ── top-level comparison ─────────────────────────────────────────────


def compare_graphs(
    predicted: list[dict], golden: list[dict]
) -> ComparisonResult:
    """Compare full predicted graph against golden reference.

    Both *predicted* and *golden* are lists of dicts with keys
    ``node_type`` and ``properties``.
    """
    # Group by node_type
    pred_by_type: dict[str, list[dict]] = defaultdict(list)
    gold_by_type: dict[str, list[dict]] = defaultdict(list)

    for node in predicted:
        pred_by_type[node["node_type"]].append(node)
    for node in golden:
        gold_by_type[node["node_type"]].append(node)

    all_types = set(pred_by_type.keys()) | set(gold_by_type.keys())

    per_type: dict[str, TypeResult] = {}
    total_matched = 0
    total_predicted = 0
    total_golden = 0
    all_prop_sims: list[float] = []

    for nt in sorted(all_types):
        tr = match_nodes_by_type(
            pred_by_type.get(nt, []),
            gold_by_type.get(nt, []),
            nt,
        )
        per_type[nt] = tr
        total_matched += tr.matched_count
        total_predicted += tr.predicted_count
        total_golden += tr.golden_count
        if tr.matched_count > 0:
            all_prop_sims.extend(
                [tr.mean_property_similarity] * tr.matched_count
            )

    overall_precision = total_matched / total_predicted if total_predicted else 0.0
    overall_recall = total_matched / total_golden if total_golden else 0.0
    overall_f1 = (
        2 * overall_precision * overall_recall / (overall_precision + overall_recall)
        if (overall_precision + overall_recall) > 0
        else 0.0
    )
    mean_prop_sim = sum(all_prop_sims) / len(all_prop_sims) if all_prop_sims else 0.0
    composite = 0.5 * overall_f1 + 0.5 * mean_prop_sim

    return ComparisonResult(
        overall_precision=overall_precision,
        overall_recall=overall_recall,
        overall_f1=overall_f1,
        mean_property_similarity=mean_prop_sim,
        composite_score=composite,
        per_type=per_type,
    )


# ── report formatting ────────────────────────────────────────────────


def format_report(result: ComparisonResult) -> str:
    """Return a human-readable quality report string."""
    lines = [
        "=== KG Quality Report ===",
        f"Overall: F1={result.overall_f1:.2f}  "
        f"Precision={result.overall_precision:.2f}  "
        f"Recall={result.overall_recall:.2f}  "
        f"PropSim={result.mean_property_similarity:.2f}  "
        f"Composite={result.composite_score:.2f}",
        "",
        "Per-type breakdown:",
    ]

    for nt in sorted(result.per_type):
        tr = result.per_type[nt]
        lines.append(
            f"  {nt:20s} P={tr.precision:.2f}  R={tr.recall:.2f}  "
            f"F1={tr.f1:.2f}  count={tr.matched_count}/{tr.golden_count}  "
            f"propSim={tr.mean_property_similarity:.2f}"
        )

    return "\n".join(lines)
