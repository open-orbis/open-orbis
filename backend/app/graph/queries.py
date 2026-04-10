"""Cypher query templates for orb graph operations."""

# ── Person ──

CREATE_PERSON = """
CREATE (p:Person {
    user_id: $user_id,
    email: $email,
    name: $name,
    orb_id: $orb_id,
    picture: $picture,
    provider: $provider,
    signup_code: $signup_code,
    is_admin: false,
    headline: '',
    location: '',
    linkedin_url: '',
    scholar_url: '',
    website_url: '',
    orcid_url: '',
    open_to_work: false,
    created_at: datetime(),
    updated_at: datetime()
})
RETURN p
"""

GET_PERSON_BY_USER_ID = """
MATCH (p:Person {user_id: $user_id})
RETURN p
"""

GET_PERSON_BY_ORB_ID = """
MATCH (p:Person {orb_id: $orb_id})
RETURN p
"""

UPDATE_PERSON = """
MATCH (p:Person {user_id: $user_id})
SET p += $properties, p.updated_at = datetime()
RETURN p
"""

DELETE_USER_GRAPH = """
MATCH (p:Person {user_id: $user_id})-[r]->(n)
WHERE NOT n:ProcessingRecord
DETACH DELETE n
"""

UPDATE_ORB_ID = """
MATCH (p:Person {user_id: $user_id})
SET p.orb_id = $orb_id, p.updated_at = datetime()
RETURN p
"""

# ── Full Orb ──

GET_FULL_ORB = """
MATCH (p:Person {user_id: $user_id})
OPTIONAL MATCH (p)-[r]->(n)
WHERE NOT n:ProcessingRecord AND NOT n:OntologyVersion AND NOT n:ShareToken

WITH p, collect({node: n, rel: type(r), rel_id: id(r)}) AS connections
OPTIONAL MATCH (p)-[]->(src)-[cr:USED_SKILL]->(tgt:Skill)
WITH p, connections,
     collect({source: src.uid, target: tgt.uid, rel: type(cr)}) AS cross_links,
     collect(DISTINCT tgt) AS cross_skill_nodes
RETURN p, connections, cross_links, cross_skill_nodes
"""

GET_FULL_ORB_PUBLIC = """
MATCH (p:Person {orb_id: $orb_id})
OPTIONAL MATCH (p)-[r]->(n)
WHERE NOT n:ProcessingRecord AND NOT n:OntologyVersion AND NOT n:ShareToken

WITH p, collect({node: n, rel: type(r), rel_id: id(r)}) AS connections
OPTIONAL MATCH (p)-[]->(src)-[cr:USED_SKILL]->(tgt:Skill)
WITH p, connections,
     collect({source: src.uid, target: tgt.uid, rel: type(cr)}) AS cross_links,
     collect(DISTINCT tgt) AS cross_skill_nodes
RETURN p, connections, cross_links, cross_skill_nodes
"""

# ── Node type to label mapping ──

NODE_TYPE_LABELS = {
    "education": "Education",
    "work_experience": "WorkExperience",
    "certification": "Certification",
    "language": "Language",
    "publication": "Publication",
    "project": "Project",
    "skill": "Skill",
    "patent": "Patent",
    "award": "Award",
    "outreach": "Outreach",
}

NODE_TYPE_RELATIONSHIPS = {
    "education": "HAS_EDUCATION",
    "work_experience": "HAS_WORK_EXPERIENCE",
    "certification": "HAS_CERTIFICATION",
    "language": "SPEAKS",
    "publication": "HAS_PUBLICATION",
    "project": "HAS_PROJECT",
    "skill": "HAS_SKILL",
    "patent": "HAS_PATENT",
    "award": "HAS_AWARD",
    "outreach": "HAS_OUTREACH",
}

# ── Generic Node CRUD ──

