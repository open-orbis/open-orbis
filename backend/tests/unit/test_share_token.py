"""Unit tests for app.orbs.share_token module."""

from app.orbs.share_token import node_matches_filters

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
