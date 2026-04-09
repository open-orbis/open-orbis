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
    created_at: datetime(),
    created_by: $created_by
})
RETURN a
"""

GET_ACCESS_CODE = """
MATCH (a:AccessCode {code: $code})
RETURN a
"""

LIST_ACCESS_CODES = """
MATCH (a:AccessCode)
OPTIONAL MATCH (p:Person {signup_code: a.code})
WITH a, count(p) AS uses
RETURN a, uses
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

# Waitlist: people who tried to register but were rejected. MERGE on email so
# repeated attempts (same person retrying via Google then LinkedIn) collapse
# into a single row with bumped attempts/last_attempt_at.

UPSERT_WAITLIST = """
MERGE (w:Waitlist {email: $email})
ON CREATE SET
    w.name = $name,
    w.provider = $provider,
    w.attempted_code = $attempted_code,
    w.reason = $reason,
    w.first_attempt_at = datetime(),
    w.last_attempt_at = datetime(),
    w.attempts = 1,
    w.contacted = false
ON MATCH SET
    w.name = $name,
    w.provider = $provider,
    w.attempted_code = $attempted_code,
    w.reason = $reason,
    w.last_attempt_at = datetime(),
    w.attempts = w.attempts + 1
RETURN w
"""

LIST_WAITLIST = """
MATCH (w:Waitlist)
RETURN w
ORDER BY w.last_attempt_at DESC
"""

MARK_WAITLIST_CONTACTED = """
MATCH (w:Waitlist {email: $email})
SET w.contacted = $contacted, w.contacted_at = datetime()
RETURN w
"""

WAITLIST_STATS = """
MATCH (w:Waitlist)
RETURN w.reason AS reason, count(w) AS count
"""

# BetaConfig: a singleton node holding the runtime-modifiable cap and master
# switch. We use a constant `singleton` field with a unique constraint so it
# is structurally impossible to create a second config row.

INIT_BETA_CONFIG = """
MERGE (c:BetaConfig {singleton: 'global'})
ON CREATE SET
    c.max_users = $max_users,
    c.registration_enabled = true,
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