ADD_NODE = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:{rel_type}]->(n:{label} $properties)
SET n.uid = $uid
RETURN n
"""

UPDATE_NODE = """
MATCH (n {uid: $uid})
SET n += $properties
RETURN n
"""

DELETE_NODE = """
MATCH (n {uid: $uid})
DETACH DELETE n
"""

# ── Merge keys for dedup during CV import ──

NODE_TYPE_MERGE_KEYS: dict[str, list[str]] = {
    "skill": ["name"],
    "language": ["name"],
    "work_experience": ["company", "title"],
    "education": ["institution", "degree"],
    "certification": ["name", "issuing_organization"],
    "publication": ["title"],
    "project": ["name"],
    "patent": ["title"],
    "award": ["name"],
    "outreach": ["title", "venue"],
}

# ── Cross-node relationships ──

LINK_SKILL = """
MATCH (n {uid: $node_uid}), (s:Skill {uid: $skill_uid})
MERGE (n)-[:USED_SKILL]->(s)
RETURN n, s
"""

UNLINK_SKILL = """
MATCH (n {uid: $node_uid})-[r:USED_SKILL]->(s:Skill {uid: $skill_uid})
DELETE r
RETURN n, s
"""

GET_SKILL_LINKS = """
MATCH (p:Person {user_id: $user_id})-[]->(n)
OPTIONAL MATCH (n)-[:USED_SKILL]->(s:Skill)
WITH n, collect(s.uid) AS skill_uids
WHERE size(skill_uids) > 0
RETURN n.uid AS node_uid, skill_uids
"""

# ── Invitation system: AccessCode, Waitlist, BetaConfig ──

COUNT_PERSONS = """
MATCH (p:Person)
RETURN count(p) AS total
"""

# AccessCode: shared, reusable codes that grant signup permission while the
# beta cap is not reached. Each code carries a label so we can attribute
# signups back to the channel that distributed it (newsletter, twitter, ...).

CREATE_ACCESS_CODE = """
CREATE (a:AccessCode {
    code: $code,
    label: $label,
    active: true,
    used_at: null,
    used_by: null,
    created_at: datetime(),
    created_by: $created_by
})
RETURN a
"""

GET_ACCESS_CODE = """
MATCH (a:AccessCode {code: $code})
RETURN a
"""

# Atomically consume an unused code: the WHERE clause prevents a race
# condition — if two signups hit the same code concurrently, the second
# transaction will see used_at is no longer null and return no rows.
CONSUME_ACCESS_CODE = """
MATCH (a:AccessCode {code: $code})
WHERE a.active = true AND a.used_at IS NULL
SET a.used_at = datetime(), a.used_by = $user_id
RETURN a
"""

LIST_ACCESS_CODES = """
MATCH (a:AccessCode)
RETURN a
ORDER BY a.created_at DESC
"""

SET_ACCESS_CODE_ACTIVE = """
MATCH (a:AccessCode {code: $code})
SET a.active = $active
RETURN a
"""

DELETE_ACCESS_CODE = """
MATCH (a:AccessCode {code: $code})
DELETE a
"""

COUNT_ACCESS_CODES = """
MATCH (a:AccessCode)
RETURN
    count(a) AS total,
    count(CASE WHEN a.used_at IS NOT NULL THEN 1 END) AS used,
    count(CASE WHEN a.used_at IS NULL AND a.active = true THEN 1 END) AS available
"""

# Pending users: registered but not yet activated (no signup_code, not admin).
# These replace the old Waitlist concept — since everyone now registers, the
# "waiting" users are simply Persons without a code.

LIST_PENDING_PERSONS = """
MATCH (p:Person)
WHERE p.signup_code IS NULL AND coalesce(p.is_admin, false) = false
RETURN p
ORDER BY p.created_at DESC
"""

COUNT_PENDING_PERSONS = """
MATCH (p:Person)
WHERE p.signup_code IS NULL AND coalesce(p.is_admin, false) = false
RETURN count(p) AS total
"""

# Activate a person by setting their signup_code after code validation.
ACTIVATE_PERSON = """
MATCH (p:Person {user_id: $user_id})
SET p.signup_code = $code, p.activated_at = datetime()
RETURN p
"""

# BetaConfig: singleton node holding the runtime-modifiable invite gate.
# `invite_code_required = true` means users need a valid code to access the
# platform. When the admin flips it to false, everyone gets in freely.

INIT_BETA_CONFIG = """
MERGE (c:BetaConfig {singleton: 'global'})
ON CREATE SET
    c.invite_code_required = $invite_code_required,
    c.created_at = datetime(),
    c.updated_at = datetime()
