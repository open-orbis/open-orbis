# Orb Knowledge Graph Ontology

## Node Labels & Properties

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
- `embedding` (vector)

### Project
- `uid` (string)
- `name` (string)
- `role` (string)
- `description` (string)
- `embedding` (vector)

### Patent
- `uid` (string)
- `name` (string)
- `patent_number` (string)
- `description` (string)
- `inventors` (string)
- `filing_date` (string)
- `grant_date` (string)

### Collaborator
- `uid` (string)
- `name` (string)
- `email` (string)
- `description` (string)
- `affiliation` (string)

## Relationships

### Person → Node
| Relationship        | Target Node    |
|---------------------|----------------|
| HAS_EDUCATION       | Education      |
| HAS_WORK_EXPERIENCE | WorkExperience |
| HAS_SKILL           | Skill          |
| HAS_CERTIFICATION   | Certification  |
| SPEAKS              | Language       |
| HAS_PUBLICATION     | Publication    |
| HAS_PROJECT         | Project        |
| HAS_PATENT          | Patent         |
| COLLABORATED_WITH   | Collaborator   |

### Cross-node
| Relationship | Source                                                      | Target |
|--------------|-------------------------------------------------------------|--------|
| USED_SKILL   | Education, WorkExperience, Publication, Project, Patent     | Skill  |

