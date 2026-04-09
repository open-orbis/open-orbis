# Agent Navigation Guide for OpenOrbis UX Evaluation

> Instructions for autonomous agents traversing the OpenOrbis user-flow map.
>
> **Prerequisites:** Read `docs/navigation-flow.md` (state diagram) and `docs/navigation-actions.yaml` (action catalog).

## Traversal Strategy

### 1. Happy Path (Full User Journey)

Execute these actions in order to cover the primary user flow:

```
LANDING
  -> Google Sign In -> AUTH_CALLBACK
  -> (if new user) CREATE -> CV_UPLOAD -> CV_REVIEW -> ORB_VIEW
  -> (if existing user) ORB_VIEW
```

Once on ORB_VIEW, execute:

```
1. Verify graph loaded (node count > 0)
2. If guided tour overlay appears -> complete it or skip it (new users only)
3. Click a node -> verify FloatingInput opens with correct data
4. Save edit -> verify graph refreshes
5. Add a new node via "+" -> fill required fields (red * indicators, date masking MM/YYYY) -> save
6. Verify undo button (teal) becomes active -> click undo -> verify node removed
7. Click redo (sky blue) -> verify node restored
8. Open Notes panel -> add a note -> enhance it -> add to graph
9. Open ChatBox -> search for a known skill -> verify highlights
10. Click a result -> verify camera centers on node
11. Click recenter button (crosshair, left of ChatBox) -> verify camera resets to center
12. Clear results -> verify camera resets
13. Open Share panel -> copy public link -> verify clipboard
14. Open Profile panel -> verify data matches orb
15. Open Account settings -> switch between tabs (Orbis ID, Versions, Account)
16. In Account Settings sidebar, click "Guided tour" -> verify tour starts immediately
17. Click Export -> verify new tab opens with CV preview
18. Import a document -> review -> confirm -> verify graph updated
19. Open UserMenu dropdown -> expand "My uploaded CVs" -> verify document list
20. Zoom in/out -> refresh page -> verify zoom level persisted
```

### 2. Edge Paths

After the happy path, cover these edge cases:

**Empty Orb Path:**
```
Create new user -> Choose "Build from scratch" -> Guided tour auto-starts
-> Complete or skip tour -> Verify empty graph hint
-> Add first node manually -> Verify graph updates
```

**Document Limit Path:**
```
Import 3 documents -> Attempt 4th import -> Verify limit warning modal
-> Confirm replacement -> Verify oldest document removed
```

**Account Deletion Path:**
```
Account settings -> Account tab -> Delete account -> Confirm
-> Verify toast "scheduled for deletion"
-> Re-login -> Verify deletion banner
-> Account settings -> Recover -> Verify banner removed
```

**Version Restore Path:**
```
Account settings -> Versions tab -> Save current version
-> Delete a node -> Save another version
-> Restore first version -> Verify deleted node is back
```

**Session Expiry Path:**
```
Invalidate JWT (e.g., clear localStorage token) -> Attempt API call
-> Verify redirect to LANDING with "Session expired" toast
```

**Shared Orb Path:**
```
Navigate to /:orbId -> Verify read-only graph loads
-> Search in ChatBox -> Click result -> Verify camera centers
-> Clear results -> Verify camera resets to center
-> Click "Create your own Orbis" -> Verify redirect to LANDING
```

**Filtered Shared Orb Path:**
```
On ORB_VIEW, add keyword filter -> Open Share -> Copy filtered link
-> Open filtered link in incognito -> Verify filtered nodes are hidden
```

### 3. Error Paths

**Invalid Orb ID:**
```
Navigate to /nonexistent-orb-id -> Verify "Orbis not found" page
```

**Bad File Upload:**
```
Upload a non-PDF file -> Verify error message
Upload a huge file (>10MB) -> Verify size error
Upload a PDF with no text -> Verify "no text extracted" error
```

**Network Error:**
```
Disconnect network -> Attempt action -> Verify toast notification
Reconnect -> Retry -> Verify recovery
```

## Stop Criteria

An agent should stop traversal when:

