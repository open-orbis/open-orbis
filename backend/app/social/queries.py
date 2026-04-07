"""Cypher query templates for social graph operations."""

# ── User node (lazy creation) ──

MERGE_USER = """
MERGE (u:User {user_id: $user_id})
RETURN u
"""

# ── Connections ──

CREATE_CONNECTION = """
MATCH (a:User {user_id: $from_user_id})
MATCH (b:User {user_id: $to_user_id})
WITH a, b
WHERE NOT (a)-[:CONNECTED_TO]->(b)
CREATE (a)-[r:CONNECTED_TO {created_at: datetime()}]->(b)
RETURN r, a, b
"""

GET_CONNECTIONS = """
MATCH (me:User {user_id: $user_id})
OPTIONAL MATCH (me)-[r_out:CONNECTED_TO]->(target_out:User)
WITH me, collect({user_id: target_out.user_id, direction: 'outgoing', created_at: toString(r_out.created_at)}) AS outgoing
OPTIONAL MATCH (source_in:User)-[r_in:CONNECTED_TO]->(me)
WITH outgoing, collect({user_id: source_in.user_id, direction: 'incoming', created_at: toString(r_in.created_at)}) AS incoming
RETURN outgoing + incoming AS connections
"""

DELETE_CONNECTION = """
MATCH (me:User {user_id: $user_id})-[r:CONNECTED_TO]-(other:User {user_id: $target_user_id})
DELETE r
RETURN count(r) AS deleted_count
"""
