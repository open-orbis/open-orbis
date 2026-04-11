# Connection Request Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authenticated visitors to request access to restricted orbs, with owner approval/rejection and filter configuration.

**Architecture:** New `ConnectionRequest` Neo4j node linked to the owner's Person. Service layer in `connection_requests.py` follows the `access_grants.py` pattern. On accept, reuses `create_access_grant` to produce an AccessGrant. Frontend adds a "Request Access" button to SharedOrbPage and a "Pending Requests" section to the OrbViewPage restricted modal.

**Tech Stack:** Python/FastAPI, Neo4j (Cypher), React/TypeScript

---

### Task 1: Add Neo4j schema and Cypher queries

**Files:**
- Modify: `infra/neo4j/init.cypher`
- Modify: `backend/app/graph/queries.py`

- [ ] **Step 1: Add constraints and indexes to `infra/neo4j/init.cypher`**

Append at the end:

```cypher
// Connection requests for restricted orbs
CREATE CONSTRAINT connection_request_id IF NOT EXISTS FOR (cr:ConnectionRequest) REQUIRE cr.request_id IS UNIQUE;
CREATE INDEX connection_request_status IF NOT EXISTS FOR (cr:ConnectionRequest) ON (cr.status);
CREATE INDEX connection_request_requester IF NOT EXISTS FOR (cr:ConnectionRequest) ON (cr.requester_user_id);
```

- [ ] **Step 2: Add Cypher queries to `backend/app/graph/queries.py`**

Append after the Access Grants section:

```python
# ── Connection Requests ──

CREATE_CONNECTION_REQUEST = """
MATCH (p:Person {orb_id: $orb_id})
WHERE p.visibility = 'restricted'
OPTIONAL MATCH (p)-[:HAS_CONNECTION_REQUEST]->(existing:ConnectionRequest {
    requester_user_id: $requester_user_id, status: 'pending'
})
WITH p, existing
WHERE existing IS NULL
CREATE (p)-[:HAS_CONNECTION_REQUEST]->(cr:ConnectionRequest {
    request_id: $request_id,
    requester_user_id: $requester_user_id,
    requester_email: $requester_email,
    requester_name: $requester_name,
    status: 'pending',
    created_at: datetime(),
    resolved_at: null
})
RETURN cr, p.user_id AS owner_user_id
"""

GET_CONNECTION_REQUEST_BY_REQUESTER = """
MATCH (p:Person {orb_id: $orb_id})-[:HAS_CONNECTION_REQUEST]->(cr:ConnectionRequest {
    requester_user_id: $requester_user_id, status: 'pending'
})
RETURN cr
"""

LIST_PENDING_CONNECTION_REQUESTS = """
MATCH (p:Person {user_id: $user_id})-[:HAS_CONNECTION_REQUEST]->(cr:ConnectionRequest {status: 'pending'})
RETURN cr
ORDER BY cr.created_at DESC
"""

UPDATE_CONNECTION_REQUEST_STATUS = """
MATCH (p:Person {user_id: $user_id})-[:HAS_CONNECTION_REQUEST]->(cr:ConnectionRequest {request_id: $request_id})
WHERE cr.status = 'pending'
SET cr.status = $status, cr.resolved_at = datetime()
RETURN cr
"""
```

- [ ] **Step 3: Run init.cypher against Neo4j**

```bash
cat infra/neo4j/init.cypher | docker exec -i orb_project-neo4j-1 cypher-shell -u neo4j -p orbis_dev_password
```

- [ ] **Step 4: Commit**

```bash
git add infra/neo4j/init.cypher backend/app/graph/queries.py
git commit -m "feat: add ConnectionRequest schema and Cypher queries (#264)"
```

---

### Task 2: Create connection request service