RETURN c
"""

GET_BETA_CONFIG = """
MATCH (c:BetaConfig {singleton: 'global'})
RETURN c
"""

UPDATE_BETA_CONFIG = """
MATCH (c:BetaConfig {singleton: 'global'})
SET c += $properties, c.updated_at = datetime()
RETURN c
"""

# Admin role: simple boolean flag on the Person node, queried on every admin
# request. Bootstrap is done out-of-band via scripts/grant_admin.py.

IS_ADMIN = """
MATCH (p:Person {user_id: $user_id})
RETURN coalesce(p.is_admin, false) AS is_admin
"""

GRANT_ADMIN_BY_USER_ID = """
MATCH (p:Person {user_id: $user_id})
SET p.is_admin = true
RETURN p
"""

REVOKE_ADMIN_BY_USER_ID = """
MATCH (p:Person {user_id: $user_id})
SET p.is_admin = false
RETURN p
"""

# ── Admin: user management ──

LIST_ALL_PERSONS = """
MATCH (p:Person)
RETURN p
ORDER BY p.created_at DESC
"""

GET_PERSON_DETAIL = """
MATCH (p:Person {user_id: $user_id})
OPTIONAL MATCH (p)-[r]->(n)
WITH p, count(DISTINCT CASE WHEN NOT n:AccessCode AND NOT n:BetaConfig AND NOT n:ProcessingRecord THEN n END) AS node_count
RETURN p, node_count
"""

DELETE_PERSON_FULL = """
MATCH (p:Person {user_id: $user_id})-[*1..]->(n)
WHERE NOT n:ProcessingRecord AND NOT n:OntologyVersion
WITH DISTINCT n DETACH DELETE n
"""

DELETE_PERSON_NODE = """
MATCH (p:Person {user_id: $user_id})
DETACH DELETE p
"""

ACTIVATE_PERSON_BY_ADMIN = """
MATCH (p:Person {user_id: $user_id})
WHERE p.signup_code IS NULL
SET p.signup_code = $code, p.activated_at = datetime()
RETURN p
"""

ACTIVATE_ALL_PENDING = """
MATCH (p:Person)
WHERE p.signup_code IS NULL AND coalesce(p.is_admin, false) = false
SET p.signup_code = $code, p.activated_at = datetime()
RETURN count(p) AS activated
"""

# ── Funnel metrics ──

FUNNEL_SIGNUPS_PER_DAY = """
MATCH (p:Person)
WHERE p.created_at >= datetime() - duration({days: $days})
WITH date(p.created_at) AS day
RETURN toString(day) AS date, count(*) AS count
ORDER BY date
"""

FUNNEL_ACTIVATIONS_PER_DAY = """
MATCH (p:Person)
WHERE p.activated_at IS NOT NULL
  AND p.activated_at >= datetime() - duration({days: $days})
WITH date(p.activated_at) AS day
RETURN toString(day) AS date, count(*) AS count
ORDER BY date
"""

# ── Insights ──

PROVIDER_BREAKDOWN = """
MATCH (p:Person)
RETURN coalesce(p.provider, 'unknown') AS provider, count(*) AS count
ORDER BY count DESC
"""

AVG_ACTIVATION_TIME = """
MATCH (p:Person)
WHERE p.activated_at IS NOT NULL AND p.created_at IS NOT NULL
WITH duration.between(p.created_at, p.activated_at) AS d
RETURN
    count(d) AS total,
    avg(d.hours + d.minutes / 60.0) AS avg_hours,
    min(d.hours + d.minutes / 60.0) AS min_hours,
    max(d.hours + d.minutes / 60.0) AS max_hours
"""

CODE_ATTRIBUTION = """
MATCH (p:Person)
WHERE p.signup_code IS NOT NULL
OPTIONAL MATCH (a:AccessCode {code: p.signup_code})
RETURN
    coalesce(a.label, p.signup_code) AS label,
    count(*) AS count
ORDER BY count DESC
"""

ENGAGEMENT_DISTRIBUTION = """
MATCH (p:Person)
WHERE p.signup_code IS NOT NULL OR coalesce(p.is_admin, false) = true
OPTIONAL MATCH (p)-[]->(n)
WHERE NOT n:AccessCode AND NOT n:BetaConfig AND NOT n:ProcessingRecord AND NOT n:OntologyVersion
WITH p, count(DISTINCT n) AS nodes
RETURN
    CASE
        WHEN nodes = 0 THEN '0'
        WHEN nodes <= 10 THEN '1-10'
        WHEN nodes <= 50 THEN '11-50'
        ELSE '50+'
    END AS bucket,
    count(*) AS count
ORDER BY
    CASE bucket
        WHEN '0' THEN 0
        WHEN '1-10' THEN 1
        WHEN '11-50' THEN 2
        ELSE 3
    END
