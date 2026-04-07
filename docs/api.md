# API Reference

Base URL: `http://localhost:8000` (dev) — frontend proxies via `/api` prefix.

## Authentication

All protected endpoints require `Authorization: Bearer <jwt>`. JWT is obtained via `POST /auth/dev-login`.

## Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Returns `{"status": "ok"}` |

## Auth (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/dev-login` | No | Creates/retrieves dev user, returns JWT |
| GET | `/auth/me` | JWT | Returns current user info (`user_id`, `email`, `name`, `gdpr_consent`) |
| POST | `/auth/gdpr-consent` | JWT | Sets GDPR consent flag on Person node |
| DELETE | `/auth/account` | JWT | Soft-deletes account (30-day grace period via `deletion_requested_at`) |

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
| POST | `/cv/upload` | JWT | Upload PDF (max 10MB). Requires GDPR consent. Returns extracted nodes. |
| GET | `/cv/processing-count` | No | Count of PDFs currently being processed |
| POST | `/cv/confirm` | JWT | Persist confirmed nodes to Neo4j. Wipes existing graph first. |

### CV Upload Response

```json
{
  "nodes": [{"node_type": "work_experience", "properties": {...}}, ...],
  "relationships": [{"source_index": 0, "target_index": 5, "type": "USED_SKILL"}],
  "unmatched": ["line that couldn't be classified", ...],
  "skipped_nodes": [...],
  "truncated": false,
  "cv_owner_name": "John Doe"
}
```

## Export (`/export`)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/export/{orb_id}` | No | 30/min | Export orb as JSON, JSON-LD, or PDF |

Query params: `?format=json|jsonld|pdf`, `?filter_token=`, `?filter_keyword=`, `?include_photo=true|false`

## Messages (`/messages`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/messages/{orb_id}` | No | Send message to orb owner (public) |
| GET | `/messages/me` | JWT | List all messages with replies |
| POST | `/messages/me/{message_id}/reply` | JWT | Reply to a message |
| PUT | `/messages/me/{message_id}/read` | JWT | Mark as read (204) |
| DELETE | `/messages/me/{message_id}` | JWT | Delete message + replies (204) |

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

## MCP Tools (Model Context Protocol)

The Orbis MCP server exposes professional knowledge graph data to AI agents. These tools are available via the MCP protocol.

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `orbis_get_summary` | Get professional profile summary and node counts. | `orb_id` (str), `filter_token` (opt, str) |
| `orbis_get_full_orb` | Get complete graph data (person + nodes). | `orb_id` (str), `filter_token` (opt, str) |
| `orbis_get_nodes_by_type` | Get all nodes of a specific type. | `orb_id` (str), `node_type` (str), `filter_token` (opt, str) |
| `orbis_get_connections` | Get all relationships for a specific node. | `orb_id` (str), `node_uid` (str), `filter_token` (opt, str) |
| `orbis_get_skills_for_experience` | Get skills associated with an experience/project. | `orb_id` (str), `experience_uid` (str), `filter_token` (opt, str) |
| `orbis_send_message` | Send a message to an orb owner. | `orb_id`, `sender_name`, `sender_email`, `subject`, `body` |

Note: retrieval tools (`get_*`) support an optional `filter_token` for fine-grained privacy. If provided and valid, nodes matching the filter keywords will be excluded from the response.
