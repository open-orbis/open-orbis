"""Strict per-node-type property allowlist.

User-supplied PDFs flow into the LLM prompt and the LLM's JSON output is
parsed and written to Neo4j. Without an allowlist, a crafted PDF can ask
the LLM to return arbitrary keys (``is_admin``, ``user_id``, …) and poison
the graph via the /cv/confirm and /notes write paths. The manual /orbs
node endpoints are vulnerable to the same shape of abuse from a
direct API client that bypasses the UI.

``sanitize_node_properties`` is the single chokepoint: every write path
should filter its payload through it before calling ``encrypt_properties``.
"""

from __future__ import annotations

import logging

from app.graph.queries import NODE_TYPE_LABELS

logger = logging.getLogger(__name__)

MAX_STRING_LEN = 5000

ALLOWED_NODE_PROPERTIES: dict[str, frozenset[str]] = {
    "work_experience": frozenset(
        {
            "company",
            "title",
            "start_date",
            "end_date",
            "description",
            "location",
            "company_url",
        }
    ),
    "education": frozenset(
        {
            "institution",
            "degree",
            "field_of_study",
            "start_date",
            "end_date",
            "description",
            "location",
        }
    ),
    "skill": frozenset({"name", "category", "proficiency"}),
    "language": frozenset({"name", "proficiency"}),
    "certification": frozenset(
        {
            "name",
            "issuing_organization",
            "issue_date",
            "expiry_date",
            "credential_url",
        }
    ),
    "publication": frozenset({"title", "venue", "date", "doi", "url", "abstract"}),
    "project": frozenset(
        {"name", "role", "description", "start_date", "end_date", "url"}
    ),
    "patent": frozenset(
        {
            "title",
            "patent_number",
            "filing_date",
            "grant_date",
            "description",
            "url",
        }
    ),
    "award": frozenset({"name", "issuer", "date", "description"}),
    "outreach": frozenset({"title", "venue", "date", "description", "url"}),
    "training": frozenset({"title", "provider", "date", "description", "url"}),
}

# Inverse lookup for update paths that only have the Neo4j label.
LABEL_TO_NODE_TYPE: dict[str, str] = {
    label: node_type for node_type, label in NODE_TYPE_LABELS.items()
}


def sanitize_node_properties(node_type: str, properties: dict) -> dict:
    """Drop unknown keys and cap oversize strings before persisting a node.

    Unknown node_types yield an empty dict — the caller is expected to
    have already rejected the request via the existing NODE_TYPE_LABELS
    gate, but we double-check here so this helper is safe in isolation.
    """
    allowed = ALLOWED_NODE_PROPERTIES.get(node_type)
    if allowed is None:
        logger.warning(
            "sanitize_node_properties: unknown node_type=%s, dropping all keys",
            node_type,
        )
        return {}

    clean: dict = {}
    dropped: list[str] = []
    for key, value in properties.items():
        if key not in allowed:
            dropped.append(key)
            continue
        if isinstance(value, str) and len(value) > MAX_STRING_LEN:
            value = value[:MAX_STRING_LEN]
        clean[key] = value

    if dropped:
        logger.warning(
            "sanitize_node_properties: dropped %d unauthorized keys from "
            "node_type=%s: %s",
            len(dropped),
            node_type,
            sorted(dropped),
        )
    return clean
