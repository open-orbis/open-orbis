# LLM Provider Benchmark Report

> Generated on 2026-04-14 03:37 UTC
> CVs tested: 3 | Providers: claude-opus, claude-sonnet, ollama, rule-based

## Executive Summary

**Best overall provider: `claude-opus`** with average composite score **0.940** (vs golden baselines).

- `claude-opus`: composite **0.940**
- `claude-sonnet`: composite **0.890**
- `ollama`: composite **0.446**
- `rule-based`: composite **0.183**

## Methodology

Each CV fixture was processed through the full extraction pipeline (`classify_entries()`) with the fallback chain pinned to a single provider at a time. This isolates each provider's output quality.

**Providers tested:**

| Provider | Model | Description |
|----------|-------|-------------|
| `claude-opus` | claude-opus-4-6 | Claude Opus via CLI (subscription) |
| `claude-sonnet` | claude-sonnet-4-6 | Claude Sonnet via CLI (subscription) |
| `ollama` | llama3.2:3b | Local Ollama (3B parameter model) |
| `rule-based` | regex/heuristics | No LLM, pure pattern matching |

**Metrics captured:**

- **Node counts** by type (work_experience, education, skill, etc.)
- **Relationship count** (USED_SKILL edges)
- **Linkage ratio** (relationships per non-skill node)
- **Field completeness** (% of properties populated per node type)
- **Quality scores** vs golden baselines: F1, precision, recall, property similarity, composite
- **Latency** (ms) and **token usage** / **cost** where available

## Aggregate Summary

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| Avg nodes | 87.0 | 37.5 | 11.0 | 267.7 |
| Avg relationships | 147.0 | 51.5 | 0.0 | 0.0 |
| Avg linkage ratio | 4.662 | 6.135 | 0.000 | 0.000 |
| Avg composite score | 0.940 | 0.890 | 0.446 | 0.183 |
| Avg latency (ms) | 128371.0 | 134263.0 | 1040887.0 | 49.0 |
| Total cost (USD) | — | — | — | — |

## Per-CV Results

### Alessandro Berti

**Node counts:**

| Node type | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|-----------|--------|--------|--------|--------|
| award | 17 | — | — | 0 |
| certification | 5 | — | — | 137 |
| education | 3 | — | — | 502 |
| language | 2 | — | — | 44 |
| outreach | 47 | — | — | 0 |
| patent | 1 | — | — | 0 |
| project | 15 | — | — | 0 |
| publication | 27 | — | — | 81 |
| skill | 52 | — | — | 0 |
| training | 12 | — | — | 0 |
| work_experience | 13 | — | — | 0 |
| **TOTAL** | **194** | **—** | **—** | **764** |

**Relationships & linkage:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| USED_SKILL edges | 345 | — | — | 0 |
| Linkage ratio | 2.43 | — | — | 0.00 |

**Quality vs golden baseline:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| Overall F1 | 0.943 | — | — | 0.056 |
| Overall Precision | 0.938 | — | — | 0.035 |
| Overall Recall | 0.948 | — | — | 0.141 |
| Property Similarity | 0.899 | — | — | 0.506 |
| Composite Score | 0.921 | — | — | 0.281 |

**Latency & cost:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| Latency (ms) | 324,647 | — | — | 49 |
| Input tokens | — | — | — | — |
| Output tokens | — | — | — | — |
| Cost (USD) | — | — | — | — |

> **`claude-sonnet` failed:** no nodes extracted

> **`ollama` failed:** no nodes extracted

### Eugenio Paluello

**Node counts:**

| Node type | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|-----------|--------|--------|--------|--------|
| education | 2 | 2 | 0 | 12 |
| outreach | 0 | 1 | 0 | 0 |
| project | 2 | 1 | 0 | 0 |
| skill | 31 | 39 | 0 | 0 |
| work_experience | 5 | 5 | 8 | 9 |
| **TOTAL** | **40** | **48** | **8** | **21** |

**Relationships & linkage:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| USED_SKILL edges | 68 | 77 | 0 | 0 |
| Linkage ratio | 7.56 | 8.56 | 0.00 | 0.00 |

**Quality vs golden baseline:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| Overall F1 | 0.988 | 0.899 | 0.204 | 0.065 |
| Overall Precision | 1.000 | 0.833 | 0.625 | 0.095 |
| Overall Recall | 0.976 | 0.976 | 0.122 | 0.049 |
| Property Similarity | 1.000 | 0.930 | 0.457 | 0.143 |
| Composite Score | 0.994 | 0.914 | 0.331 | 0.104 |

**Latency & cost:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| Latency (ms) | 37,559 | 172,949 | 1,113,943 | — |
| Input tokens | — | — | — | — |
| Output tokens | — | — | — | — |
| Cost (USD) | — | — | — | — |

### Francesca Paluello

**Node counts:**

| Node type | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|-----------|--------|--------|--------|--------|
| award | 1 | 1 | 0 | 0 |
| education | 1 | 1 | 1 | 11 |
| outreach | 1 | 1 | 0 | 0 |
| skill | 20 | 20 | 12 | 0 |
| training | 2 | 2 | 0 | 0 |
| work_experience | 2 | 2 | 1 | 7 |
| **TOTAL** | **27** | **27** | **14** | **18** |

**Relationships & linkage:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| USED_SKILL edges | 28 | 26 | 0 | 0 |
| Linkage ratio | 4.00 | 3.71 | 0.00 | 0.00 |

**Quality vs golden baseline:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| Overall F1 | 0.877 | 0.877 | 0.591 | 0.042 |
| Overall Precision | 0.926 | 0.926 | 0.929 | 0.056 |
| Overall Recall | 0.833 | 0.833 | 0.433 | 0.033 |
| Property Similarity | 0.933 | 0.856 | 0.531 | 0.286 |
| Composite Score | 0.905 | 0.866 | 0.561 | 0.164 |

**Latency & cost:**

| Metric | `claude-opus` | `claude-sonnet` | `ollama` | `rule-based` |
|--------|--------|--------|--------|--------|
| Latency (ms) | 22,907 | 95,577 | 967,831 | — |
| Input tokens | — | — | — | — |
| Output tokens | — | — | — | — |
| Cost (USD) | — | — | — | — |

## Notable Findings

- **alessandro_berti** — Skill extraction varies widely: `claude-opus` found 52 skills vs `rule-based` with only 0.
- **alessandro_berti** — Relationship richness gap: `claude-opus` produced 345 USED_SKILL edges vs `rule-based` with 0.
- **eugenio_paluello** — Skill extraction varies widely: `claude-sonnet` found 39 skills vs `ollama` with only 0.
- **eugenio_paluello** — Relationship richness gap: `claude-sonnet` produced 77 USED_SKILL edges vs `ollama` with 0.
- **francesca_paluello** — Skill extraction varies widely: `claude-opus` found 20 skills vs `rule-based` with only 0.
- **francesca_paluello** — Relationship richness gap: `claude-opus` produced 28 USED_SKILL edges vs `ollama` with 0.

## Recommendations

Based on composite quality scores, the recommended fallback chain is:

```
LLM_FALLBACK_CHAIN=claude-opus,claude-sonnet,ollama,rule-based
```

1. **`claude-opus`** (composite: 0.940)
2. **`claude-sonnet`** (composite: 0.890)
3. **`ollama`** (composite: 0.446)
4. **`rule-based`** (composite: 0.183)

---

*Report generated by `tests/integration/benchmark_providers.py` (issue #314)*
