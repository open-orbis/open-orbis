"""Unit tests for app.cv.jobs_db — asyncpg CV job state store."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import app.cv.jobs_db as jobs_db

_JOB = {
    "job_id": "job-1",
    "user_id": "user-1",
    "document_id": "doc-1",
    "cloud_task_name": None,
    "status": "queued",
    "step": None,
    "progress_pct": 0,
    "progress_detail": None,
    "llm_provider": None,
    "llm_model": None,
    "text_chars": None,
    "filename": "cv.pdf",
    "node_count": None,
    "edge_count": None,
    "result_json": None,
    "error_message": None,
    "created_at": "2026-01-01T00:00:00+00:00",
    "started_at": None,
    "completed_at": None,
    "expires_at": "2026-01-08T00:00:00+00:00",
    "cancelled_by": None,
}


def _mock_pool():
    """Return an AsyncMock that behaves like an asyncpg Pool."""
    pool = AsyncMock()
    pool.execute = AsyncMock(return_value="INSERT 0 1")
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.fetchval = AsyncMock(return_value=0)
    return pool


# ── create_job ──


async def test_create_job_returns_dict():
    pool = _mock_pool()
    pool.fetchrow.return_value = _JOB
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        result = await jobs_db.create_job(
            job_id="job-1",
            user_id="user-1",
            document_id="doc-1",
            filename="cv.pdf",
        )
    assert result["job_id"] == "job-1"
    assert result["user_id"] == "user-1"
    assert result["status"] == "queued"
    pool.fetchrow.assert_awaited_once()


async def test_create_job_sql_contains_insert():
    pool = _mock_pool()
    pool.fetchrow.return_value = _JOB
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.create_job(
            job_id="job-1",
            user_id="user-1",
            document_id=None,
            filename=None,
        )
    sql = pool.fetchrow.call_args[0][0]
    assert "INSERT INTO cv_jobs" in sql
    assert "RETURNING *" in sql


# ── get_job ──


async def test_get_job_found():
    pool = _mock_pool()
    pool.fetchrow.return_value = _JOB
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        result = await jobs_db.get_job("job-1")
    assert result is not None
    assert result["job_id"] == "job-1"


async def test_get_job_not_found():
    pool = _mock_pool()
    pool.fetchrow.return_value = None
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        result = await jobs_db.get_job("no-such-job")
    assert result is None


# ── get_active_job_for_user ──


async def test_get_active_job_for_user_found():
    pool = _mock_pool()
    pool.fetchrow.return_value = _JOB
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        result = await jobs_db.get_active_job_for_user("user-1")
    assert result is not None
    assert result["user_id"] == "user-1"
    sql = pool.fetchrow.call_args[0][0]
    assert "queued" in sql
    assert "running" in sql
    assert "succeeded" in sql


async def test_get_active_job_for_user_none():
    pool = _mock_pool()
    pool.fetchrow.return_value = None
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        result = await jobs_db.get_active_job_for_user("user-1")
    assert result is None


# ── update_job_status ──


async def test_update_job_status_running():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_status("job-1", "running")
    sql = pool.execute.call_args[0][0]
    assert "started_at" in sql


async def test_update_job_status_succeeded():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_status("job-1", "succeeded")
    sql = pool.execute.call_args[0][0]
    assert "completed_at" in sql


async def test_update_job_status_failed_with_error():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_status("job-1", "failed", error_message="oops")
    args = pool.execute.call_args[0]
    assert "failed" in args
    assert "oops" in args


async def test_update_job_status_cancelled_with_by():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_status("job-1", "cancelled", cancelled_by="admin")
    args = pool.execute.call_args[0]
    assert "admin" in args


# ── update_job_progress ──


async def test_update_job_progress():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_progress(
            "job-1", step="parsing", pct=25, detail="page 1/4", text_chars=1000
        )
    args = pool.execute.call_args[0]
    assert "parsing" in args
    assert 25 in args
    assert "page 1/4" in args
    assert 1000 in args


async def test_update_job_progress_defaults():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_progress("job-1", step="extracting", pct=50)
    args = pool.execute.call_args[0]
    assert "" in args  # default detail
    assert None in args  # default text_chars


# ── update_job_result ──


async def test_update_job_result_succeeded():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_result(
            "job-1",
            status="succeeded",
            result_json='{"nodes":[]}',
            node_count=10,
            edge_count=5,
            llm_provider="anthropic",
            llm_model="claude-3-5-haiku",
        )
    args = pool.execute.call_args[0]
    assert "succeeded" in args
    assert 10 in args
    assert 5 in args
    assert "anthropic" in args
    # progress_pct=100 for succeeded
    assert 100 in args


async def test_update_job_result_failed():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.update_job_result(
            "job-1",
            status="failed",
            error_message="timeout",
        )
    args = pool.execute.call_args[0]
    assert "failed" in args
    assert "timeout" in args
    # progress_pct=None for non-succeeded
    assert None in args


# ── set_cloud_task_name ──


async def test_set_cloud_task_name():
    pool = _mock_pool()
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        await jobs_db.set_cloud_task_name("job-1", "projects/p/tasks/t")
    args = pool.execute.call_args[0]
    assert "projects/p/tasks/t" in args
    assert "job-1" in args


# ── list_jobs_admin ──


async def test_list_jobs_admin_no_filter():
    pool = _mock_pool()
    pool.fetch.return_value = [_JOB]
    pool.fetchval.return_value = 1
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        jobs, total = await jobs_db.list_jobs_admin(offset=0, limit=20)
    assert total == 1
    assert len(jobs) == 1
    assert jobs[0]["job_id"] == "job-1"
    sql = pool.fetch.call_args[0][0]
    assert "ORDER BY created_at DESC" in sql


async def test_list_jobs_admin_with_status_filter():
    pool = _mock_pool()
    pool.fetch.return_value = [_JOB]
    pool.fetchval.return_value = 1
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        jobs, total = await jobs_db.list_jobs_admin(status="queued")
    assert total == 1
    args = pool.fetch.call_args[0]
    assert "queued" in args


async def test_list_jobs_admin_empty():
    pool = _mock_pool()
    pool.fetch.return_value = []
    pool.fetchval.return_value = 0
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        jobs, total = await jobs_db.list_jobs_admin()
    assert jobs == []
    assert total == 0


# ── cleanup_expired_jobs ──


async def test_cleanup_expired_jobs_deletes_rows():
    pool = _mock_pool()
    pool.execute.return_value = "DELETE 3"
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        count = await jobs_db.cleanup_expired_jobs()
    assert count == 3
    sql = pool.execute.call_args[0][0]
    assert "expires_at" in sql
    assert "succeeded" in sql
    assert "failed" in sql


async def test_cleanup_expired_jobs_zero():
    pool = _mock_pool()
    pool.execute.return_value = "DELETE 0"
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        count = await jobs_db.cleanup_expired_jobs()
    assert count == 0