**Files:**
- Create: `backend/app/orbs/connection_requests.py`
- Create: `backend/tests/unit/test_connection_requests.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/unit/test_connection_requests.py
from unittest.mock import AsyncMock, MagicMock

import pytest


def _mock_db(records=None, single=None):
    mock_session = AsyncMock()
    mock_result = AsyncMock()
    if single is not None:
        mock_result.single.return_value = single
    if records is not None:
        mock_result.__aiter__ = lambda self: iter(records)
    mock_session.run.return_value = mock_result
    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)
    return mock_db, mock_session


@pytest.mark.asyncio
async def test_create_connection_request_success():
    cr_node = {
        "request_id": "req-1",
        "requester_user_id": "user-2",
        "requester_email": "bob@example.com",
        "requester_name": "Bob",
        "status": "pending",
        "created_at": "2026-04-11T00:00:00Z",
        "resolved_at": None,
    }
    db, session = _mock_db(single={"cr": cr_node, "owner_user_id": "user-1"})

    from app.orbs.connection_requests import create_connection_request

    result = await create_connection_request(
        db=db, orb_id="test-orb",
        user={"user_id": "user-2", "email": "bob@example.com", "name": "Bob"},
    )
    assert result is not None
    assert result["request_id"] == "req-1"
    assert result["status"] == "pending"


@pytest.mark.asyncio
async def test_create_connection_request_duplicate_returns_none():
    db, session = _mock_db(single=None)

    from app.orbs.connection_requests import create_connection_request

    result = await create_connection_request(
        db=db, orb_id="test-orb",
        user={"user_id": "user-2", "email": "bob@example.com", "name": "Bob"},
    )
    assert result is None


@pytest.mark.asyncio
async def test_get_my_connection_request():
    cr_node = {"request_id": "req-1", "status": "pending", "created_at": "2026-04-11T00:00:00Z", "resolved_at": None}
    db, _ = _mock_db(single={"cr": cr_node})

    from app.orbs.connection_requests import get_my_connection_request

    result = await get_my_connection_request(db=db, orb_id="test-orb", user_id="user-2")
    assert result is not None
    assert result["status"] == "pending"


@pytest.mark.asyncio
async def test_list_pending_requests():
    cr1 = MagicMock()
    cr1.__getitem__ = lambda self, key: {"request_id": "req-1", "requester_email": "a@b.com", "status": "pending", "created_at": "2026-04-11T00:00:00Z", "resolved_at": None}[key]
    db, _ = _mock_db(records=[{"cr": cr1}])

    from app.orbs.connection_requests import list_pending_requests

    result = await list_pending_requests(db=db, user_id="user-1")
    assert len(result) == 1


@pytest.mark.asyncio
async def test_accept_request():
    cr_node = {"request_id": "req-1", "requester_email": "bob@example.com", "status": "accepted"}
    db, _ = _mock_db(single={"cr": cr_node})

    from app.orbs.connection_requests import accept_request

    result = await accept_request(
        db=db, user_id="user-1", request_id="req-1",
        keywords=["python"], hidden_node_types=["Skill"],
    )
    assert result is not None


@pytest.mark.asyncio
async def test_reject_request():
    cr_node = {"request_id": "req-1", "status": "rejected"}
    db, _ = _mock_db(single={"cr": cr_node})

    from app.orbs.connection_requests import reject_request

    result = await reject_request(db=db, user_id="user-1", request_id="req-1")
    assert result is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_connection_requests.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Create the service**

```python
# backend/app/orbs/connection_requests.py
"""Connection request service for restricted orbs."""

from __future__ import annotations

import logging
import uuid

from neo4j import AsyncDriver
from neo4j.time import DateTime as Neo4jDateTime

from app.graph.queries import (
    CREATE_CONNECTION_REQUEST,
    GET_CONNECTION_REQUEST_BY_REQUESTER,
    LIST_PENDING_CONNECTION_REQUESTS,
    UPDATE_CONNECTION_REQUEST_STATUS,
)
from app.orbs.access_grants import create_access_grant

logger = logging.getLogger(__name__)


def _sanitize(d: dict) -> dict:
    result = {}
    for k, v in d.items():
        if isinstance(v, Neo4jDateTime):
            result[k] = v.iso_format()
        else:
            result[k] = v
    return result


async def create_connection_request(
    db: AsyncDriver,
    orb_id: str,
    user: dict,
) -> dict | None:
    """Create a pending connection request. Returns None if duplicate."""
    request_id = str(uuid.uuid4())
    async with db.session() as session:
        result = await session.run(
            CREATE_CONNECTION_REQUEST,
            request_id=request_id,
            orb_id=orb_id,
            requester_user_id=user["user_id"],
            requester_email=(user.get("email") or "").strip().lower(),
            requester_name=user.get("name") or "",
        )
        record = await result.single()
        if record is None:
            return None
        return _sanitize(dict(record["cr"]))


async def get_my_connection_request(
    db: AsyncDriver,
    orb_id: str,
    user_id: str,
) -> dict | None:
    """Get the current user's pending request for an orb."""
    async with db.session() as session:
        result = await session.run(
            GET_CONNECTION_REQUEST_BY_REQUESTER,
            orb_id=orb_id,
            requester_user_id=user_id,
        )
        record = await result.single()
        if record is None:
            return None
        return _sanitize(dict(record["cr"]))


