# Cross-Browser Smoke Test Checklist

Manual testing companion for `scripts/cross-browser-test.sh`.

## Setup

1. Start infrastructure: `docker compose up -d`
2. Start backend: `cd backend && uv run uvicorn app.main:app --reload`
3. Start frontend: `cd frontend && npm run dev`
4. Open all browsers: `./scripts/cross-browser-test.sh`

## Browsers

| Browser | Engine | Priority |
|---------|--------|----------|
| Chrome (latest) | Blink | High |
| Firefox (latest) | Gecko | High |
| Safari (latest) | WebKit | High |
| Edge (latest) | Blink | Medium |
| Arc | Blink | Low |
| Brave | Blink | Low |

---

## Per-Browser Checks

Copy this section for each browser you are testing.

### Browser: \_\_\_\_\_\_\_\_\_\_ | Version: \_\_\_\_\_\_\_\_\_\_ | OS: \_\_\_\_\_\_\_\_\_\_

#### 1. Page Load

- [ ] `/` (Landing) loads — no errors in DevTools console
- [ ] `/privacy` loads — no errors in DevTools console
- [ ] `/<orbId>` (shared orb, if available) loads — no errors

#### 2. WebGL / 3D Graph

- [ ] HeroOrb sphere animates on landing page
- [ ] Demo orb graph renders below the fold with visible nodes and edges
- [ ] Orbit controls: drag to rotate, scroll to zoom, right-drag to pan
- [ ] Node hover shows tooltip
- [ ] No WebGL warnings in console

#### 3. CSS & Layout

- [ ] Gradient text ("Beyond the CV.") renders with purple-to-indigo gradient
- [ ] Backdrop-blur panels are translucent (not opaque or invisible)
- [ ] Custom scrollbar visible (thin rounded thumb on scrollable areas)
- [ ] Firefox: standard thin scrollbar renders (no webkit scrollbar expected)
- [ ] Font "Inter" loads correctly (check DevTools > Computed > font-family)
- [ ] No overflow or horizontal scroll on any page

#### 4. Animations (Framer Motion)

- [ ] Hero elements fade in sequentially on landing load
- [ ] Scroll down: feature rows slide/fade in when entering viewport
- [ ] No visual jank, tearing, or layout shift during animations
- [ ] Privacy page content fades in on navigate

#### 5. Authentication

- [ ] Google sign-in button opens OAuth flow
- [ ] Safari: popup is not blocked (or redirect fallback works)
- [ ] LinkedIn sign-in redirects to LinkedIn and back
- [ ] After login, redirect to `/myorbis` or `/create` works

#### 6. Browser APIs (requires authentication)

- [ ] Copy button (SharePanel) copies link to clipboard — paste to verify
- [ ] CV PDF download triggers file save / downloads bar
- [ ] No console errors related to `navigator.clipboard` or `Blob`
- [ ] DevTools > Application: localStorage and sessionStorage accessible

#### 7. Responsive

- [ ] Resize window to < 640px: mobile layout activates
- [ ] Touch/click interactions work at mobile width
- [ ] No elements overflow or get clipped

---

## Known Browser Differences

These are expected — not bugs:

| Feature | Chrome/Edge/Arc/Brave | Firefox | Safari |
|---------|----------------------|---------|--------|
| Custom scrollbar | `::-webkit-scrollbar` | `scrollbar-width: thin` | `::-webkit-scrollbar` |
| `backdrop-filter` | Supported | Supported (103+) | Supported (15+) |
| Clipboard API | Secure context | Secure context | Prompts permission |
| WebGL 2.0 | Yes | Yes | Yes (15+) |

---

## Issues Log

| # | Browser | Version | Issue Description | Severity | Screenshot | Console Output |
|---|---------|---------|-------------------|----------|------------|----------------|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
