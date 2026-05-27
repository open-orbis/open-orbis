# AI Connect Wizard — Design Spec

**Date:** 2026-05-27
**Status:** Approved for planning
**Author:** brainstormed with Claude Code

## Goal

OpenOrbis's core value is a **portable professional identity** that a user can plug into
webchat LLMs (ChatGPT, Claude, Perplexity, Gemini) and AI builders (Lovable) as an MCP
server — so the LLM can query the user's orb to draft CVs, bios, cover letters, or even
build a personal site from it as a source of truth.

Today nothing tells a new user this is possible. This feature adds a **guided wizard modal**
that appears once, right after the guided tour, introducing MCP connection and walking the
user through connecting their chosen platform, ending with starter prompts to try.

## Value proposition surfaced to the user

> Your Orbis isn't just a page — it's a live professional identity your AI assistant can read.
> Connect it once and ask ChatGPT/Claude for a tailored CV, a bio, or a site built from your data.

## Scope decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Relationship to existing `ConnectedAiClientsModal` | **New, focused wizard** that links to the existing modal for connection management — no duplication |
| Primary connection method | **OAuth "paste the URL"** flow; API-key (`X-MCP-Key`) shown as an advanced fallback |
| API-key fallback depth | **Link-only**: show the header format + URL, link to docs/management. No new key-minting UI |
| Per-platform instructions | **Concrete step-by-step**, stored as structured data with a `LAST_VERIFIED` date |
| Layout | **Guided wizard / stepper** (3 steps) |
| Trigger | **Once** after the guided tour finishes/closes; re-openable anytime |
| Re-open entry point | **Distinct "Connect to AI" button next to the chat 🤖 button** |

## Trigger & lifecycle

The wizard appears **exactly once** per user (per browser), then becomes on-demand.

- **New flag:** `localStorage["orbis_ai_connect_seen"]` — helper functions mirror the existing
  `markTourCompleted` / `isTourCompleted` pattern in `GuidedTour.tsx`.
- **First show (new users):** `GuidedTour`'s `onFinish` callback (fires on finished / skipped /
  close) opens the wizard if `orbis_ai_connect_seen` is unset.
- **Existing users** (already have `orbis_tour_completed === "true"`, so `onFinish` will never
  fire again): on `OrbViewPage` mount, if `isTourCompleted()` **and** `orbis_ai_connect_seen`
  is unset, open the wizard once. This guarantees everyone sees it exactly once.
- **Set flag on open** (not on completion) so dismissing without finishing still counts — we do
  not nag.
- **Re-open:** a new "Connect to AI" button beside the chat 🤖 button opens the wizard at any
  time, ignoring the flag.

Edge: the wizard must not appear *during* the tour or stack on top of it — only after `onFinish`.

## Wizard UX (3 steps)

Reuses the codebase's established modal pattern: `framer-motion` `AnimatePresence` + React
`createPortal`, backdrop `bg-black/60 backdrop-blur-sm`, Escape-to-close, Tab focus trap,
spring transitions — matching `ConnectedAiClientsModal.tsx`. A persistent stepper header
(`① Choose · ② Connect · ③ Try it`) and a close ✕.

### Step ① — Choose your AI
- Title + one-line value proposition.
- Grid of 5 platform cards: **Claude, ChatGPT, Perplexity, Gemini, Lovable**, each with name,
  icon/emoji, and a one-line support hint (e.g. "easiest", "dev mode", "via CLI", "build a site").
- Selecting a platform advances to Step ②.

### Step ② — Connect <Platform>
- **MCP URL** block at top: the value from `import.meta.env.VITE_MCP_URL`
  (dev fallback `http://localhost:8081/mcp`), with a **copy button** (reuse the copy pattern
  from `ConnectedAiClientsModal` / `CopyMcpConfigButton`).
- **Auth badge** for the platform (OAuth / Developer mode / API key / CLI).
- **Numbered concrete steps** for the chosen platform (see content table).
- **Caveat callout** where reality requires it (Gemini consumer app, Lovable build-time).
- **Advanced expander** (collapsed): "Connect with an API key instead" — shows the
  `X-MCP-Key: orbk_…` header format alongside the URL and links to where keys are documented/
  managed (`docs/api.md` / future settings). No minting UI in this feature.
- **Back** and **"I've connected →"** buttons.

### Step ③ — Try it
- "You're connected. Try asking:" + copy-able starter prompt cards (see Prompts).
- Footer: **"Manage connections →"** (opens existing `ConnectedAiClientsModal`) and **Done**.

## Per-platform content (verified 2026-05-27)

Stored in a data module `aiPlatforms.ts` as a typed array. A module-level
`LAST_VERIFIED = "2026-05-27"` constant is rendered subtly in the wizard footer so staleness is
visible and copy edits are a one-file change.

Each entry: `{ id, name, icon, supportHint, authBadge, steps: string[], caveat?, docsUrl }`.

