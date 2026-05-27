# AI Connect Wizard — Design Spec

**Date:** 2026-05-27
**Status:** Approved for planning
**Author:** brainstormed with Claude Code

## Revision — 2026-05-27 (post-review consolidation)

The separate **AI Connect Wizard modal** and the dedicated green **"Connect to AI"** button in the ChatBox have been **dropped**. The implementation consolidates everything into the existing `ConnectedAiClientsModal`:

- `ConnectedAiClientsModal` now has **two tabs**: **Connect** (default on open) and **Connected (N)**.
- The **Connect** tab renders `AiConnectPanel` — MCP URL + Copy URL button, a platform picker (Claude, ChatGPT, Perplexity, Gemini, Lovable); selecting a platform reveals its auth badge, numbered steps, caveat, docs link, an "Advanced: connect with an API key" toggle (shows `X-MCP-Key` header), and starter prompts. No stepper.
- The **Connected (N)** tab is the existing OAuth grants list with Revoke buttons (N = grant count).
- **Open triggers:** (1) the existing cyan robot button in the ChatBox action bar (aria-label "Connected AI clients") — unchanged; (2) auto-opens once after the guided tour finishes/closes, and once on mount for users who already completed the tour before this shipped — both gated by `localStorage["orbis_ai_connect_seen"]`. Auto-open lands on the Connect tab.
- **Close:** Esc, backdrop click, or the ✕ button.
- `AiConnectPanel.tsx` (new) replaces the planned `AiConnectWizard.tsx`.

Implementation: `frontend/src/components/ConnectedAiClientsModal.tsx`, `frontend/src/components/ai/AiConnectPanel.tsx`, wiring in `frontend/src/pages/OrbViewPage.tsx`.

---

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
| Relationship to existing `ConnectedAiClientsModal` | **Folded IN as a "Connect" tab** (no separate modal) |
| Primary connection method | **OAuth "paste the URL"** flow; API-key (`X-MCP-Key`) shown as an advanced fallback |
| API-key fallback depth | **Link-only**: show the header format + URL, link to docs/management. No new key-minting UI |
| Per-platform instructions | **Concrete step-by-step**, stored as structured data with a `LAST_VERIFIED` date |
| Layout | **Tabbed modal (Connect / Connected)**; platform picker reveals steps + prompts inline (no stepper) |
| Trigger | **Once** after the guided tour finishes/closes; re-openable anytime |
| Re-open entry point | **The existing robot button** (no separate button) |

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
- **Re-open:** ~~a new "Connect to AI" button beside the chat 🤖 button opens the wizard at any
  time, ignoring the flag.~~ *(superseded — see Revision section above: the existing robot button opens `ConnectedAiClientsModal` on demand; no separate button was added.)*

Edge: the wizard must not appear *during* the tour or stack on top of it — only after `onFinish`.

## Wizard UX (3 steps) — SUPERSEDED

> **Superseded by the Revision note above.** The 3-step stepper described in this
> section was *not* shipped. The content was consolidated into a single **"Connect"
> tab** of `ConnectedAiClientsModal` (platform picker that reveals steps + prompts
> inline — no stepper). This section is retained as historical design context only.

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
- `frontend/src/components/ai/AiConnectPanel.tsx` — the Connect-tab panel (platform picker,
  per-platform steps + prompts, advanced API-key toggle). Replaces the planned `AiConnectWizard.tsx`.
- `frontend/src/components/ai/aiPlatforms.ts` — typed platform data + `LAST_VERIFIED`.
- `frontend/src/components/ai/aiConnectSeen.ts` — localStorage helper for `orbis_ai_connect_seen`.

### Touched files
- `frontend/src/components/ConnectedAiClientsModal.tsx` — gains two tabs (Connect / Connected);
  the Connect tab renders `AiConnectPanel`; the Connected tab retains the existing OAuth grants
  list with Revoke.
- `frontend/src/pages/OrbViewPage.tsx`
  - The existing `ConnectedAiClientsModal` mount point is reused (no separate wizard mount).
  - `GuidedTour` `onFinish` handler extended to auto-open `ConnectedAiClientsModal` once
    (gated by `orbis_ai_connect_seen`).
  - Mount-time "existing user, once" check also opens `ConnectedAiClientsModal`.
  - No new `onConnectAi` chat callback — the ChatBox action cluster is unchanged (Share → Robot → Add).
- The chat component (`ChatBox`) — **no new button added**. The cyan robot button ("Connected AI
  clients") is the sole on-demand re-open entry point.

### State
- Modal open/closed: the existing `showConnectedAi` local `useState` in `OrbViewPage` — no new state variable.
- Active tab + selected platform: local `useState` inside `ConnectedAiClientsModal` / `AiConnectPanel`.
- `orbis_ai_connect_seen`: localStorage, via `aiConnectSeen.ts` helper.
- MCP URL: `import.meta.env.VITE_MCP_URL` (already typed in `vite-env.d.ts`).

No new backend work. No new Zustand store (keeps parity with existing modal handling).

## Error / edge handling
- `VITE_MCP_URL` unset → fall back to the documented dev URL and still render (never blank).
- Copy-to-clipboard failure → show a "copy failed, select manually" affordance (match existing).
- Wizard must never block or overlap the tour; only opens post-`onFinish`.
- Re-open button always works regardless of the seen-flag.

## Testing
- **Vitest unit tests** (jsdom; `setupTests.ts` exists):
  - `AiConnectPanel`: renders platform picker; selecting a platform reveals steps, auth badge, prompts, advanced toggle.
  - `aiPlatforms.ts` shape (every platform has steps + badge + docsUrl).
  - `aiConnectSeen.ts`: sets/reads/clears flag correctly.
  - Trigger gating: modal opens once when flag unset; not again when set; robot button always opens regardless of flag; existing-user mount-time path.
  - Copy URL button writes VITE_MCP_URL to clipboard.
- **Playwright e2e (optional):** finish tour → `ConnectedAiClientsModal` appears on Connect tab → pick Claude → see URL + steps → switch to Connected tab → re-open via robot button.

## Documentation (per CLAUDE.md pre-PR check)
- `docs/navigation-flow.md` — updated to remove `AI_CONNECT_WIZARD` state; `CONNECTED_AI_MODAL` extended with Connect/Connected tabs and both open triggers.
- `docs/navigation-actions.yaml` — reworked AI Connect section: removed wizard/stepper/green-button entries; actions reference `CONNECTED_AI_MODAL`; tab-switch entry added.
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
