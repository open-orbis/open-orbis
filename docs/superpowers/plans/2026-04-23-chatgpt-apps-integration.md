# ChatGPT Apps Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pubblicare Orbis in chatgpt.com/apps con 5 widget UI inline, riutilizzando l'infrastruttura OAuth 2.1 / DCR già presente.

**Architecture:** Il MCP server (`backend/mcp_server/`) aggiunge un modulo `widgets.py` che espone 5 resource MCP (`ui://widget/*`) con HTML shell che carica bundle JS da `open-orbis.com/chatgpt-widgets/`. Ogni tool response viene avvolta in `{structuredContent, _meta: {openai/outputTemplate}}` così ChatGPT sa quale widget renderizzare. Il frontend ottiene una nuova cartella `frontend/chatgpt-apps/` con build Vite separato che emette in `frontend/public/chatgpt-widgets/`. Auth, middleware, tool Neo4j e rate limiting restano invariati.

**Tech Stack:** FastMCP (Python), React 19 + TypeScript + Vite (bundle widget), Tailwind CSS, d3-force (solo widget full-orb), pytest + httpx (test backend), Vitest + Playwright (test frontend).

**Spec:** `docs/superpowers/specs/2026-04-23-chatgpt-apps-integration-design.md` (commit `4be3dc6`).

---

## File Structure

**Backend — nuovi file:**
- `backend/mcp_server/widgets.py` — registry URI widget + HTML shell builder + registrazione resource su FastMCP (~150 righe)
- `backend/tests/unit/test_mcp_widgets.py` — unit test per registry e shell builder
- `backend/tests/integration/test_chatgpt_apps_integration.py` — flusso end-to-end mocked

**Backend — modificati:**
- `backend/mcp_server/tools.py` — wrapping delle response tool con `structuredContent` + `_meta`, filtro PII per summary
- `backend/mcp_server/server.py` — import + registrazione del modulo widgets
- `backend/tests/unit/test_mcp_tools.py` — estensione test per verificare `_meta` + PII filter

**Frontend — nuovi file:**
- `frontend/chatgpt-apps/package.json` — dipendenze minimal (React, d3-force)
- `frontend/chatgpt-apps/vite.config.ts` — build multi-entry
- `frontend/chatgpt-apps/tsconfig.json` — TS config
- `frontend/chatgpt-apps/src/shared/layout.tsx` — AppShell 640px
- `frontend/chatgpt-apps/src/shared/theme.css` — Tailwind preset ChatGPT-compat
- `frontend/chatgpt-apps/src/shared/api.ts` — helper tipo-sicuro per `window.openai.toolOutput`
- `frontend/chatgpt-apps/src/shared/auth-error.tsx` — componente stato errore/attivazione
- `frontend/chatgpt-apps/src/widgets/summary.tsx`
- `frontend/chatgpt-apps/src/widgets/nodes.tsx`
- `frontend/chatgpt-apps/src/widgets/full-orb.tsx`
- `frontend/chatgpt-apps/src/widgets/connections.tsx`
- `frontend/chatgpt-apps/src/widgets/skills-for-experience.tsx`
- Test co-located (`*.test.tsx` accanto a ogni widget) + fixture JSON in `src/__fixtures__/`
- `frontend/chatgpt-apps/e2e/visual.spec.ts` — Playwright visual test per tutti i widget

**Submission / docs — nuovi file:**
- `docs/chatgpt-apps/README.md`
- `docs/chatgpt-apps/manifest.json`
- `docs/chatgpt-apps/qa-checklist.md`
- `docs/chatgpt-apps/apps-sdk-verified.md` (output fase 0)
- `docs/chatgpt-apps/assets/` — logo + screenshot
- `frontend/src/pages/Terms.tsx` — nuova pagina `/terms`

**Docs — modificati:**
- `docs/api.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/testing.md`, `docs/navigation-flow.md`

---

## Phase 0 — Apps SDK verification

Prima di scrivere codice, verificare le convenzioni **reali** dell'Apps SDK OpenAI. Lo spec assume `_meta.openai/outputTemplate`, `window.openai.toolOutput`, URI scheme `ui://widget/*`. Se la documentazione live al momento dell'implementazione diverge, **fermarsi e aggiornare lo spec** prima di procedere.

### Task 0.1: Verify Apps SDK conventions

**Files:**
- Create: `docs/chatgpt-apps/apps-sdk-verified.md`

- [ ] **Step 1: Fetch Apps SDK docs**

Run (in shell or via WebFetch):
```bash
# La URL esatta va trovata — partire da platform.openai.com/docs
curl -s https://platform.openai.com/docs/apps > /tmp/apps-overview.html
```

Se il portale richiede auth, usare WebFetch (tool Claude) su:
- `https://platform.openai.com/docs/apps`
- `https://platform.openai.com/docs/apps/components`
- `https://platform.openai.com/docs/mcp` (Apps SDK + MCP integration)

- [ ] **Step 2: Compile verification doc**

Crea `docs/chatgpt-apps/apps-sdk-verified.md` con i valori esatti per ciascuno di questi punti:

```markdown
# Apps SDK — Verified Conventions

Fetched: YYYY-MM-DD from https://platform.openai.com/docs/apps

## Tool response _meta keys
- outputTemplate key: `openai/outputTemplate` (or: ...)
- widgetAccessible key: `openai/widgetAccessible` (or: ...)
- Other required/optional keys: ...

## Widget resource URI scheme
- Scheme: `ui://` (or: ...)
- Example: `ui://widget/<name>`

## Widget runtime API
- How the widget reads tool output: `window.openai.toolOutput` (or: ...)
- Other available APIs: `window.openai.callTool(...)`, events, etc.

## HTML shell constraints
- CSP policy: ...
- Script src whitelist: ...
- CSS loading: inline or external ok?
- Max resource size: ...

## OAuth flow specifics for Apps SDK
- Discovery path: same as MCP 2025-03 (/.well-known/oauth-protected-resource)? Yes/No
- Scope naming conventions: any constraints?

## Divergences from our spec
- List every point where the live docs differ from
  docs/superpowers/specs/2026-04-23-chatgpt-apps-integration-design.md
- If ANY divergence, update spec before proceeding
```

- [ ] **Step 3: Decide: proceed or update spec**

Se il doc mostra divergenze **sostanziali** (es. API completamente diversa, no widget support, auth non-MCP), **STOP** e torna a brainstorming. Aggiorna lo spec con le divergenze minori (diversi nomi di chiave `_meta`, URI scheme) e procedi.

- [ ] **Step 4: Commit**

```bash
git add -f docs/chatgpt-apps/apps-sdk-verified.md
git commit -m "docs(chatgpt-apps): verify Apps SDK conventions"
```

---

## Phase 1 — Backend infrastructure

### Task 1.1: Add widget-response wrapper helper (TDD)

Aggiunge una funzione `wrap_tool_response` che avvolge il payload di ogni tool in `{structuredContent, _meta}`. Omette `_meta` se la request è sotto `ShareContext`.

**Files:**
- Create: `backend/mcp_server/widgets.py`
- Test: `backend/tests/unit/test_mcp_widgets.py`

- [ ] **Step 1: Write the failing test**

Crea `backend/tests/unit/test_mcp_widgets.py`:

```python
"""Tests for mcp_server.widgets."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from mcp_server.widgets import (
    WIDGET_REGISTRY,
    build_html_shell,
    wrap_tool_response,
)


class TestWrapToolResponse:
    def test_wraps_payload_with_structured_content_and_meta(self):
        """User-mode request: payload wrapped + outputTemplate included."""
        with patch("mcp_server.widgets.get_share_context", return_value=None):
            result = wrap_tool_response(
                payload={"name": "Alice"},
                widget_name="summary",
            )
        assert result["structuredContent"] == {"name": "Alice"}
        assert result["_meta"]["openai/outputTemplate"] == "ui://widget/summary"
        assert result["_meta"]["openai/widgetAccessible"] is True

    def test_omits_meta_under_share_context(self):
        """Share-mode request: no _meta (widget rendering disabled)."""
        fake_ctx = object()
        with patch("mcp_server.widgets.get_share_context", return_value=fake_ctx):
            result = wrap_tool_response(
                payload={"name": "Alice"},
                widget_name="summary",
            )
        assert result["structuredContent"] == {"name": "Alice"}
        assert "_meta" not in result

    def test_passes_through_error_payloads(self):
        """Tool error responses: still wrapped, still tagged."""
        with patch("mcp_server.widgets.get_share_context", return_value=None):
            result = wrap_tool_response(
                payload={"error": "Orb not accessible"},
                widget_name="summary",
            )
        assert result["structuredContent"] == {"error": "Orb not accessible"}
        assert "_meta" in result

    def test_unknown_widget_name_raises(self):
        """Guardrail: typo in widget name must fail fast."""
        with pytest.raises(KeyError):
            wrap_tool_response(payload={}, widget_name="nonexistent")
```

- [ ] **Step 2: Run test — should fail**

Run: `cd backend && uv run pytest tests/unit/test_mcp_widgets.py -v`
Expected: `ModuleNotFoundError: No module named 'mcp_server.widgets'`

- [ ] **Step 3: Write `widgets.py` minimum to pass test**

Crea `backend/mcp_server/widgets.py`:

```python
"""Widget registry and response wrapper for ChatGPT Apps SDK.

Exposes 5 widget resources (`ui://widget/*`) that ChatGPT reads via
`resources/read` to get the HTML shell. Each tool response is wrapped
so that ChatGPT sees `_meta.openai/outputTemplate` pointing at the
right widget.

Share-context requests are NOT widget-enabled: `_meta` is omitted so
the share-mode data path (restricted view) doesn't trigger UI
rendering the widgets weren't designed for.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import settings
from mcp_server.auth import get_share_context


@dataclass(frozen=True)
class WidgetMeta:
    name: str
    title: str
    bundle_filename: str  # e.g. "summary.js"


