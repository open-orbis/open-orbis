# Apps SDK — Verified Conventions

Fetched: 2026-04-23 from:

- https://developers.openai.com/apps-sdk (overview)
- https://developers.openai.com/apps-sdk/reference
- https://developers.openai.com/apps-sdk/quickstart
- https://developers.openai.com/apps-sdk/build/mcp-server
- https://developers.openai.com/apps-sdk/build/chatgpt-ui
- https://developers.openai.com/apps-sdk/plan/tools
- https://developers.openai.com/apps-sdk/plan/components
- https://developers.openai.com/apps-sdk/deploy
- https://developers.openai.com/apps-sdk/deploy/submission
- https://developers.openai.com/apps-sdk/deploy/troubleshooting
- https://github.com/openai/openai-apps-sdk-examples
- https://community.openai.com/t/chatgpt-app-store-is-open-for-submissions/1369611
- https://help.openai.com/en/articles/20001040-submitting-apps-to-the-chatgpt-app-directory
- https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/
- https://sunpeak.ai/blogs/mcp-app-csp-external-api-calls/ (community CSP reference)
- https://mcpui.dev/guide/apps-sdk (community cross-host reference)

The canonical developer portal is `developers.openai.com/apps-sdk` (not
`platform.openai.com/docs/apps`, which 403s — that URL in the original spec is
stale). `platform.openai.com` is now only the org / billing / submission
dashboard.

## Tool response _meta keys

The MCP Apps standard and ChatGPT's Apps SDK have diverged slightly on naming.
Both keys work in ChatGPT; only the standard key is portable.

- **Canonical (MCP Apps standard, portable across hosts):**
  `_meta.ui.resourceUri` — string, points at a `ui://…` resource.
- **ChatGPT-specific legacy alias:** `_meta["openai/outputTemplate"]` — same
  value, same meaning. ChatGPT honors it for backwards compatibility. Other
  MCP Apps hosts (Claude.ai, mcp-ui clients) do **not** read it.
- **Recommended practice from docs:** set **both** on the render tool so the
  app works in ChatGPT today and remains portable. Quoting the reference:
  _"In ChatGPT, only the render tool should include `_meta["openai/outputTemplate"]`.
  For broader MCP Apps compatibility, also set `_meta.ui.resourceUri` on the
  render tool."_

- **Widget visibility / accessibility:**
  - Canonical: `_meta.ui.visibility` — array, default `["model", "app"]`.
    `["model"]` = tool is callable but not surfaced to the widget;
    `["app"]` = reserved for widget-triggered calls. Controls whether the
    model can call the tool and whether a widget can call it via
    `window.openai.callTool`.
  - Legacy ChatGPT key: `_meta["openai/widgetAccessible"]` — boolean,
    still accepted. The spec's use of `openai/widgetAccessible: true` is
    valid but the modern idiom is `_meta.ui.visibility: ["model", "app"]`.

- **Invocation status strings** (both ≤64 chars, shown in the chat surface
  while the tool runs):
  - `_meta["openai/toolInvocation/invoking"]` — e.g. `"Fetching your graph…"`
  - `_meta["openai/toolInvocation/invoked"]` — e.g. `"Graph loaded."`

- **File inputs:** `_meta["openai/fileParams"]` declares which input fields
  accept uploaded files (not relevant to Orbis MVP).

- **CSP (lives on the resource, not the tool):** `_meta.ui.csp` with the
  three keys below (see "HTML shell constraints").

### Response envelope shape (confirmed)

Every tool call returns three sibling fields:

1. `structuredContent` — JSON the model reads **and** the widget receives via
   `window.openai.toolOutput`. Keep lean.
2. `content` — optional markdown/text narration. Model + widget see it.
3. `_meta` — widget-only, hidden from the model. Use for rich payloads the
   model doesn't need to tokenize.

## Widget resource URI scheme

- **Scheme:** `ui://` (confirmed — matches spec).
- **Example:** `ui://widget/orbis-nodes` or `ui://widget/orbis-nodes.html`.
  The `.html` suffix is idiomatic in OpenAI's examples but not required.
- **MIME type on `resources/read`:** must be `"text/html;profile=mcp-app"`
  (confirmed — this profile suffix is what tells ChatGPT the HTML is a widget
  shell rather than plain HTML).
