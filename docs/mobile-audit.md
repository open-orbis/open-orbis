# Mobile Audit — Orbis

> Status snapshot of every navigation state + critical action on mobile viewports (360 / 375 / 414 px). Rows derive from `docs/navigation-flow.md` and `docs/navigation-actions.yaml` — keep this file in sync when those change.
>
> **Status key:** `Pass` = works correctly on all three viewports. `Fail` = at least one visible defect. `Deferred-#NNN` = known issue, follow-up issue filed.
>
> **Tooling:** Chrome DevTools device emulation (iPhone SE 375×667, Pixel 5 393×851, Galaxy S8+ 360×740). Touch emulation ON. iOS Safari 17 + Android Chrome 130 for the final manual pass before shipping.

## States

| State | 360 | 375 | 414 | Notes |
|---|---|---|---|---|
| LANDING | Fail | Fail | Pass | HeroOrb `w-96` = 384 px overflows at 360 / 375 — Task 4 |
| AUTH_CALLBACK | Pass | Pass | Pass | Just a loader |
| LINKEDIN_CALLBACK | Pass | Pass | Pass | Just a loader |
| ACTIVATION | Pass | Pass | Pass | Single form, already `px-*` safe |
| CREATE | Pass | Pass | Pass | Two stacking PathCards |
| CV_UPLOAD | Pass | Pass | Pass | Drag-and-drop area fills width |
| CV_REVIEW | Fail | Fail | Fail | Long tabbed lists — deferred-to-follow-up; file as separate issue |
| ORB_VIEW | Fail | Fail | Pass | Header bar, ChatBox keyboard, NodeTooltip off-screen — Tasks 3, 5, 6 |
| SHARED_ORB | Fail | Fail | Pass | Same NodeTooltip bug + chat overlay sizing |
| CV_EXPORT | Pass | Pass | Pass | Print stylesheet; tolerable |
| ADMIN | Deferred | Deferred | Deferred | Admin is desktop-first by design; no priority |

## Critical actions

| Action ID | State | 360 | 375 | 414 | Notes |
|---|---|---|---|---|---|
| LANDING_GOOGLE_LOGIN | LANDING | Pass | Pass | Pass | Button ≥ 44 px, responsive |
| ORB_NODE_CLICK | ORB_VIEW | Pass | Pass | Pass | Large tap target on 3D canvas |
| ORB_ADD_NODE (+) | ORB_VIEW | Pass | Pass | Pass | Floating button 44 px |
| SHARE_PANEL open | ORB_VIEW | Pass | Pass | Pass | Modal fills screen on mobile |
| SHARE_SHOW_QR | SHARE_PANEL | Pass | Pass | Pass | `QrShareModal` uses `92vw` |
| SHARE_COPY_LINK | SHARE_PANEL | Pass | Pass | Pass | Button + input inline |
| CONNECTIONS_OPEN | ORB_VIEW | Deferred | Deferred | Deferred | Dropdown is `hidden lg:block` — no mobile UI yet |
| User-menu dropdown | ORB_VIEW | Pass | Pass | Pass | z-index already fixed in previous PR |
| ChatBox submit | ORB_VIEW | Fail | Fail | Pass | Keyboard pushes layout, no safe-area inset — Task 6 |
| Node hover tooltip | ORB_VIEW | Fail | Fail | Pass | NodeTooltip clamp uses fixed 420 px — Task 3 |

## Cross-cutting

| Check | Status | Notes |
|---|---|---|
| Viewport meta includes `viewport-fit=cover` | Fail | Task 2 |
| `env(safe-area-inset-*)` consumed somewhere | Fail | Task 2 |
| All tap targets ≥ 44×44 px | Partial | Visual audit deferred to Task 5 |
| Inputs ≥ 16 px font-size (no iOS zoom-on-focus) | Pass | Verified via search for `text-xs` on `<input>` — only `text-sm` + `text-base` on form inputs |
| Horizontal scroll absent at 360 px | Fail | Hero overflow (Task 4), other cases deferred |
| Hover-only affordances | Pass | Tooltips trigger on touch via graph lib; settings dropdowns toggle on tap |
