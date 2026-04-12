"""Unit tests for app.graph.queries module (mappings and query templates)."""

from __future__ import annotations

import pytest

from app.graph.queries import (
    ADD_NODE,
    CREATE_ONTOLOGY_VERSION,
    CREATE_PERSON,
    CREATE_PROCESSING_RECORD,
    DELETE_NODE,
    GET_FULL_ORB,
    GET_FULL_ORB_PUBLIC,
    GET_LATEST_ONTOLOGY_VERSION,
    GET_PERSON_BY_ORB_ID,
    GET_PERSON_BY_USER_ID,
    GET_SKILL_LINKS,
    LINK_ONTOLOGY_SUPERSEDES,
    LINK_PERSON_TO_PROCESSING_RECORD,
    LINK_PROCESSING_RECORD_TO_NODE,
    LINK_PROCESSING_RECORD_TO_ONTOLOGY,
    LINK_SKILL,
    NODE_TYPE_LABELS,
    NODE_TYPE_MERGE_KEYS,
    NODE_TYPE_RELATIONSHIPS,
    UNLINK_SKILL,
    UPDATE_NODE,
    UPDATE_ORB_ID,
    UPDATE_PERSON,
)

# All query templates to validate
ALL_QUERIES = {
    "CREATE_PERSON": CREATE_PERSON,
    "GET_PERSON_BY_USER_ID": GET_PERSON_BY_USER_ID,
    "GET_PERSON_BY_ORB_ID": GET_PERSON_BY_ORB_ID,
    "UPDATE_PERSON": UPDATE_PERSON,
    "UPDATE_ORB_ID": UPDATE_ORB_ID,
    "GET_FULL_ORB": GET_FULL_ORB,
    "GET_FULL_ORB_PUBLIC": GET_FULL_ORB_PUBLIC,
    "ADD_NODE": ADD_NODE,
    "UPDATE_NODE": UPDATE_NODE,
    "DELETE_NODE": DELETE_NODE,
    "LINK_SKILL": LINK_SKILL,
    "UNLINK_SKILL": UNLINK_SKILL,
    "GET_SKILL_LINKS": GET_SKILL_LINKS,
}


# ── Mapping consistency ──


class TestNodeTypeMappings:
    def test_labels_and_relationships_same_keys(self):
        assert set(NODE_TYPE_LABELS.keys()) == set(NODE_TYPE_RELATIONSHIPS.keys())

    def test_merge_keys_subset_of_labels(self):
        assert set(NODE_TYPE_MERGE_KEYS.keys()) == set(NODE_TYPE_LABELS.keys())


class TestFullOrbExclusions:
    """Metadata nodes (ShareToken, AccessGrant, ProcessingRecord, OntologyVersion)
    must be excluded from the full-orb traversal — they aren't part of the
    professional graph and don't have a ``uid`` field, so leaking them into
    ``_serialize_orb`` would crash with KeyError.
    """

    @pytest.mark.parametrize(
        "label", ["ProcessingRecord", "OntologyVersion", "ShareToken", "AccessGrant"]
    )
    def test_get_full_orb_excludes_metadata_label(self, label):
        assert f"NOT n:{label}" in GET_FULL_ORB

    @pytest.mark.parametrize(
        "label", ["ProcessingRecord", "OntologyVersion", "ShareToken", "AccessGrant"]
    )
    def test_get_full_orb_public_excludes_metadata_label(self, label):
        assert f"NOT n:{label}" in GET_FULL_ORB_PUBLIC

    def test_all_labels_are_capitalized(self):
        for node_type, label in NODE_TYPE_LABELS.items():
            assert label[0].isupper(), (
                f"Label for '{node_type}' should be capitalized: '{label}'"
            )

    def test_all_relationships_uppercase(self):
        for node_type, rel in NODE_TYPE_RELATIONSHIPS.items():
            assert rel == rel.upper(), (
                f"Relationship for '{node_type}' should be uppercase: '{rel}'"
            )

    def test_merge_keys_non_empty_lists(self):
        for node_type, keys in NODE_TYPE_MERGE_KEYS.items():
            assert isinstance(keys, list), (
                f"Merge keys for '{node_type}' should be a list"
            )
            assert len(keys) > 0, f"Merge keys for '{node_type}' should not be empty"

    def test_expected_node_types(self):
        expected = {
            "education",
            "work_experience",
            "certification",
            "language",
            "publication",
            "project",
            "skill",
            "patent",
            "award",
            "outreach",
            "training",
        }
        assert set(NODE_TYPE_LABELS.keys()) == expected

    def test_specific_mappings(self):
        assert NODE_TYPE_LABELS["skill"] == "Skill"
        assert NODE_TYPE_LABELS["work_experience"] == "WorkExperience"
        assert NODE_TYPE_RELATIONSHIPS["language"] == "SPEAKS"
        assert NODE_TYPE_MERGE_KEYS["skill"] == ["name"]
        assert NODE_TYPE_MERGE_KEYS["work_experience"] == ["company", "title"]


# ── Query template validation ──


