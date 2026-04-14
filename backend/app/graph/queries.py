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
    waitlist_joined: true,
    waitlist_joined_at: datetime(),
    is_admin: false,
    headline: '',
    location: '',
    linkedin_url: '',
    scholar_url: '',
    website_url: '',
    orcid_url: '',
    open_to_work: false,
    visibility: 'restricted',
    created_at: datetime(),
    updated_at: datetime()
})
RETURN p
"""

GET_PERSON_BY_USER_ID = """
MATCH (p:Person {user_id: $user_id})
RETURN p
"""

GET_PERSON_VISIBILITY = """
MATCH (p:Person {orb_id: $orb_id})
RETURN coalesce(p.visibility, 'public') AS visibility
"""

# ── Access grants (restricted-mode allowlist) ──

CREATE_ACCESS_GRANT = """
MATCH (p:Person {user_id: $user_id})
WHERE p.orb_id IS NOT NULL AND p.orb_id <> ''
OPTIONAL MATCH (p)-[:GRANTED_ACCESS]->(old:AccessGrant {email: $email})
WHERE old.revoked = false
SET old.revoked = true, old.revoked_at = datetime()
CREATE (p)-[:GRANTED_ACCESS]->(g:AccessGrant {
    grant_id:   $grant_id,
    orb_id:     p.orb_id,
    email:      $email,
    keywords:   $keywords,
    hidden_node_types: $hidden_node_types,
    created_at: datetime(),
    revoked:    false,
    revoked_at: null
})
RETURN g, p.orb_id AS orb_id, p.name AS owner_name
"""

LIST_ACCESS_GRANTS = """
MATCH (p:Person {user_id: $user_id})-[:GRANTED_ACCESS]->(g:AccessGrant)
WHERE g.revoked = false
RETURN g
ORDER BY g.created_at DESC
"""

REVOKE_ACCESS_GRANT = """
MATCH (p:Person {user_id: $user_id})-[:GRANTED_ACCESS]->(g:AccessGrant {grant_id: $grant_id})
SET g.revoked = true, g.revoked_at = datetime()
RETURN g
"""

CHECK_ACCESS_GRANT = """
MATCH (p:Person {orb_id: $orb_id})-[:GRANTED_ACCESS]->(g:AccessGrant {email: $email})
WHERE g.revoked = false
RETURN g
ORDER BY g.created_at DESC
LIMIT 1
"""

UPDATE_ACCESS_GRANT_FILTERS = """
MATCH (p:Person {user_id: $user_id})-[:GRANTED_ACCESS]->(g:AccessGrant {grant_id: $grant_id})
WHERE g.revoked = false
SET g.keywords = $keywords,
    g.hidden_node_types = $hidden_node_types,
    g.filters_updated_at = datetime()
RETURN g
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
MATCH (p:Person {user_id: $user_id})-[*1..]->(n)
WHERE NOT n:ProcessingRecord AND NOT n:OntologyVersion
  AND NOT n:ShareToken AND NOT n:AccessGrant
  AND NOT n:RefreshToken AND NOT n:MCPApiKey
  AND NOT n:LLMUsage AND NOT n:ConnectionRequest
WITH DISTINCT n
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
      AND NOT n:AccessGrant AND NOT n:ConnectionRequest AND NOT n:LLMUsage
      AND NOT n:RefreshToken

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
      AND NOT n:AccessGrant AND NOT n:ConnectionRequest AND NOT n:LLMUsage
      AND NOT n:RefreshToken

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
    "training": "Training",
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
    "training": "HAS_TRAINING",
}

# ── Generic Node CRUD ──

ADD_NODE = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:{rel_type}]->(n:{label} $properties)
SET n.uid = $uid
RETURN n
"""

UPDATE_NODE = """
MATCH (p:Person {user_id: $user_id})-[]->(n {uid: $uid})
SET n += $properties
RETURN n
"""

DELETE_NODE = """
MATCH (p:Person {user_id: $user_id})-[]->(n {uid: $uid})
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
    "training": ["title", "provider"],
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
SKIP $offset
LIMIT $limit
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

# Pending users: registered but not yet activated (no signup_code, not admin),
# and currently marked as joined to the waitlist.

LIST_PENDING_PERSONS = """
MATCH (p:Person)
WHERE p.signup_code IS NULL
  AND coalesce(p.is_admin, false) = false
  AND coalesce(p.waitlist_joined, false) = true
RETURN p
ORDER BY p.created_at DESC
"""

