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


_TABLE_HEADER_NAMES = ("Relationship", "-", "---")


def _parse_person_rel_row(stripped: str, relationships: list[dict]) -> None:
    """Parse a Person → Node relationship table row."""
    row_match = re.match(r"^\|\s*(\w+)\s*\|\s*(\w+)\s*\|", stripped)
    if row_match and row_match.group(1) not in _TABLE_HEADER_NAMES:
        relationships.append(
            {
                "type": row_match.group(1),
                "from": "Person",
                "to": row_match.group(2),
            }
        )


def _parse_cross_rel_row(stripped: str, relationships: list[dict]) -> None:
    """Parse a Cross-node relationship table row."""
    row_match = re.match(r"^\|\s*(\w+)\s*\|(.+)\|\s*(\w+)\s*\|", stripped)
    if row_match and row_match.group(1) not in _TABLE_HEADER_NAMES:
        for source in row_match.group(2).split(","):
            source = source.strip()
            if source:
                relationships.append(
                    {
                        "type": row_match.group(1),
                        "from": source,
                        "to": row_match.group(3).strip(),
                    }
                )


def parse_ontology_markdown(content: str) -> dict:
    """Parse ontology.md into a structured JSON-serializable dict.

    Returns:
        {
            "nodes": [{"label": "Person", "properties": [...]}],
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
        if node_match and "Person →" not in stripped and "Cross" not in stripped:
            if current_node:
                nodes.append(current_node)
            current_node = {"label": node_match.group(1), "properties": []}
            in_person_rel_table = False
            in_cross_rel_table = False
            continue

        # Detect property: - `name` (type)
        prop_match = re.match(r"^-\s+`(\w+)`\s+\((\w+)\)", stripped)
        if prop_match and current_node:
            current_node["properties"].append(
                {
                    "name": prop_match.group(1),
                    "type": prop_match.group(2),
                }
            )
            continue

        # Detect relationship table sections
        if "Person →" in stripped or "Person → Node" in stripped:
            if current_node:
                nodes.append(current_node)
                current_node = None
            in_person_rel_table = True
            in_cross_rel_table = False
            continue

        if "Cross-node" in stripped or "### Cross" in stripped:
            if current_node:
                nodes.append(current_node)
                current_node = None
            in_cross_rel_table = True
            in_person_rel_table = False
            continue

        if in_person_rel_table:
            _parse_person_rel_row(stripped, relationships)
            continue

        if in_cross_rel_table:
            _parse_cross_rel_row(stripped, relationships)
            continue

    if current_node:
        nodes.append(current_node)

    return {"nodes": nodes, "relationships": relationships}


def read_ontology_file(project_root: str) -> str:
    """Read the ontology file from disk."""
    from pathlib import Path

    return (Path(project_root) / ONTOLOGY_FILE).read_text()
