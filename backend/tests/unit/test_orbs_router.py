from unittest.mock import AsyncMock, patch

from app.orbs.router import _sanitize_neo4j_types, _serialize_orb
from tests.unit.conftest import MockNode


def test_sanitize_neo4j_types():
    from neo4j.time import Date, DateTime, Time

    d = {
        "dt": DateTime(2023, 1, 1, 12, 0, 0),
        "d": Date(2023, 1, 1),
        "t": Time(12, 0, 0),
        "s": "string",
        "i": 123,
    }
    sanitized = _sanitize_neo4j_types(d)
    assert isinstance(sanitized["dt"], str)
    assert isinstance(sanitized["d"], str)
    assert isinstance(sanitized["t"], str)
    assert sanitized["s"] == "string"
    assert sanitized["i"] == 123


def test_get_my_orb_success(client, mock_db):
    person_node = MockNode({"user_id": "test-user", "name": "Test User"}, ["Person"])
    node1 = MockNode({"uid": "node-1", "name": "Python"}, ["Skill"])

    record = {
        "p": person_node,
        "connections": [{"node": node1, "rel": "HAS_SKILL"}],
        "cross_skill_nodes": [],
        "cross_links": [],
    }

    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=record)
    )

    response = client.get("/orbs/me")
    assert response.status_code == 200
    assert response.json()["person"]["name"] == "Test User"
    assert len(response.json()["nodes"]) == 1
    assert response.json()["nodes"][0]["uid"] == "node-1"


def test_update_my_profile(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"status": "updated"})
    )

    response = client.put("/orbs/me", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["status"] == "updated"


def test_claim_orb_id_success(client, mock_db):
    # Mock orb_id not taken (GET_PERSON_BY_ORB_ID returns None)
    # Then UPDATE_ORB_ID returns something
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(side_effect=[None, {"orb_id": "new-id"}])
    )

    response = client.put("/orbs/me/orb-id", json={"orb_id": "new-id"})
    assert response.status_code == 200
    assert response.json()["orb_id"] == "new-id"


def test_add_node_success(client, mock_db):
    node_mock = MockNode({"uid": "new-node", "name": "Java"}, ["Skill"])

    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"n": node_mock})
    )

    response = client.post(
        "/orbs/me/nodes", json={"node_type": "skill", "properties": {"name": "Java"}}
    )
    assert response.status_code == 200
    assert response.json()["uid"] == "new-node"


def test_get_my_orb_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.get("/orbs/me")
    assert response.status_code == 404


def test_update_my_profile_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.put("/orbs/me", json={"name": "X"})
    assert response.status_code == 404


def test_add_node_user_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.post(
        "/orbs/me/nodes", json={"node_type": "skill", "properties": {"name": "X"}}
    )
    assert response.status_code == 404


def test_update_node_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.put("/orbs/me/nodes/node-1", json={"properties": {"name": "X"}})
    assert response.status_code == 404


def test_link_skill_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.post(
        "/orbs/me/link-skill", json={"node_uid": "n1", "skill_uid": "s1"}
    )
    assert response.status_code == 404


def test_unlink_skill_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.post(
        "/orbs/me/unlink-skill", json={"node_uid": "n1", "skill_uid": "s1"}
    )
    assert response.status_code == 404


def test_update_node_success(client, mock_db):
    node_data = {"uid": "node-1", "name": "Updated"}
    node_mock = MockNode(node_data, ["Skill"])

    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"n": node_mock})
    )

    response = client.put(
        "/orbs/me/nodes/node-1", json={"properties": {"name": "Updated"}}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated"


def test_delete_node_success(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )

    response = client.delete("/orbs/me/nodes/node-1")
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"


@patch("app.orbs.router.validate_share_token")
def test_get_public_orb_success(mock_validate, client, mock_db):
    mock_validate.return_value = {"orb_id": "test-orb", "keywords": []}

    person_node = MockNode({"orb_id": "test-orb", "name": "Test User"}, ["Person"])
    node1 = MockNode({"uid": "node-1", "name": "Python"}, ["Skill"])

    record = {
        "p": person_node,
        "connections": [{"node": node1, "rel": "HAS_SKILL"}],
        "cross_skill_nodes": [],
        "cross_links": [],
    }

    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=record)
    )

    response = client.get("/orbs/test-orb?token=valid-token")
    assert response.status_code == 200
    assert response.json()["person"]["name"] == "Test User"


@patch("app.orbs.router.validate_share_token")
def test_get_public_orb_not_found(mock_validate, client, mock_db):
    mock_validate.return_value = {"orb_id": "nonexistent", "keywords": []}

    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )

    response = client.get("/orbs/nonexistent?token=valid-token")
    assert response.status_code == 404


def test_get_public_orb_no_token(client):
    response = client.get("/orbs/test-orb")
    assert response.status_code == 422


@patch("app.orbs.router.validate_share_token")
def test_get_public_orb_invalid_token(mock_validate, client, mock_db):
    mock_validate.return_value = None

    response = client.get("/orbs/test-orb?token=bad-token")
    assert response.status_code == 403


def test_add_node_invalid_type(client):
    response = client.post(
        "/orbs/me/nodes", json={"node_type": "invalid", "properties": {}}
    )
    assert response.status_code == 400


