"""PostgreSQL CRUD module for cv_jobs — background CV processing job state."""

from __future__ import annotations

from app.db.postgres import get_pool

JOB_RETENTION_DAYS = 7

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cv_jobs (
    job_id          TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    document_id     TEXT,
    cloud_task_name TEXT,
    status          TEXT NOT NULL DEFAULT 'queued',
    step            TEXT,
    progress_pct    INT DEFAULT 0,
    progress_detail TEXT,
    llm_provider    TEXT,
    llm_model       TEXT,
    text_chars      INT,
    filename        TEXT,
    node_count      INT,
    edge_count      INT,
    result_json     TEXT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    cancelled_by    TEXT
);
CREATE INDEX IF NOT EXISTS cv_jobs_user_id_idx    ON cv_jobs (user_id);
CREATE INDEX IF NOT EXISTS cv_jobs_status_idx     ON cv_jobs (status);
CREATE INDEX IF NOT EXISTS cv_jobs_expires_at_idx ON cv_jobs (expires_at);
"""


async def ensure_table() -> None:
    """Create the cv_jobs table and indexes if they do not already exist."""
    pool = await get_pool()
    await pool.execute(CREATE_TABLE_SQL)


async def create_job(
    *,
    job_id: str,
    user_id: str,
    document_id: str | None = None,
    filename: str | None = None,
) -> dict:
    """Insert a new job with status=queued and return the full row."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO cv_jobs (
            job_id, user_id, document_id, filename,
            status, created_at, expires_at
        )
        VALUES (
            $1, $2, $3, $4,
            'queued',
            NOW(),
            NOW() + INTERVAL '$5 days'
        )
        RETURNING *
        """,
        job_id,
        user_id,
        document_id,
        filename,
        JOB_RETENTION_DAYS,
    )
    return dict(row)


async def get_job(job_id: str) -> dict | None:
    """Fetch a single job by job_id, or None if not found."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM cv_jobs WHERE job_id = $1",
        job_id,
    )
    return dict(row) if row else None


async def get_active_job_for_user(user_id: str) -> dict | None:
    """Return the latest non-expired queued/running/succeeded job for a user."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT * FROM cv_jobs
        WHERE user_id = $1
          AND status IN ('queued', 'running', 'succeeded')
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
        LIMIT 1
        """,
        user_id,
    )
    return dict(row) if row else None


async def update_job_status(
    job_id: str,
    status: str,
    *,
    error_message: str | None = None,
    cancelled_by: str | None = None,
) -> None:
    """Update job status; set started_at or completed_at depending on the new status."""
    pool = await get_pool()
    if status == "running":
        await pool.execute(
            """
            UPDATE cv_jobs
            SET status = $1, started_at = NOW(),
                error_message = COALESCE($2, error_message),
                cancelled_by  = COALESCE($3, cancelled_by)
            WHERE job_id = $4
            """,
            status,
            error_message,
            cancelled_by,
            job_id,
        )
    elif status in ("succeeded", "failed", "cancelled"):
        await pool.execute(
            """
            UPDATE cv_jobs
            SET status = $1, completed_at = NOW(),
                error_message = COALESCE($2, error_message),
                cancelled_by  = COALESCE($3, cancelled_by)
            WHERE job_id = $4
            """,
            status,
            error_message,
            cancelled_by,
            job_id,
        )
    else:
        await pool.execute(
            """
            UPDATE cv_jobs
            SET status = $1,
                error_message = COALESCE($2, error_message),
                cancelled_by  = COALESCE($3, cancelled_by)
            WHERE job_id = $4
            """,
            status,
            error_message,
            cancelled_by,
            job_id,
        )


async def update_job_progress(
    job_id: str,
    *,
    step: str,
    pct: int,
    detail: str = "",
    text_chars: int | None = None,
) -> None:
    """Update in-progress step, percentage, and optional detail fields."""
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE cv_jobs
        SET step = $1, progress_pct = $2, progress_detail = $3,
            text_chars = COALESCE($4, text_chars)
        WHERE job_id = $5
        """,
        step,
        pct,
        detail,
        text_chars,
        job_id,
    )


async def update_job_result(
    job_id: str,
    *,
    status: str,
    result_json: str | None = None,
    node_count: int | None = None,
    edge_count: int | None = None,
    llm_provider: str | None = None,
    llm_model: str | None = None,
    error_message: str | None = None,
) -> None:
    """Persist the final result of a job, including completion timestamp."""
    pool = await get_pool()
    progress_pct = 100 if status == "succeeded" else None
    await pool.execute(
        """
        UPDATE cv_jobs
        SET status       = $1,
            completed_at = NOW(),
            result_json  = COALESCE($2, result_json),
            node_count   = COALESCE($3, node_count),
            edge_count   = COALESCE($4, edge_count),
            llm_provider = COALESCE($5, llm_provider),
            llm_model    = COALESCE($6, llm_model),
            error_message = COALESCE($7, error_message),
            progress_pct = COALESCE($8, progress_pct)
        WHERE job_id = $9
        """,
        status,
        result_json,
        node_count,
        edge_count,
        llm_provider,
        llm_model,
        error_message,
        progress_pct,
        job_id,
    )


async def set_cloud_task_name(job_id: str, task_name: str) -> None:
    """Record the Cloud Tasks task name against the job."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE cv_jobs SET cloud_task_name = $1 WHERE job_id = $2",
        task_name,
        job_id,
    )


async def list_jobs_admin(
    *,
    offset: int = 0,
    limit: int = 20,
    status: str | None = None,
) -> tuple[list[dict], int]:
    """Paginated admin listing of all jobs, with optional status filter.

    Returns (jobs, total_count).
    """
    pool = await get_pool()
    if status is not None:
        rows = await pool.fetch(
            "SELECT * FROM cv_jobs WHERE status = $1 ORDER BY created_at DESC "
            "LIMIT $2 OFFSET $3",
            status,
            limit,
            offset,
        )
        total = await pool.fetchval(
            "SELECT COUNT(*) FROM cv_jobs WHERE status = $1",
            status,
        )
    else:
        rows = await pool.fetch(
            "SELECT * FROM cv_jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            limit,
            offset,
        )
        total = await pool.fetchval("SELECT COUNT(*) FROM cv_jobs")

    return [dict(r) for r in rows], total


async def cleanup_expired_jobs() -> int:
    """Delete succeeded/failed jobs whose retention window has elapsed.

    Returns the number of rows deleted.
    """
    pool = await get_pool()
    result = await pool.execute(
        """
        DELETE FROM cv_jobs
        WHERE expires_at < NOW()
          AND status IN ('succeeded', 'failed')
        """,
    )
    # result is like "DELETE 3"
    return int(result.split()[-1])
