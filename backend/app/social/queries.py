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
WITH me, collect(CASE WHEN target_out IS NOT NULL THEN {user_id: target_out.user_id, direction: 'outgoing', created_at: toString(r_out.created_at)} END) AS outgoing
OPTIONAL MATCH (source_in:User)-[r_in:CONNECTED_TO]->(me)
WITH outgoing, collect(CASE WHEN source_in IS NOT NULL THEN {user_id: source_in.user_id, direction: 'incoming', created_at: toString(r_in.created_at)} END) AS incoming
RETURN [x IN outgoing + incoming WHERE x IS NOT NULL] AS connections
"""

DELETE_CONNECTION = """
MATCH (me:User {user_id: $user_id})-[r:CONNECTED_TO]-(other:User {user_id: $target_user_id})
DELETE r
RETURN 1 AS deleted_count
"""
