from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch


@patch("app.cv.router.jobs_db.create_job", new_callable=AsyncMock)
@patch("app.cv.router.save_document", new_callable=AsyncMock)
@patch("app.cv.router.evict_oldest_if_at_limit", new_callable=AsyncMock)
def test_upload_cv_success(mock_evict, mock_save, mock_create_job, client):
    mock_create_job.return_value = {"job_id": "test-job-id", "status": "queued"}

    file_content = b"%PDF-1.4 test content"
    file = BytesIO(file_content)

    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )

    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "queued"
    mock_create_job.assert_called_once()


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


@patch("app.cv.router.jobs_db.create_job", new_callable=AsyncMock)
@patch("app.cv.router.save_document", new_callable=AsyncMock)
@patch("app.cv.router.evict_oldest_if_at_limit", new_callable=AsyncMock)
def test_upload_cv_dispatches_job(_evict, _save, mock_create_job, client):
    """Upload now returns a job_id immediately instead of running the pipeline."""
    mock_create_job.return_value = {"job_id": "job-123", "status": "queued"}

    file = BytesIO(b"%PDF-1.4 test")
    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "queued"
    assert "job_id" in data


def test_confirm_cv_invalid_node_type(client, mock_db):
    payload = {
        "nodes": [{"node_type": "invalid", "properties": {}}],
        "relationships": [],
    }
    response = client.post("/cv/confirm", json=payload)
    assert response.status_code == 200
    assert response.json()["created"] == 0


# ── #394: CV-parsed profile must not overwrite the OAuth-verified email ──


def test_build_person_updates_routes_cv_email_to_cv_email_field():
    """CV-parsed email goes to `cv_email` (encrypted) — never to `email`."""
    from app.cv.models import ConfirmRequest, ExtractedProfile
    from app.cv.router import _build_person_updates
    from app.graph.encryption import decrypt_value

    data = ConfirmRequest(
        cv_owner_name="CV Owner",
        nodes=[],
        relationships=[],
        profile=ExtractedProfile(
            email="someone-from-cv@example.com",
            phone="+10000000000",
            headline="Staff Engineer",
            linkedin_url="https://linkedin.com/in/cvowner",
        ),
    )

    updates = _build_person_updates(data)

    # Identity field untouched — admin dashboard, notifications, etc. stay on OAuth email.
    assert "email" not in updates, "CV-confirm must NEVER set Person.email"

    # CV-parsed email is still captured, but as an encrypted reference-only field.
    assert "cv_email" in updates
    assert decrypt_value(updates["cv_email"]) == "someone-from-cv@example.com"

    # Non-identity profile fields continue to flow through.
    assert updates["headline"] == "Staff Engineer"
    assert updates["linkedin_url"] == "https://linkedin.com/in/cvowner"
    assert decrypt_value(updates["phone"]) == "+10000000000"


def test_build_person_updates_with_profile_missing_email():
    """If the LLM didn't extract any email, no cv_email field is added."""
    from app.cv.models import ConfirmRequest, ExtractedProfile
    from app.cv.router import _build_person_updates

    data = ConfirmRequest(
        cv_owner_name="CV Owner",
        nodes=[],
        relationships=[],
        profile=ExtractedProfile(headline="Senior Researcher"),
    )

    updates = _build_person_updates(data)

    assert "email" not in updates
    assert "cv_email" not in updates
    assert updates["headline"] == "Senior Researcher"
