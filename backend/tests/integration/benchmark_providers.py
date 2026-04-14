"""Benchmark CV extraction quality across all LLM providers.

Usage (from ``backend/`` directory):

    uv run python -m tests.integration.benchmark_providers

Discovers every ``*_cv.pdf`` fixture, extracts text, then runs
``classify_entries()`` with each provider pinned individually.
Produces per-CV JSON results in ``tests/integration/benchmark_results/``
and a final markdown report at ``docs/llm-provider-benchmark.md``.

Resolves: #314
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

import httpx

# ── paths ───────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"
FIXTURES_DIR = BACKEND_ROOT / "tests" / "fixtures"
RESULTS_DIR = Path(__file__).resolve().parent / "benchmark_results"
REPORT_PATH = REPO_ROOT / "docs" / "llm-provider-benchmark.md"

# ── config ──────────────────────────────────────────────────────────

PROVIDERS = ["claude-opus", "claude-sonnet", "ollama", "rule-based"]
MAX_RETRIES = 2


# ── helpers ─────────────────────────────────────────────────────────


def _kill_claude_cli_processes() -> int:
    """Kill any lingering ``claude -p`` CLI processes between provider switches."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "claude -p"],
            capture_output=True,
            text=True,
        )
        pids = [int(p) for p in result.stdout.strip().split() if p.isdigit()]
        for pid in pids:
            with contextlib.suppress(ProcessLookupError):
                os.kill(pid, signal.SIGTERM)
        return len(pids)
    except Exception:
        return 0


def _discover_cv_fixtures() -> list[Path]:
    """Return CV fixture PDF paths."""
    return sorted(FIXTURES_DIR.glob("*_cv.pdf"))


def _ensure_ollama_running() -> bool:
    """Ensure the Ollama Docker container is running and the model is pulled."""
    from app.config import settings

    base_url = settings.ollama_base_url
    model = settings.ollama_model

    # 1. Check if Ollama is reachable
    reachable = False
    try:
        resp = httpx.get(f"{base_url}/api/tags", timeout=5)
        reachable = resp.status_code == 200
    except Exception:
        pass

    # 2. If not reachable, start the Docker container
    if not reachable:
        print("  Ollama not reachable, starting Docker container...", flush=True)
        try:
            subprocess.run(
                ["docker", "compose", "up", "-d", "ollama"],
                cwd=str(REPO_ROOT),
                capture_output=True,
                timeout=60,
            )
        except Exception as e:
            print(f"  Failed to start Ollama container: {e}")
            return False

        # Wait for Ollama to be ready (up to 30s)
        for _i in range(15):
            time.sleep(2)
            try:
                resp = httpx.get(f"{base_url}/api/tags", timeout=5)
                if resp.status_code == 200:
                    reachable = True
                    print("  Ollama container started")
                    break
            except Exception:
                pass
        if not reachable:
            print("  Ollama failed to start within 30s")
            return False
    else:
        resp = httpx.get(f"{base_url}/api/tags", timeout=5)

    # 3. Check if model is already available
    tags = resp.json().get("models", [])
    model_names = [t.get("name", "") for t in tags]
    if any(model in name for name in model_names):
        return True

    # 4. Pull the model
    print(f"  Pulling Ollama model '{model}'...", flush=True)
    try:
        pull_resp = httpx.post(
            f"{base_url}/api/pull",
            json={"name": model, "stream": False},
            timeout=600,
        )
        if pull_resp.status_code == 200:
            print(f"  Model '{model}' pulled successfully")
            return True
        print(f"  Failed to pull model: HTTP {pull_resp.status_code}")
        return False
    except Exception as e:
        print(f"  Failed to pull model: {e}")
        return False


def _check_provider_available(provider: str) -> bool:
    """Check if a provider is reachable."""
    if provider == "rule-based":
        return True
    if provider in ("claude-opus", "claude-sonnet"):
        return shutil.which("claude") is not None
    if provider == "ollama":
        return _ensure_ollama_running()
    return False


def _node_counts(nodes: list[dict]) -> dict[str, int]:
    """Count nodes by type."""
    counts: dict[str, int] = defaultdict(int)
    for n in nodes:
        counts[n["node_type"]] += 1
    return dict(sorted(counts.items()))


