"""Unit tests for _parse_result and _normalize_date in ollama_classifier."""

from __future__ import annotations

import json

import pytest

from app.cv.ollama_classifier import (
    DATE_FIELDS,
    REQUIRED_FIELDS,
    ClassificationResult,
    _normalize_date,
    _parse_result,
)

# ── _normalize_date ──


class TestNormalizeDate:
    @pytest.mark.parametrize(
        "input_val, expected",
        [
            # Already ISO
            ("2023-01-15", "2023-01-15"),
            ("2023-01", "2023-01"),
            ("2023", "2023"),
            # Month Year formats
            ("January 2023", "2023-01"),
            ("Jan 2023", "2023-01"),
            ("March 2020", "2020-03"),
            ("Dec 2019", "2019-12"),
            # Slash formats
            ("01/2023", "2023-01"),
            ("12/2020", "2020-12"),
            # Full date formats
            ("01/15/2023", "2023-01-15"),
            ("15/01/2023", "2023-01-15"),
            ("2023/01/15", "2023-01-15"),
            # Verbose formats
            ("15 January 2023", "2023-01-15"),
            ("15 Jan 2023", "2023-01-15"),
            ("January 15, 2023", "2023-01-15"),
            ("Jan 15, 2023", "2023-01-15"),
        ],
    )
    def test_normalizes_dates(self, input_val, expected):
        assert _normalize_date(input_val) == expected

    def test_returns_original_on_unparseable(self):
        assert _normalize_date("not-a-date") == "not-a-date"

    def test_handles_empty_string(self):
        assert _normalize_date("") == ""

    def test_handles_none(self):
        assert _normalize_date(None) is None

    def test_strips_whitespace(self):
        assert _normalize_date("  2023-01-15  ") == "2023-01-15"

    def test_ambiguous_date_03_04_2023(self):
        """'03/04/2023' is ambiguous (US: March 4 vs EU: April 3).
        _normalize_date tries formats in order: %m/%d/%Y first, then %d/%m/%Y.
        This documents which interpretation wins.
        """
        result = _normalize_date("03/04/2023")
        # %m/%d/%Y is tried first → March 4
        assert result == "2023-03-04"

    def test_ambiguous_date_13_04_2023_unambiguous(self):
        """'13/04/2023' — day=13 can't be month, so %d/%m/%Y wins."""
        result = _normalize_date("13/04/2023")
        assert result == "2023-04-13"


# ── _parse_result: basic JSON parsing ──


