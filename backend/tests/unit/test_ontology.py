"""Tests for ontology file parsing and version detection."""

import hashlib
import json

from app.graph.ontology import hash_content, parse_ontology_markdown

SAMPLE_ONTOLOGY = """# Orb Knowledge Graph Ontology

## Node Labels & Properties

### Person (Root Node)
- `user_id` (string) — unique user identifier
- `name` (string)

### Education
- `uid` (string)
- `institution` (string)
- `degree` (string)

### Skill
- `uid` (string)
- `name` (string)
- `category` (string)

## Relationships

### Person → Node
| Relationship        | Target Node    |
|---------------------|----------------|
| HAS_EDUCATION       | Education      |
| HAS_SKILL           | Skill          |

### Cross-node
| Relationship | Source                                                      | Target |
|--------------|-------------------------------------------------------------|--------|
| USED_SKILL   | Education, WorkExperience, Publication, Project, Patent     | Skill  |
"""


def test_parse_ontology_markdown_extracts_nodes():
    schema = parse_ontology_markdown(SAMPLE_ONTOLOGY)
    assert "nodes" in schema
    node_names = [n["label"] for n in schema["nodes"]]
    assert "Person" in node_names
    assert "Education" in node_names
    assert "Skill" in node_names


def test_parse_ontology_markdown_extracts_properties():
    schema = parse_ontology_markdown(SAMPLE_ONTOLOGY)
    edu = next(n for n in schema["nodes"] if n["label"] == "Education")
    prop_names = [p["name"] for p in edu["properties"]]
    assert "uid" in prop_names
    assert "institution" in prop_names
    assert "degree" in prop_names


def test_parse_ontology_markdown_extracts_relationships():
    schema = parse_ontology_markdown(SAMPLE_ONTOLOGY)
    assert "relationships" in schema
    rel_types = [r["type"] for r in schema["relationships"]]
    assert "HAS_EDUCATION" in rel_types
    assert "HAS_SKILL" in rel_types


def test_parse_ontology_markdown_extracts_cross_node_relationships():
    schema = parse_ontology_markdown(SAMPLE_ONTOLOGY)
    rel_types = [r["type"] for r in schema["relationships"]]
    assert "USED_SKILL" in rel_types


def test_hash_content():
    content = "hello world"
    expected = hashlib.sha256(content.encode()).hexdigest()
    assert hash_content(content) == expected


def test_parse_ontology_is_valid_json():
    schema = parse_ontology_markdown(SAMPLE_ONTOLOGY)
    # Must be JSON-serializable
    json_str = json.dumps(schema)
    assert json_str
