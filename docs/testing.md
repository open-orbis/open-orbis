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
uv run pytest tests/unit/ -v --cov=app --cov-fail-under=50
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

Playwright runs **real browser engines** (not simulated) in headless mode. Every test runs on all 3 engines: Chromium (Chrome/Edge/Brave/Arc), Firefox (Gecko), WebKit (Safari).

#### Running

```bash
cd frontend
npm run e2e              # All browsers (108 tests)
npm run e2e:chromium     # Chromium only
npm run e2e:firefox      # Firefox only
npm run e2e:webkit       # WebKit (Safari engine) only
```

The Vite dev server starts automatically (configured in `playwright.config.ts` via `webServer`). No backend needed — all API calls are mocked.

#### First-time setup

```bash
cd frontend
npm install
npx playwright install --with-deps   # Downloads Chromium, Firefox, WebKit
```

#### Interactive UI mode

```bash
cd frontend
npm run e2e:ui
```

Opens a desktop app where you can:
- See the **list of all tests** grouped by file and browser
- **Run individual tests** by clicking on them
- Watch a **live browser preview** while the test runs
- **Step through** each action (goto, click, expect) and see the screenshot at that exact moment
- **Inspect failures** with DOM state, screenshot, and trace
- **Watch mode**: re-runs automatically when you edit a test file

Use this mode when writing new tests or debugging failures.

#### Test structure

```
frontend/e2e/
  fixtures/
    base.ts              — base fixture: suppresses session-expired redirect, mocks auth as 401
    auth.ts              — mockAuthRoutes(): overrides auth to return 200 with mock user
    mock-orb.ts          — mockOrbRoutes(): intercepts all orb/CV/draft API routes
  page-load.spec.ts      — public routes load without JS errors
  webgl.spec.ts          — WebGL context creation, canvas rendering
  css-compat.spec.ts     — backdrop-filter, scrollbar-width, bg-clip-text, overflow
  animations.spec.ts     — Framer Motion opacity transitions complete
  browser-apis.spec.ts   — clipboard, Blob/createObjectURL, localStorage/sessionStorage
  responsive.spec.ts     — desktop/tablet/mobile viewport checks
  authenticated-pages.spec.ts — /myorbis, /create, /cv-export with mocked auth
  shared-orb.spec.ts     — /:orbId public shared orb view
```

#### How the mocks work

The app calls `GET /api/auth/me` on every page mount. Without a backend, this triggers a 401 → refresh → 401 → `orbis:session-expired` event → redirect to `/`. The test fixtures handle this:

- **`base.ts`** — All tests import from here. It uses `addInitScript()` to suppress the `session-expired` event before the app mounts, and intercepts `/api/auth/me` → 401 (unauthenticated state, no redirect).
- **`auth.ts`** — For authenticated page tests. Removes the 401 stub and registers a 200 response with a mock `UserInfo` (activated user).
- **`mock-orb.ts`** — Intercepts `/api/orbs/me`, `/api/cv/documents`, `/api/drafts`, share panel APIs, and shared orb routes with mock data.

All route interceptions use `url.pathname` predicate functions (not glob patterns) to avoid intercepting Vite source files like `/src/api/auth.ts`.

#### What the tests check

Tests focus on **cross-browser compatibility**, not business logic:

| Spec | What it checks | A failure means... |
|------|---------------|--------------------|
| page-load | Pages render, no JS exceptions | The app crashes on a specific browser |
| webgl | `getContext('webgl')` works, `<canvas>` appears | Three.js / 3D graph won't render (GPU/driver issue) |
| css-compat | `bg-clip-text`, `backdrop-filter`, `scrollbar-width`, no overflow | Modern CSS features unsupported or layout broken |
| animations | Framer Motion elements reach `opacity > 0.8` | Animations stuck — content invisible to users |
| browser-apis | localStorage, sessionStorage, Clipboard API, Blob | Browser API missing or restricted (e.g. Safari private mode) |
| responsive | Font sizes scale, no overflow at 375px/768px/1440px | Layout breaks at a specific viewport size |
| authenticated-pages | Protected pages render with mock auth + data | Auth flow or data loading broken on a browser |
| shared-orb | Public orb page renders graph + person name | Shared links broken for visitors |

If a test **fails on one browser but passes on others**, you've found a real cross-browser compatibility issue.

### Manual Cross-Browser Smoke Test

For things automated tests can't verify (visual quality, animation smoothness, OAuth popup flow):

```bash
./scripts/cross-browser-test.sh           # Opens site in all installed macOS browsers
./scripts/cross-browser-test.sh <URL>     # Custom URL (e.g. staging)
```

Follow the structured checklist at `docs/cross-browser-checklist.md` while testing each browser.

## CI Pipelines

### Lint (`lint.yml`)

Runs on all PRs and pushes to `main`. Two parallel jobs:
- **Backend:** `ruff check .` + `ruff format --check .`
- **Frontend:** `npm run lint`

### Unit Tests (`unit-tests.yml`)

Runs on PRs/pushes to `main` when `backend/**` files change:
- `uv run pytest tests/unit/ -v --tb=short --cov=app --cov-report=term-missing --cov-fail-under=50`

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
