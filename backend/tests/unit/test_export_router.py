from unittest.mock import AsyncMock, patch

import pytest

from tests.unit.conftest import MockNode


@pytest.fixture
def mock_orb_record():
    person_data = {
        "name": "Test User",
        "headline": "Tester",
        "email": "test@example.com",
    }
    person_node = MockNode(person_data, ["Person"])

    node1_data = {"uid": "node-1", "name": "Python", "proficiency": "Expert"}
    node1 = MockNode(node1_data, ["Skill"])

    node2_data = {
        "uid": "node-2",
        "company": "Google",
        "title": "Engineer",
        "start_date": "2020-01-01",
    }
    node2 = MockNode(node2_data, ["WorkExperience"])

    return {
        "p": person_node,
        "connections": [
            {"node": node1, "rel": "HAS_SKILL"},
            {"node": node2, "rel": "HAS_EXPERIENCE"},
        ],
    }


@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_json(mock_decrypt, client, mock_db, mock_orb_record):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=mock_orb_record)
    )

    response = client.get("/export/test-orb?format=json")
    assert response.status_code == 200
    data = response.json()
    assert data["orb_id"] == "test-orb"
    assert data["person"]["name"] == "Test User"
    assert len(data["nodes"]) == 2


@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_jsonld(mock_decrypt, client, mock_db, mock_orb_record):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=mock_orb_record)
    )

    response = client.get("/export/test-orb?format=jsonld")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/ld+json"
    data = response.json()
    assert data["@type"] == "Person"
    assert len(data["orb:nodes"]) == 2


@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_pdf(mock_decrypt, client, mock_db, mock_orb_record):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=mock_orb_record)
    )

    response = client.get("/export/test-orb?format=pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 0


@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_not_found(mock_decrypt, client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )

    response = client.get("/export/nonexistent")
    assert response.status_code == 404


@pytest.fixture
def mock_complex_orb_record():
    person_data = {
        "name": "Test User",
        "headline": "Tester",
        "email": "test@example.com",
    }
    person_node = MockNode(person_data, ["Person"])

    nodes = [
        MockNode({"uid": "n1", "institution": "Uni", "degree": "MSc"}, ["Education"]),
        MockNode({"uid": "n2", "name": "Python"}, ["Skill"]),
        MockNode(
            {"uid": "n3", "name": "English", "proficiency": "Native"}, ["Language"]
        ),
        MockNode(
            {"uid": "n4", "name": "AWS", "issuing_organization": "Amazon"},
            ["Certification"],
        ),
        MockNode({"uid": "n5", "title": "Paper", "venue": "Conf"}, ["Publication"]),
        MockNode({"uid": "n6", "name": "Project X", "role": "Lead"}, ["Project"]),
        MockNode(
            {"uid": "n7", "title": "Patent 1", "patent_number": "123"}, ["Patent"]
        ),
    ]

    connections = [{"node": n, "rel": "REL"} for n in nodes]

    return {"p": person_node, "connections": connections}


@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_pdf_complex(mock_decrypt, client, mock_db, mock_complex_orb_record):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=mock_complex_orb_record)
    )
    response = client.get("/export/test-orb?format=pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"


@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_jsonld_types(
    mock_decrypt, client, mock_db, mock_complex_orb_record
):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=mock_complex_orb_record)
    )
    response = client.get("/export/test-orb?format=jsonld")
    assert response.status_code == 200
    data = response.json()
    types = [n.get("@type") for n in data["orb:nodes"]]
    # Verify exact mapping from router's type_mapping dict
    assert "EducationalOccupationalCredential" in types  # Education
    assert "DefinedTerm" in types  # Skill
    assert "Language" in types  # Language
    assert "ScholarlyArticle" in types  # Publication
    assert "Project" in types  # Project
    assert "Thing" in types  # Patent (unmapped, falls back to Thing)


@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
@patch("app.export.router.node_matches_filters")
def test_export_orb_with_filters(
    mock_matches, mock_decrypt, client, mock_db, mock_orb_record
):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=mock_orb_record)
    )

    # Mock filtering: node-1 matches (is filtered out), node-2 doesn't
    mock_matches.side_effect = lambda node, _filters: node.get("uid") == "node-1"

    response = client.get("/export/test-orb?filter_keyword=python")
    assert response.status_code == 200
    data = response.json()
    assert len(data["nodes"]) == 1
    assert data["nodes"][0]["uid"] == "node-2"
