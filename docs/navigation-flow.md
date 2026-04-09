# OpenOrbis Navigation Flow Map

> Navigable user-flow map for agent-based UX evaluation. Covers all pages, modals, interactions, guards, and error states.
>
> **Last updated:** 2026-04-09 | **Issue:** #193

## How to Update This Map

When the UI changes:
1. Update the Mermaid diagram below (add/remove states and transitions)
2. Update `docs/navigation-actions.yaml` (add/remove action entries)
3. Commit both files together so they stay in sync
4. Use stable state IDs (e.g., `LANDING`, `ORB_VIEW`) so test scripts can reference them

---

## Page/State Diagram

```mermaid
stateDiagram-v2
    [*] --> LANDING: Open app

    %% ── Authentication ──
    state "Landing Page (/)" as LANDING
    state "Auth Callback (/auth/callback)" as AUTH_CALLBACK
    state "LinkedIn Callback (/auth/linkedin/callback)" as LINKEDIN_CALLBACK
    state "GDPR Consent Gate" as CONSENT_GATE
    state "Create Orb (/create)" as CREATE
    state "CV Upload Onboarding" as CV_UPLOAD
    state "Extracted Data Review" as CV_REVIEW
    state "Manual Build (guided)" as MANUAL_BUILD
    state "Orb View (/myorbis)" as ORB_VIEW
    state "Shared Orb (/:orbId)" as SHARED_ORB
    state "CV Export (/cv-export)" as CV_EXPORT
    state "About (/about)" as ABOUT
    state "Privacy (/privacy)" as PRIVACY

    %% ── Auth flows ──
    LANDING --> AUTH_CALLBACK: Google Sign In
    LANDING --> LINKEDIN_CALLBACK: LinkedIn Sign In
    AUTH_CALLBACK --> ORB_VIEW: Has orb content
    AUTH_CALLBACK --> CREATE: Empty orb
    LINKEDIN_CALLBACK --> ORB_VIEW: Has orb content
    LINKEDIN_CALLBACK --> CREATE: Empty orb

    %% ── Consent gate ──
    CREATE --> CONSENT_GATE: No GDPR consent
    CONSENT_GATE --> CREATE: Consent granted
    ORB_VIEW --> CONSENT_GATE: No GDPR consent (CV upload)

    %% ── Create flows ──
    CREATE --> CV_UPLOAD: Choose "Build from CV"
    CREATE --> ORB_VIEW: Choose "Build from scratch" (allowEmpty)
    CV_UPLOAD --> CV_REVIEW: Extraction complete
    CV_REVIEW --> ORB_VIEW: Confirm import
    CV_UPLOAD --> CV_UPLOAD: Extraction failed (retry)
    MANUAL_BUILD --> ORB_VIEW: Done / View My Orbis

    %% ── Orb View navigation ──
    ORB_VIEW --> CV_EXPORT: Export button (new tab)
    ORB_VIEW --> SHARED_ORB: Share link (public URL)
    ORB_VIEW --> CREATE: Orb is empty (auto-redirect)
    ORB_VIEW --> LANDING: Sign out

    %% ── Public pages ──
    LANDING --> ABOUT: About link
    LANDING --> PRIVACY: Privacy link
    LANDING --> SHARED_ORB: Public orb link
    SHARED_ORB --> LANDING: "Create your own Orbis" CTA

    %% ── Session expiry ──
    ORB_VIEW --> LANDING: Session expired
    CREATE --> LANDING: Session expired
    CV_EXPORT --> LANDING: Session expired
```

---

## OrbViewPage Interaction Map

```mermaid
stateDiagram-v2
    state "Orb View (main)" as MAIN

    %% ── Modals & Panels ──
    state "FloatingInput (Add/Edit Node)" as FLOATING_INPUT
    state "SharePanel (modal)" as SHARE_PANEL
    state "ProfilePanel (modal)" as PROFILE_PANEL
    state "AccountSettings (modal)" as ACCOUNT_SETTINGS
    state "DraftNotes (slide-out)" as DRAFT_NOTES
    state "Import Review (overlay)" as IMPORT_REVIEW
    state "Import Limit Warning (modal)" as IMPORT_LIMIT

    %% ── Tabs inside AccountSettings ──
    state ACCOUNT_SETTINGS {
        [*] --> OrbisID_Tab
        OrbisID_Tab --> Versions_Tab
        Versions_Tab --> Account_Tab
        Account_Tab --> OrbisID_Tab
        state "Orbis ID" as OrbisID_Tab
        state "Versions" as Versions_Tab
        state "Account" as Account_Tab
    }

    %% ── Transitions ──
    MAIN --> FLOATING_INPUT: Click node / Click "+" / Draft "Add to graph"
    FLOATING_INPUT --> MAIN: Save / Cancel / Delete
    MAIN --> SHARE_PANEL: Click Share
    SHARE_PANEL --> MAIN: Close
    MAIN --> PROFILE_PANEL: Click profile image
    PROFILE_PANEL --> MAIN: Close
    MAIN --> ACCOUNT_SETTINGS: UserMenu > Account settings
    ACCOUNT_SETTINGS --> MAIN: Close
    MAIN --> DRAFT_NOTES: Click Notes button
    DRAFT_NOTES --> MAIN: Close
    DRAFT_NOTES --> FLOATING_INPUT: Enhance note / Add to graph
    MAIN --> IMPORT_LIMIT: Import file (at 3 docs)
    IMPORT_LIMIT --> MAIN: Cancel
    IMPORT_LIMIT --> IMPORT_REVIEW: Replace & import
    MAIN --> IMPORT_REVIEW: Import file (under limit)
    IMPORT_REVIEW --> MAIN: Confirm / Cancel
```