WIDGET_REGISTRY: dict[str, WidgetMeta] = {
    "summary": WidgetMeta(
        name="summary",
        title="Orbis Profile Summary",
        bundle_filename="summary.js",
    ),
    "nodes": WidgetMeta(
        name="nodes",
        title="Orbis Nodes",
        bundle_filename="nodes.js",
    ),
    "full-orb": WidgetMeta(
        name="full-orb",
        title="Orbis Full Graph",
        bundle_filename="full-orb.js",
    ),
    "connections": WidgetMeta(
        name="connections",
        title="Orbis Node Connections",
        bundle_filename="connections.js",
    ),
    "skills-for-experience": WidgetMeta(
        name="skills-for-experience",
        title="Skills for Experience",
        bundle_filename="skills-for-experience.js",
    ),
}


def wrap_tool_response(*, payload: dict, widget_name: str) -> dict:
    """Wrap a tool response in structuredContent + _meta.

    Raises KeyError if `widget_name` isn't in the registry (typos fail
    fast rather than producing a broken tool response).
    """
    if widget_name not in WIDGET_REGISTRY:
        raise KeyError(f"Unknown widget: {widget_name!r}")

    wrapped: dict = {"structuredContent": payload}

    # Share-mode: intentionally drop _meta — widgets aren't designed
    # for the restricted-view shape and share tokens are outside the
    # Apps SDK flow.
    if get_share_context() is not None:
        return wrapped

    wrapped["_meta"] = {
        "openai/outputTemplate": f"ui://widget/{widget_name}",
        "openai/widgetAccessible": True,
    }
    return wrapped


