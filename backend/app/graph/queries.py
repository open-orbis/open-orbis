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
