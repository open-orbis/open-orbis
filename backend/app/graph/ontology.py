"""Ontology file parsing, hashing, and version detection."""
from __future__ import annotations

import hashlib
import logging
import re

logger = logging.getLogger(__name__)

ONTOLOGY_FILE = "ontology.md"


def hash_content(content: str) -> str:
    """Return SHA-256 hex digest of the given string."""
    return hashlib.sha256(content.encode()).hexdigest()


def parse_ontology_markdown(content: str) -> dict:
    """Parse ontology.md into a structured JSON-serializable dict.

    Returns:
        {
            "nodes": [{"label": "Person", "properties": [{"name": "user_id", "type": "string"}, ...]}],
            "relationships": [{"type": "HAS_EDUCATION", "from": "Person", "to": "Education"}, ...]
        }
    """
    nodes: list[dict] = []
    relationships: list[dict] = []

    current_node: dict | None = None
    in_person_rel_table = False
    in_cross_rel_table = False

    for line in content.split("\n"):
        stripped = line.strip()

        # Detect node header: ### NodeName or ### NodeName (Root Node)
        node_match = re.match(r"^###\s+(\w+)(?:\s+\(.*\))?\s*$", stripped)
        if node_match and not stripped.startswith("### Person →") and not stripped.startswith("### Cross"):
            if current_node:
                nodes.append(current_node)
            current_node = {"label": node_match.group(1), "properties": []}
            in_person_rel_table = False
            in_cross_rel_table = False
            continue

        # Detect property: - `name` (type) — description
        prop_match = re.match(r"^-\s+`(\w+)`\s+\((\w+)\)", stripped)
        if prop_match and current_node:
            current_node["properties"].append({
                "name": prop_match.group(1),
                "type": prop_match.group(2),
            })
            continue

        # Detect Person → Node table
        if "### Person →" in stripped or "Person → Node" in stripped:
            if current_node:
                nodes.append(current_node)
                current_node = None
            in_person_rel_table = True
            in_cross_rel_table = False
            continue

        # Detect Cross-node table
        if "### Cross-node" in stripped or "### Cross" in stripped:
            if current_node:
                nodes.append(current_node)
                current_node = None
            in_cross_rel_table = True
            in_person_rel_table = False
            continue

        # Parse Person → Node table rows: | HAS_EDUCATION | Education |
        if in_person_rel_table:
            row_match = re.match(r"^\|\s*(\w+)\s*\|\s*(\w+)\s*\|", stripped)
            if row_match and row_match.group(1) not in ("Relationship", "-", "---"):
                relationships.append({
                    "type": row_match.group(1),
                    "from": "Person",
                    "to": row_match.group(2),
                })
            continue

        # Parse Cross-node table rows: | USED_SKILL | Source... | Skill |
        if in_cross_rel_table:
            row_match = re.match(r"^\|\s*(\w+)\s*\|(.+)\|\s*(\w+)\s*\|", stripped)
            if row_match and row_match.group(1) not in ("Relationship", "-", "---"):
                sources = [s.strip() for s in row_match.group(2).split(",")]
                for source in sources:
                    source = source.strip()
                    if source:
                        relationships.append({
                            "type": row_match.group(1),
                            "from": source,
                            "to": row_match.group(3).strip(),
                        })
            continue

    if current_node:
        nodes.append(current_node)

    return {"nodes": nodes, "relationships": relationships}


def read_ontology_file(project_root: str) -> str:
    """Read the ontology file from disk."""
    import os
    path = os.path.join(project_root, ONTOLOGY_FILE)
    with open(path) as f:
        return f.read()
