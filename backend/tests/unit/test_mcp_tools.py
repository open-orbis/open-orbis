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


# ── _strip_widget_pii (widget-path PII filter) ──


def test_strip_widget_pii_removes_sensitive_fields():
    from mcp_server.tools import _strip_widget_pii

    person = {
        "name": "Alice",
        "headline": "Engineer",
        "email": "alice@example.com",
        "phone": "+123456",
        "address": "Via Roma 1, 00100 Roma",
        "location": "Roma, Italy",
    }
    result = _strip_widget_pii(person)
    assert "email" not in result
    assert "phone" not in result
    assert "address" not in result
    # Non-sensitive fields preserved:
    assert result["name"] == "Alice"
    assert result["headline"] == "Engineer"
    assert result["location"] == "Roma, Italy"


def test_strip_widget_pii_tolerates_missing_fields():
    from mcp_server.tools import _strip_widget_pii

    result = _strip_widget_pii({"name": "Bob"})
    assert result == {"name": "Bob"}


def test_strip_widget_pii_does_not_mutate_input():
    from mcp_server.tools import _strip_widget_pii

    person = {"name": "Eve", "email": "eve@example.com"}
    _strip_widget_pii(person)
    assert "email" in person  # original untouched


@pytest.mark.asyncio
async def test_orbis_get_summary_wire_shape_via_call_tool():
    """Verify the actual MCP wire shape, not just the function return."""
    import json as _json

    from mcp.types import CallToolResult

    from mcp_server.server import mcp

    fake_payload = {"name": "Alice", "headline": "Eng", "node_counts": {}}
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch(
            "mcp_server.server.get_orb_summary",
            new=AsyncMock(return_value=fake_payload),
        ),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await mcp.call_tool("orbis_get_summary", {"orb_id": "", "token": ""})

    # FastMCP returns CallToolResult when the tool function does
    assert isinstance(result, CallToolResult)
    # Backwards-compat: existing clients reading content[0].text get the
    # raw payload
    assert _json.loads(result.content[0].text) == fake_payload
    # Modern MCP clients reading structuredContent get the same data
    assert result.structuredContent == fake_payload
    # ChatGPT Apps SDK reads _meta.openai/outputTemplate at top level
    assert result.meta["openai/outputTemplate"] == "ui://widget/summary"
    assert result.meta["ui"]["resourceUri"] == "ui://widget/summary"


@pytest.mark.asyncio
async def test_orbis_get_nodes_wire_shape_via_call_tool():
    """get_nodes_by_type returns list, widget gets {node_type, nodes}."""
    import json as _json

    from mcp.types import CallToolResult

    from mcp_server.server import mcp

    fake_nodes = [{"uid": "s1", "name": "Python"}]
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch(
            "mcp_server.server.get_nodes_by_type",
            new=AsyncMock(return_value=fake_nodes),
        ),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await mcp.call_tool(
            "orbis_get_nodes_by_type",
            {"node_type": "skill", "orb_id": "", "token": ""},
        )
    assert isinstance(result, CallToolResult)
    # Backwards-compat: raw list in content text
    assert _json.loads(result.content[0].text) == fake_nodes
    # Widget gets enriched shape
    assert result.structuredContent == {"node_type": "skill", "nodes": fake_nodes}
    # Widget meta still attached
    assert result.meta["openai/outputTemplate"] == "ui://widget/nodes"


@pytest.mark.asyncio
async def test_orbis_get_full_orb_wire_shape_translates_labels():
    """get_orb_full's PascalCase _type becomes snake_case type for the widget."""
    from mcp_server.server import mcp

    raw_tool_output = {
        "person": {"uid": "p1", "name": "Alice", "orb_id": "orb1"},
        "nodes": [
            {
                "uid": "w1",
                "_type": "WorkExperience",
                "title": "Eng",
                "_relationship": "HAS_WORK_EXPERIENCE",
            },
            {
                "uid": "s1",
                "_type": "Skill",
                "name": "Python",
                "_relationship": "HAS_SKILL",
            },
        ],
        "cross_links": [],
    }
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch(
            "mcp_server.server.get_orb_full",
            new=AsyncMock(return_value=raw_tool_output),
        ),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await mcp.call_tool("orbis_get_full_orb", {"orb_id": "", "token": ""})
    sc = result.structuredContent
    assert sc["person"]["uid"] == "p1"
    types = [n["type"] for n in sc["nodes"]]
    assert "work_experience" in types
    assert "skill" in types
    assert sc["total_nodes"] == 2
    # edges link person to each node
    assert {"source": "p1", "target": "w1"} in sc["edges"]


