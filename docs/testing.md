# Testing

## Test Structure

```
backend/tests/
├── conftest.py               # Shared fixture: cv_fixture (parameterized over fixtures/)
├── fixtures/                 # CV text files + golden JSON references
│   ├── *_cv.txt              # Raw CV text input
│   └── *_golden.json         # Expected extraction output (baseline)
├── lib/
│   └── graph_comparator.py   # Fuzzy graph comparison engine
├── integration/
│   ├── test_kg_quality.py    # CV extraction quality test (calls real Claude CLI)
│   └── generate_baseline.py  # CLI script to regenerate golden baselines
└── unit/
    ├── conftest.py           # Mock Neo4j driver + TestClient fixtures
    └── test_*.py             # Unit tests for every module
```

## Running Tests

### Unit Tests

```bash
cd backend
uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75
```

Unit tests mock Neo4j entirely (no database needed). The `conftest.py` provides:
- `mock_neo4j_driver` (autouse) — patches `get_driver` and `close_driver` globally
- `mock_db` — mock AsyncDriver with session/run/single chain
- `client` — `TestClient` with `get_db` and `get_current_user` overrides

Coverage minimum: **75%** (enforced in CI).

### Integration Tests

```bash
cd backend
uv run pytest tests/integration/ -v -s -m integration
```

Integration tests call the real Claude CLI to classify CVs and measure extraction quality against golden baselines. Requires Claude CLI installed and authenticated.

### Frontend Unit Tests

```bash
cd frontend
npm test
```

Uses Vitest with jsdom environment. Tests in `src/**/*.test.{ts,tsx}`.

### E2E Cross-Browser Tests (Playwright)

```bash
cd frontend
npm run e2e              # All browsers (Chromium, Firefox, WebKit)
npm run e2e:ui           # Interactive UI mode
npm run e2e:chromium     # Chromium only
npm run e2e:firefox      # Firefox only
npm run e2e:webkit       # WebKit (Safari engine) only
```

E2E tests live in `frontend/e2e/`. They focus on **cross-browser compatibility** (not business logic):

- **page-load** — public routes render without console errors
- **webgl** — Three.js canvas presence and WebGL context creation
- **css-compat** — backdrop-filter, scrollbar-width, gradient bg-clip
- **animations** — Framer Motion opacity/transform transitions complete
- **browser-apis** — Clipboard API, Blob/createObjectURL, localStorage/sessionStorage
- **responsive** — desktop (1440x900), tablet (768x1024), mobile (375x667)

Auth is mocked via `page.route()` intercepting `/api/auth/me` — no real backend needed.

First-time setup:
```bash
cd frontend
npm install
npx playwright install --with-deps
```

### Manual Cross-Browser Smoke Test

```bash
./scripts/cross-browser-test.sh           # Opens all installed browsers
./scripts/cross-browser-test.sh <URL>     # Custom URL
```

Follow the checklist at `docs/cross-browser-checklist.md` for structured manual testing covering areas that automated tests cannot verify (visual quality, animation smoothness, OAuth popup flow).

## CI Pipelines

### Lint (`lint.yml`)

Runs on all PRs and pushes to `main`. Two parallel jobs:
- **Backend:** `ruff check .` + `ruff format --check .`
- **Frontend:** `npm run lint`

### Unit Tests (`unit-tests.yml`)

Runs on PRs/pushes to `main` when `backend/**` files change:
- `uv run pytest tests/unit/ -v --tb=short --cov=app --cov-report=term-missing --cov-fail-under=75`

### E2E Cross-Browser (`e2e-tests.yml`)

Runs on PRs/pushes to `main` when `frontend/**` files change. Matrix strategy with `fail-fast: false` across three browser engines:
- **Chromium** (Chrome, Edge, Brave, Arc)
- **Firefox** (Gecko)
- **WebKit** (Safari)

Uploads HTML test report as artifact on every run; uploads traces on failure.

### CV Extraction Quality (`cv-extraction-quality.yml`)

Runs on PRs touching `backend/app/cv/**`, `backend/app/graph/queries.py`, or `backend/tests/**`. Two-phase:

1. **Baseline generation:** checks out `main`, generates golden JSON baselines using `generate_baseline.py`
2. **Quality check:** checks out PR branch, runs `test_kg_quality.py` against baselines

Quality thresholds:

| Metric | Threshold |
|--------|-----------|
| Overall F1 | >= 0.70 |
| Overall Recall | >= 0.60 |
| Composite (0.5 x F1 + 0.5 x property similarity) | >= 0.65 |

Per-type recall minimums:
- Education >= 0.66
- WorkExperience >= 0.55
- Language = 1.00
- Skill >= 0.40

## Graph Comparator

`tests/lib/graph_comparator.py` implements fuzzy matching for extracted graph nodes:

- **Token-level Jaccard similarity** with SequenceMatcher fallback
- **Match threshold:** 0.4 similarity score
- **Greedy assignment:** sorts all pairwise similarities, assigns best non-conflicting pairs
- **Reports:** per-type precision/recall/F1 + overall + mean property similarity + composite score

## pytest Configuration

In `backend/pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
markers = ["integration: tests that call external LLM APIs"]
```

The `integration` marker is used to skip LLM-calling tests in CI unit test runs.

## Test Fixtures

CV fixtures in `tests/fixtures/`:
- `*_cv.txt` — raw CV text (used as input to the classifier)
- `*_golden.json` — expected extraction output (list of `{node_type, properties}`)

To regenerate baselines after intentional changes:
```bash
cd backend
uv run python -m tests.integration.generate_baseline tests/fixtures/
```
