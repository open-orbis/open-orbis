# API Reference

Base URL: `http://localhost:8000` (dev) — frontend proxies via `/api` prefix.

## Authentication

All protected endpoints require `Authorization: Bearer <jwt>`. JWT is obtained via Google or LinkedIn OAuth.

Admin endpoints additionally require `is_admin = true` on the Person node (returns 403 otherwise).

## Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Returns `{"status": "ok"}` |

## Auth (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/google` | No | Exchange Google OAuth code for JWT. Creates Person on first login. |
| POST | `/auth/linkedin` | No | Exchange LinkedIn OAuth code for JWT. Creates Person on first login. |
| GET | `/auth/me` | JWT | Returns current user info including `activated`, `is_admin`, `gdpr_consent`, `deletion_requested_at` |
| POST | `/auth/activate` | JWT | Validate and consume invite code. Sets `signup_code` on Person. 403 if invalid/used. |
| POST | `/auth/gdpr-consent` | JWT | Sets GDPR consent flag on Person node |
| DELETE | `/auth/me` | JWT | Soft-deletes account (30-day grace period via `deletion_requested_at`) |
| POST | `/auth/me/recover` | JWT | Cancel pending account deletion |

## Admin (`/admin`)

All endpoints require `is_admin = true` on the authenticated Person.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/stats` | Admin | Aggregated stats: registered count, pending activation, invite code counts |
| GET | `/admin/beta-config` | Admin | Read `invite_code_required` toggle state |
| PATCH | `/admin/beta-config` | Admin | Update `invite_code_required` (true = codes required, false = open platform) |
| GET | `/admin/access-codes` | Admin | List all invite codes with status (used/available/inactive) |
| POST | `/admin/access-codes` | Admin | Create single invite code (`{code, label?}`) |
| POST | `/admin/access-codes/batch` | Admin | Batch create codes (`{prefix, count, label?}`) |
| PATCH | `/admin/access-codes/{code}` | Admin | Toggle code active/inactive |
| DELETE | `/admin/access-codes/{code}` | Admin | Delete unused code |
| GET | `/admin/pending-users` | Admin | List users registered but not yet activated |
| GET | `/admin/funnel` | Admin | Waitlist funnel metrics: daily signups/activations, conversion rate (`?days=30`) |
| GET | `/admin/insights` | Admin | Provider breakdown, avg activation time, code attribution, engagement distribution |

## Orbs (`/orbs`)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/orbs/me` | JWT | — | Full orb: person + nodes + links |
| PUT | `/orbs/me` | JWT | — | Update Person profile fields |
| PUT | `/orbs/me/orb-id` | JWT | — | Claim/update public orb_id (409 if taken) |
| POST | `/orbs/me/profile-image` | JWT | — | Upload profile image as base64 (max 2MB) |
| DELETE | `/orbs/me/profile-image` | JWT | — | Clear profile image |
| POST | `/orbs/me/nodes` | JWT | — | Create node (any type) linked to Person |
| PUT | `/orbs/me/nodes/{uid}` | JWT | — | Update node properties |
| DELETE | `/orbs/me/nodes/{uid}` | JWT | — | Delete node |
| POST | `/orbs/me/link-skill` | JWT | — | Add `USED_SKILL` relationship |
| POST | `/orbs/me/unlink-skill` | JWT | — | Remove `USED_SKILL` relationship |
| POST | `/orbs/me/filter-token` | JWT | — | Generate shareable filter token (JWT with keyword exclusions) |
| GET | `/orbs/{orb_id}` | No | 30/min | Public orb view (supports `?filter_token=`) |

## CV (`/cv`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/cv/upload` | JWT | Upload PDF (max 10MB). Requires GDPR consent. Returns extracted nodes + `document_id`. |
| POST | `/cv/confirm` | JWT | Persist confirmed nodes to Neo4j. Wipes existing graph first. Accepts `document_id` to track metadata. |
| POST | `/cv/import` | JWT | Import supplementary document (PDF, DOCX, TXT). Returns extracted nodes + `document_id`. |
| POST | `/cv/import-confirm` | JWT | Merge imported nodes into existing orb (no wipe). Accepts `document_id` to track metadata. |
| GET | `/cv/documents` | JWT | List document metadata for current user (up to 3, ordered by date desc). |
| GET | `/cv/documents/{document_id}/download` | JWT | Download a specific stored document (decrypted). |
| GET | `/cv/download` | JWT | Download the latest uploaded CV (backward compat, delegates to documents endpoint). |
| GET | `/cv/processing-count` | No | Count of PDFs currently being processed. |
| GET | `/cv/progress` | JWT | Real-time progress for current user's CV processing. |

### CV Upload/Import Response

```json
{
  "nodes": [{"node_type": "work_experience", "properties": {...}}, ...],
  "relationships": [{"from_index": 0, "to_index": 5, "type": "USED_SKILL"}],
  "unmatched": ["line that couldn't be classified", ...],
  "skipped_nodes": [...],
  "truncated": false,
  "cv_owner_name": "John Doe",
  "document_id": "uuid-string"
}
```

### Confirm Request Body

```json
{
  "nodes": [...],
  "relationships": [...],
  "cv_owner_name": "John Doe",
  "document_id": "uuid-from-upload-response",
  "original_filename": "resume.pdf",
  "file_size_bytes": 204800,
  "page_count": 3
}
```

When `document_id` is provided, the confirm endpoint records document metadata (including `entities_count` and `edges_count` computed from the nodes/relationships). If the user already has 3 documents, the oldest is automatically evicted.

### Document Metadata Response (`GET /cv/documents`)

```json
[
  {
    "document_id": "uuid",
    "original_filename": "resume.pdf",
    "uploaded_at": "2026-04-09T12:00:00+00:00",
    "file_size_bytes": 204800,
    "page_count": 3,
    "entities_count": 42,
    "edges_count": 15
  }
]
```

## Versions (`/orbs/me/versions`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/orbs/me/versions` | JWT | List orb snapshots (metadata only, up to 3, ordered by date desc) |
| POST | `/orbs/me/versions` | JWT | Manually save current orb state as a snapshot |
| POST | `/orbs/me/versions/{snapshot_id}/restore` | JWT | Restore orb from a snapshot (current state saved first) |
| DELETE | `/orbs/me/versions/{snapshot_id}` | JWT | Delete a specific snapshot |

Snapshots are automatically created before destructive CV imports (`POST /cv/confirm`). Up to 3 snapshots per user; oldest is evicted when a 4th is created. Restoring always saves the current state first so the restore is undoable.

### Snapshot Metadata Response (`GET /orbs/me/versions`)

```json
[
  {
    "snapshot_id": "uuid",
    "user_id": "user-id",
    "created_at": "2026-04-09T12:00:00+00:00",
    "trigger": "cv_import",
    "label": "Before CV import",
    "node_count": 42,
    "edge_count": 15
  }
]
```

## Export (`/export`)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/export/{orb_id}` | No | 30/min | Export orb as JSON, JSON-LD, or PDF |

Query params: `?format=json|jsonld|pdf`, `?filter_token=`, `?filter_keyword=`, `?include_photo=true|false`

## Notes (`/notes`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/notes/enhance` | JWT | LLM-enhanced note classification. Takes free text + target language + existing skills, returns structured node type + properties + suggested skill links. |

## Search (`/search`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/search/semantic` | JWT | Vector similarity search across 5 Neo4j indexes |
| POST | `/search/text` | JWT | Fuzzy text search on own orb |
| POST | `/search/text/public` | No | Fuzzy text search on any public orb (supports `?filter_token=`) |