"""

# ── Extended insights ──

CUMULATIVE_GROWTH = """
MATCH (p:Person)
WITH date(p.created_at) AS day
ORDER BY day
WITH day, count(*) AS daily
WITH collect({date: toString(day), count: daily}) AS rows
WITH rows,
     [i IN range(0, size(rows)-1) |
       {date: rows[i].date,
        count: reduce(s = 0, j IN range(0, i) | s + rows[j].count)}
     ] AS cumulative
UNWIND cumulative AS row
RETURN row.date AS date, row.count AS count
"""

ACTIVATION_STAGES = """
MATCH (p:Person)
WITH
    count(p) AS registered,
    count(CASE WHEN p.signup_code IS NOT NULL OR coalesce(p.is_admin, false) THEN 1 END) AS activated
MATCH (p2:Person)
WHERE p2.signup_code IS NOT NULL OR coalesce(p2.is_admin, false) = true
OPTIONAL MATCH (p2)-[]->(n)
WHERE NOT n:AccessCode AND NOT n:BetaConfig AND NOT n:ProcessingRecord AND NOT n:OntologyVersion
WITH registered, activated, p2, count(DISTINCT n) AS nodes
WITH registered, activated,
    count(CASE WHEN nodes > 0 THEN 1 END) AS built_orb,
    count(CASE WHEN nodes >= 10 THEN 1 END) AS rich_orb
RETURN registered, activated, built_orb, rich_orb
"""

TOP_SKILLS = """
MATCH (:Person)-[:HAS_SKILL]->(s:Skill)
RETURN s.name AS name, count(*) AS count
ORDER BY count DESC
LIMIT 15
"""

NODE_TYPE_DISTRIBUTION = """
MATCH (p:Person)-[]->(n)
WHERE NOT n:AccessCode AND NOT n:BetaConfig AND NOT n:ProcessingRecord AND NOT n:OntologyVersion
WITH labels(n)[0] AS label, count(DISTINCT n) AS count
RETURN label, count
ORDER BY count DESC
"""

PROFILE_COMPLETENESS = """
MATCH (p:Person)
WHERE p.signup_code IS NOT NULL OR coalesce(p.is_admin, false) = true
WITH p,
    CASE WHEN p.headline IS NOT NULL AND p.headline <> '' THEN 1 ELSE 0 END +
    CASE WHEN p.location IS NOT NULL AND p.location <> '' THEN 1 ELSE 0 END +
    CASE WHEN p.linkedin_url IS NOT NULL AND p.linkedin_url <> '' THEN 1 ELSE 0 END +
    CASE WHEN p.website_url IS NOT NULL AND p.website_url <> '' THEN 1 ELSE 0 END +
    CASE WHEN p.picture IS NOT NULL AND p.picture <> '' THEN 1 ELSE 0 END
    AS filled
RETURN
    count(CASE WHEN filled = 0 THEN 1 END) AS empty,
    count(CASE WHEN filled >= 1 AND filled <= 2 THEN 1 END) AS partial,
    count(CASE WHEN filled >= 3 AND filled <= 4 THEN 1 END) AS good,
    count(CASE WHEN filled = 5 THEN 1 END) AS complete
"""

GRAPH_RICHNESS = """
MATCH (p:Person)
WHERE p.signup_code IS NOT NULL OR coalesce(p.is_admin, false) = true
OPTIONAL MATCH (p)-[]->(n)
WHERE NOT n:AccessCode AND NOT n:BetaConfig AND NOT n:ProcessingRecord AND NOT n:OntologyVersion
WITH p, count(DISTINCT n) AS nodes
RETURN
    count(p) AS total_users,
    avg(nodes) AS avg_nodes,
    min(nodes) AS min_nodes,
    max(nodes) AS max_nodes,
    percentileCont(nodes, 0.5) AS median_nodes
"""

RECENTLY_ACTIVE_USERS = """
MATCH (p:Person)
WHERE p.updated_at IS NOT NULL
  AND p.updated_at >= datetime() - duration({days: $days})
  AND (p.signup_code IS NOT NULL OR coalesce(p.is_admin, false) = true)
RETURN count(p) AS count
"""

CODE_EFFICIENCY = """
MATCH (a:AccessCode)
WITH coalesce(a.label, 'unlabeled') AS label,
     count(a) AS created,
     count(CASE WHEN a.used_at IS NOT NULL THEN 1 END) AS used