class TestQueryTemplates:
    def test_create_person_has_required_params(self):
        assert "$user_id" in CREATE_PERSON
        assert "$email" in CREATE_PERSON
        assert "$name" in CREATE_PERSON
        assert "$orb_id" in CREATE_PERSON

    def test_get_person_by_user_id(self):
        assert "$user_id" in GET_PERSON_BY_USER_ID

    def test_get_person_by_orb_id(self):
        assert "$orb_id" in GET_PERSON_BY_ORB_ID

    def test_update_person(self):
        assert "$user_id" in UPDATE_PERSON
        assert "$properties" in UPDATE_PERSON
        assert "updated_at" in UPDATE_PERSON

    def test_update_orb_id(self):
        assert "$user_id" in UPDATE_ORB_ID
        assert "$orb_id" in UPDATE_ORB_ID

    def test_add_node_template(self):
        assert "$user_id" in ADD_NODE
        assert "$uid" in ADD_NODE
        assert "$properties" in ADD_NODE
        assert "{rel_type}" in ADD_NODE
        assert "{label}" in ADD_NODE

    def test_update_node(self):
        assert "$uid" in UPDATE_NODE
        assert "$properties" in UPDATE_NODE

    def test_delete_node(self):
        assert "$uid" in DELETE_NODE
        assert "DETACH DELETE" in DELETE_NODE

    def test_full_orb_queries_structure(self):
        for query in (GET_FULL_ORB, GET_FULL_ORB_PUBLIC):
            assert "OPTIONAL MATCH" in query
            assert "cross_links" in query
            assert "USED_SKILL" in query

    def test_link_skill(self):
        assert "$node_uid" in LINK_SKILL
        assert "$skill_uid" in LINK_SKILL
        assert "USED_SKILL" in LINK_SKILL

    def test_unlink_skill(self):
        assert "$node_uid" in UNLINK_SKILL
        assert "$skill_uid" in UNLINK_SKILL
        assert "DELETE r" in UNLINK_SKILL

    def test_get_skill_links(self):
        assert "$user_id" in GET_SKILL_LINKS
        assert "USED_SKILL" in GET_SKILL_LINKS

    # ── Negative tests: queries must NOT leak wrong params ──

    def test_full_orb_public_must_not_use_user_id(self):
        assert "$user_id" not in GET_FULL_ORB_PUBLIC, (
            "GET_FULL_ORB_PUBLIC should use $orb_id, not $user_id"
        )

    def test_full_orb_private_must_not_use_orb_id(self):
        assert "$orb_id" not in GET_FULL_ORB, (
            "GET_FULL_ORB should use $user_id, not $orb_id"
        )

    def test_get_person_by_user_id_must_not_use_orb_id(self):
        assert "$orb_id" not in GET_PERSON_BY_USER_ID

    def test_get_person_by_orb_id_must_not_use_user_id(self):
        assert "$user_id" not in GET_PERSON_BY_ORB_ID

    def test_update_node_must_not_use_user_id(self):
        assert "$user_id" not in UPDATE_NODE, (
            "UPDATE_NODE identifies by $uid, not $user_id"
        )

    def test_delete_node_must_not_use_user_id(self):
        assert "$user_id" not in DELETE_NODE, (
            "DELETE_NODE identifies by $uid, not $user_id"
        )


# ── Cypher structural validation ──


class TestCypherStructure:
    """Validate that query templates are structurally sound Cypher."""

    @pytest.mark.parametrize("name, query", list(ALL_QUERIES.items()))
    def test_balanced_parentheses(self, name, query):
        assert query.count("(") == query.count(")"), f"{name}: unbalanced parentheses"

    @pytest.mark.parametrize("name, query", list(ALL_QUERIES.items()))
    def test_balanced_brackets(self, name, query):
        assert query.count("[") == query.count("]"), f"{name}: unbalanced brackets"

    @pytest.mark.parametrize("name, query", list(ALL_QUERIES.items()))
    def test_balanced_braces(self, name, query):
        # Cypher uses {} for property maps; Python format placeholders like {label}
        # are also present — both should be balanced
        assert query.count("{") == query.count("}"), f"{name}: unbalanced braces"

    @pytest.mark.parametrize("name, query", list(ALL_QUERIES.items()))
    def test_starts_with_cypher_keyword(self, name, query):
        first_word = query.strip().split()[0].upper()
        valid_starts = {
            "MATCH",
            "CREATE",
            "MERGE",
            "OPTIONAL",
            "WITH",
            "RETURN",
            "SET",
            "DELETE",
            "DETACH",
        }
        assert first_word in valid_starts, (
            f"{name}: starts with '{first_word}', expected a Cypher keyword"
        )


# ── Provenance queries ──


def test_provenance_queries_are_strings():
    """All provenance query constants are non-empty strings."""
    for q in [
        CREATE_ONTOLOGY_VERSION,
        GET_LATEST_ONTOLOGY_VERSION,
        CREATE_PROCESSING_RECORD,
        LINK_PROCESSING_RECORD_TO_ONTOLOGY,
        LINK_PROCESSING_RECORD_TO_NODE,
        LINK_PERSON_TO_PROCESSING_RECORD,
        LINK_ONTOLOGY_SUPERSEDES,
    ]:
        assert isinstance(q, str)
        assert len(q.strip()) > 0


def test_create_ontology_version_uses_parameters():
    assert "$version_id" in CREATE_ONTOLOGY_VERSION
    assert "$version_number" in CREATE_ONTOLOGY_VERSION
    assert "$content_hash" in CREATE_ONTOLOGY_VERSION
    assert "$schema_definition" in CREATE_ONTOLOGY_VERSION
    assert "$extraction_prompt" in CREATE_ONTOLOGY_VERSION
    assert "$prompt_reviewed" in CREATE_ONTOLOGY_VERSION


def test_create_processing_record_uses_parameters():
    assert "$record_id" in CREATE_PROCESSING_RECORD
    assert "$document_id" in CREATE_PROCESSING_RECORD
    assert "$llm_provider" in CREATE_PROCESSING_RECORD
    assert "$llm_model" in CREATE_PROCESSING_RECORD
    assert "$prompt_hash" in CREATE_PROCESSING_RECORD
