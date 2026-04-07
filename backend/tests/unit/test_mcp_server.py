from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from mcp_server.server import orbis_send_message
from mcp_server.tools import (
    get_connections,
    get_nodes_by_type,
    get_orb_full,
    get_orb_summary,
    get_skills_for_experience,
)
from tests.fixtures.mcp_schemas import (
    ConnectionsResponse,
    FullOrbResponse,
    MessageResponse,
    NodeListResponse,
    SummaryResponse,
)


@pytest.fixture
def mock_person():
    return {
        "name": "Test User",
        "headline": "Software Engineer",
        "location": "San Francisco",
        "orb_id": "test-orb",
        "open_to_work": True,
    }


class MockNode:
    def __init__(self, labels, properties):
        self.labels = set(labels)
        self._properties = properties

    def __getitem__(self, key):
        return self._properties[key]

    def get(self, key, default=None):
        return self._properties.get(key, default)

    def items(self):
        return self._properties.items()

    def keys(self):
        return self._properties.keys()


@pytest.mark.asyncio
async def test_get_orb_summary_success(mock_db, mock_person):
    # Setup mock record
    data = {
        "p": mock_person,
        "connections": [
            {
                "node": MockNode(["Skill"], {"name": "Python", "uid": "s1"}),
                "rel": "HAS_SKILL",
            },
            {
                "node": MockNode(
                    ["Education"], {"institution": "Stanford", "uid": "e1"}
                ),
                "rel": "HAS_EDUCATION",
            },
        ],
    }
    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = data.__getitem__

    mock_result = AsyncMock()
    mock_result.single.return_value = mock_record
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    # Call tool
    result = await get_orb_summary(mock_db, "test-orb")

    # Validate against schema
    SummaryResponse.model_validate(result)

    assert result["name"] == "Test User"
    assert result["node_counts"]["Skill"] == 1
    assert result["node_counts"]["Education"] == 1
    assert result["total_nodes"] == 2


@pytest.mark.asyncio
async def test_get_orb_summary_not_found(mock_db):
    mock_result = AsyncMock()
    mock_result.single.return_value = None
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    result = await get_orb_summary(mock_db, "non-existent")

    assert "error" in result
    assert "not found" in result["error"]


@pytest.mark.asyncio
async def test_get_orb_summary_filtering(mock_db, mock_person):
    # Setup mock record
    data = {
        "p": mock_person,
        "connections": [
            {
                "node": MockNode(["Skill"], {"name": "Python", "uid": "s1"}),
                "rel": "HAS_SKILL",
            },
            {
                "node": MockNode(["Skill"], {"name": "SecretSkill", "uid": "s2"}),
                "rel": "HAS_SKILL",
            },
        ],
    }
    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = data.__getitem__

    mock_result = AsyncMock()
    mock_result.single.return_value = mock_record
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    # Mock filter token decoding
    with patch("mcp_server.tools.decode_filter_token") as mock_decode:
        mock_decode.return_value = {"orb_id": "test-orb", "filters": ["secret"]}

        # Call tool with token
        result = await get_orb_summary(mock_db, "test-orb", filter_token="some-token")

    # SecretSkill should be filtered out because it contains "secret"
    assert result["node_counts"]["Skill"] == 1
    assert result["total_nodes"] == 1


@pytest.mark.asyncio
async def test_get_orb_full_success(mock_db, mock_person):
    data = {
        "p": mock_person,
        "connections": [
            {
                "node": MockNode(["Skill"], {"name": "Python", "uid": "s1"}),
                "rel": "HAS_SKILL",
            }
        ],
    }
    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = data.__getitem__

    mock_result = AsyncMock()
    mock_result.single.return_value = mock_record
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    result = await get_orb_full(mock_db, "test-orb")

    FullOrbResponse.model_validate(result)
    assert result["person"]["name"] == "Test User"
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["name"] == "Python"
    assert result["nodes"][0]["_type"] == "Skill"


@pytest.mark.asyncio
async def test_get_nodes_by_type_success(mock_db):
    mock_node = MockNode(["Skill"], {"name": "Python", "uid": "s1"})

    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = {"n": mock_node}.__getitem__

    mock_result = AsyncMock()
    mock_result.__aiter__.return_value = [mock_record]
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    result = await get_nodes_by_type(mock_db, "test-orb", "skill")

    NodeListResponse.model_validate(result)
    assert len(result) == 1
    assert result[0]["name"] == "Python"


@pytest.mark.asyncio
async def test_get_connections_success(mock_db):
    mock_connected_node = MockNode(["Skill"], {"name": "Python", "uid": "s1"})

    data = {
        "connected": mock_connected_node,
        "rel_type": "USED_SKILL",
        "connected_labels": ["Skill"],
    }
    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = data.__getitem__

    mock_result = AsyncMock()
    mock_result.__aiter__.return_value = [mock_record]
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    result = await get_connections(mock_db, "test-orb", "exp-1")

    ConnectionsResponse.model_validate(result)
    assert result["node_uid"] == "exp-1"
    assert len(result["connections"]) == 1
    assert result["connections"][0]["relationship"] == "USED_SKILL"
    assert result["connections"][0]["node"]["name"] == "Python"


@pytest.mark.asyncio
async def test_get_skills_for_experience_success(mock_db):
    mock_skill = MockNode(["Skill"], {"name": "Python", "uid": "s1"})

    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = {"s": mock_skill}.__getitem__

    mock_result = AsyncMock()
    mock_result.__aiter__.return_value = [mock_record]
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    result = await get_skills_for_experience(mock_db, "test-orb", "exp-1")

    NodeListResponse.model_validate(result)
    assert len(result) == 1
    assert result[0]["name"] == "Python"


@pytest.mark.asyncio
async def test_get_orb_full_filtering(mock_db, mock_person):
    data = {
        "p": mock_person,
        "connections": [
            {
                "node": MockNode(["Skill"], {"name": "Python", "uid": "s1"}),
                "rel": "HAS_SKILL",
            },
            {
                "node": MockNode(["Skill"], {"name": "Secret", "uid": "s2"}),
                "rel": "HAS_SKILL",
            },
        ],
    }
    mock_record = MagicMock()
    mock_record.__getitem__.side_effect = data.__getitem__

    mock_result = AsyncMock()
    mock_result.single.return_value = mock_record
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    with patch("mcp_server.tools.decode_filter_token") as mock_decode:
        mock_decode.return_value = {"orb_id": "test-orb", "filters": ["secret"]}
        result = await get_orb_full(mock_db, "test-orb", filter_token="token")

    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["name"] == "Python"


@pytest.mark.asyncio
async def test_orbis_send_message_success(mock_db):
    mock_result = AsyncMock()
    mock_result.single.return_value = MagicMock(__getitem__=lambda _: "msg-123")
    mock_db.session.return_value.__aenter__.return_value.run.return_value = mock_result

    # We need to mock _get_driver in server.py
    with patch("mcp_server.server._get_driver", AsyncMock(return_value=mock_db)):
        result = await orbis_send_message(
            "test-orb", "Alice", "alice@example.com", "Hello", "Test body"
        )

    MessageResponse.model_validate(result)
    assert result["detail"] == "Message sent successfully"
    assert "uid" in result