def build_html_shell(widget_name: str) -> str:
    """Return the HTML document ChatGPT loads into the widget iframe.

    The shell is intentionally minimal: a single <div id="root"> + a
    script tag pointing at the widget bundle on the public frontend.
    The bundle reads `window.openai.toolOutput` and renders into
    `#root`. A fallback <noscript> keeps the experience graceful when
    JS fails or the CDN is unreachable.
    """
    meta = WIDGET_REGISTRY[widget_name]
    bundle_url = (
        f"{settings.frontend_url.rstrip('/')}/chatgpt-widgets/{meta.bundle_filename}"
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{meta.title}</title>
</head>
<body>
  <div id="root"></div>
  <noscript>Enable JavaScript to see Orbis data.</noscript>
  <script src="{bundle_url}" defer></script>
</body>
</html>
"""
```

- [ ] **Step 4: Run tests — should pass**

Run: `cd backend && uv run pytest tests/unit/test_mcp_widgets.py -v`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/mcp_server/widgets.py backend/tests/unit/test_mcp_widgets.py
git commit -m "feat(mcp): add widget registry + tool response wrapper"
```

---

### Task 1.2: Tests for `build_html_shell`

**Files:**
- Modify: `backend/tests/unit/test_mcp_widgets.py`

- [ ] **Step 1: Add failing test**

Aggiungi in cima al file (dopo gli import) e dentro una nuova classe:

```python
class TestBuildHtmlShell:
    def test_returns_html_with_bundle_src(self, monkeypatch):
        monkeypatch.setattr(
            "mcp_server.widgets.settings",
            type("S", (), {"frontend_url": "https://open-orbis.com"})(),
        )
        html = build_html_shell("summary")
        assert "<div id=\"root\"></div>" in html
        assert "https://open-orbis.com/chatgpt-widgets/summary.js" in html
        assert "<noscript>" in html

    def test_strips_trailing_slash_from_frontend_url(self, monkeypatch):
        monkeypatch.setattr(
            "mcp_server.widgets.settings",
            type("S", (), {"frontend_url": "https://open-orbis.com/"})(),
        )
        html = build_html_shell("nodes")
        assert "https://open-orbis.com/chatgpt-widgets/nodes.js" in html
        # double-slash bug guard
        assert "chatgpt-widgets//nodes.js" not in html

    def test_unknown_widget_raises(self):
        with pytest.raises(KeyError):
            build_html_shell("nonexistent")
```

- [ ] **Step 2: Run tests**

Run: `cd backend && uv run pytest tests/unit/test_mcp_widgets.py -v`
Expected: i 3 nuovi test passano.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/unit/test_mcp_widgets.py
git commit -m "test(mcp): cover build_html_shell edge cases"
```

---

### Task 1.3: PII filter helper for summary widget

La spec (decisione 8) richiede di filtrare email/phone/address dalle response tool destinate al widget summary.

**Files:**
- Modify: `backend/mcp_server/tools.py`
- Test: `backend/tests/unit/test_mcp_tools.py` (estensione; se non esiste, crealo)

- [ ] **Step 1: Controlla se `test_mcp_tools.py` esiste**

Run: `ls backend/tests/unit/test_mcp_tools.py 2>/dev/null && echo exists || echo create`

- [ ] **Step 2: Write failing test**

Aggiungi in `backend/tests/unit/test_mcp_tools.py` (crealo se non c'è):

```python
"""Tests for PII filtering in summary tool (widget path)."""

from mcp_server.tools import _strip_widget_pii


def test_strip_widget_pii_removes_sensitive_fields():
    person = {
        "name": "Alice",
        "headline": "Engineer",
        "email": "alice@example.com",
        "phone": "+123456",
        "address": "Via Roma 1, 00100 Roma",
        "location": "Roma, Italy",
    }
    result = _strip_widget_pii(person)
    assert "email" not in result
    assert "phone" not in result
    assert "address" not in result
    # Non-sensitive fields preserved:
    assert result["name"] == "Alice"
    assert result["headline"] == "Engineer"
    assert result["location"] == "Roma, Italy"


def test_strip_widget_pii_tolerates_missing_fields():
    result = _strip_widget_pii({"name": "Bob"})
    assert result == {"name": "Bob"}


def test_strip_widget_pii_does_not_mutate_input():
    person = {"name": "Eve", "email": "eve@example.com"}
    _strip_widget_pii(person)
    assert "email" in person  # original untouched
```

- [ ] **Step 3: Run — should fail**

Run: `cd backend && uv run pytest tests/unit/test_mcp_tools.py::test_strip_widget_pii_removes_sensitive_fields -v`
Expected: ImportError (function doesn't exist).

- [ ] **Step 4: Add `_strip_widget_pii` to `tools.py`**

Aggiungi in fondo ai helper privati di `backend/mcp_server/tools.py` (prima della prima funzione public `get_orb_summary`):

```python
# Sensitive person fields never included in widget-path responses.
# The iframe runs under ChatGPT (third-party), so we deny these to the
# LLM by omission rather than relying on widget rendering to mask them.
_WIDGET_PII_BLOCKLIST = frozenset({"email", "phone", "address"})


def _strip_widget_pii(person: dict) -> dict:
    """Return a copy of `person` with sensitive fields removed.

    Immutable — does not mutate the input.
    """
    return {k: v for k, v in person.items() if k not in _WIDGET_PII_BLOCKLIST}
```

- [ ] **Step 5: Run — should pass**

Run: `cd backend && uv run pytest tests/unit/test_mcp_tools.py -v`
Expected: 3 test passano.

- [ ] **Step 6: Commit**

```bash
git add backend/mcp_server/tools.py backend/tests/unit/test_mcp_tools.py
git commit -m "feat(mcp): add PII filter for widget-path responses"
```

---

### Task 1.4: Wire `wrap_tool_response` + PII filter into all 5 tools

**Files:**
- Modify: `backend/mcp_server/server.py` (5 tool functions)
- Modify: `backend/mcp_server/tools.py` (apply `_strip_widget_pii` in `get_orb_summary`)

- [ ] **Step 1: Apply PII filter in `get_orb_summary`**

In `backend/mcp_server/tools.py`, funzione `get_orb_summary`, sostituisci il blocco:

```python
person = decrypt_properties(dict(record["p"]))
person.pop("user_id", None)
person.pop("encryption_key_id", None)
person.pop("embedding", None)
```

Con:

```python
person = decrypt_properties(dict(record["p"]))
person.pop("user_id", None)
person.pop("encryption_key_id", None)
person.pop("embedding", None)
person = _strip_widget_pii(person)
```

- [ ] **Step 2: Write failing test for widget wrap at tool boundary**

Aggiungi in `backend/tests/unit/test_mcp_tools.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_orbis_get_summary_wraps_response():
    """The @mcp.tool entry in server.py wraps the raw tool payload."""
    from mcp_server.server import orbis_get_summary

    fake_payload = {"name": "Alice", "headline": "Eng", "node_counts": {}}
    with (
        patch("mcp_server.server._resolve_scope", new=AsyncMock(return_value=("orb1", ""))),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch("mcp_server.server.get_orb_summary", new=AsyncMock(return_value=fake_payload)),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await orbis_get_summary.fn("")
    assert result["structuredContent"] == fake_payload
    assert result["_meta"]["openai/outputTemplate"] == "ui://widget/summary"
```

Nota: `orbis_get_summary.fn` è il modo per chiamare la funzione sottostante al decorator `@mcp.tool()` di FastMCP. Se il test non funziona per motivi di introspezione, rimpiazza con chiamata diretta importando la funzione prima del decorator (refactoring minore).

- [ ] **Step 3: Run — should fail**

Run: `cd backend && uv run pytest tests/unit/test_mcp_tools.py::test_orbis_get_summary_wraps_response -v`
Expected: AssertionError o KeyError.

- [ ] **Step 4: Update `server.py` — wrap each tool response**

In `backend/mcp_server/server.py`, aggiungi import in cima (accanto agli altri):

```python
from mcp_server.widgets import wrap_tool_response
```

Poi per **ciascuno dei 5** `@mcp.tool` entry point, modifica il return per avvolgerlo. Esempio per `orbis_get_summary`:

Cambia da:
```python
@mcp.tool()
async def orbis_get_summary(orb_id: str = "", token: str = "") -> dict:
    """..."""
    orb_id, token = await _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id, token)
```

A:
```python
@mcp.tool()
async def orbis_get_summary(orb_id: str = "", token: str = "") -> dict:
    """..."""
    orb_id, token = await _resolve_scope(orb_id, token)
    driver = await _get_driver()
    payload = await get_orb_summary(driver, orb_id, token)
    return wrap_tool_response(payload=payload, widget_name="summary")
```

Ripeti per:
- `orbis_get_full_orb` → `widget_name="full-orb"`
- `orbis_get_nodes_by_type` → `widget_name="nodes"`
- `orbis_get_connections` → `widget_name="connections"`
- `orbis_get_skills_for_experience` → `widget_name="skills-for-experience"`

Per i tool che ritornano `list[dict]` (non `dict`): il wrap accetta già un payload di tipo qualunque (vedi test). Passa il risultato grezzo, anche se è lista — `wrap_tool_response` lo mette sotto `structuredContent`.

**Attenzione** a `get_nodes_by_type` e `get_skills_for_experience` che ritornano `list[dict]`, non `dict`. Aggiorna il type hint del wrapper helper o crea una variante — più semplice: accetta qualunque JSON-serializable.

In `backend/mcp_server/widgets.py`, cambia la signature di `wrap_tool_response`:

```python
def wrap_tool_response(*, payload: dict | list, widget_name: str) -> dict:
```

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov=mcp_server`
Expected: tutti passano.

- [ ] **Step 6: Commit**

```bash
git add backend/mcp_server/server.py backend/mcp_server/widgets.py backend/tests/unit/test_mcp_tools.py
git commit -m "feat(mcp): wrap all tool responses with widget _meta"
```

---

### Task 1.5: Register widget resources on FastMCP

I widget devono essere esposti come resource MCP (`resources/list` + `resources/read`). FastMCP permette registrazione via decorator `@mcp.resource(uri)`.

**Files:**
- Modify: `backend/mcp_server/server.py`

- [ ] **Step 1: Write failing test**

Aggiungi in `backend/tests/unit/test_mcp_widgets.py`:

```python
import pytest


class TestResourceRegistration:
    @pytest.mark.asyncio
    async def test_all_5_widgets_are_registered(self):
        """list_resources() should return exactly the 5 widget URIs."""
        from mcp_server.server import mcp

        resources = await mcp.list_resources()
        uris = {str(r.uri) for r in resources}
        assert uris == {
            "ui://widget/summary",
            "ui://widget/nodes",
            "ui://widget/full-orb",
            "ui://widget/connections",
            "ui://widget/skills-for-experience",
        }

    @pytest.mark.asyncio
    async def test_read_resource_returns_html_shell(self, monkeypatch):
        from mcp_server.server import mcp

        monkeypatch.setattr(
            "mcp_server.widgets.settings",
            type("S", (), {"frontend_url": "https://open-orbis.com"})(),
        )
        contents = await mcp.read_resource("ui://widget/summary")
        content_list = list(contents)
        assert len(content_list) == 1
        html = content_list[0].content
        assert "<div id=\"root\"></div>" in html
        assert "chatgpt-widgets/summary.js" in html
```

- [ ] **Step 2: Run — should fail**

Run: `cd backend && uv run pytest tests/unit/test_mcp_widgets.py::TestResourceRegistration -v`

- [ ] **Step 3: Register widgets in `server.py`**

In `backend/mcp_server/server.py`, dopo la definizione di `mcp = FastMCP(...)` e PRIMA dei `@mcp.tool()`, aggiungi:

```python
from mcp_server.widgets import WIDGET_REGISTRY, build_html_shell


def _register_widget_resources() -> None:
    """Register each widget as a text/html MCP resource.

    ChatGPT reads these via resources/read to get the HTML shell that
    loads the actual widget bundle from open-orbis.com. Each resource
    is static per-deploy — no per-request data.
    """
    for widget_name, meta in WIDGET_REGISTRY.items():
        uri = f"ui://widget/{widget_name}"

        # FastMCP's @mcp.resource decorator registers a callable that
        # produces content on demand. We bind `widget_name` via default
        # arg so each closure captures its own value.
        @mcp.resource(
            uri,
            name=meta.name,
            title=meta.title,
            mime_type="text/html",
        )
        def _widget_shell(_name: str = widget_name) -> str:
            return build_html_shell(_name)


_register_widget_resources()
```

- [ ] **Step 4: Run — should pass**

Run: `cd backend && uv run pytest tests/unit/test_mcp_widgets.py -v`
Expected: tutti i test passano.

- [ ] **Step 5: Commit**

```bash
git add backend/mcp_server/server.py backend/tests/unit/test_mcp_widgets.py
git commit -m "feat(mcp): register 5 widget resources on FastMCP"
```

---

### Task 1.6: Integration test — end-to-end tool → _meta → resources/read

**Files:**
- Create: `backend/tests/integration/test_chatgpt_apps_integration.py`

- [ ] **Step 1: Write the integration test**

Crea il file:

```python
"""End-to-end integration: tool call produces _meta, resource read
returns matching HTML shell. Runs against FastMCP in-process, mocks
the Neo4j driver at the boundary.

Does NOT hit ChatGPT — that's manual QA in Developer Mode (see
docs/chatgpt-apps/qa-checklist.md).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_full_flow_summary_tool_to_resource(monkeypatch):
    monkeypatch.setattr(
        "mcp_server.widgets.settings",
        type("S", (), {"frontend_url": "https://open-orbis.com"})(),
    )

    # 1. Tool call → returns structuredContent + _meta.outputTemplate
    from mcp_server.server import orbis_get_summary

    fake_tool_data = {
        "name": "Alice",
        "headline": "Engineer",
        "location": "Roma",
        "orb_id": "orb1",
        "node_counts": {"skill": 3},
        "total_nodes": 3,
    }
    with (
        patch("mcp_server.server._resolve_scope", new=AsyncMock(return_value=("orb1", ""))),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch("mcp_server.server.get_orb_summary", new=AsyncMock(return_value=fake_tool_data)),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        tool_result = await orbis_get_summary.fn("")

    widget_uri = tool_result["_meta"]["openai/outputTemplate"]
    assert widget_uri == "ui://widget/summary"

    # 2. resources/read on that URI → HTML shell loading the bundle
    from mcp_server.server import mcp

    contents = list(await mcp.read_resource(widget_uri))
    html = contents[0].content
    assert "<div id=\"root\"></div>" in html
    assert "chatgpt-widgets/summary.js" in html


@pytest.mark.asyncio
async def test_share_context_omits_meta(monkeypatch):
    """Share-token request: tool returns data but NO _meta (widget disabled)."""
    from mcp_server.server import orbis_get_summary

    fake_share_ctx = object()
    with (
        patch("mcp_server.server._resolve_scope", new=AsyncMock(return_value=("orb1", "tok"))),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch("mcp_server.server.get_orb_summary", new=AsyncMock(return_value={"name": "X"})),
        patch("mcp_server.widgets.get_share_context", return_value=fake_share_ctx),
    ):
        result = await orbis_get_summary.fn("orb1", "tok")

    assert result["structuredContent"] == {"name": "X"}
    assert "_meta" not in result
```

- [ ] **Step 2: Run**

Run: `cd backend && uv run pytest tests/integration/test_chatgpt_apps_integration.py -v`
Expected: entrambi i test passano.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_chatgpt_apps_integration.py
git commit -m "test(mcp): integration tests for ChatGPT Apps flow"
```

---

## Phase 2 — Frontend scaffold

### Task 2.1: Create `frontend/chatgpt-apps/` scaffold

**Files:**
- Create: `frontend/chatgpt-apps/package.json`
- Create: `frontend/chatgpt-apps/tsconfig.json`
- Create: `frontend/chatgpt-apps/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "orbis-chatgpt-apps",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "d3-force": "^3.0.0"
  },
  "devDependencies": {
    "@types/d3-force": "^3.0.10",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@playwright/test": "^1.49.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^8.0.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true
  },
  "include": ["src", "e2e"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.vite/
test-results/
playwright-report/
```

- [ ] **Step 4: Install dependencies**

Run: `cd frontend/chatgpt-apps && npm install`
Expected: install completo senza errori.

- [ ] **Step 5: Commit**

```bash
git add frontend/chatgpt-apps/package.json frontend/chatgpt-apps/package-lock.json frontend/chatgpt-apps/tsconfig.json frontend/chatgpt-apps/.gitignore
git commit -m "chore(chatgpt-apps): scaffold widget package"
```

---

### Task 2.2: Vite config with 5 entries, output to `frontend/public/chatgpt-widgets/`

**Files:**
- Create: `frontend/chatgpt-apps/vite.config.ts`

- [ ] **Step 1: Write config**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";

// Each widget is a separate entry. Vite emits one bundle per entry
// to ../public/chatgpt-widgets/<name>.js. The file name must match
// WIDGET_REGISTRY[name].bundle_filename in backend/mcp_server/widgets.py.
const WIDGETS = [
  "summary",
  "nodes",
  "full-orb",
  "connections",
  "skills-for-experience",
];

export default defineConfig({
  plugins: [react(), tailwind()],
  build: {
    outDir: resolve(__dirname, "../public/chatgpt-widgets"),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        WIDGETS.map((w) => [w, resolve(__dirname, `src/widgets/${w}.tsx`)]),
      ),
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        format: "iife", // single <script src> — no module loading
        inlineDynamicImports: false,
      },
    },
    target: "es2020",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 2: Create stub entries so Vite doesn't error**

Crea 5 file stub in `frontend/chatgpt-apps/src/widgets/`. Ogni file:

```tsx
// summary.tsx (repeat with appropriate widget name)
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root) createRoot(root).render(<div>Widget: summary</div>);
```

File da creare: `summary.tsx`, `nodes.tsx`, `full-orb.tsx`, `connections.tsx`, `skills-for-experience.tsx`.

- [ ] **Step 3: Create test-setup.ts**

Crea `frontend/chatgpt-apps/src/test-setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 4: Test build**

Run: `cd frontend/chatgpt-apps && npm run build`
Expected: 5 file `.js` in `frontend/public/chatgpt-widgets/`.

- [ ] **Step 5: Verify output**

Run: `ls frontend/public/chatgpt-widgets/`
Expected:
```
summary.js
nodes.js
full-orb.js
connections.js
skills-for-experience.js
```

- [ ] **Step 6: Commit**

```bash
git add frontend/chatgpt-apps/vite.config.ts frontend/chatgpt-apps/src/
# Ignora la cartella di output (sarà rigenerata dal deploy):
echo "public/chatgpt-widgets/" >> frontend/.gitignore  # solo se non già presente
git add frontend/.gitignore
git commit -m "chore(chatgpt-apps): vite multi-entry build"
```

---

### Task 2.3: Shared layout, theme, api helper, auth-error

**Files:**
- Create: `frontend/chatgpt-apps/src/shared/api.ts`
- Create: `frontend/chatgpt-apps/src/shared/layout.tsx`
- Create: `frontend/chatgpt-apps/src/shared/theme.css`
- Create: `frontend/chatgpt-apps/src/shared/auth-error.tsx`

- [ ] **Step 1: Create `api.ts`**

```typescript
// Apps SDK runtime API. See docs/chatgpt-apps/apps-sdk-verified.md
// for the exact shape — update this file if that doc diverges.

declare global {
  interface Window {
    openai?: {
      toolOutput?: unknown;
      // Other Apps SDK calls TBD after verification. Add here as needed.
    };
  }
}

export function getToolOutput<T>(): T | null {
  const raw = window.openai?.toolOutput;
  if (raw == null) return null;
  return raw as T;
}

/** True if the tool response is the "not_activated" sentinel shape. */
export function isNotActivated(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output != null &&
    (output as { state?: string }).state === "not_activated"
  );
}

