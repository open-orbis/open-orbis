"""Contract tests for MCP tools.

Verifies: correct response schema, proper error handling,
access control (auth + share tokens), and response structure.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _mock_node(labels, properties):
    """Create a mock Neo4j node with labels and properties."""
    node = MagicMock()
    node.labels = labels
    node.items.return_value = properties.items()
    node.keys.return_value = properties.keys()
    node.values.return_value = properties.values()
    node.__iter__ = lambda _self: iter(properties)
    node.__getitem__ = lambda _self, key: properties[key]
    node.__contains__ = lambda _self, key: key in properties
    node.get = lambda key, default=None: properties.get(key, default)
    return node


def _mock_driver(owner_record=None, orb_record=None, query_records=None):
    """Create a mock AsyncDriver with configurable query results."""
    driver = MagicMock()
    session = AsyncMock()

    call_count = 0

    async def mock_run(query, **kwargs):
        nonlocal call_count
        call_count += 1
        result = AsyncMock()

        # First call: _check_access queries owner
        if call_count == 1:
            result.single.return_value = owner_record
            return result

        # Second call: data query
        if orb_record is not None:
            result.single.return_value = orb_record
            return result

        if query_records is not None:

            async def _aiter(_self):
                for r in query_records:
                    yield r

            result.__aiter__ = _aiter
            return result

        result.single.return_value = None
        return result

    session.run = mock_run
    driver.session.return_value.__aenter__ = AsyncMock(return_value=session)
    driver.session.return_value.__aexit__ = AsyncMock(return_value=False)
    return driver


# ── Fixtures ──


@pytest.fixture()
def owner_record():
    """Owner record for _check_access — the caller owns this orb."""
    return {"owner": "user-1"}


@pytest.fixture()
def stranger_owner_record():
    """Owner record where the caller does NOT own the orb."""
    return {"owner": "someone-else"}


@pytest.fixture()
def sample_person():
    return _mock_node(
        ["Person"],
        {
            "name": "Alice Smith",
            "headline": "Engineer",
            "location": "London",
            "orb_id": "alice",
            "user_id": "user-1",
            "open_to_work": True,
        },
    )


@pytest.fixture()
def sample_connections():
    skill_node = _mock_node(["Skill"], {"uid": "sk-1", "name": "Python"})
    work_node = _mock_node(
        ["WorkExperience"],
        {"uid": "we-1", "title": "Engineer", "company": "Acme"},
    )
    return [
        {"node": skill_node, "rel": "HAS_SKILL"},
        {"node": work_node, "rel": "HAS_EXPERIENCE"},
    ]


@pytest.fixture()
def sample_orb_record(sample_person, sample_connections):
    return {
        "p": sample_person,
        "connections": sample_connections,
        "cross_links": [],
        "cross_skill_nodes": [],
    }


# ── Access control ──


class TestAccessControl:
    @pytest.mark.asyncio
    async def test_rejects_unauthenticated_user(self):
        driver = _mock_driver()
        with patch("mcp_server.tools.get_current_user_id", return_value=None):
            from mcp_server.tools import get_orb_summary

            result = await get_orb_summary(driver, "alice")

        assert "error" in result
        assert "authentication required" in result["error"]

    @pytest.mark.asyncio
    async def test_rejects_missing_orb(self):
        driver = _mock_driver(owner_record=None)
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_summary

            result = await get_orb_summary(driver, "nonexistent")

        assert "error" in result
        assert "not accessible" in result["error"]

    @pytest.mark.asyncio
    async def test_stranger_without_token_rejected(self, stranger_owner_record):
        driver = _mock_driver(owner_record=stranger_owner_record)
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_summary

            result = await get_orb_summary(driver, "alice", token="")

        assert "error" in result
        assert "not accessible" in result["error"]

    @pytest.mark.asyncio
    async def test_owner_bypasses_token_requirement(
        self, owner_record, sample_orb_record
    ):
        driver = _mock_driver(
            owner_record=owner_record,
            orb_record=sample_orb_record,
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_summary

            result = await get_orb_summary(driver, "alice")

        assert "error" not in result
        assert "name" in result


# ── get_orb_summary ──


class TestGetOrbSummary:
    @pytest.mark.asyncio
    async def test_returns_correct_schema(self, owner_record, sample_orb_record):
        driver = _mock_driver(
            owner_record=owner_record,
            orb_record=sample_orb_record,
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_summary

            result = await get_orb_summary(driver, "alice")

        assert "name" in result
        assert "headline" in result
        assert "location" in result
        assert "orb_id" in result
        assert "open_to_work" in result
        assert "node_counts" in result
        assert "total_nodes" in result
        assert result["name"] == "Alice Smith"
        assert result["orb_id"] == "alice"
        assert result["total_nodes"] == 2
        assert result["node_counts"]["Skill"] == 1
        assert result["node_counts"]["WorkExperience"] == 1

    @pytest.mark.asyncio
    async def test_strips_sensitive_fields(self, owner_record, sample_orb_record):
        driver = _mock_driver(
            owner_record=owner_record,
            orb_record=sample_orb_record,
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_summary

            result = await get_orb_summary(driver, "alice")

        assert "user_id" not in result
        assert "encryption_key_id" not in result

    @pytest.mark.asyncio
    async def test_handles_null_connections(self, owner_record, sample_person):
        record = {
            "p": sample_person,
            "connections": [{"node": None, "rel": "HAS_SKILL"}],
            "cross_links": [],
            "cross_skill_nodes": [],
        }
        driver = _mock_driver(owner_record=owner_record, orb_record=record)
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_summary

            result = await get_orb_summary(driver, "alice")

        assert result["total_nodes"] == 0
        assert result["node_counts"] == {}


# ── get_orb_full ──


class TestGetOrbFull:
    @pytest.mark.asyncio
    async def test_returns_correct_schema(self, owner_record, sample_orb_record):
        driver = _mock_driver(
            owner_record=owner_record,
            orb_record=sample_orb_record,
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_full

            result = await get_orb_full(driver, "alice")

        assert "person" in result
        assert "nodes" in result
        assert isinstance(result["nodes"], list)
        assert len(result["nodes"]) == 2

    @pytest.mark.asyncio
    async def test_nodes_have_type_and_relationship(
        self, owner_record, sample_orb_record
    ):
        driver = _mock_driver(
            owner_record=owner_record,
            orb_record=sample_orb_record,
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_full

            result = await get_orb_full(driver, "alice")

        for node in result["nodes"]:
            assert "_type" in node
            assert "_relationship" in node

    @pytest.mark.asyncio
    async def test_strips_user_id_from_person(self, owner_record, sample_orb_record):
        driver = _mock_driver(
            owner_record=owner_record,
            orb_record=sample_orb_record,
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_orb_full

            result = await get_orb_full(driver, "alice")

        assert "user_id" not in result["person"]


# ── get_nodes_by_type ──


class TestGetNodesByType:
    @pytest.mark.asyncio
    async def test_returns_list_of_nodes(self, owner_record):
        skill = {"n": _mock_node(["Skill"], {"uid": "sk-1", "name": "Python"})}
        driver = _mock_driver(
            owner_record=owner_record,
            query_records=[skill],
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_nodes_by_type

            result = await get_nodes_by_type(driver, "alice", "skill")

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["name"] == "Python"

    @pytest.mark.asyncio
    async def test_rejects_invalid_node_type(self):
        driver = _mock_driver()
        from mcp_server.tools import get_nodes_by_type

        result = await get_nodes_by_type(driver, "alice", "invalid_type")

        assert isinstance(result, list)
        assert "error" in result[0]
        assert "Invalid node type" in result[0]["error"]

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_nodes(self, owner_record):
        driver = _mock_driver(
            owner_record=owner_record,
            query_records=[],
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_nodes_by_type

            result = await get_nodes_by_type(driver, "alice", "skill")

        assert result == []


# ── get_connections ──


class TestGetConnections:
    @pytest.mark.asyncio
    async def test_returns_correct_schema(self, owner_record):
        connected = _mock_node(["Skill"], {"uid": "sk-1", "name": "Python"})
        source = _mock_node(["WorkExperience"], {"uid": "we-1", "title": "Engineer"})
        record = {
            "n": source,
            "rel_type": "USED_SKILL",
            "connected": connected,
            "connected_labels": ["Skill"],
        }
        driver = _mock_driver(
            owner_record=owner_record,
            query_records=[record],
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_connections

            result = await get_connections(driver, "alice", "we-1")

        assert "node_uid" in result
        assert "connections" in result
        assert result["node_uid"] == "we-1"
        assert len(result["connections"]) == 1
        assert result["connections"][0]["relationship"] == "USED_SKILL"
        assert "_labels" in result["connections"][0]["node"]

    @pytest.mark.asyncio
    async def test_returns_empty_connections(self, owner_record):
        driver = _mock_driver(
            owner_record=owner_record,
            query_records=[],
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_connections

            result = await get_connections(driver, "alice", "nonexistent")

        assert result["connections"] == []


# ── get_skills_for_experience ──


class TestGetSkillsForExperience:
    @pytest.mark.asyncio
    async def test_returns_list_of_skills(self, owner_record):
        skill = {"s": _mock_node(["Skill"], {"uid": "sk-1", "name": "Python"})}
        driver = _mock_driver(
            owner_record=owner_record,
            query_records=[skill],
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_skills_for_experience

            result = await get_skills_for_experience(driver, "alice", "we-1")

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["name"] == "Python"

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_skills(self, owner_record):
        driver = _mock_driver(
            owner_record=owner_record,
            query_records=[],
        )
        with patch("mcp_server.tools.get_current_user_id", return_value="user-1"):
            from mcp_server.tools import get_skills_for_experience

            result = await get_skills_for_experience(driver, "alice", "we-1")

        assert result == []