def _field_completeness(nodes: list[dict]) -> dict[str, float]:
    """Per node-type: fraction of non-empty property values."""
    by_type: dict[str, list[dict]] = defaultdict(list)
    for n in nodes:
        by_type[n["node_type"]].append(n.get("properties", {}))

    result: dict[str, float] = {}
    for nt, props_list in sorted(by_type.items()):
        total_fields = 0
        filled_fields = 0
        for props in props_list:
            for v in props.values():
                total_fields += 1
                if v is not None and str(v).strip():
                    filled_fields += 1
        result[nt] = filled_fields / total_fields if total_fields else 0.0
    return result


def _linkage_ratio(nodes: list[dict], relationships: list[dict]) -> float:
    """Ratio of USED_SKILL edges to non-skill nodes."""
    non_skill = sum(1 for n in nodes if n["node_type"] != "skill")
    if non_skill == 0:
        return 0.0
    return len(relationships) / non_skill


async def _run_single(
    cv_text: str,
    provider_key: str,
) -> dict:
    """Run classify_entries with a single provider pinned. Returns result dict."""
    from app.config import settings
    from app.cv.ollama_classifier import classify_entries

    original_chain = settings.llm_fallback_chain
    settings.llm_fallback_chain = provider_key

    start = time.time()
    result = None
    error_msg = None

    try:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                result = await classify_entries(cv_text)
                if result.nodes:
                    break
                print(
                    f"    attempt {attempt}/{MAX_RETRIES}: 0 nodes",
                    file=sys.stderr,
                )
            except Exception as e:
                error_msg = str(e)
                print(
                    f"    attempt {attempt}/{MAX_RETRIES} error: {e}",
                    file=sys.stderr,
                )
    finally:
        settings.llm_fallback_chain = original_chain

    elapsed_ms = int((time.time() - start) * 1000)

    if result is None or not result.nodes:
        return {
            "provider": provider_key,
            "status": "failed",
            "error": error_msg or "no nodes extracted",
            "elapsed_ms": elapsed_ms,
            "nodes": [],
            "relationships": [],
            "unmatched": [],
        }

    nodes = [
        {"node_type": n.node_type, "properties": n.properties} for n in result.nodes
    ]
    rels = [
        {"from_index": r.from_index, "to_index": r.to_index, "type": r.type}
        for r in result.relationships
    ]

    meta = result.metadata
    return {
        "provider": provider_key,
        "status": "ok",
        "elapsed_ms": meta.duration_ms if meta and meta.duration_ms else elapsed_ms,
        "input_tokens": meta.input_tokens if meta else None,
        "output_tokens": meta.output_tokens if meta else None,
        "cost_usd": meta.cost_usd if meta else None,
        "nodes": nodes,
        "relationships": rels,
        "unmatched": result.unmatched,
        "cv_owner_name": result.cv_owner_name,
        "node_counts": _node_counts(nodes),
        "total_nodes": len(nodes),
        "total_relationships": len(rels),
        "field_completeness": _field_completeness(nodes),
        "linkage_ratio": _linkage_ratio(nodes, rels),
    }


def _compare_against_golden(result: dict, golden_path: Path) -> dict | None:
    """Compare result against golden baseline if available."""
    if not golden_path.exists():
        return None

    from tests.lib.graph_comparator import compare_graphs

    golden = json.loads(golden_path.read_text(encoding="utf-8"))
    golden_nodes = golden["nodes"]
    golden_rels = golden.get("relationships", [])

    comparison = compare_graphs(
        result["nodes"],
        golden_nodes,
        predicted_relationships=result["relationships"],
        golden_relationships=golden_rels,
    )

    per_type = {}
    for nt, tr in comparison.per_type.items():
        per_type[nt] = {
            "precision": round(tr.precision, 3),
            "recall": round(tr.recall, 3),
            "f1": round(tr.f1, 3),
            "predicted": tr.predicted_count,
            "golden": tr.golden_count,
            "matched": tr.matched_count,
        }

    rel_data = None
    if comparison.relationship_result:
        rr = comparison.relationship_result
        rel_data = {
            "precision": round(rr.precision, 3),
            "recall": round(rr.recall, 3),
            "f1": round(rr.f1, 3),
            "predicted": rr.predicted_count,
            "golden": rr.golden_count,
            "matched": rr.matched_count,
        }

    return {
        "overall_f1": round(comparison.overall_f1, 3),
        "overall_precision": round(comparison.overall_precision, 3),
        "overall_recall": round(comparison.overall_recall, 3),
        "property_similarity": round(comparison.mean_property_similarity, 3),
        "composite_score": round(comparison.composite_score, 3),
        "per_type": per_type,
        "relationships": rel_data,
    }


