"""Unit tests for app.orbs.filter_token module."""

from __future__ import annotations

from unittest.mock import patch

import pytest

import app.orbs.filter_token as ft_mod
from app.orbs.filter_token import (
    create_filter_token,
    decode_filter_token,
    node_matches_filters,
)


@pytest.fixture(autouse=True)
def _mock_settings():
    """Provide consistent JWT settings for tests."""
    with patch.object(ft_mod, "settings") as mock_settings:
        mock_settings.jwt_secret = "test-secret-key-for-unit-tests"
        mock_settings.jwt_algorithm = "HS256"
        yield


# ── create / decode roundtrip ──


class TestCreateDecodeRoundtrip:
    def test_basic_roundtrip(self):
        token = create_filter_token("orb-123", ["python", "java"])
        decoded = decode_filter_token(token)
        assert decoded is not None
        assert decoded["orb_id"] == "orb-123"
        assert decoded["filters"] == ["python", "java"]

    def test_keywords_normalized(self):
        token = create_filter_token("orb-1", ["  Python ", " JAVA "])
        decoded = decode_filter_token(token)
        assert decoded["filters"] == ["python", "java"]

    def test_empty_keywords_stripped(self):
        token = create_filter_token("orb-1", ["python", "", "  ", "java"])
        decoded = decode_filter_token(token)
        assert decoded["filters"] == ["python", "java"]

    def test_single_keyword(self):
        token = create_filter_token("orb-1", ["sensitive"])
        decoded = decode_filter_token(token)
        assert decoded["filters"] == ["sensitive"]


# ── decode_filter_token edge cases ──


class TestDecodeFilterToken:
    def test_invalid_token_returns_none(self):
        assert decode_filter_token("not.a.valid.jwt") is None

    def test_wrong_secret_returns_none(self):
        token = create_filter_token("orb-1", ["test"])
        with patch.object(ft_mod, "settings") as mock_settings:
            mock_settings.jwt_secret = "different-secret"
            mock_settings.jwt_algorithm = "HS256"
            assert decode_filter_token(token) is None

    def test_wrong_type_returns_none(self):
        from jose import jwt
        payload = {
            "orb_id": "orb-1",
            "filters": ["test"],
            "type": "access",
        }
        token = jwt.encode(payload, "test-secret-key-for-unit-tests", algorithm="HS256")
        assert decode_filter_token(token) is None

    def test_missing_orb_id_returns_none(self):
        from jose import jwt
        payload = {
            "filters": ["test"],
            "type": "filter",
        }
        token = jwt.encode(payload, "test-secret-key-for-unit-tests", algorithm="HS256")
        assert decode_filter_token(token) is None

    def test_missing_filters_returns_none(self):
        from jose import jwt
        payload = {
            "orb_id": "orb-1",
            "filters": [],
            "type": "filter",
        }
        token = jwt.encode(payload, "test-secret-key-for-unit-tests", algorithm="HS256")
        assert decode_filter_token(token) is None

    def test_empty_string_returns_none(self):
        assert decode_filter_token("") is None


# ── node_matches_filters ──


class TestNodeMatchesFilters:
    def test_matching_keyword(self):
        node = {"name": "Python", "category": "Programming"}
        assert node_matches_filters(node, ["python"]) is True

    def test_partial_match(self):
        node = {"description": "Worked on machine learning infrastructure"}
        assert node_matches_filters(node, ["machine"]) is True

    def test_no_match(self):
        node = {"name": "Python", "category": "Programming"}
        assert node_matches_filters(node, ["java"]) is False

    def test_non_string_values_ignored(self):
        node = {"name": "Python", "count": 42, "active": True}
        assert node_matches_filters(node, ["42"]) is False

    def test_empty_keywords(self):
        node = {"name": "Python"}
        assert node_matches_filters(node, []) is False

    def test_empty_node(self):
        assert node_matches_filters({}, ["python"]) is False

    def test_multiple_keywords_any_match(self):
        node = {"name": "Python"}
        assert node_matches_filters(node, ["java", "python"]) is True

    def test_keyword_in_any_field(self):
        node = {"name": "SWE", "company": "Google", "description": "Built APIs"}
        assert node_matches_filters(node, ["google"]) is True
        assert node_matches_filters(node, ["apis"]) is True
