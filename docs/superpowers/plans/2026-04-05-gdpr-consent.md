# GDPR Consent Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GDPR consent gate that blocks personal data creation (CV upload and manual entry) until the user explicitly consents, with backend enforcement and consent stored in Neo4j.

**Architecture:** Frontend ConsentGate component wraps the path selection on CreateOrbPage. Backend stores consent as properties on the Person node and enforces it on CV endpoints. `/auth/me` returns consent status so the gate can be skipped for returning users.

**Tech Stack:** FastAPI, Neo4j, React, Zustand, Tailwind CSS

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/components/onboarding/ConsentGate.tsx` | Consent checkbox UI, calls backend, wraps children |
| `backend/tests/unit/test_gdpr_consent.py` | Tests for consent endpoint and CV router guard |

### Modified Files

| File | Change |
|------|--------|
| `backend/app/auth/models.py:4-8` | Add `gdpr_consent: bool` to `UserInfo` |
| `backend/app/auth/router.py` | Add `POST /auth/gdpr-consent` endpoint, update `/auth/me` to return consent |
| `backend/app/cv/router.py:30-34,99-104` | Add consent check to `upload_cv` and `confirm_cv` |
| `frontend/src/api/auth.ts:3-8` | Add `gdpr_consent: boolean` to `UserInfo` interface |
| `frontend/src/api/auth.ts` | Add `grantGdprConsent()` API function |
| `frontend/src/stores/authStore.ts` | No change needed — already stores full `UserInfo` object |
| `frontend/src/pages/CreateOrbPage.tsx:103-118` | Wrap path selector with `<ConsentGate>` |
| `backend/tests/unit/conftest.py:73-77` | Update test fixture to include `gdpr_consent` in mock user |

---

### Task 1: Backend — Add `gdpr_consent` to UserInfo Model

**Files:**
- Modify: `backend/app/auth/models.py:4-8`

- [ ] **Step 1: Add gdpr_consent field to UserInfo**

In `backend/app/auth/models.py`, add the field to the `UserInfo` model:

```python
class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    gdpr_consent: bool = False
```

- [ ] **Step 2: Verify import works**

Run: `cd /Users/alessandro/orb_project/backend && python -c "from app.auth.models import UserInfo; print(UserInfo(user_id='x', email='x', name='x').gdpr_consent)"`
Expected: `False`

- [ ] **Step 3: Commit**

```bash
git add backend/app/auth/models.py
git commit -m "feat: add gdpr_consent field to UserInfo model"
```

---

### Task 2: Backend — Add Consent Endpoint and Update /auth/me

**Files:**
- Modify: `backend/app/auth/router.py`
- Create: `backend/tests/unit/test_gdpr_consent.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/unit/test_gdpr_consent.py`:

```python
from unittest.mock import AsyncMock

from tests.unit.conftest import MockNode


def test_grant_gdpr_consent(client, mock_db):
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value = AsyncMock()

    response = client.post("/auth/gdpr-consent")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Verify the Cypher query sets gdpr_consent
    call_args = session_mock.run.call_args
    assert "gdpr_consent" in call_args[0][0]
    assert call_args[1]["user_id"] == "test-user"


def test_get_me_returns_gdpr_consent(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={
                "p": MockNode(
                    {"user_id": "test-user", "name": "Test User", "gdpr_consent": True}
                )
            }
        )
    )

    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["gdpr_consent"] is True