def _detect_findings(all_results: dict[str, dict[str, dict]]) -> list[str]:
    """Auto-detect notable differences across providers."""
    findings: list[str] = []
    for cv_name in sorted(all_results):
        cv_data = all_results[cv_name]
        ok_provs = {p: d for p, d in cv_data.items() if d["status"] == "ok"}
        if len(ok_provs) < 2:
            continue

        skill_counts = {
            p: d["node_counts"].get("skill", 0) for p, d in ok_provs.items()
        }
        max_s = max(skill_counts.values())
        min_s = min(skill_counts.values())
        if max_s > 0 and min_s / max_s < 0.5:
            best_p = max(skill_counts, key=skill_counts.get)
            worst_p = min(skill_counts, key=skill_counts.get)
            findings.append(
                f"**{cv_name}** — Skill extraction varies widely: "
                f"`{best_p}` found {skill_counts[best_p]} skills vs "
                f"`{worst_p}` with only {skill_counts[worst_p]}."
            )

        rel_counts = {p: d["total_relationships"] for p, d in ok_provs.items()}
        max_r = max(rel_counts.values())
        min_r = min(rel_counts.values())
        if max_r > 0 and (min_r == 0 or max_r / max(min_r, 1) > 3):
            best_p = max(rel_counts, key=rel_counts.get)
            worst_p = min(rel_counts, key=rel_counts.get)
            findings.append(
                f"**{cv_name}** — Relationship richness gap: "
                f"`{best_p}` produced {rel_counts[best_p]} USED_SKILL edges vs "
                f"`{worst_p}` with {rel_counts[worst_p]}."
            )
    return findings


# ── report generation ───────────────────────────────────────────────


def _compute_aggregates(
    all_results: dict[str, dict[str, dict]],
) -> dict[str, dict[str, list]]:
    """Compute per-provider aggregate metrics across all CVs."""
    agg: dict[str, dict[str, list]] = {
        "scores": defaultdict(list),
        "nodes": defaultdict(list),
        "rels": defaultdict(list),
        "linkage": defaultdict(list),
        "cost": defaultdict(list),
        "latency": defaultdict(list),
    }
    for cv_data in all_results.values():
        for prov, data in cv_data.items():
            if data["status"] != "ok":
                continue
            agg["nodes"][prov].append(data["total_nodes"])
            agg["rels"][prov].append(data["total_relationships"])
            agg["linkage"][prov].append(data["linkage_ratio"])
            if data.get("elapsed_ms"):
                agg["latency"][prov].append(data["elapsed_ms"])
            if data.get("cost_usd"):
                agg["cost"][prov].append(data["cost_usd"])
            comp = data.get("comparison") or {}
            if comp.get("composite_score"):
                agg["scores"][prov].append(comp["composite_score"])
    return agg


def _report_cv_section(
    cv_name: str,
    cv_data: dict[str, dict],
    providers_tested: list[str],
) -> list[str]:
    """Generate the per-CV markdown section."""
    lines: list[str] = []
    lines.append(f"### {cv_name.replace('_', ' ').title()}")
    lines.append("")

    all_node_types: set[str] = set()
    for _prov, data in cv_data.items():
        if data["status"] == "ok":
            all_node_types.update(data["node_counts"].keys())

    provs = [p for p in providers_tested if p in cv_data]
    hdr = "| Node type | " + " | ".join(f"`{p}`" for p in provs) + " |"
    sep = "|-----------|" + "|".join("--------" for _ in provs) + "|"

    lines.append("**Node counts:**")
    lines.append("")
    lines.append(hdr)
    lines.append(sep)

    for nt in sorted(all_node_types):
        cells = [
            str(cv_data[p]["node_counts"].get(nt, 0))
            if cv_data[p]["status"] == "ok"
            else "—"
            for p in provs
        ]
        lines.append(f"| {nt} | " + " | ".join(cells) + " |")

    total_cells = [
        str(cv_data[p]["total_nodes"]) if cv_data[p]["status"] == "ok" else "—"
        for p in provs
    ]
    lines.append("| **TOTAL** | " + " | ".join(f"**{c}**" for c in total_cells) + " |")
    lines.append("")

    # Relationships & linkage
    lines.append("**Relationships & linkage:**")
    lines.append("")
    lines.append("| Metric | " + " | ".join(f"`{p}`" for p in provs) + " |")
    lines.append("|--------|" + "|".join("--------" for _ in provs) + "|")

    rel_cells, link_cells = [], []
    for p in provs:
        d = cv_data[p]
        if d["status"] == "ok":
            rel_cells.append(str(d["total_relationships"]))
            link_cells.append(f"{d['linkage_ratio']:.2f}")
        else:
            rel_cells.append("—")
            link_cells.append("—")
    lines.append("| USED_SKILL edges | " + " | ".join(rel_cells) + " |")
    lines.append("| Linkage ratio | " + " | ".join(link_cells) + " |")
    lines.append("")

    # Quality vs golden
    has_comparison = any(
        cv_data[p].get("comparison") for p in provs if cv_data[p]["status"] == "ok"
    )
    if has_comparison:
        _append_quality_table(lines, cv_data, provs)

    # Latency & cost
    _append_latency_table(lines, cv_data, provs)

    # Errors
    for p in provs:
        d = cv_data[p]
        if d["status"] != "ok":
            lines.append(f"> **`{p}` failed:** {d.get('error', 'unknown error')}")
            lines.append("")

    return lines


