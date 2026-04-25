## Summary

Pubblica Orbis come app nella directory ChatGPT Apps (chatgpt.com/apps) con 5
widget UI inline renderizzati direttamente in chat. Riusa l'infrastruttura
OAuth 2.1 + DCR già merged (PRs #425–#429); il lavoro nuovo è il layer
Apps SDK: widget React, MCP `resources/*` endpoint, `_meta` envelope su tool
responses, asset di submission.

**Spec:** `docs/superpowers/specs/2026-04-23-chatgpt-apps-integration-design.md`
**Plan:** `docs/superpowers/plans/2026-04-23-chatgpt-apps-integration.md`
**Apps SDK verification:** `docs/chatgpt-apps/apps-sdk-verified.md`

## Architecture

```
ChatGPT iframe ──▶ mcp.open-orbis.com/mcp              tool calls + resources/read
               ──▶ open-orbis.com/chatgpt-widgets/*.js  widget JS bundles
               ──▶ open-orbis.com/oauth/*              auth flow (esistente)
```

**5 widget:** `summary`, `nodes` (timeline/grid/list dispatch), `full-orb`
(d3-force SVG), `connections`, `skills-for-experience`.

**Backend:**
- `backend/mcp_server/widgets.py` (nuovo) — `WIDGET_REGISTRY` + `wrap_tool_response()` (dual `_meta` keys: canonical `ui.*` + ChatGPT-legacy `openai/*`) + `build_html_shell()` (`<script type="module" src>`)
- `backend/mcp_server/server.py` — registra 5 risorse `ui://widget/*` con mime `text/html;profile=mcp-app` e `_meta.ui.csp.resourceDomains`. Le 5 tool entry chiamano `wrap_tool_response()` sui payload.
- `backend/mcp_server/tools.py` — `_strip_widget_pii` rimuove `email/phone/address` dalla `summary` path.

**Frontend:** `frontend/chatgpt-apps/` (nuovo package Vite parallelo a `frontend/src/`):
- 5 entry React + Tailwind v4
- Hook `useToolOutput()` su `useSyncExternalStore` (subscribe a `openai:set_globals` event — necessario per re-render su tool turn successivi)
- Bundle ES modules, CSS auto-inlinato via `vite-plugin-css-injected-by-js` con `relativeCSSInjection`

## Phase-0 Apps SDK verification

Prima di scrivere codice, ho fatto verifica live di `developers.openai.com/apps-sdk` e dell'examples repo. Risultato: nessuna divergenza bloccante dallo spec, ma 5 amendment puntuali:

1. `_meta` keys dual-keyed (canonical `ui.resourceUri` / `ui.visibility` + ChatGPT-legacy `openai/outputTemplate` / `openai/widgetAccessible`)
2. CSP via `_meta.ui.csp.resourceDomains` obbligatoria sui widget resources
3. `useToolOutput` hook subscribed a `openai:set_globals` (no read-once)
4. Submission OPEN dal 2025-12-17 (no waitlist)
5. URL canonico `developers.openai.com/apps-sdk` (non `platform.openai.com/docs/apps`)

Pre-flight gates submission: project data residency = global, identity verification.

## Test plan

- [ ] Backend: 837 unit + integration test passano (`uv run pytest tests/unit/ tests/integration/test_chatgpt_apps_integration.py`)
- [ ] Backend lint: `ruff check . && ruff format --check .` clean
- [ ] Frontend principale lint + build clean
- [ ] `frontend/chatgpt-apps/`: 18/18 Vitest, 10/10 Playwright visual (light + dark)
- [ ] Manual QA in ChatGPT Developer Mode (vedi `docs/chatgpt-apps/qa-checklist.md`) — **da fare su staging deploy prima della submission**
- [ ] Visual review delle 10 baseline PNG in `frontend/chatgpt-apps/e2e/visual.spec.ts-snapshots/`

## Out of scope (follow-up post-merge)

- **Manual QA in ChatGPT Developer Mode** — richiede staging deploy
- **OpenAI submission**: identity verification, project residency check, upload manifest + asset, screenshot reali catturati durante la QA
- **Legal review** del `/terms` skeleton (placeholder con disclaimer)
- **Logo asset** (512×512 + 1024×1024) — placeholder, da sostituire pre-submission
- **Self-serve marketplace publishing** — al momento OpenAI review è manuale, "self-serve coming soon" per docs ufficiali

## Documentation

Aggiornati (per CLAUDE.md pre-PR check):
- `docs/api.md` — MCP widget resources + tool response envelope (dual `_meta`)
- `docs/architecture.md` — sezione "ChatGPT Apps integration" con data flow + reference ai due nuovi moduli
- `docs/testing.md` — sezione widget testing (Vitest + Playwright visual)
- `docs/deployment.md` — CORS/cache headers + chunk preservation per `/chatgpt-widgets/*`
- `docs/navigation-flow.md` + `docs/navigation-actions.yaml` — stato `TERMS` + back action
- `docs/chatgpt-apps/` (nuovo dir): `README.md`, `manifest.json`, `qa-checklist.md`, `apps-sdk-verified.md`

## Commits (26 totali)

| Phase | Commit | Topic |
|---|---|---|
| Spec | `4be3dc6` | Design spec |
| Plan | `41d861f` | Implementation plan |
| 0 | `0611adc` | Apps SDK live verification |
| 0 | `4bd9033` | 5 plan amendments inline |
| 1.1 | `57b0802` | Widget registry + wrap_tool_response |
| 1.2 | `0f61430` | build_html_shell tests |
| 1.3 | `78bc0cd` | PII filter |
| 1.4 | `3882c67` | Wire wrap + PII into 5 tools |
| 1.5 | `f6eed77` | Register widget MCP resources |
| 1.6 | `a84fca3` | Integration test e2e |
| 2.1 | `6d1a714` | chatgpt-apps scaffold |
| 2.2 | `3031d1d` | Vite multi-entry config |
| fix | `b8300d3` | `<script type="module">` for ES bundles |
| 2.3 | `15e5d70` | Shared layout/theme/api/auth-error |
| 2.4 | `7bb7e32` | Deployment doc CORS+cache |
| 3.1 | `ef3a882` | summary widget |
| 4.1 | `ec23dc8` | nodes widget |
| 5.1 | `d638572` | full-orb widget (d3-force) |
| 6.1 | `46ce0bd` | connections widget |
| 7.1 | `8df1efd` | skills-for-experience widget |
| 8.1 | `0872da6` | Playwright visual baselines |
| fix | `504648d` | CSS inline into bundles |
| 9.1 | `cf22d76` | /terms page (skeleton) |
| 10.1 | `719743e` | Submission artifacts (manifest, README, QA) |
| 11.1 | `fc62e80` | Doc updates (api/arch/testing) |
| fix | `1ceef00` | Vitest exclude e2e/ |
| nav | `f58109d` | Nav docs for /terms |