---

## Guard & Decision Diagram

```mermaid
flowchart TD
    START[User opens app] --> AUTH{Authenticated?}
    AUTH -->|No| LANDING[Landing Page]
    AUTH -->|Yes| CONSENT{GDPR consent?}
    CONSENT -->|No| CONSENT_GATE[Consent Gate]
    CONSENT_GATE --> CONSENT_YES[Grant consent] --> HAS_ORB
    CONSENT -->|Yes| HAS_ORB{Orb has content?}
    HAS_ORB -->|Yes| ORB_VIEW[Orb View]
    HAS_ORB -->|No| CREATE[Create Orb]

    LANDING --> GOOGLE[Google Sign In]
    LANDING --> LINKEDIN[LinkedIn Sign In]
    GOOGLE --> CALLBACK[Auth Callback]
    LINKEDIN --> LI_CALLBACK[LinkedIn Callback]
    CALLBACK --> HAS_ORB
    LI_CALLBACK --> HAS_ORB

    ORB_VIEW --> IMPORT{Import document}
    IMPORT --> DOC_COUNT{Documents >= 3?}
    DOC_COUNT -->|Yes| LIMIT_WARN[Show limit warning]
    DOC_COUNT -->|No| EXTRACT[Extract & Review]
    LIMIT_WARN -->|Confirm| EXTRACT
    LIMIT_WARN -->|Cancel| ORB_VIEW

    ORB_VIEW --> DELETE_ACC{Delete account?}
    DELETE_ACC --> SCHEDULED[Scheduled for deletion]
    SCHEDULED --> GRACE[30-day grace period]
    GRACE -->|Recover| ORB_VIEW
    GRACE -->|Expired| PERMANENT_DELETE[Permanent deletion]
```

---

## States Reference

| State ID | Route | Auth Required | Description |
|----------|-------|---------------|-------------|
| `LANDING` | `/` | No | Marketing page + sign-in buttons |
| `AUTH_CALLBACK` | `/auth/callback` | No | OAuth code exchange, sets JWT |
| `LINKEDIN_CALLBACK` | `/auth/linkedin/callback` | No | LinkedIn OAuth code exchange |
| `CREATE` | `/create` | Yes | Path selection (CV upload vs manual) |
| `CV_UPLOAD` | `/create` (subview) | Yes | PDF drag-and-drop + progress |
| `CV_REVIEW` | `/create` (subview) | Yes | Review extracted nodes before confirm |
| `MANUAL_BUILD` | `/create` (subview) | Yes | Step-by-step guided node creation |
| `ORB_VIEW` | `/myorbis` | Yes | Main orb editor/dashboard |
| `SHARED_ORB` | `/:orbId` | No | Public read-only orb view |
| `CV_EXPORT` | `/cv-export` | Yes | PDF CV generation and preview |
| `ABOUT` | `/about` | No | About page |
| `PRIVACY` | `/privacy` | No | Privacy policy |
| `CONSENT_GATE` | (overlay) | Yes | GDPR consent checkbox |
| `FLOATING_INPUT` | (modal on ORB_VIEW) | Yes | Add/edit node form |
| `SHARE_PANEL` | (modal on ORB_VIEW) | Yes | Share links + QR code |
| `PROFILE_PANEL` | (modal on ORB_VIEW) | Yes | Edit profile + social links |
| `ACCOUNT_SETTINGS` | (modal on ORB_VIEW) | Yes | Orbis ID, Versions, Account tabs |
| `DRAFT_NOTES` | (panel on ORB_VIEW) | Yes | Draft notes list + management |
| `IMPORT_REVIEW` | (overlay on ORB_VIEW) | Yes | Review imported document data |
| `IMPORT_LIMIT` | (modal on ORB_VIEW) | Yes | Document limit confirmation |

---

## Error & Edge States

| State | Trigger | UI Display | Recovery |
|-------|---------|-----------|----------|
| `LOADING` | Initial page load, API call | Spinner animation | Wait for completion |
| `EMPTY_ORB` | New user, no nodes | Hint message + arrow to "+" | Add first node |
| `ORB_NOT_FOUND` | Invalid `/:orbId` | "Orbis not found" page | Navigate to `/` |
| `IMPORT_FAILED` | PDF extraction error | Toast + error message | Retry upload |
| `API_ERROR` | Network/server failure | Toast notification | Retry action |
| `SESSION_EXPIRED` | JWT invalidated | Toast + redirect to `/` | Re-login |
| `ACCOUNT_PENDING_DELETION` | User deleted account | Banner + grayed features | Recover from Account tab |
| `CV_NO_TEXT` | PDF has no extractable text | Error message | Try different file |
| `CV_TIMEOUT` | Extraction takes >30min | 504 timeout error | Retry with smaller file |
