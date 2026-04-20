# Database — Neo4j Schema

Orbis uses Neo4j 5 (Community Edition) as its graph database. All queries are in `backend/app/graph/queries.py`.

## Node Types

### Person (root node, one per user)

| Property | Type | Notes |
|----------|------|-------|
| `user_id` | string | Unique identifier |
| `orb_id` | string | User-chosen public slug |
| `email` | string | Fernet-encrypted |
| `name` | string | |
| `headline` | string | |
| `location` | string | |
| `linkedin_url` | string | |
| `scholar_url` | string | |
| `website_url` | string | |
| `open_to_work` | boolean | |
| `visibility` | string | `restricted` (default) \| `public` — gates `GET /orbs/{orb_id}` |
| `profile_image` | string | Base64 data URI |
| `gdpr_consent` | boolean | |
| `gdpr_consent_at` | string | ISO datetime |
| `deletion_requested_at` | string | ISO datetime (soft delete) |
| `created_at` | datetime | Neo4j datetime |
| `updated_at` | datetime | Neo4j datetime |

### Education

`institution`, `degree`, `field_of_study`, `start_date`, `end_date`, `description`, `location`, `uid`

### WorkExperience

`company`, `title`, `start_date`, `end_date`, `description`, `location`, `company_url`, `uid`

### Skill

`name`, `category` (Programming / Framework / Tool / Methodology / Soft Skill / Other), `proficiency` (Expert / Advanced / Intermediate / Beginner), `uid`, `embedding` (1536-dim vector, stripped from API responses)

### Language

`name`, `proficiency` (Native / Professional / B2 / C1 / etc.), `uid`

### Certification

`name`, `issuing_organization`, `issue_date`, `expiry_date`, `credential_url`, `uid`

### Publication

`title`, `venue`, `date`, `doi`, `url`, `abstract`, `uid`

### Project

`name`, `role`, `description`, `start_date`, `end_date`, `url`, `uid`

### Patent

`title`, `patent_number`, `filing_date`, `grant_date`, `description`, `url`, `uid`

### Award

`name`, `issuer`, `date`, `description`, `uid`

### Outreach

`title`, `venue`, `date`, `description`, `url`, `uid`

### Training

`title`, `provider`, `date`, `description`, `url`, `uid`

### AccessGrant (restricted-mode allowlist)

Created when a user grants a specific email permission to view their orb while `visibility = 'restricted'`.

| Property | Type | Notes |
|----------|------|-------|
| `grant_id` | string | Unique, URL-safe token |
| `orb_id` | string | Denormalized from Person for fast lookup |
| `email` | string | Lowercase, trimmed |
| `created_at` | datetime | |
| `revoked` | boolean | Soft delete |
| `revoked_at` | datetime | |

Linked via `(Person)-[:GRANTED_ACCESS]->(AccessGrant)`. Parallel to `ShareToken` — share tokens gate `public` orbs, access grants gate `restricted` orbs.

### ConnectionRequest (restricted-mode access request)

Created when a user requests access to a restricted orb. The orb owner reviews and accepts (creating an AccessGrant) or rejects.

| Property | Type | Notes |
|----------|------|-------|
| `request_id` | string | UUID |
| `requester_user_id` | string | Requesting user's ID |
| `requester_email` | string | Lowercase |
| `requester_name` | string | |
| `status` | string | `pending` / `accepted` / `rejected` |
| `created_at` | datetime | |
| `resolved_at` | datetime | Nullable — set on accept/reject |

Linked via `(Person)-[:HAS_CONNECTION_REQUEST]->(ConnectionRequest)`.

### LLMUsage (per-call usage tracking)

Records every LLM invocation (CV extraction, note enhancement) for cost and token tracking.

| Property | Type | Notes |
|----------|------|-------|
| `usage_id` | string | UUID |
| `endpoint` | string | e.g. `/cv/upload`, `/notes/enhance` |
| `llm_provider` | string | `claude`, `gemini`, `ollama`, `rule_based`, or `none` |
| `llm_model` | string | e.g. `claude-opus-4-6`, `gemini-2.5-pro`, `llama3.2:3b`, `rule_based_parser`, `none` |
| `input_tokens` | integer | Nullable |
| `output_tokens` | integer | Nullable |
| `total_tokens` | integer | Nullable (input + output) |
| `cost_usd` | float | Nullable |
| `duration_ms` | integer | Nullable |
| `created_at` | datetime | |

Linked via `(Person)-[:HAS_LLM_USAGE]->(LLMUsage)`.

### RefreshToken