async def list_pending_requests(
    db: AsyncDriver,
    user_id: str,
) -> list[dict]:
    """List all pending connection requests for the owner's orb."""
    async with db.session() as session:
        result = await session.run(
            LIST_PENDING_CONNECTION_REQUESTS,
            user_id=user_id,
        )
        return [_sanitize(dict(r["cr"])) async for r in result]


async def accept_request(
    db: AsyncDriver,
    user_id: str,
    request_id: str,
    keywords: list[str] | None = None,
    hidden_node_types: list[str] | None = None,
) -> dict | None:
    """Accept a request: update status and create an AccessGrant."""
    async with db.session() as session:
        result = await session.run(
            UPDATE_CONNECTION_REQUEST_STATUS,
            user_id=user_id,
            request_id=request_id,
            status="accepted",
        )
        record = await result.single()
        if record is None:
            return None
        cr = _sanitize(dict(record["cr"]))

    # Create AccessGrant for the requester
    grant = await create_access_grant(
        db=db,
        user_id=user_id,
        email=cr["requester_email"],
        keywords=keywords,
        hidden_node_types=hidden_node_types,
    )
    return grant


async def reject_request(
    db: AsyncDriver,
    user_id: str,
    request_id: str,
) -> dict | None:
    """Reject a connection request."""
    async with db.session() as session:
        result = await session.run(
            UPDATE_CONNECTION_REQUEST_STATUS,
            user_id=user_id,
            request_id=request_id,
            status="rejected",
        )
        record = await result.single()
        if record is None:
            return None
        return _sanitize(dict(record["cr"]))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_connection_requests.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/orbs/connection_requests.py backend/tests/unit/test_connection_requests.py
git commit -m "feat: add connection request service (#264)"
```

---

### Task 3: Add backend endpoints

**Files:**
- Modify: `backend/app/orbs/models.py` — add request/response models
- Modify: `backend/app/orbs/router.py` — add endpoints

- [ ] **Step 1: Add Pydantic models to `backend/app/orbs/models.py`**

Append after the AccessGrant models:

```python
# ── Connection Requests ──


class ConnectionRequestResponse(BaseModel):
    request_id: str
    requester_user_id: str
    requester_email: str
    requester_name: str
    status: str
    created_at: str
    resolved_at: str | None = None


class ConnectionRequestListResponse(BaseModel):
    requests: list[ConnectionRequestResponse]


class AcceptConnectionRequestBody(BaseModel):
    keywords: list[str] = []
    hidden_node_types: list[str] = []
```

- [ ] **Step 2: Add endpoints to `backend/app/orbs/router.py`**

Add imports at the top:

```python
from app.orbs.connection_requests import (
    accept_request,
    create_connection_request,
    get_my_connection_request,
    list_pending_requests,
    reject_request,
)
from app.orbs.models import (
    AcceptConnectionRequestBody,
    ConnectionRequestListResponse,
    ConnectionRequestResponse,
)
```

Add endpoints after the access grants section:

```python
# ── Connection Requests ──


