# ChatGPT Apps — Manual QA checklist

Before submission, every checkbox must pass. Run in ChatGPT Developer Mode:
**ChatGPT → Settings → Apps & Connectors → Advanced settings → Developer mode**, then add the staging MCP URL as a custom connector.

## Pre-flight

- [ ] Staging MCP server reachable: `curl https://mcp-staging.open-orbis.com/.well-known/oauth-protected-resource` returns valid JSON
- [ ] Widget bundles served from staging frontend: `curl https://staging.open-orbis.com/chatgpt-widgets/summary.js` returns ES module JS
- [ ] OAuth metadata reachable: `curl https://staging.open-orbis.com/.well-known/oauth-authorization-server` returns valid JSON

## Install flow

- [ ] Click "Add Orbis" in ChatGPT → redirect to `staging.open-orbis.com/oauth/authorize`
- [ ] Consent screen mentions ChatGPT explicitly and lists scope `orbis.read` clearly
- [ ] Authorize → redirected back to ChatGPT cleanly (no stuck spinners, no console errors)
- [ ] Disconnect → admin `/oauth/grants` page shows the grant revoked

## Widget rendering (fresh conversation each time, both light + dark)

### summary
- [ ] Prompt: *"show me my profile"* / *"summary del mio orbis"*
- [ ] Widget appears within 2s
- [ ] Name + headline + location visible
- [ ] Node counts grid renders, numbers match `/myorbis` actual counts
- [ ] Light mode: text contrast WCAG AA
- [ ] Dark mode: switches correctly when ChatGPT theme is dark

### nodes
- [ ] Prompt: *"list my work experiences"* → timeline with chronological order (newest first)
- [ ] Prompt: *"what skills do I have?"* → tag cloud grouped by category
- [ ] Prompt: *"my education"* → list with dates
- [ ] "Uncategorized" group appears when skills lack category
- [ ] Empty type → "Nessun nodo" message

### full-orb
- [ ] Prompt: *"show my full graph"*
- [ ] SVG renders within 3s, settles to stable layout
- [ ] Max ~30 nodes visible (10 exp/project + 15 skill + others, capped per spec)
- [ ] "+N nodi non mostrati" badge correct when total exceeds visible
- [ ] CTA "Esplora l'Orb completo su open-orbis.com →" works
- [ ] No WebGL errors (we use SVG, not Three.js)

### connections
- [ ] Prompt: *"what's connected to my Acme experience?"*
- [ ] Focus card at top with title + type
- [ ] Related list below with relationship badges (USED_SKILL, WORKED_ON, etc.)
- [ ] Empty related → "Nessuna connessione" message

### skills-for-experience
- [ ] Prompt: *"skills from my Acme experience"*
- [ ] Skills grouped by category, "Uncategorized" group appears for missing
- [ ] Empty → "Nessuna skill" message

## Multi-turn behaviour

- [ ] Prompt 1: *"my profile"* → summary widget appears
- [ ] Prompt 2 (same conversation): *"my skills"* → nodes widget appears, summary widget OUT of view (replaced by new context)
- [ ] Prompt 3: *"go back to my profile"* → summary widget appears with current data (verifies useToolOutput re-subscribes to `openai:set_globals`)

## Error paths

- [ ] Token manually revoked from `/oauth/grants` admin during a session → next prompt shows graceful recovery (auto-refresh OR clear "reauth needed" message), NOT a 500
- [ ] User without active Orbis (beta gate / invite code not consumed) → widget shows "Completa l'attivazione su open-orbis.com/activate →" CTA
- [ ] Simulate widget bundle 404 (temporarily rename file in staging) → ChatGPT falls back to text summary in chat (no broken iframe)

## Privacy / PII

- [ ] Summary widget does NOT show email/phone/address
- [ ] Inspect raw tool response (if Developer Mode shows it): `structuredContent` for summary lacks `email`/`phone`/`address` keys

## Accessibility

- [ ] Text contrast WCAG AA in both light + dark for all 5 widgets
- [ ] Widgets render without overflow at 420px viewport (Apps SDK lower bound)
- [ ] Keyboard navigation reaches CTAs (the open-orbis.com link in full-orb widget)

## Screenshots for submission

After all above pass, capture 3–5 screenshots in light mode:
1. summary widget rendered
2. nodes widget (one of timeline / skills grid)
3. full-orb widget
4. (optional) connections widget
5. (optional) skills-for-experience widget

Save to `docs/chatgpt-apps/assets/screenshots/<widget>.png`.

## Submission readiness

After QA passes:
- [ ] `docs/chatgpt-apps/manifest.json` updated with final URLs
- [ ] Logos uploaded to `frontend/public/chatgpt-apps/logo-512.png` + `logo-1024.png`
- [ ] Screenshots in `docs/chatgpt-apps/assets/screenshots/`
- [ ] `docs/chatgpt-apps/README.md` status updated to "Submitted, awaiting review"
- [ ] Pre-flight gates from README confirmed
