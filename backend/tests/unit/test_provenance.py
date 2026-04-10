"""Tests for provenance service: ontology version detection and processing record creation."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.graph.provenance import create_processing_record, ensure_ontology_version


@pytest.fixture
def mock_session():
    session = AsyncMock()
    return session


@pytest.fixture
def sample_ontology_content():
    return "# Orb Knowledge Graph Ontology\n\n## Node Labels & Properties\n\n### Skill\n- `uid` (string)\n- `name` (string)\n"


@pytest.mark.asyncio
async def test_ensure_ontology_version_creates_first_version(
    mock_session, sample_ontology_content
):
    """When no OntologyVersion exists, creates version 1."""
    # No existing version
    result_mock = AsyncMock()
    result_mock.single = AsyncMock(return_value=None)
    mock_session.run = AsyncMock(return_value=result_mock)

    with patch(
        "app.graph.provenance.read_ontology_file", return_value=sample_ontology_content
    ):
        version_id = await ensure_ontology_version(
            mock_session, "/fake/root", "test prompt"
        )

    assert version_id is not None
    # Should have called run at least twice: GET_LATEST + CREATE
    assert mock_session.run.call_count >= 2


@pytest.mark.asyncio
async def test_ensure_ontology_version_reuses_existing(
    mock_session, sample_ontology_content
):
    """When hash matches, reuses existing OntologyVersion."""
    from app.graph.ontology import hash_content

    existing_hash = hash_content(sample_ontology_content)
    existing_version = MagicMock()
    existing_version.__getitem__ = lambda _self, key: {
        "version_id": "existing-id",
        "content_hash": existing_hash,
        "version_number": 1,
        "extraction_prompt": "test prompt",
    }[key]

    result_mock = AsyncMock()
    result_mock.single = AsyncMock(return_value={"ov": existing_version})
    mock_session.run = AsyncMock(return_value=result_mock)

    with patch(
        "app.graph.provenance.read_ontology_file", return_value=sample_ontology_content
    ):
        version_id = await ensure_ontology_version(
            mock_session, "/fake/root", "test prompt"
        )

    assert version_id == "existing-id"
    # Only the GET query should have run
    assert mock_session.run.call_count == 1


@pytest.mark.asyncio
async def test_ensure_ontology_version_warns_on_unchanged_prompt(
    mock_session, sample_ontology_content, caplog
):
    """When ontology changes but prompt doesn't, logs a warning."""
    existing_version = MagicMock()
    existing_version.__getitem__ = lambda _self, key: {
        "version_id": "old-id",
        "content_hash": "different-hash",
        "version_number": 1,
        "extraction_prompt": "test prompt",
    }[key]

    result_mock = AsyncMock()
    result_mock.single = AsyncMock(return_value={"ov": existing_version})
    mock_session.run = AsyncMock(return_value=result_mock)

    import logging

    with (
        patch(
            "app.graph.provenance.read_ontology_file",
            return_value=sample_ontology_content,
        ),
        caplog.at_level(logging.WARNING),
    ):
        version_id = await ensure_ontology_version(
            mock_session, "/fake/root", "test prompt"
        )

    assert version_id is not None
    assert version_id != "old-id"
    assert "extraction prompt is unchanged" in caplog.text


@pytest.mark.asyncio
async def test_create_processing_record(mock_session):
    """create_processing_record creates a node and links it."""
    result_mock = AsyncMock()
    result_mock.single = AsyncMock(return_value=MagicMock())
    mock_session.run = AsyncMock(return_value=result_mock)

    record_id = await create_processing_record(
        session=mock_session,
        user_id="user-1",
        document_id="doc-1",
        ontology_version_id="ov-1",
        llm_provider="claude",
        llm_model="claude-opus-4-6",
        extraction_method="primary",
        prompt_hash="abc123",
        nodes_extracted=5,
        edges_extracted=3,
        node_uids=["uid-1", "uid-2", "uid-3", "uid-4", "uid-5"],
    )

    assert record_id is not None
    # CREATE_PROCESSING_RECORD + LINK_TO_ONTOLOGY + LINK_PERSON + 5x LINK_TO_NODE = 8
    assert mock_session.run.call_count == 8