1. **All happy-path actions executed** and verified
2. **All edge paths attempted** at least once
3. **A blocking error occurs** that prevents further navigation (report it)
4. **A loop is detected** (same state visited 3+ times without progress)
5. **Time budget exhausted** (configurable, default 10 minutes)

## What to Log for UX Reporting

### Per Action

| Field | Description |
|-------|-------------|
| `action_id` | From `navigation-actions.yaml` (e.g., `ORB_ADD_NODE`) |
| `timestamp` | ISO timestamp of action execution |
| `duration_ms` | Time from action trigger to expected effect |
| `success` | Boolean — did the expected effect occur? |
| `screenshot` | Before + after screenshots (if available) |
| `error` | Error message if failed |

### UX Quality Metrics

| Metric | How to Measure |
|--------|---------------|
| **Latency** | Time from click/action to visual feedback (should be < 500ms for UI, < 3s for API) |
| **Confusion points** | States where the expected next action is unclear (no visible CTA, ambiguous labels) |
| **Dead ends** | States with no available forward action (no back button, no CTA) |
| **Broken flows** | Actions that fail silently (no error toast, no visual feedback) |
| **Inconsistencies** | Same action produces different results in different contexts |
| **Accessibility** | Missing labels, non-keyboard-navigable elements, insufficient contrast |
| **Mobile gaps** | Actions available on desktop but missing on mobile |

### Report Format

```yaml
session:
  start: "2026-04-09T10:00:00Z"
  end: "2026-04-09T10:08:32Z"
  agent: "ux-eval-v1"
  browser: "Chrome 130"
  viewport: "1440x900"

summary:
  actions_attempted: 47
  actions_succeeded: 45
  actions_failed: 2
  paths_covered: [happy, empty_orb, document_limit, shared_orb]
  paths_skipped: [account_deletion]

findings:
  - type: latency
    action_id: CV_UPLOAD_FILE
    details: "Extraction took 45s for a 3-page PDF"
    severity: medium

  - type: confusion
    state: CREATE
    details: "No back button to return to LANDING from path selection"
    severity: low

  - type: broken_flow
    action_id: DRAFT_DELETE_NOTE
    details: "Note reappears after refresh"
    severity: high

  - type: mobile_gap
    state: ORB_VIEW
    details: "Keyword filter not accessible in mobile tools menu"
    severity: medium
```

## Recommended Agent Configuration

```yaml
# Agent config
max_duration_seconds: 600
screenshot_on_failure: true
screenshot_on_transition: false  # Set true for full visual audit
retry_on_failure: 1
wait_for_network_idle: true
default_timeout_ms: 10000
cv_upload_timeout_ms: 120000  # CV extraction can be slow
```

## State Detection Heuristics

For agents that need to detect the current state programmatically:

| State | Detection Method |
|-------|-----------------|
| `LANDING` | URL is `/`, sign-in buttons visible |
| `CREATE` | URL is `/create`, path cards visible |
| `CV_UPLOAD` | Drag-and-drop zone visible |
| `CV_REVIEW` | "Found N entries" header visible |
| `ORB_VIEW` | URL is `/myorbis`, 3D graph canvas present |
| `SHARED_ORB` | URL matches `/:orbId`, "Create your own Orbis" link visible |
| `FLOATING_INPUT` | Node form overlay visible (type selector tabs) |
| `SHARE_PANEL` | QR code and "Public Link" label visible |
| `PROFILE_PANEL` | Profile image and social links visible |
| `ACCOUNT_SETTINGS` | "Account Settings" heading visible |
| `DRAFT_NOTES` | Notes panel with input field visible |
| `IMPORT_REVIEW` | "Found N entries" with "Cancel import" button visible |
| `IMPORT_LIMIT` | "Document limit reached" heading visible |
| `GUIDED_TOUR` | Joyride tooltip overlay visible with "Next" / "Skip tour" buttons and spotlight on a UI element |
| `LOADING` | Spinner animation visible |
| `EMPTY_ORB` | "Tap the + button" hint visible |
| `ORB_NOT_FOUND` | "Orbis not found" text visible |