def _append_quality_table(
    lines: list[str],
    cv_data: dict[str, dict],
    provs: list[str],
) -> None:
    """Append quality-vs-golden comparison table."""
    lines.append("**Quality vs golden baseline:**")
    lines.append("")
    lines.append("| Metric | " + " | ".join(f"`{p}`" for p in provs) + " |")
    lines.append("|--------|" + "|".join("--------" for _ in provs) + "|")

    metrics = [
        "overall_f1",
        "overall_precision",
        "overall_recall",
        "property_similarity",
        "composite_score",
    ]
    for metric in metrics:
        cells = []
        for p in provs:
            comp = cv_data[p].get("comparison")
            if comp and metric in comp:
                cells.append(f"{comp[metric]:.3f}")
            else:
                cells.append("—")
        label = metric.replace("_", " ").title()
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    lines.append("")


def _append_latency_table(
    lines: list[str],
    cv_data: dict[str, dict],
    provs: list[str],
) -> None:
    """Append latency and cost table."""
    lines.append("**Latency & cost:**")
    lines.append("")
    lines.append("| Metric | " + " | ".join(f"`{p}`" for p in provs) + " |")
    lines.append("|--------|" + "|".join("--------" for _ in provs) + "|")

    lat, tok_in, tok_out, cost = [], [], [], []
    for p in provs:
        d = cv_data[p]
        if d["status"] != "ok":
            lat.append("—")
            tok_in.append("—")
            tok_out.append("—")
            cost.append("—")
        else:
            lat.append(f"{d['elapsed_ms']:,}" if d.get("elapsed_ms") else "—")
            tok_in.append(f"{d['input_tokens']:,}" if d.get("input_tokens") else "—")
            tok_out.append(f"{d['output_tokens']:,}" if d.get("output_tokens") else "—")
            cost.append(f"${d['cost_usd']:.4f}" if d.get("cost_usd") else "—")

    lines.append("| Latency (ms) | " + " | ".join(lat) + " |")
    lines.append("| Input tokens | " + " | ".join(tok_in) + " |")
    lines.append("| Output tokens | " + " | ".join(tok_out) + " |")
    lines.append("| Cost (USD) | " + " | ".join(cost) + " |")
    lines.append("")