@pytest.mark.asyncio
async def test_orbis_get_full_orb_computes_real_degree_from_cross_links():
    """Cross-link edges contribute to per-node degree."""
    from mcp_server.server import mcp

    raw = {
        "person": {"uid": "p1", "name": "Alice", "orb_id": "orb1"},
        "nodes": [
            {"uid": "w1", "_type": "WorkExperience", "title": "Eng"},
            {"uid": "s1", "_type": "Skill", "name": "Python"},
            {"uid": "s2", "_type": "Skill", "name": "Rust"},
        ],
        "cross_links": [
            {"source": "w1", "target": "s1", "rel": "USED_SKILL"},
            {"source": "w1", "target": "s2", "rel": "USED_SKILL"},
        ],
    }
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch("mcp_server.server.get_orb_full", new=AsyncMock(return_value=raw)),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await mcp.call_tool("orbis_get_full_orb", {"orb_id": "", "token": ""})
    sc = result.structuredContent
    by_uid = {n["uid"]: n for n in sc["nodes"]}
    # w1: person→w1 + w1→s1 + w1→s2 = 3
    assert by_uid["w1"]["degree"] == 3
    # s1: person→s1 + w1→s1 = 2
    assert by_uid["s1"]["degree"] == 2
    # s2: person→s2 + w1→s2 = 2
    assert by_uid["s2"]["degree"] == 2
    # Edges include both person-rooted and cross-links
    assert {"source": "p1", "target": "w1"} in sc["edges"]
    assert {"source": "w1", "target": "s1"} in sc["edges"]


@pytest.mark.asyncio
async def test_orbis_get_connections_wire_shape_renames_to_focus_and_related():
    """Fallback path: tool didn't return a focus, widget envelope is minimal."""
    from mcp_server.server import mcp

    raw = {
        "node_uid": "w1",
        "connections": [
            {
                "relationship": "USED_SKILL",
                "node": {"uid": "s1", "name": "Python", "_labels": ["Skill"]},
            }
        ],
    }
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch("mcp_server.server.get_connections", new=AsyncMock(return_value=raw)),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await mcp.call_tool(
            "orbis_get_connections", {"node_uid": "w1", "orb_id": "", "token": ""}
        )
    sc = result.structuredContent
    assert sc["focus"]["uid"] == "w1"
    assert sc["related"][0]["name"] == "Python"
    assert sc["related"][0]["type"] == "skill"
    assert sc["related"][0]["relationship"] == "USED_SKILL"


@pytest.mark.asyncio
async def test_orbis_get_connections_uses_focus_from_tool():
    """Tool now returns focus info; widget transform uses it instead of placeholder."""
    from mcp_server.server import mcp

    raw = {
        "node_uid": "w1",
        "focus": {
            "uid": "w1",
            "title": "Senior Engineer at Acme",
            "_labels": ["WorkExperience"],
        },
        "connections": [
            {
                "relationship": "USED_SKILL",
                "node": {"uid": "s1", "name": "Python", "_labels": ["Skill"]},
            }
        ],
    }
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch("mcp_server.server.get_connections", new=AsyncMock(return_value=raw)),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await mcp.call_tool(
            "orbis_get_connections", {"node_uid": "w1", "orb_id": "", "token": ""}
        )
    sc = result.structuredContent
    assert sc["focus"]["title"] == "Senior Engineer at Acme"
    assert sc["focus"]["type"] == "work_experience"
    assert sc["focus"]["uid"] == "w1"


@pytest.mark.asyncio
async def test_orbis_get_skills_for_experience_wire_shape():
    from mcp_server.server import mcp

    fake = [{"uid": "s1", "name": "Python", "category": "Backend"}]
    with (
        patch(
            "mcp_server.server._resolve_scope",
            new=AsyncMock(return_value=("orb1", "")),
        ),
        patch("mcp_server.server._get_driver", new=AsyncMock(return_value=None)),
        patch(
            "mcp_server.server.get_skills_for_experience",
            new=AsyncMock(return_value=fake),
        ),
        patch("mcp_server.widgets.get_share_context", return_value=None),
    ):
        result = await mcp.call_tool(
            "orbis_get_skills_for_experience",
            {"experience_uid": "w1", "orb_id": "", "token": ""},
        )
    sc = result.structuredContent
    assert sc["experience"]["uid"] == "w1"
    assert sc["skills"] == fake
