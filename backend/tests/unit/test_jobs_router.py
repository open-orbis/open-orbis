"""Unit tests for app.cv.jobs_router."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_db
from app.main import app

# ── Shared fixture data ──

USER_ID = "user-abc"
OTHER_USER_ID = "user-xyz"

_BASE_JOB = {
    "job_id": "job-123",
    "user_id": USER_ID,
    "document_id": "doc-1",
    "cloud_task_name": None,
    "status": "queued",
    "step": None,
    "progress_pct": 0,
    "progress_detail": None,
    "llm_provider": None,
    "llm_model": None,
    "text_chars": None,
    "filename": "resume.pdf",
    "node_count": None,
    "edge_count": None,
    "result_json": None,
    "error_message": None,
    "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    "started_at": None,
    "completed_at": None,
    "expires_at": None,
    "cancelled_by": None,
}


def _make_client(user_id: str = USER_ID):
    """Return a TestClient with auth overridden for the given user_id."""
    fake_user = {"user_id": user_id, "email": f"{user_id}@example.com"}
    mock_db = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_db] = lambda: mock_db
    client = TestClient(app, raise_server_exceptions=False)
    return client, mock_db


def _teardown():
    app.dependency_overrides.clear()


# ── GET /cv/job/{job_id} ──


@patch("app.cv.jobs_router.jobs_db.get_job", new_callable=AsyncMock)
def test_get_job_owner_access(mock_get_job):
    """Owner should get 200 with job fields."""
    mock_get_job.return_value = dict(_BASE_JOB)
    client, _ = _make_client(USER_ID)
    try:
        response = client.get(f"/cv/job/{_BASE_JOB['job_id']}")
    finally:
        _teardown()

    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == "job-123"
    assert data["status"] == "queued"
    assert data["filename"] == "resume.pdf"
    mock_get_job.assert_awaited_once_with("job-123")


@patch("app.cv.jobs_router.jobs_db.get_job", new_callable=AsyncMock)
def test_get_job_wrong_user_returns_404(mock_get_job):
    """A different user requesting the same job_id must get 404 (no info leak)."""
    job = dict(_BASE_JOB)
    job["user_id"] = OTHER_USER_ID  # owned by another user
    mock_get_job.return_value = job
    client, _ = _make_client(USER_ID)  # authenticated as USER_ID
    try:
        response = client.get(f"/cv/job/{_BASE_JOB['job_id']}")
    finally:
        _teardown()

    assert response.status_code == 404


@patch("app.cv.jobs_router.jobs_db.get_job", new_callable=AsyncMock)
def test_get_job_not_found(mock_get_job):
    """Non-existent job_id returns 404."""
    mock_get_job.return_value = None
    client, _ = _make_client(USER_ID)
    try:
        response = client.get("/cv/job/nonexistent-job")
    finally:
        _teardown()

    assert response.status_code == 404


@patch("app.cv.jobs_router.jobs_db.get_job", new_callable=AsyncMock)
def test_get_job_succeeded_includes_result(mock_get_job):
    """A succeeded job with result_json exposes the parsed result key."""
    import json

    job = dict(_BASE_JOB)
    job["status"] = "succeeded"
    job["node_count"] = 5
    job["edge_count"] = 3
    job["result_json"] = json.dumps({"nodes": [], "unmatched": []})
    job["completed_at"] = datetime(2026, 1, 2, tzinfo=timezone.utc)
    mock_get_job.return_value = job
    client, _ = _make_client(USER_ID)
    try:
        response = client.get(f"/cv/job/{_BASE_JOB['job_id']}")
    finally:
        _teardown()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "succeeded"
    assert "result" in data
    assert data["result"]["nodes"] == []


@patch("app.cv.jobs_router.jobs_db.get_job", new_callable=AsyncMock)
def test_get_job_failed_includes_error_message(mock_get_job):
    """A failed job response includes error_message."""
    job = dict(_BASE_JOB)
    job["status"] = "failed"
    job["error_message"] = "LLM timed out"
    mock_get_job.return_value = job
    client, _ = _make_client(USER_ID)
    try:
        response = client.get(f"/cv/job/{_BASE_JOB['job_id']}")
    finally:
        _teardown()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "failed"
    assert data["error_message"] == "LLM timed out"


# ── POST /cv/process-job ──


@patch("app.cv.jobs_router.jobs_db.get_job", new_callable=AsyncMock)
def test_process_job_invalid_oidc_returns_401(mock_get_job):
    """Request without a valid OIDC token must return 401."""
    client, _ = _make_client(USER_ID)
    try:
        with patch(
            "app.cv.jobs_router.verify_oidc_token", return_value=None
        ):
            response = client.post(
                "/cv/process-job",
                json={"job_id": "job-123"},
            )
    finally:
        _teardown()

    assert response.status_code == 401
    mock_get_job.assert_not_awaited()


@patch("app.cv.jobs_router.jobs_db.get_job", new_callable=AsyncMock)
def test_process_job_skips_non_queued(mock_get_job):
    """If job status is not 'queued', the endpoint returns skipped."""
    job = dict(_BASE_JOB)
    job["status"] = "running"
    mock_get_job.return_value = job
    client, _ = _make_client(USER_ID)
    try:
        with patch(
            "app.cv.jobs_router.verify_oidc_token",
            return_value="sa@project.iam.gserviceaccount.com",
        ):
            response = client.post(
                "/cv/process-job",
                json={"job_id": "job-123"},
            )
    finally:
        _teardown()

    assert response.status_code == 200
    assert response.json()["status"] == "skipped"
