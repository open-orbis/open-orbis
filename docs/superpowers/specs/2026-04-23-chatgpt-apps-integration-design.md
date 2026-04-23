# ChatGPT Apps Integration — Design Spec

**Date:** 2026-04-23
**Status:** Design approved, awaiting implementation plan

## Goal

Pubblicare Orbis come app nella directory **ChatGPT Apps** (chatgpt.com/apps)
permettendo all'utente di installarla in ChatGPT, fare OAuth al proprio
Orbis, e interrogare il proprio knowledge graph in chat con **widget UI
ricchi renderizzati inline** (non solo risposte testuali dell'LLM).

L'integrazione riusa l'infrastruttura OAuth 2.1 / DCR già merged (spec
`2026-04-21-mcp-oauth-authorization-design.md`) e il server MCP esistente.
Il lavoro nuovo è l'**Apps SDK layer**: widget React inline, resources
endpoint per servire gli HTML shell, `_meta.outputTemplate` sulle tool
responses, e asset di submission.

## Problem

Il MCP server Orbis oggi è già compliant con la MCP authorization spec
2025-03 e può essere aggiunto come "custom connector" su Claude via URL.
Questo apre a utenti early-adopter ma **non ha discoverability** — nessuno
sa che Orbis esiste come integrazione AI finché non arriva al sito.

ChatGPT Apps offre la directory di distribuzione più ampia del 2026 ma
richiede un layer in più rispetto al MCP vanilla: widget UI renderizzati
inline in iframe nella conversazione. Senza questo layer l'esperienza è
"ChatGPT chiama tool, risponde testo" — funzionale ma generica, lontana
dallo standard visivo delle app ufficiali (Canva, Figma, Notion, ecc).

Obiettivo: andare in directory **con widget ricchi fin dal primo release**,
senza passare da partnership (come sarebbe su Claude Connectors) e senza
fare wrapping artificiale del server MCP esistente.

## Design Decisions

| # | Question | Choice | Why |
|---|---|---|---|
| 1 | Livello esperienza in ChatGPT? | **Rich widgets (full Apps SDK).** | Tools-only renderizza JSON come testo grezzo, esperienza povera vs app ufficiali. Costo widget non è enorme perché i tool output sono già JSON puliti e OAuth è fatto. |
| 2 | Flusso primario? | **Me-first — ChatGPT come copilot del proprio Orbis.** | Flusso OAuth canonico Apps SDK, review OpenAI più veloce su scope chiaro, metriche più leggibili. Share-mode differito a una v1.1 con design dedicato. |
| 3 | Riuso componenti frontend esistenti? | **No — widget "ChatGPT-first" in cartella separata.** | `frontend/src/components/` è fortemente accoppiato a Zustand / router / 3D Three.js (inadatto all'iframe 640px ChatGPT). Refactor per estrazione costerebbe più di scrivere widget minimali freschi. |
| 4 | Quanti widget nell'MVP? | **Tutti e 5 i tool MCP hanno widget dedicato.** | Scelta utente: esperienza completa al primo rilascio invece di iterazione graduale. Ritarda submission di ~2 settimane ma evita l'effetto "MVP mezzo fatto" nella directory. |
| 5 | Hosting bundle widget? | **Servito da `open-orbis.com/chatgpt-widgets/*.js` (frontend esistente).** | CDN cache, chunk sharing tra widget, CORS già gestito dal reverse proxy per `/oauth/*` quindi aggiungere un path è banale. Response MCP piccole (HTML shell + `<script src>`). |
| 6 | OAuth scope? | **`orbis.read` esistente, invariato.** | Tutti i tool MCP sono read-only; nessuna motivazione per nuovo scope. Se arrivano tool write in futuro, `orbis.write` separato. |
| 7 | Share-token context nei widget? | **Widget solo in me-first mode; `_meta.outputTemplate` omesso sotto `ShareContext`.** | Share-mode non fa parte dell'MVP (decisione 2). Il middleware oggi accetta `orbs_` token — aggiungo protezione difensiva nel layer widget per evitare rendering su share context non previsto. |
| 8 | PII nei widget? | **Filtro campi `email/phone/address` prima di `structuredContent` per widget summary.** | L'iframe gira in contesto ChatGPT (third-party). L'LLM non deve vedere PII che il widget non renderizza. Tradeoff minimo: summary widget non mostra contatti comunque. |

## Architecture

```
┌────────────────────────────────────┐       ┌──────────────────────────────┐
│  ChatGPT (Apps SDK iframe ~640px)  │       │  Cloud Run: mcp.open-orbis   │
│                                    │       │                              │
│  1. tools/call orbis_get_summary   │──────▶│  MCP tool → JSON + _meta:{   │
│                                    │       │    "openai/outputTemplate":  │
│                                    │◀──────│    "ui://widget/summary" }   │
│  2. resources/read ui://widget/... │──────▶│  HTML shell con <script src> │
│                                    │◀──────│                              │
│                                    │       └──────────────────────────────┘
│  3. carica bundle JS               │              
│                                    │       ┌──────────────────────────────┐
│                                    │──────▶│  open-orbis.com (frontend    │
│                                    │       │  deploy, separato dal MCP)   │
│                                    │       │  /chatgpt-widgets/*.js       │
│                                    │◀──────│  (5 bundle Vite, CDN-cached) │
│                                    │       └──────────────────────────────┘
│  4. renderizza React widget        │
│     con window.openai.toolOutput   │
└────────────────────────────────────┘

Auth: OAuth 2.1 esistente (Bearer oauth_...) — ZERO cambiamenti backend auth.
```

**Due artefatti nuovi principali:**

1. **`backend/mcp_server/widgets.py`** — nuovo modulo. Gestisce
   `resources/list` (elenca le 5 URI `ui://widget/*`) e `resources/read`
   (serve l'HTML shell per ciascuna). I tool esistenti in `tools.py`
   vengono aggiornati per includere `_meta.outputTemplate` nella response.

2. **`frontend/chatgpt-apps/`** — nuova cartella parallela a
   `frontend/src/`. 5 entry Vite (summary, nodes, full-orb, connections,
   skills-for-experience) + shared utils (layout, tailwind preset
   ChatGPT-compatible, auth-error state). Build target separato con
   output in `frontend/public/chatgpt-widgets/`.

**Nessun cambiamento a:** OAuth server (tutto già implementato), auth
middleware MCP, tool Neo4j, rate limiting, deploy pipeline del frontend.

## Components

### Backend — `backend/mcp_server/`

**`widgets.py` (nuovo, ~150 righe)**
- Mappa statica `WIDGET_REGISTRY: dict[str, WidgetMeta]` con le 5 URI +
  path al bundle JS corrispondente su `open-orbis.com`.
- Funzione `build_html_shell(widget_uri) -> str` che produce un documento
  minimo: `<html><body><div id="root"></div><script src="{CDN_URL}/chatgpt-widgets/{name}.js"></script></body></html>`.
  Il CDN base è `settings.frontend_url`.
- Handler `resources/list` e `resources/read` registrati su `FastMCP`
  tramite `@mcp.list_resources()` / `@mcp.read_resource()`.

**`tools.py` (modifica)**
- Ogni tool response diventa `{"structuredContent": <dati>, "_meta": {"openai/outputTemplate": "ui://widget/<name>", "openai/widgetAccessible": True}}`.
- I dati dentro `structuredContent` restano identici a oggi — zero
  breaking change per client MCP non-ChatGPT (Cursor, Claude custom
  connector, ecc. ignorano `_meta` e leggono `structuredContent`).
- `_meta.outputTemplate` **omesso** quando la request è risolta sotto
  `ShareContext` (protezione difensiva share-mode).

**`server.py` (modifica minima)**
- Import e mount del `widgets` module. Nessuna altra modifica.

### Frontend — `frontend/chatgpt-apps/` (nuovo)

```
frontend/chatgpt-apps/
  src/
    shared/
      layout.tsx          # AppShell 640px, padding, dark/light sniffing
      theme.css           # Tailwind preset, variabili CSS ChatGPT-compat
      api.ts              # window.openai.toolOutput typing helpers
      auth-error.tsx      # "sign in again" / "not activated" state
    widgets/
      summary.tsx         # Entry: profile card (name, headline, counts, avatar)
      nodes.tsx           # Entry: dispatches by node_type → timeline | grid | list
      full-orb.tsx        # Entry: mini-graph 2D force-directed (d3-force, NO Three.js)
      connections.tsx     # Entry: focus node + related nodes card
      skills-for-experience.tsx  # Entry: skill tags grouped
  vite.config.ts          # 5 entry points, output → frontend/public/chatgpt-widgets/
  package.json            # Dipendenze minimal: React, d3-force (solo full-orb)
```

Ogni widget è un React app standalone: monta su `#root`, legge
`window.openai.toolOutput`, renderizza. Nessuno Zustand, nessun router,
nessun API call (i dati arrivano già dal tool MCP via Apps SDK bridge).

### Widget con sotto-design dedicato

- **`full-orb.tsx`** — il grafo intero in 640px è denso. Mostra solo i
  nodi "hero" selezionati col criterio: Person + top 10 esperienze/progetti
  ordinati per degree (n. relazioni) + top 15 skill per degree, layout
  radiale attorno al nodo Person, max 30 nodi visibili. Oltre: badge
  *"+N nodi non mostrati"* + CTA *"Esplora l'Orb completo su
  open-orbis.com →"*. Rendering: SVG + d3-force. Altezza fissa 480px.

- **`nodes.tsx`** — `node_type` determina la resa: `work_experience` /
  `project` → timeline verticale ordinata per `start_date` desc; `skill`
  → tag cloud raggruppato per il campo `category` se presente sul nodo
  (grouping "Uncategorized" se assente); `education` → lista con date;
  `certification` / `language` / `publication` / `patent` / `award` /
  `outreach` / `training` → lista generica con titolo + data. Un solo
  entry con sub-componenti per tipo.

### Submission artifacts (repo-level, in `docs/chatgpt-apps/`)

- `manifest.json` — metadati OpenAI (name, description, privacy_policy URL, terms URL, logo URLs, scope richiesti)
- `assets/logo-512.png`, `assets/logo-1024.png` — variante dark/light se richiesta
- `assets/screenshots/*.png` — 3-5 screenshot dei widget in ChatGPT (da catturare in Developer Mode)
- `qa-checklist.md` — manual QA pre-submission
- `README.md` — overview integrazione, link a manifest, submission status

### Nuove dipendenze

- **Frontend:** `d3-force` (solo widget `full-orb`). Nessun'altra dipendenza runtime. Build tool riusa Vite esistente con config dedicata.
- **Backend:** zero nuove dipendenze. `FastMCP` (già in uso) supporta `resources/list` e `resources/read` nativamente.

## Data Flow

### Install (one-time, user-initiated)

1. Utente clicca "Add Orbis" nella directory ChatGPT Apps.
2. ChatGPT fa `GET {mcp.open-orbis.com}/.well-known/oauth-protected-resource` → riceve `authorization_servers: ["https://open-orbis.com"]`.
3. ChatGPT fa `GET https://open-orbis.com/.well-known/oauth-authorization-server` → scopre endpoint OAuth.
4. ChatGPT fa `POST /oauth/register` (DCR) → riceve `client_id` (public client, `token_endpoint_auth_method: "none"`).
5. ChatGPT genera PKCE, redirige utente a `/oauth/authorize?client_id=...&redirect_uri=...&code_challenge=...&scope=orbis.read`.
6. Utente atterra su open-orbis.com. Se non loggato → flusso Google/LinkedIn esistente. Se loggato → consent screen.
7. Consent screen: *"ChatGPT vuole leggere il tuo Orbis..."* → Authorize.
8. Redirect a ChatGPT con auth code → scambio su `/oauth/token` → `access_token` (prefix `oauth_`) + `refresh_token`.
9. Token bound all'installazione ChatGPT.

### Runtime (per ogni prompt utente)

```
User: "quali skill ho usato nell'ultima esperienza?"
  │
  ▼
ChatGPT LLM → orbis_get_nodes_by_type(node_type="work_experience")
  │
  ▼ POST mcp.open-orbis.com/mcp   (Authorization: Bearer oauth_...)
APIKeyMiddleware → _handle_bearer → resolve_oauth_token → user_id
  │
  ▼
Tool esegue → ritorna:
  { "structuredContent": [...], "_meta": {
      "openai/outputTemplate": "ui://widget/orbis-nodes",
      "openai/widgetAccessible": true
  } }
  │
  ▼ ChatGPT vede _meta.outputTemplate
POST resources/read { uri: "ui://widget/orbis-nodes" }
  │
  ▼
MCP widgets.py → HTML shell con <script src="https://open-orbis.com/chatgpt-widgets/nodes.js">
  │
  ▼
ChatGPT iframe carica shell → bundle scarica da CDN → widget monta
  │
  ▼
Widget legge window.openai.toolOutput → renderizza timeline
  │
  ▼
LLM usa anche structuredContent testualmente per risposta in chat
```

### Revoca

Disinstallazione da ChatGPT → `/oauth/revoke` (già implementato). Revoca
da admin Orbis (`/oauth/grants` esistente) → next tool call riceve 401,
ChatGPT richiede reinstall.

## Error Handling

### Auth failures
- **Token scaduto:** 401 con `WWW-Authenticate: Bearer error="invalid_token", resource_metadata=...` (già implementato). ChatGPT refresh auto-matico via `/oauth/token`. Se fallisce → reinstall.
- **Grant revocato:** stesso percorso del token scaduto.
- **Utente senza Orbis attivato (beta gate / invite code mai consumato):** tool ritorna `{"state": "not_activated"}` in `structuredContent`. Widget mostrano `auth-error.tsx` variante con CTA *"Completa attivazione su open-orbis.com/activate →"*.
- **Share-token context leakage:** se la tool response emerge sotto `ShareContext`, `widgets.py` **non** include `_meta.outputTemplate` — ChatGPT fallback testuale. Protezione difensiva, share-mode non è MVP.

### Iframe constraints
- **Larghezza target:** 640px, fallback leggibile fino a 420px (limite Apps SDK). Tailwind preset con breakpoint `xs: 420px`.
- **Altezza:** `summary` 180px, `nodes` max-height 500px con scroll interno, `full-orb` 480px fisso, `connections` 360px, `skills-for-experience` 320px.
- **No WebGL:** `full-orb` usa SVG + d3-force.
- **No fetch esterni dal widget:** tutto arriva via `window.openai.toolOutput`. Evita CORS e preserva single source of truth.

### Dati eccessivi
- **`orbis_get_full_orb` con grafo grande (>200 nodi):** tool tronca già a livello MCP esistente. Widget mostra max 30 nodi hero + badge *"+N non mostrati"* + CTA deep-link.
- **`orbis_get_nodes_by_type` con 100+ skill:** mostra primi 50 raggruppati per categoria + CTA.

### Failure del bundle JS
- **CDN irraggiungibile / bundle rotto:** HTML shell include `<noscript>` + timeout 3s → fallback a messaggio testuale + JSON grezzo. ChatGPT continua a renderizzare testo dalla response LLM.
- **Widget crash runtime:** React `ErrorBoundary` in `shared/layout.tsx` → "Widget non disponibile, dati in chat" + log client-side (no endpoint telemetria MVP).

### Privacy / PII
- Tool output per widget `summary` **filtra** `email`, `phone`, `address` full da `structuredContent`. Widget mostra nome, headline, location city (no full address).
- Altri widget non espongono PII sensibili già nella forma attuale del grafo.

### Rate limiting
- Rate limit MCP esistente (per-user via `user_id`) invariato.

### Cambio orb_id dell'utente
- OAuth grant bound a `user_id`, non `orb_id`. `_resolve_scope` rilegge orb_id a ogni request. Nessun intervento.

## Testing Strategy

### Backend unit tests (`backend/tests/unit/`)

**`test_mcp_widgets.py`** (nuovo, ~8 test)
- `resources/list` ritorna esattamente 5 URI `ui://widget/*` attese
- `resources/read` per ogni URI ritorna HTML valido con `<script src>` puntato a `settings.frontend_url`
- URI ignota → errore standard MCP (non 500)
- HTML shell è parsabile e contiene `<div id="root">`

**`test_mcp_tools.py`** (estensione)
- Ogni tool ritorna `structuredContent` + `_meta.outputTemplate` corretto per il proprio widget
- `_meta` assente quando la request è in `ShareContext`
- Campi PII filtrati in `structuredContent` del widget summary

OAuth: test esistenti (`test_oauth_*.py`) coprono il flusso, zero nuovi.

### Frontend unit tests (Vitest, in `frontend/chatgpt-apps/`)

- 1 file per widget (`summary.test.tsx`, ecc.)
- Mock `window.openai.toolOutput` con fixture JSON realistica → snapshot render
- Stato vuoto: `structuredContent` empty → empty state, non crash
- Stato auth-error: CTA corretta
- Responsive: test a 420px / 640px / 800px

### Frontend visual tests (Playwright, in `frontend/chatgpt-apps/e2e/`)

- Un test per widget: carica bundle locale in pagina test, inietta toolOutput da fixture, screenshot → diff con baseline
- Copre dark/light mode

### Integration test (`backend/tests/integration/test_chatgpt_apps_integration.py`)

- Flusso mocked: auth OAuth → tool call → `_meta` corretto → `resources/read` → HTML parsabile
- `httpx.AsyncClient` contro FastMCP app, PostgreSQL reale, Neo4j mock
- ~5 test, golden path + 2 edge cases (share context, token scaduto)

### Manual QA in ChatGPT Developer Mode

Checklist pre-submission in `docs/chatgpt-apps/qa-checklist.md`:
1. Install dev app → OAuth end-to-end senza errori, consent leggibile
2. Prompt *"mostrami il mio profilo"* → widget `summary` corretto, dark+light mode ok
3. Prompt *"quali esperienze ho?"* → widget `nodes` timeline cronologica
4. Prompt *"mostrami il mio grafo"* → widget `full-orb` <3s, CTA funzionante
5. Prompt *"skill da [azienda]"* → widget `skills-for-experience`
6. Prompt *"relazioni del nodo X"* → widget `connections`
7. Revoca grant → next query errore recoverable (non 500)
8. Refresh token naturale / forced expiry → auto-refresh ChatGPT

### Non coperto

- E2E contro ChatGPT reale: no API stabile per automatizzarlo. Solo manuale in Developer Mode.
- Load test widget: YAGNI per MVP.

## Submission Process

- **Waitlist:** Apps SDK è **invite-only** al momento della spec (aprile 2026). Iscrizione a `platform.openai.com/apps` (da verificare al momento del submit). Timeline: settimane-mesi.
- **In parallelo mentre si aspetta la whitelist:**
  - `docs/chatgpt-apps/manifest.json` completo
  - Logo 512×512 + 1024×1024
  - 3-5 screenshot dei widget
  - Privacy policy: `/privacy` esiste
  - **Terms of Service:** da creare come pagina `/terms` (½ giornata aggiuntiva, inclusa nella stima)
  - Description: 50-word elevator + 200-word detailed
- **Review OpenAI:** manuale. Criteri noti: tool description non ingannevoli, consent screen chiaro, no dark patterns, privacy specifica su ChatGPT data handling.

## Documentation Updates (pre-PR checklist)

Per CLAUDE.md pre-PR check:
- `docs/api.md` — resources endpoint MCP, `_meta` nuovo su tool responses
- `docs/architecture.md` — blocco "ChatGPT Apps integration" + data flow diagram
- `docs/deployment.md` — `/chatgpt-widgets/*` reverse proxy rule + CDN cache headers
- `docs/testing.md` — sezione widget testing
- **Nuovo:** `docs/chatgpt-apps/README.md` (+ sotto-file manifest, qa-checklist)
- `docs/navigation-flow.md` — consent screen già presente, aggiorna solo se copy cambia

## Effort Estimate

| Fase | Giorni |
|---|---|
| Backend: `widgets.py` + tool `_meta` + test | 3 |
| Frontend: scaffold `chatgpt-apps/` + Vite + shared layout/theme | 2 |
| Widget `summary` | 2 |
| Widget `nodes` (timeline/grid/list dispatch) | 3 |
| Widget `full-orb` (SVG + d3-force + hero-nodes logic) | 4 |
| Widget `connections` | 2 |
| Widget `skills-for-experience` | 2 |
| Playwright visual tests | 2 |
| Terms page + manifest + logo + screenshot + QA checklist | 2 |
| Docs (6 file) | 1 |
| Manual QA in ChatGPT Developer Mode + fix | 3 |
| **Totale build** | **~26 giorni (~5 settimane)** |
| Waitlist + review OpenAI | **variabile (settimane-mesi)** |

## Out of Scope (MVP)

- **Share-token widgets** — widget solo in me-first mode. Share-mode in v1.1 con design separato.
- **Write tools** — MCP è read-only. Eventuale `orbis.write` scope in release futura.
- **Reuse di `frontend/src/components/`** — widget ChatGPT sono codebase separato (decisione 3).
- **3D graph in widget** — `full-orb` è 2D SVG, niente Three.js.
- **Client-side telemetry** — niente endpoint dedicato, widget loggano solo in console.
- **Claude Connectors directory / Gemini** — ogni piattaforma avrà il suo spec separato. Claude "custom connector" già funziona via URL oggi.

## Open Questions / Future Work

- Ripristino copy consent screen: verificare in `/oauth/authorize` page che il testo sia abbastanza esplicito per ChatGPT (parola chiave "ChatGPT", "your Orbis data", ecc.). Se non lo è, tweak di ~½ giornata.
- Apps SDK URL e convenzioni `window.openai.toolOutput` da riconfermare su `platform.openai.com/docs/apps` al momento dell'implementazione — l'ecosistema si muove rapidamente.
- Se OpenAI introduce un formato `_meta` leggermente diverso al momento del submit, refactor mirato (max 1 giorno).