Tracks JWT refresh tokens for token rotation. Old tokens are revoked on refresh.

| Property | Type | Notes |
|----------|------|-------|
| `token_id` | string | UUID |
| `hash` | string | SHA-256 of token |
| `issued_at` | datetime | |
| `expires_at` | datetime | |
| `revoked` | boolean | |
| `replaced_by` | string | Nullable — token_id of replacement |

Linked via `(Person)-[:HAS_REFRESH_TOKEN]->(RefreshToken)`.

### MCPApiKey

API keys for MCP server authentication. Raw key returned once at creation; only the hash is persisted.

| Property | Type | Notes |
|----------|------|-------|
| `key_id` | string | UUID |
| `hash` | string | SHA-256 of API key (prefix `orbk_`) |

Linked via `(Person)-[:HAS_MCP_API_KEY]->(MCPApiKey)`.

## Relationships

| Relationship | From | To | Purpose |
|-------------|------|-----|---------|
| `HAS_EDUCATION` | Person | Education | |
| `HAS_WORK_EXPERIENCE` | Person | WorkExperience | |
| `HAS_SKILL` | Person | Skill | |
| `SPEAKS` | Person | Language | |
| `HAS_CERTIFICATION` | Person | Certification | |
| `HAS_PUBLICATION` | Person | Publication | |
| `HAS_PROJECT` | Person | Project | |
| `HAS_PATENT` | Person | Patent | |
| `HAS_AWARD` | Person | Award | |
| `HAS_OUTREACH` | Person | Outreach | |
| `HAS_TRAINING` | Person | Training | |
| `GRANTED_ACCESS` | Person | AccessGrant | Allowlist entry for `restricted` orbs |
| `HAS_CONNECTION_REQUEST` | Person | ConnectionRequest | Access request for `restricted` orbs |
| `HAS_LLM_USAGE` | Person | LLMUsage | Per-call LLM cost/token tracking |
| `HAS_REFRESH_TOKEN` | Person | RefreshToken | JWT refresh token tracking |
| `HAS_MCP_API_KEY` | Person | MCPApiKey | MCP API key tracking |
| `USED_SKILL` | WorkExperience / Project / Education / Publication | Skill | Cross-entity skill link |

The `USED_SKILL` relationship is the key graph feature — it connects experience nodes directly to Skill nodes, enabling queries like "which skills were used at company X?"

## Deduplication Keys

Used during `POST /cv/confirm` with Cypher `MERGE`:

| Node Type | Merge Keys |
|-----------|-----------|
| Skill | `name` |
| Language | `name` |
| WorkExperience | `company`, `title` |
| Education | `institution`, `degree` |
| Certification | `name`, `issuing_organization` |
| Publication | `title` |
| Project | `name` |
| Patent | `title` |
| Award | `name` |
| Outreach | `title`, `venue` |
| Training | `title`, `provider` |

## Vector Indexes

Six vector indexes for semantic search (1536 dimensions, cosine similarity):

- `education_embedding`
- `work_experience_embedding`
- `certification_embedding`
- `publication_embedding`
- `project_embedding`
- `training_embedding`

Embeddings are currently placeholder (deterministic SHA-512 hash). The infrastructure is in place for real embeddings (OpenAI ada-002 or sentence-transformers).

## Encryption

Fernet symmetric encryption applied to PII fields: `email`, `phone`, `address`. Implemented in `backend/app/graph/encryption.py`.

