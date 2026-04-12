from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch


@patch("app.cv.router.pdf_extract")
@patch("app.cv.router.classify_entries")
@patch("app.cv.router.counter")
def test_upload_cv_success(mock_counter, mock_classify, mock_pdf_extract, client):
    mock_pdf_extract.return_value = "Extracted text"
    mock_classify.return_value = MagicMock(
        nodes=[{"node_type": "skill", "properties": {"name": "Python"}}],
        unmatched=[],
        skipped_nodes=[],  # Match models.py field name
        relationships=[],
        truncated=False,
        cv_owner_name="Test User",
        metadata=None,
    )

    file_content = b"%PDF-1.4 test content"
    file = BytesIO(file_content)

    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )

    assert response.status_code == 200
    assert "nodes" in response.json()
    mock_counter.increment.assert_called_once()
    mock_counter.decrement.assert_called_once()


def test_upload_cv_no_file(client):
    response = client.post("/cv/upload")
    assert response.status_code == 422  # FastAPI validation error for missing field


def test_upload_cv_invalid_extension(client):
    file = BytesIO(b"test")
    response = client.post(
        "/cv/upload", files={"file": ("test.txt", file, "text/plain")}
    )
    assert response.status_code == 400
    assert "Only PDF files are supported" in response.json()["detail"]


def test_upload_cv_rejects_non_pdf_magic_bytes(client):
    """A file with .pdf extension but not starting with %PDF- must be
    rejected at the magic-byte check, before any extractor runs."""
    file = BytesIO(b"<html>not a pdf</html>")
    response = client.post(
        "/cv/upload", files={"file": ("fake.pdf", file, "application/pdf")}
    )
    assert response.status_code == 400
    assert "not a valid PDF" in response.json()["detail"]


def test_safe_content_disposition_strips_traversal_and_ctrl_chars():
    from app.http_helpers import safe_content_disposition

    assert (
        safe_content_disposition("../../etc/passwd") == 'attachment; filename="passwd"'
    )
    # The regex collapses runs of unsafe chars into a single underscore.
    assert (
        safe_content_disposition('evil"\r\nSet-Cookie: x=y.pdf')
        == 'attachment; filename="evil_Set-Cookie: x=y.pdf"'
    )
    assert safe_content_disposition("") == 'attachment; filename="document.pdf"'
    assert safe_content_disposition("..") == 'attachment; filename="document.pdf"'
    # Plain, safe names pass through.
    assert (
        safe_content_disposition("my resume.pdf")
        == 'attachment; filename="my resume.pdf"'
    )


@patch("app.cv.router.counter")
def test_get_processing_count(mock_counter, client):
    mock_counter.get_count.return_value = 5
    response = client.get("/cv/processing-count")
    assert response.status_code == 200
    assert response.json()["count"] == 5


def _setup_tx_mock(mock_db, tx_side_effect):
    """Set up a mock Neo4j transaction so _persist_nodes can call
    session.begin_transaction() → tx.run(...)  →  tx.commit().

    The session-level run (used by the snapshot code) gets a generic None
    result; the transaction-level run gets the caller-supplied side_effect.
    """
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value = MagicMock(single=AsyncMock(return_value=None))

    tx_mock = AsyncMock()
    tx_mock.run = AsyncMock(side_effect=tx_side_effect)
    tx_mock.commit = AsyncMock()
    tx_mock.rollback = AsyncMock()
    session_mock.begin_transaction = AsyncMock(return_value=tx_mock)
    return tx_mock


def test_confirm_cv_success(client, mock_db):
    result_mock_1 = MagicMock()
    result_mock_1.single = AsyncMock(return_value=None)

    result_mock_2 = MagicMock()
    result_mock_2.single = AsyncMock(return_value=None)

    node_record_1 = {"n": {"uid": "node-1"}}
    result_mock_3 = MagicMock()
    result_mock_3.single = AsyncMock(return_value=node_record_1)

    node_record_2 = {"n": {"uid": "node-2"}}
    result_mock_4 = MagicMock()
    result_mock_4.single = AsyncMock(return_value=node_record_2)

    result_mock_5 = MagicMock()
    result_mock_5.single = AsyncMock(return_value=None)

    _setup_tx_mock(
        mock_db,
        [
            result_mock_1,  # DELETE_USER_GRAPH
            result_mock_2,  # UPDATE_PERSON
            result_mock_3,  # ADD_NODE 1
            result_mock_4,  # ADD_NODE 2
            result_mock_5,  # LINK_SKILL
        ],
    )

    payload = {
        "cv_owner_name": "Test User",
        "nodes": [
            {"node_type": "skill", "properties": {"name": "Python"}},
            {
                "node_type": "work_experience",
                "properties": {"company": "Google", "title": "Dev"},
            },
        ],
        "relationships": [{"from_index": 1, "to_index": 0, "type": "USED_SKILL"}],
    }

    response = client.post("/cv/confirm", json=payload)
    assert response.status_code == 200
    assert response.json()["created"] == 2
    assert "node-1" in response.json()["node_ids"]


def test_confirm_cv_partial_link_failure(client, mock_db):
    """LINK_SKILL failure is caught inside the transaction — the commit
    still succeeds because the exception is swallowed with a warning,
    not re-raised."""
    res_ok = MagicMock()
    res_ok.single = AsyncMock(return_value=None)

    node_rec_1 = {"n": {"uid": "node-we"}}
    res_node_1 = MagicMock()
    res_node_1.single = AsyncMock(return_value=node_rec_1)

    node_rec_2 = {"n": {"uid": "node-skill"}}
    res_node_2 = MagicMock()
    res_node_2.single = AsyncMock(return_value=node_rec_2)

    _setup_tx_mock(
        mock_db,
        [
            res_ok,  # DELETE_USER_GRAPH
            res_node_1,  # MERGE (work_experience)
            res_node_2,  # MERGE (skill)
            Exception("Link error"),  # LINK_SKILL raises inside tx.run()
        ],
    )

    payload = {
        "nodes": [
            {
                "node_type": "work_experience",
                "properties": {"company": "Acme", "title": "Dev"},
            },
            {"node_type": "skill", "properties": {"name": "Python"}},
        ],
        "relationships": [{"from_index": 0, "to_index": 1, "type": "USED_SKILL"}],
    }

    response = client.post("/cv/confirm", json=payload)
    assert response.status_code == 200
    assert response.json()["created"] == 2


def test_upload_cv_large_file(client):
    file = BytesIO(b"a" * (11 * 1024 * 1024))
    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )
    assert response.status_code == 400
    assert "too large" in response.json()["detail"]


@patch("app.cv.router.pdf_extract")
def test_upload_cv_extraction_failed(mock_pdf_extract, client):
    mock_pdf_extract.return_value = "  "  # Empty extraction
    file = BytesIO(b"%PDF-1.4 test")
    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )
    assert response.status_code == 400
    assert "Could not extract text" in response.json()["detail"]


@patch("app.cv.router.pdf_extract")
def test_upload_cv_timeout(mock_pdf_extract, client):
    mock_pdf_extract.side_effect = TimeoutError("Timeout")
    file = BytesIO(b"%PDF-1.4 test")
    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )
    assert response.status_code == 504


def test_confirm_cv_invalid_node_type(client, mock_db):
    payload = {
        "nodes": [{"node_type": "invalid", "properties": {}}],
        "relationships": [],
    }
    response = client.post("/cv/confirm", json=payload)
    assert response.status_code == 200
    assert response.json()["created"] == 0