- **Name format:** no strictly documented grammar; examples in the official
  repo use kebab-case paths like `ui://widget/pizzaz-list`,
  `ui://widget/solar-system`. Safe convention: `ui://widget/<slug>` where
  `<slug>` matches `[a-z0-9-]+`.
- **Versioning:** community thread (OpenAI Developer Community #1374584) notes
  that changing a widget URI requires app resubmission for review — so treat
  URIs as stable once submitted.

## Widget runtime API (what the bundle JS reads)

`window.openai` is injected into every widget iframe. Members observed in the
official reference + examples repo:

**State (read-only globals):**
- `window.openai.toolInput` — last tool call arguments (confirmed).
- `window.openai.toolOutput` — last tool `structuredContent` (confirmed,
  matches spec).
- `window.openai.toolResponseMetadata` — last tool `_meta` (widget-only data).
- `window.openai.widgetState` — persisted widget-owned state (across turns).
- `window.openai.displayMode` — `"inline" | "fullscreen" | "pip"`.
- `window.openai.theme` — `"light" | "dark"`.
- `window.openai.locale` — IETF BCP-47 tag.
- `window.openai.userAgent`, `window.openai.maxHeight`, `window.openai.safeArea`.

**Mutation / action APIs:**
- `window.openai.setWidgetState(state)` — persist arbitrary JSON across turns.
- `window.openai.callTool(name, args)` — invoke another MCP tool from the
  widget.
- `window.openai.sendFollowUpMessage(text)` — push a user-visible follow-up
  into the chat turn.
- `window.openai.requestDisplayMode({ mode })` — ask host for fullscreen/pip.
- `window.openai.requestModal({ template? })` — open host-owned modal.
- `window.openai.requestClose()` — dismiss inline card.
- `window.openai.notifyIntrinsicHeight(h)` — advise host of content height.
- `window.openai.openExternal(url)` — open URL in browser (host-mediated).
- File helpers: `uploadFile`, `selectFiles`, `getFileDownloadUrl`
  (not needed for Orbis MVP).

**Update event:** whenever any global changes (new tool result, theme flip,
display-mode change), the host dispatches `openai:set_globals` on `window`.
`event.detail.globals` holds the new values. Recommended React pattern is
`useSyncExternalStore` subscribing to this event (this is exactly what the
MVP needs for the 5 widgets).

## HTML shell constraints

- **Iframe sandboxing:** widgets run in a sandboxed iframe; cross-origin
  isolation applies.
- **Script loading:** official quickstart + examples repo both **inline** the
  compiled ESM bundle into the HTML shell (esbuild → single
  `dist/component.js` → embedded). External `<script src="…">` is permitted
  **only** if the src host is listed in `_meta.ui.csp.resourceDomains` on the
  widget resource.
  - Orbis spec currently plans `<script src="https://open-orbis.com/…">` — this
    works provided `https://open-orbis.com` is in `resourceDomains` of every
    widget resource's `_meta.ui.csp`.
- **CSP directives (set via `_meta.ui.csp` on the resource, not the tool):**
  - `connectDomains` → maps to CSP `connect-src` (fetch, XHR, WebSocket).
    Must list any host the widget calls at runtime (e.g. `https://open-orbis.com`
    if the widget ever fetches beyond what the tool already returned).
  - `resourceDomains` → maps to `img-src`, `script-src`, `style-src`,
    `font-src`, `media-src`. List the CDN/app host here.
  - `frameDomains` → maps to `frame-src`. Default empty. Adding any value
    triggers a **stricter review process**. Orbis MVP doesn't need this.
- **Inline styles/scripts:** inline `<style>` is generally accepted; inline
  `<script>` execution within the shell itself works in practice (esbuild
  output is commonly injected inline). Troubleshooting docs say to watch the
  browser console for CSP violations — meaning CSP is enforced and a strict
  default (`script-src` probably `'self'` + `resourceDomains`) applies.
- **Bundle / resource size:** no hard numeric cap is documented. Guidance is
  "keep `structuredContent` lean" and troubleshooting flags slow responses —
  infer a practical soft limit in the low-MB range. Plan for a minified
  bundle well under 1 MB.

## OAuth flow specifics

Discovery and flow exactly match what Orbis's MCP server already implements:

- **Protected-resource discovery:** `GET /.well-known/oauth-protected-resource`
  on the MCP server, returning authorization server URLs. ChatGPT also accepts
  the `WWW-Authenticate` header on a 401 as an alternative advertising channel.
- **Authorization-server metadata:** either
  `/.well-known/oauth-authorization-server` (OAuth 2.0) or
  `/.well-known/openid-configuration` (OIDC) — either is fine.
- **DCR required:** RFC 7591. ChatGPT registers a fresh client on every
  connect and uses the returned `client_id` during token exchange. A
  `registration_endpoint` must be exposed.
- **PKCE required:** S256 only. `code_challenge_methods_supported` must
  include `"S256"` in the AS metadata or ChatGPT refuses the flow.
- **Resource parameter required:** ChatGPT appends `resource=<mcp-url>` to
  both authorization and token requests. The server is expected to echo the
  value into the access token (typically as `aud`) and reject tokens whose
  audience doesn't match.
- **Token passthrough:** ChatGPT sends the access token as
  `Authorization: Bearer …` on every MCP request. Server is responsible for
  full verification (signature, iss, aud, exp, scopes).
- **Scope naming:** no documented format constraints; standard space-separated
  strings. Orbis can keep whatever scope strings it already uses.

Orbis's existing OAuth 2.1 + DCR implementation (from the 2026-04-21 MCP OAuth
spec, PRs #425–#429) already satisfies all of these.

## Submission / distribution process

**Submission is OPEN as of December 2025** — no longer invite-only or
waitlisted. The spec's "invite-only, timeline: weeks-months" assumption is
outdated.

- **Where:** OpenAI Developer Platform dashboard
  (`platform.openai.com` → Apps section), not `platform.openai.com/docs/apps`.
- **Prerequisites:**
  - Verified OpenAI developer identity (individual verification or business
    verification — business required if the publisher name is an organization
    rather than a natural person).
  - Project must use **global** data residency. EU-data-residency projects
    **cannot** submit apps — the org would need to create (or move to) a
    global project. This is a hard blocker for anyone on EU residency.
- **Required submission fields** (quoted from submission docs):
  _"app name, logo, description, company and privacy policy URLs, MCP and
  tool information, screenshots, test prompts and responses, and localization
  information"_. Also: country availability settings.
- **Review timeline:** OpenAI says _"review timelines may vary as we continue
  to build and scale our processes"_ and explicitly does not accept expedited
  requests. Community threads report typical turnaround of days to a few
  weeks, variable.
- **Self-serve publishing:** still marked _"coming soon"_ — all apps go
  through OpenAI review today.
- **Developer-mode testing before submission:** enable via
  ChatGPT → Settings → Apps & Connectors → Advanced settings → Developer
  mode. Then add the MCP endpoint as a connector. This is the
  pre-submission test loop.

## Divergences from our spec

Source of truth for the "spec says" column:
`docs/superpowers/specs/2026-04-23-chatgpt-apps-integration-design.md`.

| # | Area | Spec says | Live docs say | Severity |
|---|---|---|---|---|
| 1 | Docs URL | `platform.openai.com/docs/apps` | Canonical is `developers.openai.com/apps-sdk`. `platform.openai.com/docs/apps` returns 403. | INFO — update references. |
| 2 | _meta output key | `_meta["openai/outputTemplate"]` (sole key) | `_meta.ui.resourceUri` is the canonical MCP-Apps standard key. `openai/outputTemplate` is a ChatGPT-only legacy alias. Docs explicitly say: set **both** on the render tool. | MINOR — set both keys so we're portable + forward-compatible. |
| 3 | Widget accessibility key | `_meta["openai/widgetAccessible"]: true` | Canonical is `_meta.ui.visibility: ["model", "app"]`. Legacy `openai/widgetAccessible` still accepted in ChatGPT. | MINOR — set both or migrate to `ui.visibility`. |
| 4 | CSP configuration | Not called out in spec (only "no fetch esterni dal widget") | CSP is **explicit** and must be declared via `_meta.ui.csp` with `connectDomains` / `resourceDomains` / `frameDomains`. External `<script src="open-orbis.com/…">` requires `resourceDomains` to list `https://open-orbis.com`. | MINOR (BLOCKING for Task 1.x if omitted) — add a `_meta.ui.csp` block to every widget resource. |
| 5 | Widget bundling | Spec plans `<script src="…open-orbis.com/…">` referencing a CDN | Official quickstart + all examples inline the ESM bundle into the HTML shell (esbuild single-file output, injected as `<script type="module">…</script>`). External src is allowed with CSP, but inlined is the norm. | INFO — either approach works, but inlining is lower-friction for review. Document the choice. |
| 6 | Update mechanism inside widget | Spec implies widget re-renders from `window.openai.toolOutput` directly | Host dispatches `openai:set_globals` on window; widgets must subscribe to that event (or use a helper hook) to react to new tool results. Reading `window.openai.toolOutput` only once on mount misses subsequent turns. | MINOR (BUG risk for Task 1.x) — Task that implements widget runtime must subscribe to `openai:set_globals`. |
| 7 | Distribution status | "**invite-only** al momento della spec (aprile 2026). Timeline: settimane-mesi." | Submission has been **open to any verified developer since Dec 17, 2025**. No waitlist. Review turnaround is days-to-weeks. | MINOR — unblocks distribution; update Phase 3 plan. |
| 8 | EU data residency | Spec does not mention it | Projects with EU data residency **cannot submit apps**. Must use a global-residency project. | MINOR (potentially BLOCKING depending on Orbis's OpenAI org config) — verify the submitting OpenAI project is global-residency before Phase 3. |
| 9 | Identity verification | Spec does not mention it | Submitter must pass OpenAI identity verification (individual or business). Must be completed **before** first submission. | MINOR — add to Phase 3 pre-flight checklist. |
| 10 | URI versioning | Spec does not address what happens when widget schema changes | Changing a widget's `ui://` URI requires app resubmission. Implies URIs should be stable once approved; bake any version concerns in now. | INFO — no action for MVP but note for future. |
| 11 | Required submission fields | Spec mentions "manifest" abstractly | Concrete required fields: app name, logo, description, company URL, privacy policy URL, MCP + tool info, screenshots, test prompts + responses, localization, country availability. | INFO — make sure Phase 3 QA checklist covers all 10 items. |

No **BLOCKING** divergences in the strict sense (nothing that prevents Task 1.1
from starting). Divergences #4, #6 create functional bugs if we follow the
spec literally; #2, #3, #7, #8, #9 create process/portability risk.

## Recommendation

- [x] **Proceed with plan updates** before Task 1.x implementation touches
      `_meta` / widget runtime code.

Specific plan updates to make before or during Task 1.x / Phase 1:

1. **Task wiring tool `_meta` (backend / `widgets.py`):** set **both**
   `_meta.ui.resourceUri` and `_meta["openai/outputTemplate"]` to the same
   `ui://widget/<name>` value. Set both `_meta.ui.visibility = ["model", "app"]`
   and `_meta["openai/widgetAccessible"] = true`. Keeps us portable to Claude.ai
   / mcp-ui while preserving ChatGPT compatibility.

2. **Task defining the widget resource (backend / `resources/read`
   handler):** include `_meta.ui.csp` on every `ui://widget/*` resource with
   at minimum:
   ```json
   {
     "ui": {
       "csp": {
         "connectDomains": [],
         "resourceDomains": ["https://open-orbis.com"],
         "frameDomains": []
       }
     }
   }
   ```
   Required if any widget loads `<script src="https://open-orbis.com/…">`.
   Decide in Task 1.x whether to inline the bundle (no CSP needed beyond
   defaults) or host it (add `resourceDomains`).

3. **Task implementing the widget React runtime (frontend):** mount must
   subscribe to the `openai:set_globals` window event and read
   `event.detail.globals.toolOutput`; do NOT only read `window.openai.toolOutput`
   once on mount. Suggested: a `useOpenAI()` hook built on
   `useSyncExternalStore`.

4. **Phase 3 (submission):**
   - Remove "invite-only / waitlist" language; submission is open.
   - Add pre-flight: (a) verify submitting OpenAI project is **not** EU
     data residency; (b) complete OpenAI developer identity verification;
     (c) gather all 10 submission fields listed above.
   - Point to `developers.openai.com/apps-sdk` not `platform.openai.com/docs/apps`.

5. **Documentation references throughout spec/plan:** replace
   `platform.openai.com/docs/apps` with `developers.openai.com/apps-sdk`.

None of the above require re-brainstorming; all are localized edits to
specific tasks.