- `encrypt_properties(dict)` — encrypts only PII fields present in the dict
- `decrypt_properties(dict)` — decrypts PII fields; logs warning and leaves value as-is on failure
- Key sourced from `ENCRYPTION_KEY` env var; auto-generated in dev mode (data won't survive restarts)

## PostgreSQL — CV Background Jobs

CV processing jobs (background extraction via Cloud Tasks) are tracked in the `cv_jobs` table in PostgreSQL.

### `cv_jobs` Table

| Column | Type | Notes |
|--------|------|-------|
| `job_id` | TEXT | UUID, primary key |
| `user_id` | TEXT | Links to Person node |
| `document_id` | TEXT | Nullable — set when document is stored |
| `cloud_task_name` | TEXT | Cloud Tasks task name for the dispatched job |
| `status` | TEXT | `queued` / `running` / `succeeded` / `failed` / `cancelled` |
| `step` | TEXT | Current processing step (e.g. `extracting_text`, `classifying`) |
| `progress_pct` | INT | 0–100 percentage |
| `progress_detail` | TEXT | Human-readable status detail |
| `llm_provider` | TEXT | LLM provider used for extraction |
| `llm_model` | TEXT | LLM model used |
| `text_chars` | INT | Characters extracted from PDF |
| `filename` | TEXT | Original filename |
| `node_count` | INT | Nodes extracted on success |
| `edge_count` | INT | Edges extracted on success |
| `result_json` | TEXT | Full extraction result JSON (stored on success) |
| `error_message` | TEXT | Error detail on failure |
| `created_at` | TIMESTAMPTZ | Job creation time |
| `started_at` | TIMESTAMPTZ | When processing began |
| `completed_at` | TIMESTAMPTZ | When processing finished |
| `expires_at` | TIMESTAMPTZ | Retention cutoff (7 days after creation) |
| `cancelled_by` | TEXT | User ID or "admin" if cancelled externally |

Indexes on `user_id`, `status`, and `expires_at`. Expired `succeeded`/`failed` jobs are cleaned up automatically.

**Flow:** `POST /cv/upload` and `POST /cv/import` create a `cv_jobs` row with `status=queued`, then dispatch a Cloud Task that calls `POST /cv/process-job`. In local dev (no Cloud Tasks configured) the task runs inline via `asyncio.create_task`. On completion the user receives an email with a deep link to resume review.

## SQLite — CV Document Metadata

Separate from the Neo4j graph, CV/document upload metadata is tracked in SQLite (`backend/data/cv_uploads.db`).

### `cv_documents` Table

| Column | Type | Notes |
|--------|------|-------|
| `document_id` | TEXT | UUID, generated at upload time |
| `user_id` | TEXT | Links to Person node |
| `original_filename` | TEXT | Filename when uploaded |
| `file_size_bytes` | INTEGER | Original file size |
| `uploaded_at` | TEXT | ISO timestamp |
| `page_count` | INTEGER | PDF page count |
| `entities_count` | INTEGER | Nullable — nodes extracted from this document |
| `edges_count` | INTEGER | Nullable — relationships extracted from this document |

Primary key: `(user_id, document_id)`. Maximum 3 documents per user — when the limit is reached, the oldest document (by `uploaded_at`) is automatically evicted.

Encrypted document files are stored on disk at `backend/data/cv_files/{user_id}_{document_id}.pdf.enc`.

**Migration:** On first connection, if the old `cv_uploads` table exists (single row per user), rows are migrated to `cv_documents` with generated UUIDs and NULL entities/edges counts.

## SQLite — Orb Snapshots

Orb version snapshots are stored in the same SQLite database (`backend/data/cv_uploads.db`).

### `orb_snapshots` Table

| Column | Type | Notes |
|--------|------|-------|
| `snapshot_id` | TEXT | UUID |
| `user_id` | TEXT | Links to Person node |
| `created_at` | TEXT | ISO timestamp |
| `trigger` | TEXT | What caused it: "cv_import", "manual", "pre_restore" |
| `label` | TEXT | Nullable — user-facing label, e.g. "Before CV import" |
| `node_count` | INTEGER | Total nodes at time of snapshot |
| `edge_count` | INTEGER | Total edges at time of snapshot |
| `data` | TEXT | JSON-serialized graph (person + nodes + links) |

Primary key: `(user_id, snapshot_id)`. Maximum 3 snapshots per user — oldest evicted when a 4th is created. PII fields are stored encrypted as-is (no decrypt/re-encrypt on restore).

Auto-created before destructive CV imports. Manually creatable from Settings > Versions tab.

## Import Provenance Nodes

These two node types record which ontology version was active during a CV import and what each import produced. They are created at `POST /cv/confirm` time.

### OntologyVersion

Captures a snapshot of the ontology file at the moment it was first seen, so every extraction can be linked to the exact schema that guided it.

| Property | Type | Description |
|----------|------|-------------|
| `version_id` | string (UUID) | Unique identifier |
| `version_number` | integer | Auto-incrementing (1, 2, 3…) |
| `content_hash` | string | SHA-256 of ontology file content |
| `schema_definition` | string (JSON) | Full ontology as JSON (node types, properties, relationships) |
| `extraction_prompt` | string | System prompt template for this ontology version |
| `source_file` | string | Path to source file (`ontology.md`) |
| `prompt_reviewed` | boolean | Whether the prompt has been confirmed aligned with the ontology |
| `created_at` | datetime | When the version was registered |

### ProcessingRecord

One node per confirmed CV import. Records which LLM was used, which prompt, and how many nodes/edges were produced.

| Property | Type | Description |
|----------|------|-------------|
| `record_id` | string (UUID) | Unique identifier |
| `document_id` | string | References `cv_documents.document_id` in SQLite |
| `llm_provider` | string | `"claude"`, `"gemini"`, `"ollama"`, `"rule_based"`, or `"none"` (every provider in the chain failed) |
| `llm_model` | string | e.g. `"claude-opus-4-6"`, `"gemini-2.5-pro"`, `"llama3.2:3b"`, `"rule_based_parser"`, `"none"` |
| `extraction_method` | string | `"primary"` (chain[0] succeeded), `"fallback_<provider>"` (a later LLM succeeded), `"fallback_rule_based"` (real rule-based parser ran), or `"fallback_raw_text"` (chain exhausted — raw text dumped as unmatched) |
| `prompt_hash` | string | SHA-256 of the system prompt used |
| `nodes_extracted` | integer | Count of nodes produced |
| `edges_extracted` | integer | Count of relationships produced |
| `processed_at` | datetime | When the import was confirmed |

### Provenance Relationships

| Relationship | From | To | Description |
|-------------|------|-----|-------------|
| `USED_ONTOLOGY` | ProcessingRecord | OntologyVersion | Which ontology was active during extraction |
| `EXTRACTED` | ProcessingRecord | any domain node | Links to each node produced by this import |
| `HAS_PROCESSING_RECORD` | Person | ProcessingRecord | Easy traversal from the user's graph |
| `SUPERSEDES` | OntologyVersion | OntologyVersion | Version chain (newer → older) |

### Auto-detection Flow

At `POST /cv/confirm`, the system:

1. Hashes the current `ontology.md` file (SHA-256).
2. Compares with the latest `OntologyVersion.content_hash` stored in Neo4j.
3. If the hash differs, creates a new `OntologyVersion` node (incrementing `version_number`) and links it to the previous version via `SUPERSEDES`.
4. Logs a warning if `prompt_reviewed` is `false` on the active version — this signals that the extraction prompt may not yet be aligned with the updated ontology.
5. Creates a `ProcessingRecord` node, links it to the active `OntologyVersion` via `USED_ONTOLOGY`, to the `Person` via `HAS_PROCESSING_RECORD`, and to every extracted domain node via `EXTRACTED`.

## Account Deletion Audit

### DeletionRecord

Created by the expired-account cleanup process when a `Person` node is permanently deleted (after the 30-day grace period). Provides an audit trail for admin dashboard metrics.

| Property | Type | Notes |
|----------|------|-------|
| `user_id` | string | ID of the deleted user |
| `deleted_at` | datetime | Neo4j datetime of permanent deletion |

These nodes are standalone (no relationships). The cleanup runs on startup and then on a recurring schedule controlled by `CLEANUP_INTERVAL_HOURS` (default: 24h).

## Constraints and Indexes

Defined in `infra/neo4j/init.cypher`:

- Uniqueness constraint on `Person.user_id`
- Uniqueness constraint on `Person.orb_id`
- Standard indexes on node `uid` fields
- Vector indexes on embedding fields (1536 dimensions, cosine)
- Uniqueness constraint on `OntologyVersion.version_id`
- Uniqueness constraint on `ProcessingRecord.record_id`
- Index on `OntologyVersion.content_hash`
- Index on `ProcessingRecord.document_id`
- Uniqueness constraint on `ShareToken.token_id`
- Uniqueness constraint on `AccessGrant.grant_id`
- Index on `AccessGrant.email` and on `Person.visibility`
- Uniqueness constraint on `LLMUsage.usage_id`
- Index on `LLMUsage.endpoint`
- Uniqueness constraint on `ConnectionRequest.request_id`
- Index on `ConnectionRequest.status` and `ConnectionRequest.requester_user_id`
- Uniqueness constraint on `RefreshToken.token_id`
- Index on `RefreshToken.hash` and `RefreshToken.expires_at`
- Uniqueness constraint on `MCPApiKey.key_id`
- Index on `MCPApiKey.hash`

## Query Patterns

All Cypher queries are centralized as string constants in `backend/app/graph/queries.py`. Key patterns:

- **Graph fetch:** `MATCH (p:Person {user_id: $user_id})-[r]->(n) RETURN p, collect({node: n, rel: type(r)})` plus a second query for `USED_SKILL` relationships
- **Node creation:** `MATCH (p:Person {user_id: $user_id}) CREATE (p)-[:HAS_*]->(n:Type {props}) RETURN n`
- **CV confirm:** `DELETE_USER_GRAPH` (detach-deletes all nodes except Person) → `MERGE` per node with dedup keys → `CREATE USED_SKILL` links
- **Public orb:** Same as graph fetch but matches on `orb_id` instead of `user_id`
