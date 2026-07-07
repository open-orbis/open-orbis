"""Unit tests for app.cv.worker — in-process CV job worker (Cloud Tasks replacement)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import app.cv.jobs_db as jobs_db

# ── jobs_db.claim_next_queued_job ──


async def test_claim_next_queued_job_returns_job_id():
    pool = AsyncMock()
    pool.fetchval = AsyncMock(return_value="job-1")
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        job_id = await jobs_db.claim_next_queued_job()
    assert job_id == "job-1"
    sql = pool.fetchval.await_args.args[0]
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "'running'" in sql


async def test_claim_next_queued_job_returns_none_when_empty():
    pool = AsyncMock()
    pool.fetchval = AsyncMock(return_value=None)
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        assert await jobs_db.claim_next_queued_job() is None


# ── jobs_db.requeue_orphaned_running_jobs ──


async def test_requeue_orphaned_running_jobs_returns_count():
    pool = AsyncMock()
    pool.execute = AsyncMock(return_value="UPDATE 2")
    with patch("app.cv.jobs_db.get_pool", AsyncMock(return_value=pool)):
        count = await jobs_db.requeue_orphaned_running_jobs()
    assert count == 2
    sql = pool.execute.await_args.args[0]
    assert "'queued'" in sql
    assert "'running'" in sql


# ── worker.run_cv_job ──


def _job_row(status: str = "running") -> dict:
    return {
        "job_id": "job-1",
        "user_id": "user-1",
        "document_id": "doc-1",
        "status": status,
        "filename": "cv.pdf",
    }


def _classify_result(nodes=None, provider="claude"):
    result = MagicMock()
    result.nodes = nodes or []
    result.unmatched = []
    result.skipped = []
    result.relationships = []
    result.truncated = False
    result.cv_owner_name = None
    result.profile = None
    result.metadata = MagicMock(
        llm_provider=provider,
        llm_model="m",
        extraction_method="llm",
        prompt_hash="h",
    )
    return result


async def test_run_cv_job_success_stores_result_and_emails():
    from app.cv import worker

    node = MagicMock()
    node.model_dump.return_value = {"type": "Skill", "properties": {}}

    with (
        patch.object(worker.jobs_db, "get_job", AsyncMock(return_value=_job_row())),
        patch.object(worker.jobs_db, "update_job_progress", AsyncMock()),
        patch.object(worker.jobs_db, "update_job_result", AsyncMock()) as mock_result,
        patch(
            "app.cv_storage.storage.load_document_async",
            AsyncMock(return_value=b"%PDF"),
        ),
        patch("app.cv.pdf_extractor.extract_text", AsyncMock(return_value="text")),
        patch(
            "app.cv.ollama_classifier.classify_entries",
            AsyncMock(return_value=_classify_result(nodes=[node])),
        ),
        patch.object(worker, "_send_success_email", AsyncMock()) as mock_email,
    ):
        await worker.run_cv_job("job-1", driver=AsyncMock())

    assert mock_result.await_args.kwargs["status"] == "succeeded"
    assert mock_result.await_args.kwargs["node_count"] == 1
    mock_email.assert_awaited_once()


async def test_run_cv_job_failure_marks_failed_and_emails():
    from app.cv import worker

    with (
        patch.object(worker.jobs_db, "get_job", AsyncMock(return_value=_job_row())),
        patch.object(worker.jobs_db, "update_job_progress", AsyncMock()),
        patch.object(worker.jobs_db, "update_job_result", AsyncMock()) as mock_result,
        patch(
            "app.cv_storage.storage.load_document_async",
            AsyncMock(return_value=None),  # document missing -> pipeline error
        ),
        patch.object(worker, "_send_failure_email", AsyncMock()) as mock_email,
    ):
        await worker.run_cv_job("job-1", driver=AsyncMock())

    assert mock_result.await_args.kwargs["status"] == "failed"
    mock_email.assert_awaited_once()


async def test_run_cv_job_aborts_when_cancelled_mid_run():
    """If an admin cancels while running, the job stops at the next checkpoint
    and the 'cancelled' status is left untouched (no failed overwrite, no email)."""
    from app.cv import worker

    # First read: running (claim); at the classify checkpoint the job
    # has been cancelled by an admin.
    statuses = iter([_job_row("running"), _job_row("cancelled")])

    with (
        patch.object(
            worker.jobs_db,
            "get_job",
            AsyncMock(side_effect=lambda _job_id: next(statuses)),
        ),
        patch.object(worker.jobs_db, "update_job_progress", AsyncMock()),
        patch.object(worker.jobs_db, "update_job_result", AsyncMock()) as mock_result,
        patch(
            "app.cv_storage.storage.load_document_async",
            AsyncMock(return_value=b"%PDF"),
        ),
        patch("app.cv.pdf_extractor.extract_text", AsyncMock(return_value="text")),
        patch.object(worker, "_send_failure_email", AsyncMock()) as mock_email,
    ):
        await worker.run_cv_job("job-1", driver=AsyncMock())

    mock_result.assert_not_awaited()
    mock_email.assert_not_awaited()


async def test_run_cv_job_exhausted_llm_chain_is_failed():
    """classify_entries returning provider='none' with no nodes must fail the job."""
    from app.cv import worker

    with (
        patch.object(worker.jobs_db, "get_job", AsyncMock(return_value=_job_row())),
        patch.object(worker.jobs_db, "update_job_progress", AsyncMock()),
        patch.object(worker.jobs_db, "update_job_result", AsyncMock()) as mock_result,
        patch(
            "app.cv_storage.storage.load_document_async",
            AsyncMock(return_value=b"%PDF"),
        ),
        patch("app.cv.pdf_extractor.extract_text", AsyncMock(return_value="text")),
        patch(
            "app.cv.ollama_classifier.classify_entries",
            AsyncMock(return_value=_classify_result(nodes=[], provider="none")),
        ),
        patch.object(worker, "_send_failure_email", AsyncMock()),
    ):
        await worker.run_cv_job("job-1", driver=AsyncMock())

    assert mock_result.await_args.kwargs["status"] == "failed"
    assert "fallback chain" in mock_result.await_args.kwargs["error_message"]


# ── worker.cv_worker_loop ──


async def test_worker_loop_claims_and_runs_jobs():
    from app.cv import worker

    claims = iter(["job-1", None])
    run = AsyncMock()

    async def fake_sleep(_seconds):
        raise asyncio.CancelledError  # stop the loop after the idle poll

    with (
        patch.object(
            worker.jobs_db,
            "claim_next_queued_job",
            AsyncMock(side_effect=lambda: next(claims)),
        ),
        patch.object(worker, "run_cv_job", run),
        patch.object(worker, "_get_driver", AsyncMock(return_value=AsyncMock())),
        patch("asyncio.sleep", fake_sleep),
        pytest.raises(asyncio.CancelledError),
    ):
        await worker.cv_worker_loop()

    run.assert_awaited_once()
    assert run.await_args.args[0] == "job-1"


async def test_worker_loop_survives_job_crash():
    from app.cv import worker

    claims = iter(["job-1", None])

    async def fake_sleep(_seconds):
        raise asyncio.CancelledError

    with (
        patch.object(
            worker.jobs_db,
            "claim_next_queued_job",
            AsyncMock(side_effect=lambda: next(claims)),
        ),
        patch.object(worker, "run_cv_job", AsyncMock(side_effect=RuntimeError("boom"))),
        patch.object(worker, "_get_driver", AsyncMock(return_value=AsyncMock())),
        patch("asyncio.sleep", fake_sleep),
        pytest.raises(asyncio.CancelledError),
    ):
        await worker.cv_worker_loop()
    # reaching the idle sleep proves the crash didn't kill the loop


# ── CV completion emails (#394 acceptance coverage, ported from jobs_router) ──


def _make_db_returning_encrypted_email(ciphertext: str | None):
    """Mock AsyncDriver whose session.run().single() yields a Person row
    with the given (encrypted) email column."""
    db = MagicMock()
    session_mock = AsyncMock()
    db.session.return_value.__aenter__.return_value = session_mock
    result_mock = MagicMock()
    if ciphertext is None:
        result_mock.single = AsyncMock(return_value=None)
    else:
        result_mock.single = AsyncMock(return_value={"email": ciphertext})
    session_mock.run = AsyncMock(return_value=result_mock)
    return db


async def test_send_success_email_uses_decrypted_person_email():
    """On job success the email must go to the sign-up address stored on
    :Person.email (decrypted) — acceptance criterion from #394."""
    from app.cv.worker import _send_success_email
    from app.graph.encryption import encrypt_value

    db = _make_db_returning_encrypted_email(encrypt_value("oauth@example.com"))
    with patch(
        "app.email.service.send_cv_ready_email", new_callable=AsyncMock
    ) as mock_send:
        await _send_success_email("google-123", db, "job-abc", 7, 3)

    mock_send.assert_awaited_once()
    kwargs = mock_send.await_args.kwargs
    assert kwargs["to"] == "oauth@example.com"
    assert kwargs["job_id"] == "job-abc"
    assert kwargs["node_count"] == 7
    assert kwargs["edge_count"] == 3


async def test_send_success_email_skips_when_no_email():
    from app.cv.worker import _send_success_email

    db = _make_db_returning_encrypted_email(None)
    with patch(
        "app.email.service.send_cv_ready_email", new_callable=AsyncMock
    ) as mock_send:
        await _send_success_email("google-123", db, "job-abc", 0, 0)
    mock_send.assert_not_awaited()


async def test_send_failure_email_uses_decrypted_person_email():
    from app.cv.worker import _send_failure_email
    from app.graph.encryption import encrypt_value

    db = _make_db_returning_encrypted_email(encrypt_value("oauth@example.com"))
    with patch(
        "app.email.service.send_cv_failed_email", new_callable=AsyncMock
    ) as mock_send:
        await _send_failure_email("google-123", db)

    mock_send.assert_awaited_once()
    assert mock_send.await_args.kwargs["to"] == "oauth@example.com"
