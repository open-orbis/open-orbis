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


@patch("app.cv.router.counter")
def test_get_processing_count(mock_counter, client):
    mock_counter.get_count.return_value = 5
    response = client.get("/cv/processing-count")
    assert response.status_code == 200
    assert response.json()["count"] == 5


def test_confirm_cv_success(client, mock_db):
    # Mock multiple run results
    run_mock = mock_db.session.return_value.__aenter__.return_value.run

    # We need to return an object that has a .single() method which is an AsyncMock
    result_mock_consent = MagicMock()
    result_mock_consent.single = AsyncMock(return_value={"consent": True})

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

    run_mock.side_effect = [
        result_mock_consent,  # _require_consent
        result_mock_1,  # DELETE_USER_GRAPH
        result_mock_2,  # UPDATE_PERSON
        result_mock_3,  # ADD_NODE 1
        result_mock_4,  # ADD_NODE 2
        result_mock_5,  # LINK_SKILL
    ]

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
    # Node creation succeeds but LINK_SKILL fails (work_experience -> skill)
    run_mock = mock_db.session.return_value.__aenter__.return_value.run

    res_consent = MagicMock()
    res_consent.single = AsyncMock(return_value={"consent": True})

    res_ok = MagicMock()
    res_ok.single = AsyncMock(return_value=None)

    node_rec_1 = {"n": {"uid": "node-we"}}
    res_node_1 = MagicMock()
    res_node_1.single = AsyncMock(return_value=node_rec_1)

    node_rec_2 = {"n": {"uid": "node-skill"}}
    res_node_2 = MagicMock()
    res_node_2.single = AsyncMock(return_value=node_rec_2)

    run_mock.side_effect = [
        res_consent,  # _require_consent
        res_ok,  # DELETE_USER_GRAPH
        res_node_1,  # MERGE (work_experience)
        res_node_2,  # MERGE (skill)
        Exception("Link error"),  # LINK_SKILL raises directly from session.run()
    ]

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