COUNT_PENDING_PERSONS = """
MATCH (p:Person)
WHERE p.signup_code IS NULL
  AND coalesce(p.is_admin, false) = false
  AND coalesce(p.waitlist_joined, false) = true
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
SKIP $offset
LIMIT $limit
"""

COUNT_ALL_PERSONS = """
MATCH (p:Person)
RETURN count(p) AS total
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

# ── LLM Usage Tracking ──

CREATE_LLM_USAGE = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:HAS_LLM_USAGE]->(u:LLMUsage {
    usage_id: $usage_id,
    endpoint: $endpoint,
    llm_provider: $llm_provider,
    llm_model: $llm_model,
    input_tokens: $input_tokens,
    output_tokens: $output_tokens,
    total_tokens: $total_tokens,
    cost_usd: $cost_usd,
    duration_ms: $duration_ms,
    created_at: datetime()
})
RETURN u
"""

GET_USER_LLM_USAGE = """
MATCH (p:Person {user_id: $user_id})-[:HAS_LLM_USAGE]->(u:LLMUsage)
RETURN u
ORDER BY u.created_at DESC
"""

GET_LLM_USAGE_AGGREGATE = """
MATCH (:Person)-[:HAS_LLM_USAGE]->(u:LLMUsage)
WITH count(u) AS total_calls,
     sum(CASE WHEN u.cost_usd IS NOT NULL THEN u.cost_usd ELSE 0 END) AS total_cost,
     collect(u.cost_usd) AS costs,
     collect(u.duration_ms) AS durations,
     collect(u.total_tokens) AS tokens
WITH total_calls, total_cost, costs, durations, tokens,
     [x IN costs WHERE x IS NOT NULL] AS valid_costs,
     [x IN durations WHERE x IS NOT NULL] AS valid_durations,
     [x IN tokens WHERE x IS NOT NULL] AS valid_tokens
RETURN total_calls, total_cost,
       CASE WHEN size(valid_costs) > 0 THEN reduce(s = 0.0, x IN valid_costs | s + x) / size(valid_costs) ELSE null END AS cost_mean,
       CASE WHEN size(valid_costs) > 1 THEN reduce(s = 0.0, x IN valid_costs | s + (x - reduce(s2 = 0.0, y IN valid_costs | s2 + y) / size(valid_costs))^2) / (size(valid_costs) - 1) ELSE null END AS cost_variance,
       CASE WHEN size(valid_costs) > 0 THEN reduce(s = valid_costs[0], x IN valid_costs | CASE WHEN x < s THEN x ELSE s END) ELSE null END AS cost_min,
       CASE WHEN size(valid_costs) > 0 THEN reduce(s = valid_costs[0], x IN valid_costs | CASE WHEN x > s THEN x ELSE s END) ELSE null END AS cost_max,
       CASE WHEN size(valid_durations) > 0 THEN reduce(s = 0.0, x IN valid_durations | s + x) / size(valid_durations) ELSE null END AS duration_mean,
       CASE WHEN size(valid_durations) > 1 THEN reduce(s = 0.0, x IN valid_durations | s + (x - reduce(s2 = 0.0, y IN valid_durations | s2 + y) / size(valid_durations))^2) / (size(valid_durations) - 1) ELSE null END AS duration_variance,
       CASE WHEN size(valid_durations) > 0 THEN reduce(s = valid_durations[0], x IN valid_durations | CASE WHEN x < s THEN x ELSE s END) ELSE null END AS duration_min,
       CASE WHEN size(valid_durations) > 0 THEN reduce(s = valid_durations[0], x IN valid_durations | CASE WHEN x > s THEN x ELSE s END) ELSE null END AS duration_max,
       CASE WHEN size(valid_tokens) > 0 THEN reduce(s = 0.0, x IN valid_tokens | s + x) / size(valid_tokens) ELSE null END AS token_mean,
       CASE WHEN size(valid_tokens) > 1 THEN reduce(s = 0.0, x IN valid_tokens | s + (x - reduce(s2 = 0.0, y IN valid_tokens | s2 + y) / size(valid_tokens))^2) / (size(valid_tokens) - 1) ELSE null END AS token_variance
"""

GET_LLM_USAGE_BY_ENDPOINT = """
MATCH (:Person)-[:HAS_LLM_USAGE]->(u:LLMUsage)
RETURN u.endpoint AS endpoint,
       count(u) AS count,
       sum(CASE WHEN u.cost_usd IS NOT NULL THEN u.cost_usd ELSE 0 END) AS total_cost
ORDER BY count DESC
"""