def test_get_me_defaults_consent_to_false(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={
                "p": MockNode(
                    {"user_id": "test-user", "name": "Test User"}
                )
            }
        )
    )

    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["gdpr_consent"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_gdpr_consent.py -v`
Expected: FAIL — `test_grant_gdpr_consent` fails because the endpoint doesn't exist yet

- [ ] **Step 3: Add consent endpoint and update /auth/me**

In `backend/app/auth/router.py`, add the import for `datetime`:

```python
from datetime import datetime, timezone
```

Add the consent endpoint after the existing `get_me` function:

```python
@router.post("/gdpr-consent")
async def grant_gdpr_consent(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Record GDPR consent for the current user."""
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "SET p.gdpr_consent = true, p.gdpr_consent_at = $now",
            user_id=current_user["user_id"],
            now=datetime.now(timezone.utc).isoformat(),
        )
    return {"status": "ok"}
```

Update the `get_me` function to include `gdpr_consent` in the response. Replace the return statement:

```python
        return UserInfo(
            user_id=person["user_id"],
            email=current_user["email"],
            name=person.get("name", ""),
            gdpr_consent=bool(person.get("gdpr_consent", False)),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_gdpr_consent.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/router.py backend/tests/unit/test_gdpr_consent.py
git commit -m "feat: add GDPR consent endpoint and return consent in /auth/me"
```

---

### Task 3: Backend — Enforce Consent on CV Endpoints

**Files:**
- Modify: `backend/app/cv/router.py:30-34,99-104`
- Modify: `backend/tests/unit/test_gdpr_consent.py` (add tests)
- Modify: `backend/tests/unit/conftest.py:73-77` (update fixture)

- [ ] **Step 1: Add consent enforcement tests**

Append to `backend/tests/unit/test_gdpr_consent.py`:

```python
from io import BytesIO
from unittest.mock import patch, MagicMock


@patch("app.cv.router.docling_extract")
@patch("app.cv.router.classify_entries")
@patch("app.cv.router.counter")
def test_upload_cv_rejected_without_consent(mock_counter, mock_classify, mock_docling, client, mock_db):
    # User has NOT consented
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(
        return_value={"consent": False}
    )

    file_content = b"%PDF-1.4 test content"
    file = BytesIO(file_content)

    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]


def test_confirm_cv_rejected_without_consent(client, mock_db):
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(
        return_value={"consent": False}
    )

    response = client.post(
        "/cv/confirm",
        json={"nodes": [], "relationships": []},
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]
```

- [ ] **Step 2: Run new tests to verify they fail**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_gdpr_consent.py::test_upload_cv_rejected_without_consent tests/unit/test_gdpr_consent.py::test_confirm_cv_rejected_without_consent -v`
Expected: FAIL — endpoints don't check consent yet

- [ ] **Step 3: Add consent check to CV router**

In `backend/app/cv/router.py`, add import at the top (after existing imports):

```python
from neo4j import AsyncDriver
```

Note: `AsyncDriver` may already be imported via `get_db`. Check and add only if needed. Also add `get_db` to the imports from dependencies if not already there.

Add the consent check helper function after the router definition (after line 27):

```python
async def _require_consent(current_user: dict, db: AsyncDriver) -> None:
    """Raise 403 if user hasn't given GDPR consent."""
    async with db.session() as session:
        result = await session.run(
            "MATCH (p:Person {user_id: $user_id}) RETURN p.gdpr_consent AS consent",
            user_id=current_user["user_id"],
        )
        record = await result.single()
        if not record or not record["consent"]:
            raise HTTPException(status_code=403, detail="GDPR consent required")
```

Add `db: AsyncDriver = Depends(get_db)` parameter to `upload_cv` and call `_require_consent` at the top:

```python
@router.post("/upload", response_model=ExtractedData)
async def upload_cv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Upload a PDF CV: extract text via Docling, classify via LLM."""
    await _require_consent(current_user, db)
    if not file.filename:
```

Add the same `_require_consent` call at the top of `confirm_cv` (it already has `db`):

```python
@router.post("/confirm")
async def confirm_cv(
    data: ConfirmRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Persist confirmed CV nodes to Neo4j with dedup and cross-entity linking."""
    await _require_consent(current_user, db)
    created: list[str | None] = []
```

- [ ] **Step 4: Update test fixture to include consent by default**

In `backend/tests/unit/conftest.py`, the existing `client` fixture mocks `get_current_user`. The CV tests also need the consent check to pass. Update the mock_db fixture so that by default the consent query returns True.

This is handled automatically because the existing test for `test_upload_cv_success` uses `mock_db` which returns whatever is configured per-test. The new consent check runs a separate `session.run()` call. Since mock_db's session mock returns a generic AsyncMock for `run()`, the consent check's `result.single()` will return an AsyncMock (truthy), and `record["consent"]` will also be an AsyncMock (truthy). This means existing tests will pass without changes.

Verify by running the full test suite.

- [ ] **Step 5: Run all tests to verify**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/test_gdpr_consent.py tests/unit/test_cv_router.py -v --tb=short`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/cv/router.py backend/tests/unit/test_gdpr_consent.py
git commit -m "feat: enforce GDPR consent on CV upload and confirm endpoints"
```

---

### Task 4: Frontend — Add `gdpr_consent` to UserInfo and API Function

**Files:**
- Modify: `frontend/src/api/auth.ts`

- [ ] **Step 1: Update UserInfo interface and add API function**

In `frontend/src/api/auth.ts`, add `gdpr_consent` to the interface and add the consent API function:

```typescript
import client from './client';

export interface UserInfo {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  gdpr_consent: boolean;
}

export async function getMe(): Promise<UserInfo> {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function devLogin(): Promise<{ access_token: string; user: UserInfo }> {
  const { data } = await client.post('/auth/dev-login');
  return data;
}

export async function grantGdprConsent(): Promise<void> {
  await client.post('/auth/gdpr-consent');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/alessandro/orb_project/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/auth.ts
git commit -m "feat: add gdpr_consent to UserInfo and grantGdprConsent API"
```

---

### Task 5: Frontend — Create ConsentGate Component

**Files:**
- Create: `frontend/src/components/onboarding/ConsentGate.tsx`

- [ ] **Step 1: Create the ConsentGate component**

Create `frontend/src/components/onboarding/ConsentGate.tsx`:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import { grantGdprConsent } from '../../api/auth';

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (user?.gdpr_consent) {
    return <>{children}</>;
  }

  const handleConsent = async () => {
    setSubmitting(true);
    setError('');
    try {
      await grantGdprConsent();
      await fetchUser();
    } catch {
      setError('Failed to save consent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-semibold">Before we start</h2>
          <p className="text-white/30 text-sm mt-2">
            We need your consent to process and store your personal data.
          </p>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 focus:ring-1"
            />
            <span className="text-white/60 text-sm leading-relaxed">
              I consent to OpenOrbis processing and storing my personal data as described in the{' '}
              <a href="/privacy" target="_blank" className="text-purple-400 hover:text-purple-300 underline">
                Privacy Policy
              </a>.
            </span>
          </label>
        </div>

        {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

        <button
          onClick={handleConsent}
          disabled={!checked || submitting}
          className="w-full mt-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-semibold py-3 rounded-xl transition-all text-base"
        >
          {submitting ? 'Saving...' : 'Continue'}
        </button>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/alessandro/orb_project/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/ConsentGate.tsx
git commit -m "feat: add ConsentGate component for GDPR consent"
```

---

### Task 6: Frontend — Wire ConsentGate into CreateOrbPage

**Files:**
- Modify: `frontend/src/pages/CreateOrbPage.tsx:1-10,103-118`

- [ ] **Step 1: Add import and wrap path selector**

In `frontend/src/pages/CreateOrbPage.tsx`, add the import after the existing imports (after line 9):

```typescript
import ConsentGate from '../components/onboarding/ConsentGate';
```

Find the path selector section (around line 103-118). The current code is:

```tsx
  if (!selectedPath) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <motion.div
          ...
        >
          <h1 ...>How do you want to build your orb?</h1>
          ...
        </motion.div>

        <motion.div
          ...
          className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl"
        >
          <PathCard ... />
```

Wrap the entire return block for `!selectedPath` with `<ConsentGate>`:

```tsx
  if (!selectedPath) {
    return (
      <ConsentGate>
        <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
          <motion.div
```

And close it before the corresponding `</div>` and closing parenthesis:

```tsx
        </motion.div>
      </ConsentGate>
    );
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/alessandro/orb_project/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CreateOrbPage.tsx
git commit -m "feat: wrap CreateOrbPage path selector with ConsentGate"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/alessandro/orb_project/backend && python -m pytest tests/unit/ -v --tb=short`
Expected: All tests pass (except pre-existing fpdf failures)

- [ ] **Step 2: Run TypeScript check**

Run: `cd /Users/alessandro/orb_project/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run backend lint**

Run: `cd /Users/alessandro/orb_project/backend && python -m ruff check app/auth/ app/cv/`
Expected: All checks passed

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any verification issues"
```
