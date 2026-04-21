"""Unit tests for app.orbs.share_token module."""

import dataclasses
from unittest.mock import AsyncMock, patch

import pytest

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


class TestShareContext:
    """ShareContext dataclass is immutable and carries filter data."""

    def test_is_frozen(self):
        from mcp_server.auth import ShareContext

        ctx = ShareContext(
            orb_id="orb-1",
            keywords=["secret"],
            hidden_node_types=["skill"],
            token_id="tok-1",
        )
        with pytest.raises(dataclasses.FrozenInstanceError):
            ctx.orb_id = "orb-2"


class TestValidateShareTokenForMcp:
    """Maps validate_share_token's dict result onto a ShareContext."""

    async def test_returns_share_context_for_valid_token(self):
        from app.orbs.share_token import validate_share_token_for_mcp

        mock_db = AsyncMock()
        with patch(
            "app.orbs.share_token.validate_share_token",
            new_callable=AsyncMock,
            return_value={
                "orb_id": "orb-42",
                "keywords": ["secret"],
                "hidden_node_types": ["skill"],
            },
        ):
            ctx = await validate_share_token_for_mcp(mock_db, "tok-42")

        assert ctx is not None
        assert ctx.orb_id == "orb-42"
        assert ctx.keywords == ["secret"]
        assert ctx.hidden_node_types == ["skill"]
        assert ctx.token_id == "tok-42"

    async def test_returns_none_when_token_invalid(self):
        """Revoked/expired/unknown tokens all surface as None from
        validate_share_token; the wrapper must also return None."""
        from app.orbs.share_token import validate_share_token_for_mcp

        mock_db = AsyncMock()
        with patch(
            "app.orbs.share_token.validate_share_token",
            new_callable=AsyncMock,
            return_value=None,
        ):
            ctx = await validate_share_token_for_mcp(mock_db, "does-not-exist")

        assert ctx is None

    async def test_handles_missing_optional_fields(self):
        """If keywords or hidden_node_types are null, resulting lists must be empty (never None)."""
        from app.orbs.share_token import validate_share_token_for_mcp

        mock_db = AsyncMock()
        with patch(
            "app.orbs.share_token.validate_share_token",
            new_callable=AsyncMock,
            return_value={
                "orb_id": "orb-7",
                "keywords": None,
                "hidden_node_types": None,
            },
        ):
            ctx = await validate_share_token_for_mcp(mock_db, "tok-7")

        assert ctx is not None
        assert ctx.keywords == []
        assert ctx.hidden_node_types == []