class TestParseResultBasic:
    def test_valid_json(self):
        data = {
            "cv_owner_name": "Alice",
            "nodes": [
                {"node_type": "skill", "properties": {"name": "Python"}},
            ],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert isinstance(result, ClassificationResult)
        assert len(result.nodes) == 1
        assert result.nodes[0].node_type == "skill"
        assert result.nodes[0].properties["name"] == "Python"
        assert result.cv_owner_name == "Alice"

    def test_json_with_markdown_code_fence(self):
        data = {
            "nodes": [
                {"node_type": "language", "properties": {"name": "English"}},
            ],
            "relationships": [],
            "unmatched": [],
        }
        raw = f"```json\n{json.dumps(data)}\n```"
        result = _parse_result(raw)
        assert len(result.nodes) == 1
        assert result.nodes[0].properties["name"] == "English"

    def test_empty_response(self):
        result = _parse_result("")
        assert result.nodes == []
        assert result.unmatched == []

    def test_invalid_json(self):
        result = _parse_result("this is not json at all")
        assert result.nodes == []

    def test_json_array_instead_of_object(self):
        result = _parse_result('[{"node_type": "skill"}]')
        assert result.nodes == []


# ── _parse_result: node validation ──


class TestParseResultValidation:
    def test_unknown_node_type_skipped(self):
        data = {
            "nodes": [
                {"node_type": "unknown_type", "properties": {"name": "X"}},
                {"node_type": "skill", "properties": {"name": "Python"}},
            ],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.nodes) == 1
        assert result.nodes[0].properties["name"] == "Python"
        assert len(result.skipped) == 1
        assert "Unknown node type" in result.skipped[0].reason

    def test_missing_required_fields_skipped(self):
        data = {
            "nodes": [
                {"node_type": "work_experience", "properties": {"company": "Google"}},
                {"node_type": "skill", "properties": {"name": "Java"}},
            ],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.nodes) == 1
        assert result.nodes[0].properties["name"] == "Java"
        assert len(result.skipped) == 1
        assert "Missing required fields" in result.skipped[0].reason
        assert "title" in result.skipped[0].reason

    @pytest.mark.parametrize(
        "node_type, props",
        [
            ("skill", {"name": "Python"}),
            ("language", {"name": "English"}),
            ("work_experience", {"company": "Google", "title": "SWE"}),
            ("education", {"institution": "MIT"}),
            ("certification", {"name": "AWS SA"}),
            ("publication", {"title": "Paper X"}),
            ("project", {"name": "MyProject"}),
            ("patent", {"title": "Patent X"}),
            ("collaborator", {"name": "Bob"}),
        ],
    )
    def test_all_valid_node_types_accepted(self, node_type, props):
        data = {
            "nodes": [{"node_type": node_type, "properties": props}],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.nodes) == 1
        assert result.nodes[0].node_type == node_type

    def test_invalid_properties_format_skipped(self):
        data = {
            "nodes": [
                {"node_type": "skill", "properties": "not-a-dict"},
            ],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.nodes) == 0
        assert len(result.skipped) == 1
        assert "Invalid properties format" in result.skipped[0].reason

    def test_non_dict_items_silently_skipped(self):
        data = {
            "nodes": ["not a dict", 42, None],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.nodes) == 0
        assert len(result.skipped) == 0


# ── _parse_result: date normalization in nodes ──


class TestParseResultDateNormalization:
    def test_dates_normalized_in_properties(self):
        data = {
            "nodes": [
                {
                    "node_type": "work_experience",
                    "properties": {
                        "company": "Acme",
                        "title": "Dev",
                        "start_date": "January 2020",
                        "end_date": "Dec 2022",
                    },
                },
            ],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.nodes) == 1
        props = result.nodes[0].properties
        assert props["start_date"] == "2020-01"
        assert props["end_date"] == "2022-12"

    def test_null_dates_not_touched(self):
        data = {
            "nodes": [
                {
                    "node_type": "work_experience",
                    "properties": {
                        "company": "Acme",
                        "title": "Dev",
                        "end_date": None,
                    },
                },
            ],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        props = result.nodes[0].properties
        assert props["end_date"] is None


# ── _parse_result: relationship remapping ──


class TestParseResultRelationships:
    def test_relationships_remapped_after_skip(self):
        data = {
            "nodes": [
                {
                    "node_type": "invalid_type",
                    "properties": {"name": "X"},
                },  # idx 0 -> skipped
                {
                    "node_type": "work_experience",
                    "properties": {"company": "A", "title": "B"},
                },  # idx 1 -> 0
                {"node_type": "skill", "properties": {"name": "Python"}},  # idx 2 -> 1
            ],
            "relationships": [
                {"from_index": 1, "to_index": 2, "type": "USED_SKILL"},
            ],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.nodes) == 2
        assert len(result.relationships) == 1
        assert result.relationships[0].from_index == 0
        assert result.relationships[0].to_index == 1

    def test_relationships_dropped_when_node_skipped(self):
        data = {
            "nodes": [
                {"node_type": "invalid_type", "properties": {"name": "X"}},
                {"node_type": "skill", "properties": {"name": "Python"}},
            ],
            "relationships": [
                {"from_index": 0, "to_index": 1, "type": "USED_SKILL"},
            ],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.relationships) == 0

    def test_relationships_without_valid_indices_dropped(self):
        data = {
            "nodes": [
                {"node_type": "skill", "properties": {"name": "Python"}},
            ],
            "relationships": [
                {"from_index": "a", "to_index": 0},
                {"from_index": 0, "to_index": 99},
                "not a dict",
            ],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert len(result.relationships) == 0

    def test_default_relationship_type(self):
        data = {
            "nodes": [
                {
                    "node_type": "work_experience",
                    "properties": {"company": "A", "title": "B"},
                },
                {"node_type": "skill", "properties": {"name": "Python"}},
            ],
            "relationships": [
                {"from_index": 0, "to_index": 1},
            ],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert result.relationships[0].type == "USED_SKILL"


# ── _parse_result: unmatched ──


class TestParseResultUnmatched:
    def test_unmatched_preserved(self):
        data = {
            "nodes": [],
            "relationships": [],
            "unmatched": ["Some random text", "Another line"],
        }
        result = _parse_result(json.dumps(data))
        assert result.unmatched == ["Some random text", "Another line"]

    def test_unmatched_items_converted_to_strings(self):
        data = {
            "nodes": [],
            "relationships": [],
            "unmatched": [42, True, "text"],
        }
        result = _parse_result(json.dumps(data))
        assert all(isinstance(u, str) for u in result.unmatched)

    def test_empty_unmatched_filtered(self):
        data = {
            "nodes": [],
            "relationships": [],
            "unmatched": ["", None, "valid"],
        }
        result = _parse_result(json.dumps(data))
        assert result.unmatched == ["valid"]


# ── _parse_result: cv_owner_name ──


class TestParseResultCvOwnerName:
    def test_cv_owner_name_extracted(self):
        data = {
            "cv_owner_name": "Alice Smith",
            "nodes": [],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert result.cv_owner_name == "Alice Smith"

    def test_empty_cv_owner_name_is_none(self):
        data = {
            "cv_owner_name": "",
            "nodes": [],
            "relationships": [],
            "unmatched": [],
        }
        result = _parse_result(json.dumps(data))
        assert result.cv_owner_name is None

    def test_missing_cv_owner_name_is_none(self):
        data = {"nodes": [], "relationships": [], "unmatched": []}
        result = _parse_result(json.dumps(data))
        assert result.cv_owner_name is None


# ── Constants consistency ──


class TestConstants:
    def test_required_fields_covers_all_node_types(self):
        from app.graph.queries import NODE_TYPE_LABELS

        for nt in NODE_TYPE_LABELS:
            assert nt in REQUIRED_FIELDS, f"Missing REQUIRED_FIELDS entry for '{nt}'"

    def test_date_fields(self):
        expected = {
            "start_date",
            "end_date",
            "date",
            "issue_date",
            "expiry_date",
            "filing_date",
            "grant_date",
        }
        assert expected == DATE_FIELDS