@router.post("/{orb_id}/connection-requests", response_model=ConnectionRequestResponse, status_code=201)
async def request_access(
    orb_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Request access to a restricted orb."""
    result = await create_connection_request(db=db, orb_id=orb_id, user=current_user)
    if result is None:
        raise HTTPException(status_code=409, detail="Request already pending or orb not restricted")
    return result


@router.get("/{orb_id}/connection-requests/me", response_model=ConnectionRequestResponse)
async def get_my_request(
    orb_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Check if the current user has a pending request for this orb."""
    result = await get_my_connection_request(db=db, orb_id=orb_id, user_id=current_user["user_id"])
    if result is None:
        raise HTTPException(status_code=404, detail="No pending request")
    return result


@router.get("/me/connection-requests", response_model=ConnectionRequestListResponse)
async def list_my_connection_requests(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """List pending connection requests for the current user's orb."""
    requests = await list_pending_requests(db=db, user_id=current_user["user_id"])
    return {"requests": requests}


@router.post("/me/connection-requests/{request_id}/accept", response_model=AccessGrantResponse)
async def accept_connection_request(
    request_id: str,
    data: AcceptConnectionRequestBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Accept a connection request and create an access grant with optional filters."""
    grant = await accept_request(
        db=db,
        user_id=current_user["user_id"],
        request_id=request_id,
        keywords=data.keywords,
        hidden_node_types=data.hidden_node_types,
    )
    if grant is None:
        raise HTTPException(status_code=404, detail="Request not found or already resolved")
    return grant


@router.post("/me/connection-requests/{request_id}/reject")
async def reject_connection_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Reject a connection request."""
    result = await reject_request(db=db, user_id=current_user["user_id"], request_id=request_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Request not found or already resolved")
    return {"status": "rejected"}
```

IMPORTANT: The `/{orb_id}/connection-requests` routes must be placed BEFORE the `/{orb_id}` catch-all route (the `get_public_orb` endpoint) to avoid being matched by it. Check the router ordering.

- [ ] **Step 3: Run all tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/orbs/models.py backend/app/orbs/router.py
git commit -m "feat: add connection request endpoints (#264)"
```

---

### Task 4: Add frontend API functions and SharedOrbPage "Request Access" button

**Files:**
- Modify: `frontend/src/api/orbs.ts` — add connection request API functions
- Modify: `frontend/src/pages/SharedOrbPage.tsx` — add Request Access button

- [ ] **Step 1: Add types and API functions to `frontend/src/api/orbs.ts`**

```typescript
export interface ConnectionRequest {
  request_id: string;
  requester_user_id: string;
  requester_email: string;
  requester_name: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export async function requestAccess(orbId: string): Promise<ConnectionRequest> {
  const { data } = await client.post(`/orbs/${orbId}/connection-requests`);
  return data;
}

export async function getMyConnectionRequest(orbId: string): Promise<ConnectionRequest | null> {
  try {
    const { data } = await client.get(`/orbs/${orbId}/connection-requests/me`);
    return data;
  } catch {
    return null;
  }
}

export async function listConnectionRequests(): Promise<ConnectionRequest[]> {
  const { data } = await client.get('/orbs/me/connection-requests');
  return data.requests;
}

export async function acceptConnectionRequest(
  requestId: string,
  filters: { keywords: string[]; hidden_node_types: string[] },
): Promise<void> {
  await client.post(`/orbs/me/connection-requests/${requestId}/accept`, filters);
}

export async function rejectConnectionRequest(requestId: string): Promise<void> {
  await client.post(`/orbs/me/connection-requests/${requestId}/reject`);
}
```

- [ ] **Step 2: Update SharedOrbPage — add "Request Access" button**

In `frontend/src/pages/SharedOrbPage.tsx`, find the `isNoAccess` error block. The current code shows a title and message. Add state and a button.

Add imports at the top:

```typescript
import { requestAccess, getMyConnectionRequest } from '../api/orbs';
```

Add state variables inside the component (near the other useState calls):

```typescript
const [requestPending, setRequestPending] = useState(false);
const [requestSubmitting, setRequestSubmitting] = useState(false);
const [requestChecked, setRequestChecked] = useState(false);
```

Add a useEffect that checks for existing pending request when the error is "no access" and user is authenticated:

```typescript
useEffect(() => {
  if (!isNoAccess || !user || !orbId || requestChecked) return;
  getMyConnectionRequest(orbId).then((req) => {
    if (req) setRequestPending(true);
    setRequestChecked(true);
  });
}, [isNoAccess, user, orbId, requestChecked]);
```

Note: `isNoAccess` is computed inside the error block. You'll need to hoist the computation above the useEffect. Compute it from the `error` state:

```typescript
const isNoAccess = !!error && error.toLowerCase().includes("don't have access");
```

Place this line near the other derived state (before the useEffect).

In the error block's JSX, for the `isNoAccess` branch, add the button after the message paragraph:

```tsx
{isNoAccess && user && (
  <button
    onClick={async () => {
      if (!orbId || requestPending || requestSubmitting) return;
      setRequestSubmitting(true);
      try {
        await requestAccess(orbId);
        setRequestPending(true);
      } catch {
        // Already pending or failed
      } finally {
        setRequestSubmitting(false);
      }
    }}
    disabled={requestPending || requestSubmitting}
    className={`mt-4 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
      requestPending
        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
        : 'bg-purple-600 hover:bg-purple-500 text-white'
    }`}
  >
    {requestSubmitting ? 'Sending...' : requestPending ? 'Request Pending' : 'Request Access'}
  </button>
)}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/orbs.ts frontend/src/pages/SharedOrbPage.tsx
git commit -m "feat: add Request Access button to SharedOrbPage (#264)"
```

---

### Task 5: Add "Pending Requests" section to OrbViewPage restricted modal

**Files:**
- Modify: `frontend/src/pages/OrbViewPage.tsx`

- [ ] **Step 1: Add imports and state**

Add imports at the top of OrbViewPage.tsx:

```typescript
import { listConnectionRequests, acceptConnectionRequest, rejectConnectionRequest, type ConnectionRequest } from '../api/orbs';
```

Add state variables near the other restricted-section state:

```typescript
const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>([]);
const [pendingLoading, setPendingLoading] = useState(false);
const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
const [acceptKeywords, setAcceptKeywords] = useState('');
const [acceptHiddenTypes, setAcceptHiddenTypes] = useState('');
const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
```

- [ ] **Step 2: Add fetch effect**

Near the existing grants fetch effect, add:

```typescript
useEffect(() => {
  if (!isRestricted) return;
  setPendingLoading(true);
  listConnectionRequests()
    .then(setPendingRequests)
    .catch(() => {})
    .finally(() => setPendingLoading(false));
}, [isRestricted]);
```

- [ ] **Step 3: Add handler functions**

```typescript
const handleAcceptRequest = async (requestId: string) => {
  const keywords = acceptKeywords.split(',').map(k => k.trim()).filter(Boolean);
  const hiddenTypes = acceptHiddenTypes.split(',').map(t => t.trim()).filter(Boolean);
  try {
    await acceptConnectionRequest(requestId, { keywords, hidden_node_types: hiddenTypes });
    setPendingRequests(prev => prev.filter(r => r.request_id !== requestId));
    setAcceptingRequestId(null);
    setAcceptKeywords('');
    setAcceptHiddenTypes('');
    // Refresh grants list
    listAccessGrants().then(g => setGrants(g));
    addToast('Access granted', 'success');
  } catch {
    addToast('Failed to accept request', 'error');
  }
};

const handleRejectRequest = async (requestId: string) => {
  setRejectingRequestId(requestId);
  try {
    await rejectConnectionRequest(requestId);
    setPendingRequests(prev => prev.filter(r => r.request_id !== requestId));
    addToast('Request rejected', 'success');
  } catch {
    addToast('Failed to reject request', 'error');
  } finally {
    setRejectingRequestId(null);
  }
};
```

- [ ] **Step 4: Add "Pending Requests" JSX**

In the restricted section of OrbViewPage, BEFORE the "Invite By Email" section, add:

```tsx
{pendingRequests.length > 0 && (
  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
    <div className="flex items-center justify-between gap-2 mb-3">
      <label className="text-xs text-amber-200/80 uppercase tracking-wide font-medium">Pending Requests</label>
      <span className="text-[11px] text-amber-200/60">{pendingRequests.length}</span>
    </div>
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {pendingRequests.map((req) => (
        <div key={req.request_id} className="border border-gray-700 rounded-lg px-3 py-2.5 bg-gray-900/60 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{req.requester_name || req.requester_email}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{req.requester_email}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(req.created_at)}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAcceptingRequestId(acceptingRequestId === req.request_id ? null : req.request_id);
                  setAcceptKeywords('');
                  setAcceptHiddenTypes('');
                }}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => handleRejectRequest(req.request_id)}
                disabled={rejectingRequestId === req.request_id}
                className="h-8 px-3 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 text-xs font-medium transition-colors"
              >
                {rejectingRequestId === req.request_id ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>

          {acceptingRequestId === req.request_id && (
            <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 p-2.5 space-y-2">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wide">Filtered Keywords (comma separated)</label>
                <input
                  type="text"
                  value={acceptKeywords}
                  onChange={(e) => setAcceptKeywords(e.target.value)}
                  placeholder="python, machine learning"
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs placeholder-gray-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wide">Hidden Node Types (comma separated)</label>
                <input
                  type="text"
                  value={acceptHiddenTypes}
                  onChange={(e) => setAcceptHiddenTypes(e.target.value)}
                  placeholder="Skill, Project"
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs placeholder-gray-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAcceptRequest(req.request_id)}
                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                >
                  Confirm & Grant Access
                </button>
                <button
                  type="button"
                  onClick={() => setAcceptingRequestId(null)}
                  className="h-8 px-3 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run backend tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/OrbViewPage.tsx
git commit -m "feat: add Pending Requests section to restricted share modal (#264)"
```