def _generate_report(all_results: dict[str, dict[str, dict]]) -> str:  # noqa: C901
    """Generate the final markdown report."""
    lines: list[str] = []

    cv_names = sorted(all_results.keys())
    providers_tested: list[str] = sorted(
        {p for cv_data in all_results.values() for p in cv_data}
    )

    lines.append("# LLM Provider Benchmark Report")
    lines.append("")
    lines.append(f"> Generated on {time.strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append(
        f"> CVs tested: {len(cv_names)} | Providers: {', '.join(providers_tested)}"
    )
    lines.append("")

    agg = _compute_aggregates(all_results)
    avg_scores = {p: sum(s) / len(s) for p, s in agg["scores"].items() if s}

    # ── Executive summary ──
    lines.append("## Executive Summary")
    lines.append("")
    if avg_scores:
        best = max(avg_scores, key=avg_scores.get)
        lines.append(
            f"**Best overall provider: `{best}`** with average composite score "
            f"**{avg_scores[best]:.3f}** (vs golden baselines)."
        )
        lines.append("")
        for p in providers_tested:
            if p in avg_scores:
                lines.append(f"- `{p}`: composite **{avg_scores[p]:.3f}**")
            else:
                ok_count = len(agg["nodes"].get(p, []))
                lines.append(
                    f"- `{p}`: {'no golden comparison available' if ok_count > 0 else 'failed or skipped'}"
                )
        lines.append("")
    else:
        lines.append("No golden baselines available for comparison scoring.")
        lines.append("")

    # ── Methodology ──
    lines += [
        "## Methodology",
        "",
        "Each CV fixture was processed through the full extraction pipeline "
        "(`classify_entries()`) with the fallback chain pinned to a single provider at a time. "
        "This isolates each provider's output quality.",
        "",
        "**Providers tested:**",
        "",
        "| Provider | Model | Description |",
        "|----------|-------|-------------|",
        "| `claude-opus` | claude-opus-4-6 | Claude Opus via CLI (subscription) |",
        "| `claude-sonnet` | claude-sonnet-4-6 | Claude Sonnet via CLI (subscription) |",
        "| `ollama` | llama3.2:3b | Local Ollama (3B parameter model) |",
        "| `rule-based` | regex/heuristics | No LLM, pure pattern matching |",
        "",
        "**Metrics captured:**",
        "",
        "- **Node counts** by type (work_experience, education, skill, etc.)",
        "- **Relationship count** (USED_SKILL edges)",
        "- **Linkage ratio** (relationships per non-skill node)",
        "- **Field completeness** (% of properties populated per node type)",
        "- **Quality scores** vs golden baselines: F1, precision, recall, property similarity, composite",
        "- **Latency** (ms) and **token usage** / **cost** where available",
        "",
    ]

    # ── Aggregate summary table ──
    def _avg(lst: list) -> str:
        return f"{sum(lst) / len(lst):.1f}" if lst else "—"

    def _avg3(lst: list) -> str:
        return f"{sum(lst) / len(lst):.3f}" if lst else "—"

    def _sum2(lst: list) -> str:
        return f"${sum(lst):.4f}" if lst else "—"

    lines.append("## Aggregate Summary")
    lines.append("")
    lines.append("| Metric | " + " | ".join(f"`{p}`" for p in providers_tested) + " |")
    lines.append("|--------|" + "|".join("--------" for _ in providers_tested) + "|")

    metrics_map = [
        ("Avg nodes", _avg, "nodes"),
        ("Avg relationships", _avg, "rels"),
        ("Avg linkage ratio", _avg3, "linkage"),
        ("Avg composite score", _avg3, "scores"),
        ("Avg latency (ms)", _avg, "latency"),
        ("Total cost (USD)", _sum2, "cost"),
    ]
    for label, fmt_fn, key in metrics_map:
        row = (
            f"| {label} | "
            + " | ".join(fmt_fn(agg[key].get(p, [])) for p in providers_tested)
            + " |"
        )
        lines.append(row)
    lines.append("")

    # ── Per-CV detailed results ──
    lines.append("## Per-CV Results")
    lines.append("")
    for cv_name in cv_names:
        lines += _report_cv_section(cv_name, all_results[cv_name], providers_tested)

    # ── Notable findings ──
    lines.append("## Notable Findings")
    lines.append("")
    findings = _detect_findings(all_results)
    if findings:
        for f in findings:
            lines.append(f"- {f}")
    else:
        lines.append("No major outliers detected across providers.")
    lines.append("")

    # ── Recommendations ──
    lines.append("## Recommendations")
    lines.append("")
    if avg_scores:
        ranked = sorted(avg_scores.items(), key=lambda x: x[1], reverse=True)
        chain = ",".join(p for p, _ in ranked)
        chain += ",rule-based" if "rule-based" not in chain else ""
        lines.append(
            "Based on composite quality scores, the recommended fallback chain is:"
        )
        lines.append("")
        lines.append("```")
        lines.append(f"LLM_FALLBACK_CHAIN={chain}")
        lines.append("```")
        lines.append("")
        for i, (p, score) in enumerate(ranked, 1):
            lines.append(f"{i}. **`{p}`** (composite: {score:.3f})")
        lines.append("")
    else:
        lines.append(
            "Insufficient golden baseline data for ranking. "
            "Generate golden baselines first, then re-run the benchmark."
        )
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(
        "*Report generated by `tests/integration/benchmark_providers.py` (issue #314)*"
    )
    lines.append("")

    return "\n".join(lines)


