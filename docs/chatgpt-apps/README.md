# ChatGPT Apps — Orbis integration

**Status:** Build complete. Submission channel: OPEN (since 2025-12-17) at `platform.openai.com` → Apps dashboard. Reviewed by OpenAI; no expedited process.

## Overview

Orbis is distributed as a ChatGPT App (chatgpt.com/apps) with 5 inline widgets. See:
- **Spec:** `docs/superpowers/specs/2026-04-23-chatgpt-apps-integration-design.md`
- **Plan:** `docs/superpowers/plans/2026-04-23-chatgpt-apps-integration.md`
- **Apps SDK verification:** `apps-sdk-verified.md`

## Deploy architecture

```
ChatGPT iframe ──▶ mcp.open-orbis.com/mcp              (tool calls, resources/read)
               ──▶ open-orbis.com/chatgpt-widgets/*.js  (widget JS bundles)
               ──▶ open-orbis.com/oauth/*              (auth flow)
```

The 5 widgets:

| URI | Tool | Component |
|---|---|---|
| `ui://widget/summary` | `orbis_get_summary` | profile card |
| `ui://widget/nodes` | `orbis_get_nodes_by_type` | timeline / grid / list dispatch |
| `ui://widget/full-orb` | `orbis_get_full_orb` | d3-force 2D graph (hero nodes) |
| `ui://widget/connections` | `orbis_get_connections` | focus node + related list |
| `ui://widget/skills-for-experience` | `orbis_get_skills_for_experience` | grouped skill tags |

## Files in this directory

- `manifest.json` — submission metadata (adapt to exact OpenAI schema in the dashboard wizard)
- `qa-checklist.md` — pre-submission manual QA in ChatGPT Developer Mode
- `apps-sdk-verified.md` — findings from live Apps SDK docs (Phase 0 output)
- `assets/` — logos, screenshots for submission (to be added before submit)

## Submission pre-flight gates

**Before** opening the dashboard, verify:

1. **OpenAI project data residency = global.** EU data residency projects cannot submit. `platform.openai.com` → Organization → Projects → the submitting project → Data controls.
2. **Identity verification completed.** Settings → Organization → Verifications. Individual or business depending on publisher name. Cannot be done retroactively.
3. **Developer Mode QA passed.** Run `qa-checklist.md` on the staging deploy first. Capture screenshots while doing so.
4. **Privacy + Terms live.** `https://open-orbis.com/privacy` and `https://open-orbis.com/terms` must be reachable; Terms is currently a draft pending legal review.

## Submit

Upload via dashboard:
- Manifest fields (from `manifest.json`)
- Logo 512×512 + 1024×1024 (PNG, transparent background recommended)
- 3–5 screenshots (light mode, real ChatGPT capture; save under `assets/screenshots/`)
- Privacy URL + Terms URL
- MCP endpoint + tool descriptions
- 5–10 test prompts with expected behavior
- Localization (en + it minimum)
- Country availability

After submit, update this README status to "Submitted, awaiting review" + date.

## URI versioning

Changing any `ui://widget/<name>` URI after approval **requires re-submission for review**. Treat the 5 widget URIs as a public stable API. The same applies to renaming MCP tools — keep the names that ship with the first approval.
