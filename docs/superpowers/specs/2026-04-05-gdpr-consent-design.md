# GDPR Consent Checkbox Before Data Creation

**Issue:** #89 — Add GDPR consent checkbox before CV upload
**Date:** 2026-04-05
**Scope:** Consent gate before any personal data creation (CV upload or manual entry)

---

## Overview

Add a GDPR consent gate on CreateOrbPage that blocks both CV upload and manual node entry until the user explicitly consents to data processing. Consent is stored in the user's Person node in Neo4j and enforced by the backend. Once given, the user is never asked again unless they revoke consent.

## Consent Flow

1. User logs in via Google OAuth, navigates to `/create`
2. CreateOrbPage checks if `user.gdpr_consent` is true (from `/auth/me`)
3. If not consented: a ConsentGate overlay appears before the path selection cards
4. User checks the checkbox: *"I consent to OpenOrbis processing and storing my personal data as described in the [Privacy Policy](/privacy)"*
5. On check + click "Continue": frontend calls `POST /auth/gdpr-consent`
6. Backend sets `gdpr_consent = true` and `gdpr_consent_at = <ISO timestamp>` on the Person node
7. Frontend updates authStore, ConsentGate disappears, path selection cards become visible
8. On subsequent visits, `/auth/me` returns `gdpr_consent: true` — gate is skipped

## Backend Changes

### Person Node Properties (Neo4j)

Two new properties on the Person node:
- `gdpr_consent`: boolean (default: not set / false)
- `gdpr_consent_at`: ISO 8601 timestamp string (set when consent is given)

### New Endpoint: `POST /auth/gdpr-consent`

Requires user JWT. Sets consent on the Person node.

```python
@router.post("/gdpr-consent")
async def grant_gdpr_consent(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "SET p.gdpr_consent = true, p.gdpr_consent_at = $now",
            user_id=current_user["user_id"],
            now=datetime.now(timezone.utc).isoformat(),
        )
    return {"status": "ok"}
```

### `/auth/me` Response Change

Add `gdpr_consent: bool` to the `UserInfo` model and query it from the Person node.

Current `UserInfo`:
```python
class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str | None = None
```

Updated:
```python
class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str | None = None
    gdpr_consent: bool = False
```

The `/auth/me` handler reads `gdpr_consent` from the Person node properties.

### CV Router Guard

`POST /cv/upload` and `POST /cv/confirm` check consent before processing:

```python
async def _require_consent(current_user: dict, db: AsyncDriver) -> None:
    async with db.session() as session:
        result = await session.run(
            "MATCH (p:Person {user_id: $user_id}) RETURN p.gdpr_consent AS consent",
            user_id=current_user["user_id"],
        )
        record = await result.single()
        if not record or not record["consent"]:
            raise HTTPException(status_code=403, detail="GDPR consent required")
```

Called at the top of both `upload_cv` and `confirm_cv` handlers.

## Frontend Changes

### `UserInfo` Type Update

Add `gdpr_consent: boolean` to the `UserInfo` interface in `api/auth.ts`.

### ConsentGate Component

New component `frontend/src/components/onboarding/ConsentGate.tsx`:

- Receives `children` (the path selection cards)
- Reads `user.gdpr_consent` from authStore
- If true: renders children directly
- If false: renders a consent card with:
  - Checkbox with label text linking to `/privacy`
  - "Continue" button (disabled until checkbox is checked)
  - On click: calls `POST /auth/gdpr-consent`, updates authStore, renders children

### CreateOrbPage Integration

Wrap the path selection section in CreateOrbPage with `<ConsentGate>`:

```tsx
<ConsentGate>
  {/* existing path cards (CV upload / manual entry) */}
</ConsentGate>
```

No changes to CVUploadOnboarding or the manual entry flow — the gate is upstream.

## What This Does NOT Include

- Privacy policy page content (separate task — the consent links to `/privacy` which should exist)
- Consent revocation / right to be forgotten (separate task — requires data deletion flow)
- Cookie consent banner (separate concern — not related to CV data processing)

## Acceptance Criteria

- [ ] ConsentGate appears before path selection on CreateOrbPage for users who haven't consented
- [ ] Checkbox must be checked before "Continue" button is enabled
- [ ] `POST /auth/gdpr-consent` stores consent + timestamp on Person node
- [ ] `/auth/me` returns `gdpr_consent: true` after consent is given
- [ ] ConsentGate is skipped on subsequent visits for users who already consented
- [ ] `POST /cv/upload` returns 403 if user hasn't consented
- [ ] `POST /cv/confirm` returns 403 if user hasn't consented
- [ ] Existing tests continue to pass (test fixtures include consent by default)
