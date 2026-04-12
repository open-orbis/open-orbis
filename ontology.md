# Orb Knowledge Graph Ontology

## Domain Nodes (extractable from CVs)

### Person (Root Node)
- `user_id` (string) — unique user identifier
- `orb_id` (string) — public profile identifier
- `name` (string)
- `email` (string)
- `headline` (string)
- `location` (string)
- `linkedin_url` (string)
- `github_url` (string)
- `twitter_url` (string)
- `instagram_url` (string)
- `scholar_url` (string)
- `website_url` (string)
- `open_to_work` (boolean)
- `picture` (string) — profile picture URL
- `visibility` (string) — orb visibility setting
- `public_filter_keywords` (list[string]) — keywords for public filter
- `public_filter_hidden_types` (list[string]) — node types hidden in public view
- `created_at` (datetime)
- `updated_at` (datetime)

### Education
- `uid` (string)
- `institution` (string)
- `degree` (string)
- `field_of_study` (string)
- `location` (string)
- `description` (string)
- `start_date` (string)
- `end_date` (string)

### WorkExperience
- `uid` (string)
- `company` (string)
- `title` (string)
- `location` (string)
- `description` (string)
- `start_date` (string)
- `end_date` (string)
- `company_url` (string)

### Skill
- `uid` (string)
- `name` (string)
- `category` (string)
- `proficiency` (string)
- `embedding` (vector)

### Certification
- `uid` (string)
- `name` (string)
- `issuing_organization` (string)
- `date` (string)
- `credential_url` (string)
- `issue_date` (string)
- `expiry_date` (string)

### Language
- `uid` (string)
- `name` (string)
- `proficiency` (string)

### Publication
- `uid` (string)
- `title` (string)
- `venue` (string)
- `abstract` (string)
- `description` (string)
- `url` (string)
- `doi` (string)
- `embedding` (vector)

### Project
- `uid` (string)
- `name` (string)
- `role` (string)
- `description` (string)
- `url` (string)
- `start_date` (string)
- `end_date` (string)
- `embedding` (vector)

### Patent
- `uid` (string)
- `name` (string)
- `patent_number` (string)
- `description` (string)
- `inventors` (string)
- `filing_date` (string)
- `grant_date` (string)
- `url` (string)

### Award
- `uid` (string)
- `name` (string)
- `issuing_organization` (string)
- `date` (string)
- `description` (string)
- `url` (string)

### Outreach
- `uid` (string)
- `title` (string)
- `type` (string)
- `venue` (string)
- `date` (string)
- `description` (string)
- `role` (string)
- `url` (string)

### Training
- `uid` (string)
- `title` (string)
- `provider` (string)
- `date` (string)
- `description` (string)
- `url` (string)

## System Nodes

### OntologyVersion
- `version_id` (string)
- `version_number` (integer)
- `content_hash` (string)
- `schema_definition` (string)
- `extraction_prompt` (string)
- `source_file` (string)
- `prompt_reviewed` (boolean)
- `created_at` (datetime)

### ProcessingRecord
- `record_id` (string)
- `document_id` (string)
- `llm_provider` (string)
- `llm_model` (string)
- `extraction_method` (string)
- `prompt_hash` (string)
- `nodes_extracted` (integer)
- `edges_extracted` (integer)
- `cost_usd` (float)
- `duration_ms` (integer)
- `input_tokens` (integer)
- `output_tokens` (integer)
- `processed_at` (datetime)

### ShareToken
- `token_id` (string)
- `orb_id` (string)
- `keywords` (list[string])
- `hidden_node_types` (list[string])
- `label` (string)
- `created_at` (datetime)
- `expires_at` (datetime)
- `revoked` (boolean)

### AccessGrant
- `grant_id` (string)
- `orb_id` (string)
- `email` (string)
- `keywords` (list[string])
- `hidden_node_types` (list[string])
- `created_at` (datetime)
- `revoked` (boolean)

### ConnectionRequest
- `request_id` (string)
- `requester_user_id` (string)
- `requester_email` (string)
- `requester_name` (string)
- `status` (string)
- `created_at` (datetime)
- `resolved_at` (datetime)

### LLMUsage
- `usage_id` (string)
- `endpoint` (string)
- `llm_provider` (string)
- `llm_model` (string)
- `input_tokens` (integer)
- `output_tokens` (integer)
- `total_tokens` (integer)
- `cost_usd` (float)
- `duration_ms` (integer)
- `created_at` (datetime)

## Relationships

### Person → Node
| Relationship           | Target Node       |
|------------------------|-------------------|
| HAS_EDUCATION          | Education         |
| HAS_WORK_EXPERIENCE   | WorkExperience    |
| HAS_SKILL              | Skill             |
| HAS_CERTIFICATION      | Certification     |
| SPEAKS                 | Language          |
| HAS_PUBLICATION        | Publication       |
| HAS_PROJECT            | Project           |
| HAS_PATENT             | Patent            |
| HAS_AWARD              | Award             |
| HAS_OUTREACH           | Outreach          |
| HAS_TRAINING           | Training          |
| HAS_SHARE_TOKEN        | ShareToken        |
| GRANTED_ACCESS         | AccessGrant       |
| HAS_CONNECTION_REQUEST | ConnectionRequest |
| HAS_LLM_USAGE         | LLMUsage          |

### Cross-node
| Relationship | Source                                                                       | Target |
|--------------|------------------------------------------------------------------------------|--------|
| USED_SKILL   | Education, WorkExperience, Publication, Project, Patent, Award, Outreach, Training | Skill  |

### Provenance
| Relationship          | Source           | Target           |
|-----------------------|------------------|------------------|
| HAS_PROCESSING_RECORD | Person           | ProcessingRecord |
| USED_ONTOLOGY         | ProcessingRecord | OntologyVersion  |
| EXTRACTED             | ProcessingRecord | (any domain node)|
| SUPERSEDES            | OntologyVersion  | OntologyVersion  |