# ── main ────────────────────────────────────────────────────────────


async def main() -> None:
    from app.cv.pdf_extractor import extract_text

    cv_files = _discover_cv_fixtures()
    if not cv_files:
        print("ERROR: no *_cv.pdf fixtures found", file=sys.stderr)
        sys.exit(1)

    # Check provider availability
    available: list[str] = []
    skipped_provs: list[str] = []
    for p in PROVIDERS:
        if _check_provider_available(p):
            available.append(p)
            print(f"  [OK] {p}")
        else:
            skipped_provs.append(p)
            print(f"  [SKIP] {p} — not available")

    if not available:
        print("ERROR: no providers available", file=sys.stderr)
        sys.exit(1)

    print(f"\nBenchmarking {len(cv_files)} CV(s) x {len(available)} provider(s)...\n")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Pre-extract text from all CVs
    cv_texts: dict[str, str] = {}
    for cv_path in cv_files:
        cv_name = cv_path.stem.removesuffix("_cv")
        pdf_bytes = cv_path.read_bytes()
        cv_text = await extract_text(pdf_bytes)
        cv_texts[cv_name] = cv_text
        print(f"  {cv_name}: {len(cv_text)} chars extracted")

    # all_results[cv_name][provider] = result_dict
    all_results: dict[str, dict[str, dict]] = {name: {} for name in cv_texts}

    # Group by provider — process all CVs with one provider before switching.
    # This avoids rapid model switching in the Claude CLI which causes
    # throttling / slowness when alternating opus ↔ sonnet.
    for prov_idx, provider in enumerate(available):
        # Kill lingering claude -p processes before switching provider
        if prov_idx > 0:
            killed = _kill_claude_cli_processes()
            if killed:
                print(f"  (killed {killed} lingering claude process(es))")
            await asyncio.sleep(5)
        print(f"\n{'=' * 50}")
        print(f"  PROVIDER: {provider}")
        print(f"{'=' * 50}")

        for cv_name, cv_text in cv_texts.items():
            print(f"  [{cv_name}] running...", end="", flush=True)
            result = await _run_single(cv_text, provider)

            # Compare against golden if available
            golden_path = FIXTURES_DIR / f"{cv_name}_golden.json"
            if result["status"] == "ok" and golden_path.exists():
                result["comparison"] = _compare_against_golden(result, golden_path)

            all_results[cv_name][provider] = result

            # Save raw result
            out_path = RESULTS_DIR / f"{cv_name}__{provider.replace('-', '_')}.json"
            out_path.write_text(
                json.dumps(result, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

            if result["status"] == "ok":
                print(
                    f" {result['total_nodes']} nodes, "
                    f"{result['total_relationships']} rels "
                    f"({result['elapsed_ms']}ms)"
                )
            else:
                print(f" FAILED: {result.get('error', '?')}")

    # Generate report & update baselines
    _save_report(all_results)
    _update_golden_baselines(all_results, available)
    print("\nDone.")


def _save_report(all_results: dict[str, dict[str, dict]]) -> None:
    """Generate and save the markdown report."""
    print("\nGenerating report...")
    report = _generate_report(all_results)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Report saved to {REPORT_PATH}")


def _update_golden_baselines(
    all_results: dict[str, dict[str, dict]],
    available: list[str],
) -> None:
    """Update golden baselines from best available provider."""
    best_provider = None
    for candidate in ("claude-opus", "claude-sonnet"):
        if candidate in available:
            best_provider = candidate
            break

    if not best_provider:
        return

    print(f"\nUpdating golden baselines from {best_provider} results...")
    for cv_name, cv_data in all_results.items():
        if best_provider not in cv_data:
            continue
        data = cv_data[best_provider]
        if data["status"] != "ok":
            continue
        golden_path = FIXTURES_DIR / f"{cv_name}_golden.json"
        golden_data = {
            "nodes": data["nodes"],
            "relationships": data["relationships"],
            "unmatched": data.get("unmatched", []),
        }
        golden_path.write_text(
            json.dumps(golden_data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(
            f"  {golden_path.name}: "
            f"{len(data['nodes'])} nodes, "
            f"{len(data['relationships'])} rels"
        )


if __name__ == "__main__":
    asyncio.run(main())