@patch("app.orbs.router.validate_share_token")
@patch("app.orbs.router.node_matches_filters")
def test_get_public_orb_with_keyword_filters(
    mock_matches, mock_validate, client, mock_db
):
    mock_validate.return_value = {"orb_id": "test-orb", "keywords": ["secret"]}

    person_node = MockNode({"orb_id": "test-orb"}, ["Person"])
    node1 = MockNode({"uid": "node-1", "name": "Python"}, ["Skill"])
    node2 = MockNode({"uid": "node-2", "name": "Secret"}, ["Skill"])

    record = {
        "p": person_node,
        "connections": [
            {"node": node1, "rel": "HAS_SKILL"},
            {"node": node2, "rel": "HAS_SKILL"},
        ],
        "cross_skill_nodes": [],
        "cross_links": [],
    }

    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=record)
    )

    mock_matches.side_effect = lambda node, _filters: node.get("name") == "Secret"

    response = client.get("/orbs/test-orb?token=valid-token")
    assert response.status_code == 200
    data = response.json()
    assert len(data["nodes"]) == 1
    assert data["nodes"][0]["uid"] == "node-1"


def test_serialize_orb_with_cross_links():
    person = MockNode({"user_id": "u1"}, ["Person"])
    n1 = MockNode({"uid": "n1"}, ["Project"])
    n2 = MockNode({"uid": "n2"}, ["Skill"])

    record = {
        "p": person,
        "connections": [
            {"node": n1, "rel": "HAS_PROJECT"},
            {"node": n2, "rel": "HAS_SKILL"},
        ],
        "cross_skill_nodes": [],
        "cross_links": [{"source": "n1", "target": "n2", "rel": "USED_SKILL"}],
    }

    result = _serialize_orb(record)
    assert len(result["links"]) == 3  # 2 from person + 1 cross link
    assert any(link["type"] == "USED_SKILL" for link in result["links"])


def test_serialize_orb_with_duplicates():
    person = MockNode({"user_id": "u1"}, ["Person"])
    n1 = MockNode({"uid": "n1"}, ["Project"])

    record = {
        "p": person,
        "connections": [
            {"node": n1, "rel": "HAS_PROJECT"},
            {"node": n1, "rel": "HAS_PROJECT"},  # Duplicate
        ],
        "cross_skill_nodes": [],
        "cross_links": [],
    }

    result = _serialize_orb(record)
    assert len(result["nodes"]) == 1
    assert len(result["links"]) == 1


def test_serialize_orb_with_cross_skill_nodes():
    person = MockNode({"user_id": "u1"}, ["Person"])
    n1 = MockNode({"uid": "n1"}, ["Skill"])

    record = {
        "p": person,
        "connections": [],
        "cross_skill_nodes": [n1],
        "cross_links": [],
    }

    result = _serialize_orb(record)
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["uid"] == "n1"
    assert len(result["links"]) == 1
    assert result["links"][0]["type"] == "HAS_SKILL"


def test_link_skill_success(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"status": "linked"})
    )
    response = client.post(
        "/orbs/me/link-skill", json={"node_uid": "n1", "skill_uid": "s1"}
    )
    assert response.status_code == 200


def test_unlink_skill_success(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"status": "unlinked"})
    )
    response = client.post(
        "/orbs/me/unlink-skill", json={"node_uid": "n1", "skill_uid": "s1"}
    )
    assert response.status_code == 200


@patch("app.orbs.router.create_share_token")
def test_create_share_token_success(mock_create, client, mock_db):
    mock_create.return_value = {
        "token_id": "abc123",
        "orb_id": "test-orb",
        "keywords": ["private"],
        "label": "",
        "created_at": "2026-01-01T00:00:00+00:00",
        "expires_at": "2026-04-01T00:00:00+00:00",
        "revoked": False,
    }

    response = client.post("/orbs/me/share-tokens", json={"keywords": ["private"]})
    assert response.status_code == 200
    assert response.json()["token_id"] == "abc123"


@patch("app.orbs.router.create_share_token")
def test_create_share_token_no_orb_id(mock_create, client, mock_db):
    mock_create.return_value = None

    response = client.post("/orbs/me/share-tokens", json={"keywords": ["private"]})
    assert response.status_code == 400


@patch("app.orbs.router.list_share_tokens")
def test_list_share_tokens(mock_list, client, mock_db):
    mock_list.return_value = [
        {
            "token_id": "abc123",
            "orb_id": "test-orb",
            "keywords": ["private"],
            "label": "",
            "created_at": "2026-01-01T00:00:00+00:00",
            "expires_at": None,
            "revoked": False,
        }
    ]

    response = client.get("/orbs/me/share-tokens")
    assert response.status_code == 200
    assert len(response.json()["tokens"]) == 1


@patch("app.orbs.router.revoke_share_token")
def test_revoke_share_token_success(mock_revoke, client, mock_db):
    mock_revoke.return_value = {"token_id": "abc123", "revoked": True}

    response = client.delete("/orbs/me/share-tokens/abc123")
    assert response.status_code == 200
    assert response.json()["status"] == "revoked"


@patch("app.orbs.router.revoke_share_token")
def test_revoke_share_token_not_found(mock_revoke, client, mock_db):
    mock_revoke.return_value = None

    response = client.delete("/orbs/me/share-tokens/nonexistent")
    assert response.status_code == 404


def test_claim_orb_id_conflict(client, mock_db):
    """Claiming an orb_id already taken by another user returns 409."""
    existing_record = {"p": MockNode({"user_id": "other-user"}, ["Person"])}
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=existing_record)
    )

    response = client.put("/orbs/me/orb-id", json={"orb_id": "taken-id"})
    assert response.status_code == 409
    assert "already taken" in response.json()["detail"]