| Platform | Auth badge | Step-② content (summary) | Caveat |
|---|---|---|---|
| **Claude** | OAuth · easiest | Settings → Connectors (Pro/Max) → ＋ → Add custom connector → paste URL → Add → finish login & consent (choose full/restricted) | Team/Enterprise: an Owner must add it org-wide first. OAuth only (no header field in UI). |
| **ChatGPT** | Developer mode (beta) | Settings → Apps & Connectors → Advanced → enable **Developer mode** → Create → name + paste MCP URL → enable per chat via ＋ | Plus/Pro/Team/Enterprise only; beta safety gate; not the Apps SDK (that's for publishing). |
| **Perplexity** | OAuth / API key | Connectors settings → add a custom remote connector → paste URL → choose auth method | Pro/Max/Enterprise; HTTPS required; launched Mar 2026; exact button labels may differ. |
| **Gemini** | Via CLI ⚠ | Consumer app: not supported yet. Use **Gemini CLI**: `gemini mcp add --transport http orbis <URL>`, verify with `/mcp` | No consumer self-serve; CLI is config-driven; CLI transition to Antigravity CLI noted Jun 2026. |
| **Lovable** | Build-time 🧡 | Add as a **chat connector** (Cmd/Ctrl+K → connectors) so the *builder* reads your Orbis while generating the app | MCP chat connectors are **build-time context, not bundled into the deployed app**. For live site data use Lovable's app-connector/API path. |

Source basis: official help/docs for each platform (Anthropic support, OpenAI help, Perplexity
changelog, Gemini CLI docs, Lovable docs), checked 2026-05-27. Steps with unpublished exact
labels (Perplexity, Lovable) describe the surface rather than invent labels.

## Suggested prompts (Step ③)

General (always shown):
1. "What's the best-fitting job opportunity for me given my Orbis? Then draft a CV tuned to that job description."
2. "Draft a short professional bio of me from my specialities."
3. "Write a cover letter for this role: [paste the job description]."

Platform-flavored (shown when relevant, e.g. Lovable):
4. "Build my portfolio site using my Orbis as the source of truth."

Each prompt card has a copy button. Prompts align with the orb's MCP tools
(`orbis_get_summary`, `orbis_get_full_orb`, `orbis_get_nodes_by_type`, `orbis_get_connections`,
`orbis_get_skills_for_experience`).

## Architecture

### New files
- `frontend/src/components/ai/AiConnectWizard.tsx` — the modal + 3-step state machine.
- `frontend/src/components/ai/aiPlatforms.ts` — typed platform data + `LAST_VERIFIED`.
- A small localStorage helper for `orbis_ai_connect_seen` (co-located with the wizard or beside
  the existing tour helpers).

### Touched files
- `frontend/src/pages/OrbViewPage.tsx`
  - Mount `<AiConnectWizard open={…} onClose={…} onManageConnections={() => setShowConnectedAi(true)} />`
    near the existing `ConnectedAiClientsModal` (currently `:1061`).
  - Extend the `GuidedTour` `onFinish` handler (`:1179`) to also open the wizard once.
  - Add the mount-time "existing user, once" check.
  - Pass a new `onConnectAi` callback down to the chat component (sibling of the existing
    `onConnectedAi` at `:1041`).
- The chat component (`ChatBox`) — add a distinct **"Connect to AI"** button next to the 🤖
  button. Tooltips disambiguate: new = "Connect to AI assistant (setup)", robot = "Connected AI
  clients (manage)".

### State
- Wizard open/closed: local `useState` in `OrbViewPage` (consistent with `showConnectedAi`).
- Step index + selected platform: local `useState` inside `AiConnectWizard`.
- `orbis_ai_connect_seen`: localStorage, via helper.
- MCP URL: `import.meta.env.VITE_MCP_URL` (already typed in `vite-env.d.ts`).

No new backend work. No new Zustand store (keeps parity with existing modal handling).

## Error / edge handling
- `VITE_MCP_URL` unset → fall back to the documented dev URL and still render (never blank).
- Copy-to-clipboard failure → show a "copy failed, select manually" affordance (match existing).
- Wizard must never block or overlap the tour; only opens post-`onFinish`.
- Re-open button always works regardless of the seen-flag.

## Testing
- **Vitest unit tests** (jsdom; `setupTests.ts` exists):
  - Renders all 3 steps; Back/Next navigation; platform selection drives Step ② content.
  - `aiPlatforms.ts` shape (every platform has steps + badge + docsUrl).
  - Trigger gating: opens once when flag unset; not again when set; re-open ignores flag;
    existing-user mount-time path.
  - Copy button writes the MCP URL to the clipboard.
- **Playwright e2e (optional):** finish tour → wizard appears → pick Claude → see URL + steps →
  Done → re-open via the chat-area button.

## Documentation (per CLAUDE.md pre-PR check)
- `docs/navigation-flow.md` — add the wizard modal, its trigger, and the new re-open button.
- `docs/navigation-actions.yaml` — add actions: open/close wizard, select platform, copy URL,
  copy prompt, open manage-connections, the new chat-area button.
- No `docs/api.md` change (no new endpoint; link-only API-key path references existing docs).

## Out of scope (YAGNI)
- Minting `orbk_` API keys from the wizard (link-only).
- Detecting whether the user has *actually* connected a client (no success telemetry loop).
- Re-prompting / nagging users who dismiss without connecting.
- Localizing platform steps or auto-fetching them from a remote source.
- Per-platform deep links into each vendor's settings page.

## Open questions
None blocking. Exact Perplexity/Lovable button labels should be spot-checked against the live
products before final copy lock, but the spec already flags those as surface-level.
