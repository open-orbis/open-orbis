"""Unit tests for app.graph.node_schema.sanitize_node_properties."""

from __future__ import annotations

from app.graph.node_schema import (
    ALLOWED_NODE_PROPERTIES,
    LABEL_TO_NODE_TYPE,
    MAX_STRING_LEN,
    sanitize_node_properties,
)
from app.graph.queries import NODE_TYPE_LABELS


class TestSanitizeNodeProperties:
    def test_allowed_keys_pass_through(self):
        props = {"company": "Acme", "title": "Engineer"}
        result = sanitize_node_properties("work_experience", props)
        assert result == props

    def test_unknown_keys_dropped(self):
        props = {
            "company": "Acme",
            "is_admin": True,
            "user_id": "victim-123",
            "uid": "attacker-uid",
        }
        result = sanitize_node_properties("work_experience", props)
        assert result == {"company": "Acme"}

    def test_unknown_node_type_drops_everything(self):
        result = sanitize_node_properties("definitely_not_a_type", {"name": "X"})
        assert result == {}

    def test_oversize_string_truncated(self):
        oversized = "A" * (MAX_STRING_LEN + 100)
        result = sanitize_node_properties("skill", {"name": oversized})
        assert len(result["name"]) == MAX_STRING_LEN

    def test_non_string_values_preserved(self):
        result = sanitize_node_properties("skill", {"name": "Python", "proficiency": None})
        assert result == {"name": "Python", "proficiency": None}

    def test_empty_properties_returns_empty(self):
        assert sanitize_node_properties("skill", {}) == {}

    def test_all_node_types_in_allowlist(self):
        """Every node_type in NODE_TYPE_LABELS must have an allowlist entry,
        otherwise writes silently break."""
        for node_type in NODE_TYPE_LABELS:
            assert node_type in ALLOWED_NODE_PROPERTIES, node_type

    def test_label_to_type_inverse_is_complete(self):
        for node_type, label in NODE_TYPE_LABELS.items():
            assert LABEL_TO_NODE_TYPE[label] == node_type
