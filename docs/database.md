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

`title`, `patent_number`, `filing_date`, `grant_date`, `status`, `description`, `url`, `uid`

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

## Vector Indexes

Five vector indexes for semantic search (1536 dimensions, cosine similarity):

- `education_embedding`
- `work_experience_embedding`
- `certification_embedding`
- `publication_embedding`
- `project_embedding`

Embeddings are currently placeholder (deterministic SHA-512 hash). The infrastructure is in place for real embeddings (OpenAI ada-002 or sentence-transformers).

## Encryption

Fernet symmetric encryption applied to PII fields: `email`, `phone`, `address`. Implemented in `backend/app/graph/encryption.py`.

- `encrypt_properties(dict)` — encrypts only PII fields present in the dict
- `decrypt_properties(dict)` — decrypts PII fields; logs warning and leaves value as-is on failure
- Key sourced from `ENCRYPTION_KEY` env var; auto-generated in dev mode (data won't survive restarts)

## Constraints and Indexes

Defined in `infra/neo4j/init.cypher`:

- Uniqueness constraint on `Person.user_id`
- Uniqueness constraint on `Person.orb_id`
- Standard indexes on node `uid` fields
- Vector indexes on embedding fields (1536 dimensions, cosine)

## Query Patterns

All Cypher queries are centralized as string constants in `backend/app/graph/queries.py`. Key patterns:

- **Graph fetch:** `MATCH (p:Person {user_id: $user_id})-[r]->(n) RETURN p, collect({node: n, rel: type(r)})` plus a second query for `USED_SKILL` relationships
- **Node creation:** `MATCH (p:Person {user_id: $user_id}) CREATE (p)-[:HAS_*]->(n:Type {props}) RETURN n`
- **CV confirm:** `DELETE_USER_GRAPH` (detach-deletes all nodes except Person) → `MERGE` per node with dedup keys → `CREATE USED_SKILL` links
- **Public orb:** Same as graph fetch but matches on `orb_id` instead of `user_id`
