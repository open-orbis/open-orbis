# Connection Request Flow for Restricted Orbs — Design Spec

**Issue:** #264 — Restricted orb: connection request flow with pending approval
**Date:** 2026-04-11

## Goal

Allow authenticated visitors to request access to a restricted orb. The owner
reviews pending requests in the share modal, and accepts (with filter
configuration) or rejects each one.

## Data Model

### New node: ConnectionRequest

```
(Person)-[:HAS_CONNECTION_REQUEST]->(ConnectionRequest {
    request_id: str,            # UUID
    requester_user_id: str,     # user_id of the requester
    requester_email: str,
    requester_name: str,
    status: str,                # "pending" | "accepted" | "rejected"
    created_at: datetime,
    resolved_at: datetime | null
})
```

The owner's Person node owns the requests via `HAS_CONNECTION_REQUEST`.

**Constraints:**
- `ConnectionRequest.request_id IS UNIQUE`

**Indexes:**
- `ConnectionRequest.status` (for filtering pending requests)
- `ConnectionRequest.requester_user_id` (for checking if user already requested)

## Backend

### New endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/orbs/{orb_id}/connection-requests` | Required | Create a pending request |
| `GET` | `/orbs/{orb_id}/connection-requests/me` | Required | Check if current user has a pending request |
| `GET` | `/orbs/me/connection-requests` | Required | Owner lists pending requests |
| `POST` | `/orbs/me/connection-requests/{request_id}/accept` | Required | Accept + create AccessGrant |
| `POST` | `/orbs/me/connection-requests/{request_id}/reject` | Required | Reject request |

### POST `/orbs/{orb_id}/connection-requests`

- Requires authentication.
- Checks that the orb exists and is restricted.
- Checks that the requester doesn't already have an active grant.
- Checks that the requester doesn't already have a pending request.
- Creates a `ConnectionRequest` node with status "pending".
- Returns 201 with the request record.

### GET `/orbs/{orb_id}/connection-requests/me`

- Returns the current user's pending request for this orb, or 404 if none.
- Used by SharedOrbPage to show "Request Pending" state.

### GET `/orbs/me/connection-requests`

- Returns all pending `ConnectionRequest` nodes for the current user's orb.
- Ordered by `created_at DESC`.

### POST `/orbs/me/connection-requests/{request_id}/accept`

- Request body: `{ keywords: string[], hidden_node_types: string[] }` (both optional, default empty).
- Sets `ConnectionRequest.status = "accepted"` and `resolved_at = datetime()`.
- Creates an `AccessGrant` for the requester's email with the specified filters.
- Reuses existing `create_access_grant` logic.
- Returns the created grant.

### POST `/orbs/me/connection-requests/{request_id}/reject`

- Sets `ConnectionRequest.status = "rejected"` and `resolved_at = datetime()`.
- Returns 200.

### New service file

`backend/app/orbs/connection_requests.py` — contains all business logic:
- `create_connection_request(db, orb_id, user)`
- `get_my_connection_request(db, orb_id, user_id)`
- `list_pending_requests(db, user_id)`
- `accept_request(db, user_id, request_id, keywords, hidden_node_types)`
- `reject_request(db, user_id, request_id)`

### New Cypher queries

Added to `backend/app/graph/queries.py`:
- `CREATE_CONNECTION_REQUEST`
- `GET_CONNECTION_REQUEST_BY_REQUESTER`
- `LIST_PENDING_CONNECTION_REQUESTS`
- `ACCEPT_CONNECTION_REQUEST`
- `REJECT_CONNECTION_REQUEST`

## Frontend

### SharedOrbPage — requester side

In the error block where `title = "You don't have access"`:

- If user is authenticated, show a "Request Access" button.
- On mount, call `GET /orbs/{orb_id}/connection-requests/me` to check for existing request.
- If pending request exists, show "Request Pending" (disabled button with muted styling).
- On click: `POST /orbs/{orb_id}/connection-requests`, switch to pending state.

### OrbViewPage — owner side (restricted modal)

Add a "Pending Requests" section between the "Invite By Email" section and "People With Access":

- Calls `GET /orbs/me/connection-requests` on modal open.
- Lists each pending request: requester name, email, timestamp.
- Each request has "Accept" and "Reject" buttons.
- **Accept flow**: clicking "Accept" expands an inline filter editor below the request (same fields as existing grant filter editor: keywords textarea + hidden node types textarea). A "Confirm" button creates the grant with filters. A "Cancel" button collapses the editor.
- **Reject flow**: clicking "Reject" calls the reject endpoint and removes the request from the list.

### New API functions

In `frontend/src/api/orbs.ts`:
- `requestAccess(orbId: string): Promise<ConnectionRequest>`
- `getMyConnectionRequest(orbId: string): Promise<ConnectionRequest | null>`

In `frontend/src/api/admin.ts` or a new `frontend/src/api/connectionRequests.ts`:
- `listConnectionRequests(): Promise<ConnectionRequest[]>`
- `acceptConnectionRequest(requestId: string, filters: { keywords: string[], hidden_node_types: string[] }): Promise<void>`
- `rejectConnectionRequest(requestId: string): Promise<void>`

## Neo4j Schema Updates

Add to `infra/neo4j/init.cypher`:

```cypher
CREATE CONSTRAINT connection_request_id IF NOT EXISTS
  FOR (cr:ConnectionRequest) REQUIRE cr.request_id IS UNIQUE;
CREATE INDEX connection_request_status IF NOT EXISTS
  FOR (cr:ConnectionRequest) ON (cr.status);
CREATE INDEX connection_request_requester IF NOT EXISTS
  FOR (cr:ConnectionRequest) ON (cr.requester_user_id);
```

## Testing

- Unit tests for each service function (mock Neo4j).
- Test duplicate request prevention.
- Test accept creates AccessGrant with correct filters.
- Test reject updates status.
- Test requester can check their own request status.
