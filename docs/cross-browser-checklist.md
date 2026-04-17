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


## Mobile

Manual checks before shipping anything UI-visible. Run at iPhone SE (375 × 667), Pixel 5 (393 × 851) minimum; ideally a real iPhone SE on iOS Safari 17+ for final sign-off.

- [ ] Landing `/` — no horizontal scroll; HeroOrb fits; headline is readable.
- [ ] Tap every primary CTA (Google / LinkedIn sign-in, "Create your orbis"). Target ≥ 44 × 44 px.
- [ ] `/myorbis` — header bar doesn't overflow; Tools hamburger opens; UserMenu dropdown is above the Orbis Pulse.
- [ ] `/myorbis` — Orbis Pulse compact mode works; tapping a card expands + doesn't overlap ChatBox.
- [ ] ChatBox — focus the input. Keyboard opens, input stays visible, no layout jump. Safe-area inset keeps the input above the home indicator on notched devices.
- [ ] Hover a graph node (touch-and-hold to emulate hover) — tooltip appears on screen, not clipped by edge. Release — tooltip dismisses.
- [ ] Open SharePanel → Copy URL + Show QR. Modal scrolls within itself; dismiss via X, backdrop, and ESC (hardware keyboard only).
- [ ] OS "reduce motion" on → HeroOrb animations pause.
- [ ] Rotate device to landscape at each checkpoint.