/** True if the tool response is an error envelope ({error: "..."}). */
export function isToolError(output: unknown): output is { error: string } {
  return (
    typeof output === "object" &&
    output != null &&
    typeof (output as { error?: unknown }).error === "string"
  );
}
```

- [ ] **Step 2: Create `theme.css`**

```css
@import "tailwindcss";

:root {
  /* ChatGPT-compatible CSS variables; adjust to match both light and dark. */
  --orbis-fg: #0b1220;
  --orbis-fg-muted: #556173;
  --orbis-bg: #ffffff;
  --orbis-bg-subtle: #f6f8fa;
  --orbis-border: #e2e6ec;
  --orbis-accent: #4f46e5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --orbis-fg: #e8eaf0;
    --orbis-fg-muted: #9ba2b0;
    --orbis-bg: #0f1115;
    --orbis-bg-subtle: #1a1d24;
    --orbis-border: #2a2f3a;
    --orbis-accent: #8b85ff;
  }
}

html, body, #root {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--orbis-bg);
  color: var(--orbis-fg);
}
```

- [ ] **Step 3: Create `layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { Component, type ErrorInfo } from "react";
import "./theme.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: "640px",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Client-side only log. No network: preserves privacy + simplicity.
    console.error("[orbis-widget] render crash", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <AppShell>
          <p style={{ color: "var(--orbis-fg-muted)" }}>
            Widget non disponibile. I dati restano visibili nella risposta
            in chat.
          </p>
        </AppShell>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Create `auth-error.tsx`**

```tsx
import { AppShell } from "./layout";

export function NotActivatedState() {
  return (
    <AppShell>
      <div
        style={{
          padding: "16px",
          border: "1px solid var(--orbis-border)",
          borderRadius: "8px",
          background: "var(--orbis-bg-subtle)",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>
          Orbis non attivo
        </h3>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: "0.875rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          Completa l'attivazione del tuo Orbis per continuare.
        </p>
        <a
          href="https://open-orbis.com/activate"
          target="_blank"
          rel="noopener"
          style={{
            color: "var(--orbis-accent)",
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          Attiva su open-orbis.com →
        </a>
      </div>
    </AppShell>
  );
}

export function ToolErrorState({ error }: { error: string }) {
  return (
    <AppShell>
      <div
        style={{
          padding: "16px",
          border: "1px solid var(--orbis-border)",
          borderRadius: "8px",
          color: "var(--orbis-fg-muted)",
          fontSize: "0.875rem",
        }}
      >
        {error}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Verify build still works**

Run: `cd frontend/chatgpt-apps && npm run build`
Expected: build ok.

- [ ] **Step 6: Commit**

```bash
git add frontend/chatgpt-apps/src/shared/
git commit -m "feat(chatgpt-apps): shared layout, theme, api helpers"
```

---

### Task 2.4: CORS / cache headers for `/chatgpt-widgets/*`

**Files:**
- Modify: `docs/deployment.md` (documentazione)
- Potentially modify: Cloud Run / reverse proxy config (NON in repo — fuori scope del piano coding)

- [ ] **Step 1: Document needed headers in deployment doc**

Aggiungi una nuova sezione a `docs/deployment.md` (tail):

```markdown
## ChatGPT Apps — static widget bundle

La directory `frontend/public/chatgpt-widgets/` contiene bundle JS
caricati dall'iframe ChatGPT. Il reverse proxy / CDN deve servirli con:

- `Cache-Control: public, max-age=3600, s-maxage=86400` (CDN cache 1 giorno, browser 1h)
- `Access-Control-Allow-Origin: https://chatgpt.com` (iframe ChatGPT)
- `Access-Control-Allow-Origin: https://chatgpt-com-*.chat.openai.com` se necessario per dev
- `Content-Type: application/javascript; charset=utf-8`

Se stai usando Cloud Run → Cloud CDN, aggiungi queste header nella
`cache_key_policy` / custom response headers del LB HTTPS. Per Vercel
usa `vercel.json` header rules.

Nessun tuning lato backend necessario — sono file statici serviti dal
frontend.
```

- [ ] **Step 2: Commit**

```bash
git add docs/deployment.md
git commit -m "docs(deployment): CORS+cache config for chatgpt-widgets bundle"
```

---

## Phase 3 — Widget `summary`

### Task 3.1: Write widget component + Vitest test

**Files:**
- Modify: `frontend/chatgpt-apps/src/widgets/summary.tsx` (sostituisce stub)
- Create: `frontend/chatgpt-apps/src/widgets/summary.test.tsx`
- Create: `frontend/chatgpt-apps/src/__fixtures__/summary.json`

- [ ] **Step 1: Create fixture**

Crea `frontend/chatgpt-apps/src/__fixtures__/summary.json`:

```json
{
  "name": "Alice Rossi",
  "headline": "Senior Software Engineer",
  "location": "Milano, Italy",
  "orb_id": "orb-abc-123",
  "open_to_work": true,
  "node_counts": {
    "work_experience": 4,
    "skill": 23,
    "project": 7,
    "education": 2
  },
  "total_nodes": 36
}
```

- [ ] **Step 2: Write failing test**

Crea `frontend/chatgpt-apps/src/widgets/summary.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { SummaryWidget } from "./summary";
import fixture from "../__fixtures__/summary.json";

describe("SummaryWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders name and headline from toolOutput", () => {
    window.openai = { toolOutput: fixture };
    render(<SummaryWidget />);
    expect(screen.getByText("Alice Rossi")).toBeInTheDocument();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Milano/)).toBeInTheDocument();
  });

  it("renders node counts", () => {
    window.openai = { toolOutput: fixture };
    render(<SummaryWidget />);
    expect(screen.getByText(/36/)).toBeInTheDocument();  // total
    expect(screen.getByText(/work_experience/i)).toBeInTheDocument();
  });

  it("shows not-activated state when tool returns state:not_activated", () => {
    window.openai = { toolOutput: { state: "not_activated" } };
    render(<SummaryWidget />);
    expect(screen.getByText(/attivazione/i)).toBeInTheDocument();
  });

  it("shows tool-error state on error envelope", () => {
    window.openai = { toolOutput: { error: "Orb non accessibile" } };
    render(<SummaryWidget />);
    expect(screen.getByText(/Orb non accessibile/)).toBeInTheDocument();
  });

  it("renders empty-state when toolOutput is null", () => {
    render(<SummaryWidget />);
    expect(screen.getByText(/nessun dato/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — should fail**

Run: `cd frontend/chatgpt-apps && npm test summary`
Expected: fallimento (stub non esporta `SummaryWidget`).

- [ ] **Step 4: Write `summary.tsx` implementation**

Sostituisci il contenuto di `frontend/chatgpt-apps/src/widgets/summary.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import {
  getToolOutput,
  isNotActivated,
  isToolError,
} from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface SummaryData {
  name: string;
  headline: string;
  location: string;
  orb_id: string;
  open_to_work: boolean;
  node_counts: Record<string, number>;
  total_nodes: number;
}

export function SummaryWidget() {
  const output = getToolOutput<unknown>();

  if (output == null) {
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  }
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as SummaryData;
  return (
    <AppShell>
      <div>
        <h2
          style={{
            margin: "0 0 4px",
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          {data.name}
        </h2>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "0.95rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          {data.headline}
        </p>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: "0.825rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          {data.location}
          {data.open_to_work && " · Open to work"}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: "8px",
          }}
        >
          {Object.entries(data.node_counts).map(([type, count]) => (
            <div
              key={type}
              style={{
                padding: "8px",
                border: "1px solid var(--orbis-border)",
                borderRadius: "6px",
                fontSize: "0.825rem",
              }}
            >
              <div style={{ color: "var(--orbis-fg-muted)" }}>{type}</div>
              <div style={{ fontWeight: 600, fontSize: "1rem" }}>{count}</div>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: "12px",
            fontSize: "0.75rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          {data.total_nodes} nodi totali
        </p>
      </div>
    </AppShell>
  );
}

// Entry point — mount on #root when loaded in iframe.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <SummaryWidget />
    </WidgetErrorBoundary>,
  );
}
```

- [ ] **Step 5: Run tests — should pass**

Run: `cd frontend/chatgpt-apps && npm test summary`
Expected: 5 test pass.

- [ ] **Step 6: Verify build**

Run: `cd frontend/chatgpt-apps && npm run build`
Expected: `summary.js` rigenerato, no errori.

- [ ] **Step 7: Commit**

```bash
git add frontend/chatgpt-apps/src/widgets/summary.tsx frontend/chatgpt-apps/src/widgets/summary.test.tsx frontend/chatgpt-apps/src/__fixtures__/summary.json
git commit -m "feat(chatgpt-apps): summary widget"
```

---

## Phase 4 — Widget `nodes`

### Task 4.1: Fixtures + test

**Files:**
- Create: `frontend/chatgpt-apps/src/__fixtures__/nodes-work-experience.json`
- Create: `frontend/chatgpt-apps/src/__fixtures__/nodes-skills.json`
- Create: `frontend/chatgpt-apps/src/__fixtures__/nodes-education.json`

- [ ] **Step 1: Create fixtures**

`nodes-work-experience.json`:
```json
{
  "node_type": "work_experience",
  "nodes": [
    {"uid": "w1", "title": "Senior Engineer", "company": "Acme", "start_date": "2022-01", "end_date": null},
    {"uid": "w2", "title": "Engineer", "company": "BetaCo", "start_date": "2019-06", "end_date": "2021-12"}
  ]
}
```

`nodes-skills.json`:
```json
{
  "node_type": "skill",
  "nodes": [
    {"uid": "s1", "name": "Python", "category": "Backend"},
    {"uid": "s2", "name": "PostgreSQL", "category": "Backend"},
    {"uid": "s3", "name": "React", "category": "Frontend"},
    {"uid": "s4", "name": "Figma"}
  ]
}
```

`nodes-education.json`:
```json
{
  "node_type": "education",
  "nodes": [
    {"uid": "e1", "title": "MSc CS", "institution": "Politecnico Milano", "start_date": "2015", "end_date": "2018"}
  ]
}
```

**Nota:** il formato esatto dei node objects dipende dallo schema Neo4j corrente. Prima di committare, verificare con un test reale contro il tool `get_nodes_by_type` che le chiavi coincidano. Se non coincidono, **aggiornare le fixture** non il widget.

- [ ] **Step 2: Write failing test**

Crea `frontend/chatgpt-apps/src/widgets/nodes.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { NodesWidget } from "./nodes";
import workExp from "../__fixtures__/nodes-work-experience.json";
import skills from "../__fixtures__/nodes-skills.json";
import education from "../__fixtures__/nodes-education.json";

describe("NodesWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders work_experience as timeline", () => {
    window.openai = { toolOutput: workExp };
    render(<NodesWidget />);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    // Timeline marker: orderly dates visible
    expect(screen.getByText(/2022/)).toBeInTheDocument();
  });

  it("renders skills grouped by category", () => {
    window.openai = { toolOutput: skills };
    render(<NodesWidget />);
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Figma")).toBeInTheDocument();
  });

  it("renders education as list", () => {
    window.openai = { toolOutput: education };
    render(<NodesWidget />);
    expect(screen.getByText("MSc CS")).toBeInTheDocument();
    expect(screen.getByText(/Politecnico Milano/)).toBeInTheDocument();
  });

  it("empty nodes list shows empty state", () => {
    window.openai = { toolOutput: { node_type: "skill", nodes: [] } };
    render(<NodesWidget />);
    expect(screen.getByText(/nessun nodo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — should fail**

Run: `cd frontend/chatgpt-apps && npm test nodes`

- [ ] **Step 4: Implement widget**

Sostituisci `frontend/chatgpt-apps/src/widgets/nodes.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { getToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface NodesOutput {
  node_type: string;
  nodes: Record<string, unknown>[];
}

const TIMELINE_TYPES = new Set(["work_experience", "project"]);
const LIST_TYPES = new Set([
  "education",
  "certification",
  "language",
  "publication",
  "patent",
  "award",
  "outreach",
  "training",
]);

function Timeline({ nodes }: { nodes: Record<string, unknown>[] }) {
  const sorted = [...nodes].sort((a, b) => {
    const aStart = String((a as { start_date?: string }).start_date ?? "");
    const bStart = String((b as { start_date?: string }).start_date ?? "");
    return bStart.localeCompare(aStart);
  });
  return (
    <ol
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        borderLeft: "2px solid var(--orbis-border)",
      }}
    >
      {sorted.map((n, i) => {
        const o = n as Record<string, string | null>;
        return (
          <li
            key={String(n.uid ?? i)}
            style={{ padding: "8px 0 8px 12px", marginLeft: "8px" }}
          >
            <div style={{ fontWeight: 600 }}>
              {o.title ?? o.name ?? "Untitled"}
            </div>
            <div style={{ fontSize: "0.825rem", color: "var(--orbis-fg-muted)" }}>
              {o.company ?? o.organization ?? ""}
              {o.start_date && ` · ${o.start_date}`}
              {o.end_date ? ` – ${o.end_date}` : o.start_date ? " – present" : ""}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SkillGrid({ nodes }: { nodes: Record<string, unknown>[] }) {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const n of nodes) {
    const cat = String((n as { category?: string }).category ?? "Uncategorized");
    const arr = grouped.get(cat) ?? [];
    arr.push(n);
    grouped.set(cat, arr);
  }
  return (
    <div>
      {[...grouped.entries()].map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: "12px" }}>
          <h4
            style={{
              margin: "0 0 6px",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--orbis-fg-muted)",
              letterSpacing: "0.05em",
            }}
          >
            {cat}
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {items.map((n, i) => (
              <span
                key={String(n.uid ?? i)}
                style={{
                  padding: "4px 10px",
                  background: "var(--orbis-bg-subtle)",
                  border: "1px solid var(--orbis-border)",
                  borderRadius: "999px",
                  fontSize: "0.825rem",
                }}
              >
                {String((n as { name?: string }).name ?? "?")}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GenericList({ nodes }: { nodes: Record<string, unknown>[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {nodes.map((n, i) => {
        const o = n as Record<string, string | null>;
        return (
          <li
            key={String(n.uid ?? i)}
            style={{
              padding: "8px 0",
              borderBottom: "1px solid var(--orbis-border)",
            }}
          >
            <div style={{ fontWeight: 500 }}>
              {o.title ?? o.name ?? "Untitled"}
            </div>
            <div style={{ fontSize: "0.825rem", color: "var(--orbis-fg-muted)" }}>
              {o.institution ?? o.issuer ?? o.publisher ?? ""}
              {o.start_date && ` · ${o.start_date}`}
              {o.end_date && ` – ${o.end_date}`}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NodesWidget() {
  const output = getToolOutput<unknown>();
  if (output == null) {
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  }
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as NodesOutput;
  if (!data.nodes || data.nodes.length === 0) {
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun nodo.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ maxHeight: "500px", overflowY: "auto" }}>
        {TIMELINE_TYPES.has(data.node_type) && <Timeline nodes={data.nodes} />}
        {data.node_type === "skill" && <SkillGrid nodes={data.nodes} />}
        {LIST_TYPES.has(data.node_type) && <GenericList nodes={data.nodes} />}
        {!TIMELINE_TYPES.has(data.node_type) &&
          data.node_type !== "skill" &&
          !LIST_TYPES.has(data.node_type) && <GenericList nodes={data.nodes} />}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <NodesWidget />
    </WidgetErrorBoundary>,
  );
}
```

- [ ] **Step 5: Run — should pass**

Run: `cd frontend/chatgpt-apps && npm test nodes`

- [ ] **Step 6: Commit**

```bash
git add frontend/chatgpt-apps/src/widgets/nodes.tsx frontend/chatgpt-apps/src/widgets/nodes.test.tsx frontend/chatgpt-apps/src/__fixtures__/nodes-*.json
git commit -m "feat(chatgpt-apps): nodes widget with timeline/grid/list dispatch"
```

---

## Phase 5 — Widget `full-orb`

### Task 5.1: Hero-nodes selection + SVG layout

**Files:**
- Create: `frontend/chatgpt-apps/src/__fixtures__/full-orb.json`
- Create: `frontend/chatgpt-apps/src/widgets/full-orb.test.tsx`
- Modify: `frontend/chatgpt-apps/src/widgets/full-orb.tsx`

- [ ] **Step 1: Create fixture**

`full-orb.json`:
```json
{
  "person": {"uid": "p1", "name": "Alice", "orb_id": "orb-1"},
  "nodes": [
    {"uid": "n1", "type": "work_experience", "title": "Eng at Acme", "degree": 5},
    {"uid": "n2", "type": "work_experience", "title": "Eng at BetaCo", "degree": 3},
    {"uid": "n3", "type": "skill", "name": "Python", "degree": 4},
    {"uid": "n4", "type": "skill", "name": "React", "degree": 3},
    {"uid": "n5", "type": "skill", "name": "SQL", "degree": 2},
    {"uid": "n6", "type": "project", "title": "Orbis", "degree": 4}
  ],
  "edges": [
    {"source": "p1", "target": "n1"},
    {"source": "p1", "target": "n2"},
    {"source": "p1", "target": "n3"},
    {"source": "p1", "target": "n4"},
    {"source": "p1", "target": "n5"},
    {"source": "p1", "target": "n6"},
    {"source": "n1", "target": "n3"},
    {"source": "n1", "target": "n4"}
  ],
  "total_nodes": 42
}
```

**Attenzione:** il tool `get_orb_full` attuale può restituire una forma diversa. Verifica con un `curl` reale al tool o leggi l'output shape in `backend/mcp_server/tools.py:get_orb_full` e allinea il fixture.

- [ ] **Step 2: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { FullOrbWidget, selectHeroNodes } from "./full-orb";
import fixture from "../__fixtures__/full-orb.json";

describe("selectHeroNodes", () => {
  it("keeps person + top-10 experiences/projects + top-15 skills by degree", () => {
    const many = {
      person: { uid: "p1", name: "A", orb_id: "o" },
      nodes: [
        ...Array.from({ length: 20 }, (_, i) => ({
          uid: `w${i}`,
          type: "work_experience",
          title: `W${i}`,
          degree: 20 - i,
        })),
        ...Array.from({ length: 30 }, (_, i) => ({
          uid: `s${i}`,
          type: "skill",
          name: `S${i}`,
          degree: 30 - i,
        })),
      ],
      edges: [],
      total_nodes: 50,
    };
    const heroes = selectHeroNodes(many);
    const wExp = heroes.nodes.filter((n) => n.type === "work_experience");
    const skills = heroes.nodes.filter((n) => n.type === "skill");
    expect(wExp.length).toBe(10);
    expect(skills.length).toBe(15);
    // Highest degree preserved:
    expect(wExp[0].degree).toBe(20);
    expect(skills[0].degree).toBe(30);
  });
});

describe("FullOrbWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders person name and SVG element", () => {
    window.openai = { toolOutput: fixture };
    const { container } = render(<FullOrbWidget />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows 'N nodi non mostrati' badge when total_nodes > hero count", () => {
    window.openai = { toolOutput: fixture };
    render(<FullOrbWidget />);
    // fixture has 6 nodes, all will be shown (< 30 cap); total_nodes=42 > 6
    expect(screen.getByText(/36 nodi non mostrati/i)).toBeInTheDocument();
  });

  it("shows explore CTA", () => {
    window.openai = { toolOutput: fixture };
    render(<FullOrbWidget />);
    expect(screen.getByText(/esplora.*open-orbis/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — should fail**

Run: `cd frontend/chatgpt-apps && npm test full-orb`

- [ ] **Step 4: Implement widget**

Sostituisci `frontend/chatgpt-apps/src/widgets/full-orb.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { getToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface OrbNode {
  uid: string;
  type: string;
  title?: string;
  name?: string;
  degree: number;
}
interface Edge {
  source: string;
  target: string;
}
interface FullOrbData {
  person: { uid: string; name: string; orb_id: string };
  nodes: OrbNode[];
  edges: Edge[];
  total_nodes: number;
}

const MAX_EXP = 10; // top work_experience + project by degree
const MAX_SKILL = 15;

export function selectHeroNodes(data: FullOrbData): FullOrbData {
  const exps = data.nodes
    .filter((n) => n.type === "work_experience" || n.type === "project")
    .sort((a, b) => b.degree - a.degree)
    .slice(0, MAX_EXP);
  const skills = data.nodes
    .filter((n) => n.type === "skill")
    .sort((a, b) => b.degree - a.degree)
    .slice(0, MAX_SKILL);
  const others = data.nodes.filter(
    (n) =>
      n.type !== "work_experience" &&
      n.type !== "project" &&
      n.type !== "skill",
  );

  const heroUids = new Set([
    ...exps.map((n) => n.uid),
    ...skills.map((n) => n.uid),
    ...others.map((n) => n.uid),
  ]);

  return {
    person: data.person,
    nodes: [...exps, ...skills, ...others],
    edges: data.edges.filter(
      (e) =>
        (e.source === data.person.uid || heroUids.has(e.source)) &&
        (e.target === data.person.uid || heroUids.has(e.target)),
    ),
    total_nodes: data.total_nodes,
  };
}

const COLOR_BY_TYPE: Record<string, string> = {
  work_experience: "#4f46e5",
  project: "#059669",
  skill: "#db2777",
  education: "#d97706",
};

type SimNode = SimulationNodeDatum & { uid: string; label: string; color: string };
type SimLink = SimulationLinkDatum<SimNode>;

export function FullOrbWidget() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tick, setTick] = useState(0);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);

  const output = getToolOutput<unknown>();

  useEffect(() => {
    if (!output || typeof output !== "object") return;
    if (isNotActivated(output) || isToolError(output)) return;

    const raw = output as FullOrbData;
    const hero = selectHeroNodes(raw);

    const simNodes: SimNode[] = [
      {
        uid: hero.person.uid,
        label: hero.person.name,
        color: "#111827",
      } as SimNode,
      ...hero.nodes.map<SimNode>((n) => ({
        uid: n.uid,
        label: n.title ?? n.name ?? n.uid,
        color: COLOR_BY_TYPE[n.type] ?? "#6b7280",
      })),
    ];
    const nodeByUid = new Map(simNodes.map((n) => [n.uid, n]));
    const simLinks: SimLink[] = hero.edges
      .filter((e) => nodeByUid.has(e.source) && nodeByUid.has(e.target))
      .map((e) => ({
        source: nodeByUid.get(e.source)!,
        target: nodeByUid.get(e.target)!,
      }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    const WIDTH = 600;
    const HEIGHT = 440;
    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks).distance(80).strength(0.4),
      )
      .force("charge", forceManyBody().strength(-160))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide(28))
      .on("tick", () => setTick((t) => t + 1));

    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [output]);

  if (output == null) {
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  }
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as FullOrbData;
  const hero = selectHeroNodes(data);
  const hiddenCount = Math.max(
    0,
    data.total_nodes - hero.nodes.length - 1,
  );

  // Touch `tick` so React re-renders on simulation updates:
  void tick;

  return (
    <AppShell>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600 }}>
          {data.person.name}
        </h2>
        <svg
          ref={svgRef}
          viewBox="0 0 600 440"
          style={{
            width: "100%",
            height: "440px",
            background: "var(--orbis-bg-subtle)",
            borderRadius: "8px",
          }}
        >
          {linksRef.current.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            return (
              <line
                key={i}
                x1={s.x ?? 0}
                y1={s.y ?? 0}
                x2={t.x ?? 0}
                y2={t.y ?? 0}
                stroke="var(--orbis-border)"
                strokeWidth={1}
              />
            );
          })}
          {nodesRef.current.map((n) => (
            <g key={n.uid} transform={`translate(${n.x ?? 0},${n.y ?? 0})`}>
              <circle r={14} fill={n.color} opacity={0.85} />
              <text
                y={28}
                textAnchor="middle"
                fontSize={10}
                fill="var(--orbis-fg)"
              >
                {n.label.length > 16 ? n.label.slice(0, 16) + "…" : n.label}
              </text>
            </g>
          ))}
        </svg>

        {hiddenCount > 0 && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "0.75rem",
              color: "var(--orbis-fg-muted)",
            }}
          >
            +{hiddenCount} nodi non mostrati
          </p>
        )}
        <a
          href={`https://open-orbis.com/orb/${data.person.orb_id}`}
          target="_blank"
          rel="noopener"
          style={{
            display: "inline-block",
            marginTop: "8px",
            fontSize: "0.825rem",
            color: "var(--orbis-accent)",
            textDecoration: "none",
          }}
        >
          Esplora l'Orb completo su open-orbis.com →
        </a>
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <FullOrbWidget />
    </WidgetErrorBoundary>,
  );
}
```

- [ ] **Step 5: Run tests — should pass**

Run: `cd frontend/chatgpt-apps && npm test full-orb`

- [ ] **Step 6: Commit**

```bash
git add frontend/chatgpt-apps/src/widgets/full-orb.tsx frontend/chatgpt-apps/src/widgets/full-orb.test.tsx frontend/chatgpt-apps/src/__fixtures__/full-orb.json
git commit -m "feat(chatgpt-apps): full-orb widget with d3-force layout"
```

---

## Phase 6 — Widget `connections`

### Task 6.1: Fixture + test + implementation

**Files:**
- Create: `frontend/chatgpt-apps/src/__fixtures__/connections.json`
- Create: `frontend/chatgpt-apps/src/widgets/connections.test.tsx`
- Modify: `frontend/chatgpt-apps/src/widgets/connections.tsx`

- [ ] **Step 1: Fixture**

```json
{
  "focus": {"uid": "w1", "type": "work_experience", "title": "Senior Eng at Acme"},
  "related": [
    {"uid": "s1", "type": "skill", "name": "Python", "relationship": "USED_SKILL"},
    {"uid": "s2", "type": "skill", "name": "PostgreSQL", "relationship": "USED_SKILL"},
    {"uid": "p1", "type": "project", "title": "Orbis launch", "relationship": "WORKED_ON"}
  ]
}
```

- [ ] **Step 2: Test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ConnectionsWidget } from "./connections";
import fixture from "../__fixtures__/connections.json";

describe("ConnectionsWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders focus node and related list", () => {
    window.openai = { toolOutput: fixture };
    render(<ConnectionsWidget />);
    expect(screen.getByText("Senior Eng at Acme")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("Orbis launch")).toBeInTheDocument();
  });

  it("shows relationship labels", () => {
    window.openai = { toolOutput: fixture };
    render(<ConnectionsWidget />);
    expect(screen.getAllByText(/USED_SKILL/).length).toBe(2);
    expect(screen.getByText(/WORKED_ON/)).toBeInTheDocument();
  });

  it("empty related shows empty-state", () => {
    window.openai = {
      toolOutput: { focus: fixture.focus, related: [] },
    };
    render(<ConnectionsWidget />);
    expect(screen.getByText(/nessuna connessione/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implementation**

```tsx
import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { getToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface ConnectionsData {
  focus: { uid: string; type: string; title?: string; name?: string };
  related: Array<{
    uid: string;
    type: string;
    title?: string;
    name?: string;
    relationship: string;
  }>;
}

export function ConnectionsWidget() {
  const output = getToolOutput<unknown>();
  if (output == null)
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as ConnectionsData;
  const focusLabel = data.focus.title ?? data.focus.name ?? data.focus.uid;

  return (
    <AppShell>
      <div style={{ maxHeight: "360px", overflowY: "auto" }}>
        <div
          style={{
            padding: "12px",
            background: "var(--orbis-bg-subtle)",
            border: "1px solid var(--orbis-border)",
            borderRadius: "8px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontWeight: 600 }}>{focusLabel}</div>
          <div
            style={{ fontSize: "0.75rem", color: "var(--orbis-fg-muted)" }}
          >
            {data.focus.type}
          </div>
        </div>

        {data.related.length === 0 ? (
          <p style={{ color: "var(--orbis-fg-muted)" }}>
            Nessuna connessione.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.related.map((n) => (
              <li
                key={n.uid}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid var(--orbis-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div>
                  <div>{n.title ?? n.name ?? n.uid}</div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--orbis-fg-muted)",
                    }}
                  >
                    {n.type}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 8px",
                    background: "var(--orbis-bg-subtle)",
                    borderRadius: "4px",
                    color: "var(--orbis-fg-muted)",
                    alignSelf: "flex-start",
                  }}
                >
                  {n.relationship}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <ConnectionsWidget />
    </WidgetErrorBoundary>,
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend/chatgpt-apps && npm test connections`

- [ ] **Step 5: Commit**

```bash
git add frontend/chatgpt-apps/src/widgets/connections.tsx frontend/chatgpt-apps/src/widgets/connections.test.tsx frontend/chatgpt-apps/src/__fixtures__/connections.json
git commit -m "feat(chatgpt-apps): connections widget"
```

---

## Phase 7 — Widget `skills-for-experience`

### Task 7.1: Fixture + test + implementation

**Files:**
- Create: `frontend/chatgpt-apps/src/__fixtures__/skills-for-experience.json`
- Create: `frontend/chatgpt-apps/src/widgets/skills-for-experience.test.tsx`
- Modify: `frontend/chatgpt-apps/src/widgets/skills-for-experience.tsx`

- [ ] **Step 1: Fixture**

```json
{
  "experience": {"uid": "w1", "title": "Senior Eng at Acme", "start_date": "2022-01"},
  "skills": [
    {"uid": "s1", "name": "Python", "category": "Backend"},
    {"uid": "s2", "name": "PostgreSQL", "category": "Backend"},
    {"uid": "s3", "name": "React", "category": "Frontend"},
    {"uid": "s4", "name": "Docker"}
  ]
}
```

- [ ] **Step 2: Test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { SkillsForExperienceWidget } from "./skills-for-experience";
import fixture from "../__fixtures__/skills-for-experience.json";

describe("SkillsForExperienceWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders experience title and skills grouped by category", () => {
    window.openai = { toolOutput: fixture };
    render(<SkillsForExperienceWidget />);
    expect(screen.getByText(/Senior Eng at Acme/)).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
  });

  it("empty skills shows empty state", () => {
    window.openai = {
      toolOutput: { experience: fixture.experience, skills: [] },
    };
    render(<SkillsForExperienceWidget />);
    expect(screen.getByText(/nessuna skill/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implementation**

```tsx
import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { getToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface Skill {
  uid: string;
  name: string;
  category?: string;
}
interface Data {
  experience: { uid: string; title: string; start_date?: string };
  skills: Skill[];
}

export function SkillsForExperienceWidget() {
  const output = getToolOutput<unknown>();
  if (output == null)
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as Data;
  const grouped = new Map<string, Skill[]>();
  for (const s of data.skills) {
    const cat = s.category ?? "Uncategorized";
    const arr = grouped.get(cat) ?? [];
    arr.push(s);
    grouped.set(cat, arr);
  }

  return (
    <AppShell>
      <div style={{ maxHeight: "320px", overflowY: "auto" }}>
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: "0.95rem",
            fontWeight: 600,
          }}
        >
          Skill per: {data.experience.title}
        </h3>

        {data.skills.length === 0 ? (
          <p style={{ color: "var(--orbis-fg-muted)" }}>Nessuna skill.</p>
        ) : (
          [...grouped.entries()].map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: "12px" }}>
              <h4
                style={{
                  margin: "0 0 6px",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  color: "var(--orbis-fg-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                {cat}
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {items.map((s) => (
                  <span
                    key={s.uid}
                    style={{
                      padding: "4px 10px",
                      background: "var(--orbis-bg-subtle)",
                      border: "1px solid var(--orbis-border)",
                      borderRadius: "999px",
                      fontSize: "0.825rem",
                    }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <SkillsForExperienceWidget />
    </WidgetErrorBoundary>,
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend/chatgpt-apps && npm test skills-for-experience`

- [ ] **Step 5: Commit**

```bash
git add frontend/chatgpt-apps/src/widgets/skills-for-experience.tsx frontend/chatgpt-apps/src/widgets/skills-for-experience.test.tsx frontend/chatgpt-apps/src/__fixtures__/skills-for-experience.json
git commit -m "feat(chatgpt-apps): skills-for-experience widget"
```

---

## Phase 8 — Playwright visual tests

### Task 8.1: Playwright setup + 5 visual tests

**Files:**
- Create: `frontend/chatgpt-apps/playwright.config.ts`
- Create: `frontend/chatgpt-apps/e2e/visual.spec.ts`
- Create: `frontend/chatgpt-apps/e2e/fixtures/*.html` (page harness)

- [ ] **Step 1: Playwright config**

```typescript
// frontend/chatgpt-apps/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 640, height: 600 },
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium-light", use: { colorScheme: "light" } },
    { name: "chromium-dark", use: { colorScheme: "dark" } },
  ],
});
```

- [ ] **Step 2: Add `preview` script and create harness pages**

Aggiungi a `package.json` di `chatgpt-apps`:
```json
"scripts": {
  ...
  "preview": "vite preview --outDir ../public/chatgpt-widgets"
}
```

Crea per ogni widget un file `e2e/fixtures/<name>.html` che mimica l'HTML shell prodotto dal backend:

`e2e/fixtures/summary.html`:
```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
  <div id="root"></div>
  <script>
    window.openai = {
      toolOutput: {
        name: "Alice Rossi",
        headline: "Senior Software Engineer",
        location: "Milano, Italy",
        orb_id: "orb-abc-123",
        open_to_work: true,
        node_counts: { work_experience: 4, skill: 23, project: 7 },
        total_nodes: 34
      }
    };
  </script>
  <script src="/summary.js"></script>
</body>
</html>
```

Ripeti con le fixture JSON già create per gli altri widget (`nodes-work-experience.json`, `full-orb.json`, ecc.).

- [ ] **Step 3: Visual spec**

`e2e/visual.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

const widgets = [
  "summary",
  "nodes",
  "full-orb",
  "connections",
  "skills-for-experience",
];

for (const w of widgets) {
  test(`${w} widget renders`, async ({ page }) => {
    await page.goto(`/e2e/fixtures/${w}.html`);
    await page.waitForSelector("#root *", { state: "attached" });
    // Wait for d3-force to settle (only full-orb)
    if (w === "full-orb") await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot(`${w}.png`, {
      maxDiffPixelRatio: 0.02,
    });
  });
}
```

**Nota:** la prima run genera le baseline. Committale solo dopo averle ispezionate manualmente.

- [ ] **Step 4: Install Playwright browsers**

Run: `cd frontend/chatgpt-apps && npx playwright install chromium`

- [ ] **Step 5: Run visual tests**

Run: `cd frontend/chatgpt-apps && npm run build && npx playwright test`
Expected: prima run → failure perché baseline mancano. Run con `--update-snapshots` per generarle.

- [ ] **Step 6: Commit baseline**

```bash
cd frontend/chatgpt-apps && npx playwright test --update-snapshots
cd ../..
git add frontend/chatgpt-apps/playwright.config.ts frontend/chatgpt-apps/e2e/ frontend/chatgpt-apps/package.json
git commit -m "test(chatgpt-apps): playwright visual baseline for 5 widgets"
```

---

## Phase 9 — Terms page

### Task 9.1: Create `/terms` page

Required per submission OpenAI (spec decisione submission).

**Files:**
- Create: `frontend/src/pages/Terms.tsx`
- Modify: `frontend/src/App.tsx` (aggiungi route)

- [ ] **Step 1: Check routing pattern**

Run: `grep -n 'Routes\|Route path' frontend/src/App.tsx | head -20`

- [ ] **Step 2: Create `Terms.tsx` based on `Privacy.tsx` pattern**

Run: `cp frontend/src/pages/Privacy.tsx frontend/src/pages/Terms.tsx`

Modifica `Terms.tsx` — contenuto scritto in ITALIANO e INGLESE come il privacy esistente. Struttura minima:

```tsx
// Replace Privacy-specific content with Terms content.
// Sections to include (consult with legal counsel before shipping):
// 1. Accettazione termini
// 2. Account e invitation codes (chiuso in beta)
// 3. Dati utente (rinvio a privacy policy)
// 4. Contenuto generato dall'utente (orb graph)
// 5. Uso di AI / LLM provider (Anthropic, Google, Ollama)
// 6. Integrazioni third-party (ChatGPT Apps, Claude Connectors)
// 7. Limiti di servizio
// 8. Modifiche ai termini
// 9. Legge applicabile (probabilmente Italia)
```

**Attenzione:** il contenuto legale va consultato con un avvocato prima di mettere in produzione. Nello spec ho assegnato ½ giornata — questa è SOLO la parte tecnica (routing + rendering); il testo legale è responsabilità dell'utente/legale.

- [ ] **Step 3: Register route**

In `frontend/src/App.tsx`, aggiungi accanto alla route `/privacy`:
```tsx
<Route path="/terms" element={<Terms />} />
```

E l'import:
```tsx
import Terms from "./pages/Terms";
```

- [ ] **Step 4: Test route manually**

Run: `cd frontend && npm run dev`
Naviga a `http://localhost:5173/terms` → pagina renderizzata.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Terms.tsx frontend/src/App.tsx
git commit -m "feat(web): /terms page for ChatGPT Apps submission"
```

---

## Phase 10 — Submission artifacts

### Task 10.1: Manifest + README + QA checklist

**Files:**
- Create: `docs/chatgpt-apps/README.md`
- Create: `docs/chatgpt-apps/manifest.json`
- Create: `docs/chatgpt-apps/qa-checklist.md`
- Create: `docs/chatgpt-apps/assets/.gitkeep`

- [ ] **Step 1: Create `manifest.json`**

**Importante:** la forma esatta del manifest dipende dalla verifica fase 0 — adatta al formato richiesto da `platform.openai.com/apps`. Quello sotto è una bozza generica basata sullo spec.

```json
{
  "schema_version": "0.1",
  "name_for_human": "Orbis",
  "name_for_model": "orbis",
  "description_for_human": "Query your Orbis professional knowledge graph from ChatGPT — summary, experiences, skills, and relationships inline.",
  "description_for_model": "Access the authenticated user's Orbis knowledge graph. Supports querying their profile summary, nodes by type (work_experience, skill, education, etc.), connections between nodes, and skills associated with a specific experience.",
  "auth": {
    "type": "oauth",
    "authorization_url": "https://open-orbis.com/oauth/authorize",
    "token_url": "https://open-orbis.com/oauth/token",
    "scopes": ["orbis.read"],
    "dynamic_client_registration_url": "https://open-orbis.com/oauth/register"
  },
  "api": {
    "type": "mcp",
    "url": "https://mcp.open-orbis.com/mcp"
  },
  "logo_url": "https://open-orbis.com/chatgpt-apps/logo-512.png",
  "contact_email": "support@open-orbis.com",
  "legal_info_url": "https://open-orbis.com/terms",
  "privacy_policy_url": "https://open-orbis.com/privacy"
}
```

- [ ] **Step 2: Create `README.md`**

```markdown
# ChatGPT Apps — Orbis integration

**Status:** Building. Submission pending OpenAI waitlist invite.

## Overview

Orbis is distributed as a ChatGPT App (chatgpt.com/apps) with 5 inline
widgets. See:
- **Spec:** `docs/superpowers/specs/2026-04-23-chatgpt-apps-integration-design.md`
- **Plan:** `docs/superpowers/plans/2026-04-23-chatgpt-apps-integration.md`

## Deploy architecture

```
ChatGPT iframe ──▶ mcp.open-orbis.com/mcp              (tool calls, resources/read)
               ──▶ open-orbis.com/chatgpt-widgets/*.js  (widget JS bundles)
               ──▶ open-orbis.com/oauth/*              (auth flow)
```

## Files

- `manifest.json` — submission metadata (adapt to exact OpenAI schema after Phase 0 verification)
- `qa-checklist.md` — pre-submission manual QA
- `apps-sdk-verified.md` — findings from live Apps SDK docs (Phase 0 output)
- `assets/` — logos, screenshots for submission

## Submission

Pending invite to `platform.openai.com/apps`. Once invited:
1. Upload `manifest.json`
2. Upload `assets/logo-512.png` + `assets/logo-1024.png`
3. Upload 3–5 screenshots from `assets/screenshots/`
4. Link privacy (`/privacy`) and terms (`/terms`)
5. Submit for review
```

- [ ] **Step 3: Create `qa-checklist.md`**

```markdown
# ChatGPT Apps — Manual QA checklist

Before submission, every checkbox must pass. Run in ChatGPT Developer Mode
(register MCP URL as dev app, install for own account).

## Install flow
- [ ] Click "Add Orbis" → redirected to open-orbis.com/oauth/authorize
- [ ] Consent screen mentions ChatGPT explicitly and lists scope `orbis.read`
- [ ] Authorize → redirected back to ChatGPT cleanly (no stuck spinners)
- [ ] Disconnect → `/oauth/grants` admin shows grant revoked

## Widget rendering (fresh conversation each time)
### summary
- [ ] Prompt: *"show me my profile"*
- [ ] Widget appears within 2s
- [ ] Name + headline + location visible
- [ ] Node counts render as grid, numbers match /myorbis actual counts
- [ ] Dark mode: colors switch correctly

### nodes
- [ ] Prompt: *"list my work experiences"* → timeline with chronological order
- [ ] Prompt: *"what skills do I have?"* → tag cloud grouped by category
- [ ] Prompt: *"my education"* → list
- [ ] "Uncategorized" skill group appears when skills lack category

### full-orb
- [ ] Prompt: *"show my full graph"*
- [ ] SVG renders within 3s, settles to stable layout
- [ ] Max 30 nodes visible
- [ ] "+N nodi non mostrati" badge correct when total > 30
- [ ] CTA to open-orbis.com works

### connections
- [ ] Prompt: *"what's connected to my Acme experience?"*
- [ ] Focus card + related list
- [ ] Relationship labels readable

### skills-for-experience
- [ ] Prompt: *"skills from my Acme experience"*
- [ ] Skills grouped by category
- [ ] Empty experience handled

## Error paths
- [ ] Token manually revoked during session → next prompt shows recovery (auto-refresh or reinstall prompt, NOT 500)
- [ ] User without active Orbis → widget shows "Complete activation" CTA
- [ ] Simulate widget bundle 404 (temporarily rename file) → ChatGPT falls back to text

## Accessibility
- [ ] All text in widgets has sufficient contrast (WCAG AA)
- [ ] Widgets render at 420px viewport without overflow
```

- [ ] **Step 4: Commit**

```bash
mkdir -p docs/chatgpt-apps/assets
touch docs/chatgpt-apps/assets/.gitkeep
git add docs/chatgpt-apps/
git commit -m "docs(chatgpt-apps): README, manifest draft, QA checklist"
```

---

## Phase 11 — Docs updates (pre-PR check)

### Task 11.1: Update existing docs per CLAUDE.md pre-PR checklist

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`

- [ ] **Step 1: `docs/api.md` — add resources endpoint + _meta note**

Trova la sezione MCP endpoint e aggiungi:

```markdown
### MCP Resources (ChatGPT Apps)

The MCP server exposes 5 widget resources under `ui://widget/*`:
- `ui://widget/summary`
- `ui://widget/nodes`
- `ui://widget/full-orb`
- `ui://widget/connections`
- `ui://widget/skills-for-experience`

Accessed via MCP `resources/list` and `resources/read`. Each returns
HTML (mime_type `text/html`) that loads a JS bundle from
`open-orbis.com/chatgpt-widgets/<name>.js`.

### Tool response envelope

All tool responses are wrapped in `{structuredContent, _meta}`:
```json
{
  "structuredContent": { ... raw tool output ... },
  "_meta": {
    "openai/outputTemplate": "ui://widget/<widget-name>",
    "openai/widgetAccessible": true
  }
}
```

Under share-token context (`X-MCP-Key: orbs_...`), `_meta` is omitted —
share-mode disables widget rendering by design.
```

- [ ] **Step 2: `docs/architecture.md` — add ChatGPT Apps section**

Aggiungi una sezione in fondo con il diagramma di flow dallo spec (sezione Architecture). Cita esplicitamente i due nuovi moduli: `backend/mcp_server/widgets.py` e `frontend/chatgpt-apps/`.

- [ ] **Step 3: `docs/testing.md` — add widget testing**

```markdown
### ChatGPT Apps widget tests

Frontend (`frontend/chatgpt-apps/`):
- Vitest unit per widget: `npm test`
- Playwright visual per widget: `npm run e2e`

Backend:
- `backend/tests/unit/test_mcp_widgets.py` — resource registry + HTML shell
- `backend/tests/integration/test_chatgpt_apps_integration.py` — tool→_meta→resource flow

Manual QA: `docs/chatgpt-apps/qa-checklist.md` (runs in ChatGPT Developer Mode).
```

- [ ] **Step 4: Commit**

```bash
git add docs/api.md docs/architecture.md docs/testing.md
git commit -m "docs: ChatGPT Apps integration reference"
```

---

## Phase 12 — Manual QA + submission

### Task 12.1: Full manual QA in ChatGPT Developer Mode

**Files:** none (manuale).

- [ ] **Step 1: Deploy staging**

Deploy del branch su staging environment (o dev cloud run) — serve URL pubblico raggiungibile da chatgpt.com iframe.

- [ ] **Step 2: Register MCP as dev app**

Apri ChatGPT, abilita Developer Mode (vedi Apps SDK docs), aggiungi l'MCP URL `https://mcp-staging.open-orbis.com/mcp` come custom app.

- [ ] **Step 3: Esegui checklist completa**

Apri `docs/chatgpt-apps/qa-checklist.md` e verifica ogni box. Per ogni fallimento:
- Apri una issue con titolo `chatgpt-apps QA: <what failed>`
- Fix in branch dedicato
- Re-run il singolo checkbox dopo fix

- [ ] **Step 4: Cattura screenshot per submission**

Con widget che passano QA, cattura 3-5 screenshot in chatgpt.com (light mode). Salvali in `docs/chatgpt-apps/assets/screenshots/`.

```bash
git add docs/chatgpt-apps/assets/screenshots/
git commit -m "docs(chatgpt-apps): submission screenshots"
```

### Task 12.2: Submit to OpenAI

**Files:** none (esterno al repo).

- [ ] **Step 1: Iscriviti alla waitlist Apps SDK**

Su `platform.openai.com/apps` (o URL finale verificato in fase 0), iscriviti come sviluppatore.

- [ ] **Step 2: Dopo l'invito, submit**

Upload `docs/chatgpt-apps/manifest.json`, logo, screenshot, link privacy + terms. Aggiorna `docs/chatgpt-apps/README.md` con status "Submitted, awaiting review".

- [ ] **Step 3: Durante la review**

Monitora email dev. Se OpenAI richiede modifiche, apri branch + fix + re-submit.

- [ ] **Step 4: After approval**

Aggiorna README a "Live" + data di go-live. Commit.

---

## Effort Recap

| Phase | Tasks | Giorni |
|---|---|---|
| 0 — Apps SDK verification | 1 | 0.5 |
| 1 — Backend infra (widgets.py, wrap, PII, integration) | 6 | 3 |
| 2 — Frontend scaffold (Vite, shared, deploy docs) | 4 | 2 |
| 3 — Widget summary | 1 | 2 |
| 4 — Widget nodes | 1 | 3 |
| 5 — Widget full-orb | 1 | 4 |
| 6 — Widget connections | 1 | 2 |
| 7 — Widget skills-for-experience | 1 | 2 |
| 8 — Playwright visual | 1 | 2 |
| 9 — Terms page | 1 | 0.5 |
| 10 — Submission artifacts | 1 | 1 |
| 11 — Docs updates | 1 | 1 |
| 12 — Manual QA + submit | 2 | 3 |
| **Totale build** | **22** | **~26** |

Con waitlist + review OpenAI: tempo totale variabile (settimane-mesi dopo il build).

---

## Self-review notes

- **Spec coverage check:** OAuth flow (spec §Data flow install) → coperto dall'infra esistente, nessun task necessario. Share-mode protection (decisione 7) → Task 1.1 + Task 1.6. PII filter (decisione 8) → Task 1.3. Tutti i 5 widget (decisione 4) → Phase 3-7. Terms page → Phase 9. Docs pre-PR → Phase 11.
- **No placeholder scan:** nessun "TBD/TODO" nei passi. I soli punti "aperti" espliciti sono: (a) verifica fase 0 dell'Apps SDK (documentata), (b) contenuto legale del `/terms` (delega fuori scope tecnico).
- **Type consistency:** `wrap_tool_response(payload, widget_name)` signature identica in Task 1.1 e Task 1.4. `WIDGET_REGISTRY` keys identici tra backend (`summary`, `nodes`, `full-orb`, `connections`, `skills-for-experience`) e frontend vite entries (stessi 5 nomi).
- **Cross-file contract:** `settings.frontend_url` è la sola dipendenza di build_html_shell verso config backend — cambio di frontend_url in deploy muove la URL del bundle automaticamente.
