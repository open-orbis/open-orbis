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
WITH p, count(DISTINCT CASE WHEN NOT n:AccessCode AND NOT n:BetaConfig THEN n END) AS node_count
RETURN p, node_count
"""

DELETE_PERSON_FULL = """
MATCH (p:Person {user_id: $user_id})-[*1..]->(n)
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