GET_LLM_USAGE_BY_MODEL = """
MATCH (:Person)-[:HAS_LLM_USAGE]->(u:LLMUsage)
RETURN u.llm_model AS model,
       count(u) AS count,
       sum(CASE WHEN u.cost_usd IS NOT NULL THEN u.cost_usd ELSE 0 END) AS total_cost
ORDER BY count DESC
"""

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


# ── Refresh Tokens ──
# We store the SHA-256 hash of the raw token, never the token itself, so a
# DB leak cannot be used to hijack active sessions. Rotation is tracked via
# `replaced_by`; a reuse of an already-rotated token triggers a cascade
# revoke of the whole family (handled in refresh_tokens.py).

CREATE_REFRESH_TOKEN = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:HAS_REFRESH_TOKEN]->(rt:RefreshToken {
    token_id:    $token_id,
    hash:        $hash,
    issued_at:   datetime(),
    expires_at:  $expires_at,
    revoked:     false,
    revoked_at:  null,
    replaced_by: null,
    user_agent:  $user_agent
})
RETURN rt
"""

GET_REFRESH_TOKEN_BY_HASH = """
MATCH (p:Person)-[:HAS_REFRESH_TOKEN]->(rt:RefreshToken {hash: $hash})
RETURN rt, p.user_id AS user_id, p.email AS email
LIMIT 1
"""

REVOKE_REFRESH_TOKEN = """
MATCH (rt:RefreshToken {token_id: $token_id})
SET rt.revoked = true, rt.revoked_at = datetime()
RETURN rt
"""

MARK_REFRESH_TOKEN_ROTATED = """
MATCH (rt:RefreshToken {token_id: $token_id})
SET rt.revoked = true,
    rt.revoked_at = datetime(),
    rt.replaced_by = $replaced_by
RETURN rt
"""

# Follow the `replaced_by` chain forward from a token to revoke an entire
# family. Used when we detect the reuse of an already-rotated refresh token,
# which means either the legitimate user or an attacker is holding a stale
# copy — safest to force re-login on all descendants.
REVOKE_REFRESH_TOKEN_FAMILY = """
MATCH (start:RefreshToken {token_id: $token_id})
OPTIONAL MATCH path = (start)<-[:REPLACED_BY*0..]-(ancestor:RefreshToken)
OPTIONAL MATCH chain = (start)-[:REPLACED_BY*0..]->(descendant:RefreshToken)
WITH collect(DISTINCT start) + collect(DISTINCT ancestor) + collect(DISTINCT descendant) AS family
UNWIND family AS node
WITH DISTINCT node WHERE node IS NOT NULL
SET node.revoked = true,
    node.revoked_at = coalesce(node.revoked_at, datetime())
RETURN count(node) AS revoked_count
"""

REVOKE_ALL_REFRESH_TOKENS_FOR_USER = """
MATCH (p:Person {user_id: $user_id})-[:HAS_REFRESH_TOKEN]->(rt:RefreshToken)
WHERE rt.revoked = false
SET rt.revoked = true, rt.revoked_at = datetime()
RETURN count(rt) AS revoked_count
"""

PURGE_EXPIRED_REFRESH_TOKENS = """
MATCH (rt:RefreshToken)
WHERE rt.expires_at < datetime()
DETACH DELETE rt
RETURN count(rt) AS deleted
"""


# ── MCP API Keys ──
# Long-lived machine credentials for the MCP server. Stored as SHA-256 hash
# of the raw token. Scoped to a single Person so every tool call resolves
# to a user_id and can only touch that user's graph.

CREATE_MCP_API_KEY = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:HAS_MCP_KEY]->(k:MCPApiKey {
    key_id:       $key_id,
    hash:         $hash,
    label:        $label,
    created_at:   datetime(),
    last_used_at: null,
    revoked:      false,
    revoked_at:   null
})
RETURN k
"""

GET_MCP_KEY_BY_HASH = """
MATCH (p:Person)-[:HAS_MCP_KEY]->(k:MCPApiKey {hash: $hash})
WHERE k.revoked = false
RETURN k, p.user_id AS user_id
LIMIT 1
"""

TOUCH_MCP_KEY_LAST_USED = """
MATCH (k:MCPApiKey {key_id: $key_id})
SET k.last_used_at = datetime()
"""

LIST_MCP_KEYS_FOR_USER = """
MATCH (p:Person {user_id: $user_id})-[:HAS_MCP_KEY]->(k:MCPApiKey)
RETURN k
ORDER BY k.created_at DESC
"""

REVOKE_MCP_KEY = """
MATCH (p:Person {user_id: $user_id})-[:HAS_MCP_KEY]->(k:MCPApiKey {key_id: $key_id})
SET k.revoked = true, k.revoked_at = datetime()
RETURN k
"""