RETURN label, created, used,
       CASE WHEN created > 0 THEN toFloat(used) / created ELSE 0.0 END AS rate
ORDER BY used DESC
"""

# ── Ontology Versioning ──

CREATE_ONTOLOGY_VERSION = """
CREATE (ov:OntologyVersion {
    version_id: $version_id,
    version_number: $version_number,
    content_hash: $content_hash,
    schema_definition: $schema_definition,
    extraction_prompt: $extraction_prompt,
    source_file: $source_file,
    prompt_reviewed: $prompt_reviewed,
    created_at: datetime()
})
RETURN ov
"""

GET_LATEST_ONTOLOGY_VERSION = """
MATCH (ov:OntologyVersion)
RETURN ov
ORDER BY ov.version_number DESC
LIMIT 1
"""

LINK_ONTOLOGY_SUPERSEDES = """
MATCH (newer:OntologyVersion {version_id: $newer_id})
MATCH (older:OntologyVersion {version_id: $older_id})
CREATE (newer)-[:SUPERSEDES]->(older)
"""

# ── Processing Records ──

CREATE_PROCESSING_RECORD = """
CREATE (pr:ProcessingRecord {
    record_id: $record_id,
    document_id: $document_id,
    llm_provider: $llm_provider,
    llm_model: $llm_model,
    extraction_method: $extraction_method,
    prompt_hash: $prompt_hash,
    nodes_extracted: $nodes_extracted,
    edges_extracted: $edges_extracted,
    processed_at: datetime()
})
RETURN pr
"""

LINK_PROCESSING_RECORD_TO_ONTOLOGY = """
MATCH (pr:ProcessingRecord {record_id: $record_id})
MATCH (ov:OntologyVersion {version_id: $version_id})
CREATE (pr)-[:USED_ONTOLOGY]->(ov)
"""

LINK_PROCESSING_RECORD_TO_NODE = """
MATCH (pr:ProcessingRecord {record_id: $record_id})
MATCH (n {uid: $node_uid})
CREATE (pr)-[:EXTRACTED]->(n)
"""

LINK_PERSON_TO_PROCESSING_RECORD = """
MATCH (p:Person {user_id: $user_id})
MATCH (pr:ProcessingRecord {record_id: $record_id})
CREATE (p)-[:HAS_PROCESSING_RECORD]->(pr)
"""

GET_USER_PROCESSING_RECORDS = """
MATCH (p:Person {user_id: $user_id})-[:HAS_PROCESSING_RECORD]->(pr:ProcessingRecord)
OPTIONAL MATCH (pr)-[:USED_ONTOLOGY]->(ov:OntologyVersion)
RETURN pr, ov.version_number AS ontology_version
ORDER BY pr.processed_at DESC
"""

# ── Share Tokens ──

CREATE_SHARE_TOKEN = """
MATCH (p:Person {user_id: $user_id})
WHERE p.orb_id IS NOT NULL AND p.orb_id <> ''
CREATE (p)-[:HAS_SHARE_TOKEN]->(st:ShareToken {
    token_id: $token_id,
    orb_id: p.orb_id,
    keywords: $keywords,
    hidden_node_types: $hidden_node_types,
    label: $label,
    created_at: datetime(),
    expires_at: $expires_at,
    revoked: false,
    revoked_at: null
})
RETURN st
"""

VALIDATE_SHARE_TOKEN = """
MATCH (st:ShareToken {token_id: $token_id})
WHERE st.revoked = false
  AND (st.expires_at IS NULL OR st.expires_at > datetime())
RETURN st.orb_id AS orb_id, st.keywords AS keywords,
       coalesce(st.hidden_node_types, []) AS hidden_node_types
"""

LIST_SHARE_TOKENS = """
MATCH (p:Person {user_id: $user_id})-[:HAS_SHARE_TOKEN]->(st:ShareToken)
RETURN st
ORDER BY st.created_at DESC
"""

REVOKE_SHARE_TOKEN = """
MATCH (p:Person {user_id: $user_id})-[:HAS_SHARE_TOKEN]->(st:ShareToken {token_id: $token_id})
WHERE st.revoked = false
SET st.revoked = true, st.revoked_at = datetime()
RETURN st
"""

DELETE_SHARE_TOKEN = """
MATCH (p:Person {user_id: $user_id})-[:HAS_SHARE_TOKEN]->(st:ShareToken {token_id: $token_id})
DETACH DELETE st
RETURN true AS deleted
"""
