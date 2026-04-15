"""CV processing progress — reads job state from the cv_jobs table."""

from __future__ import annotations

import time

from app.cv import jobs_db

# Step-specific human-readable messages
STEP_MESSAGE: dict[str, str] = {
    "reading_pdf": "Reading your PDF...",
    "extracting_text": "Extracting text...",
    "classifying": "Classifying entries...",
    "storing_result": "Building your knowledge graph...",
    "done": "Done!",
    "failed": "Processing failed.",
}


async def get_progress_for_user(user_id: str) -> dict | None:
    """Return progress info for the user's active CV job, or ``None``.

    The returned dict contains:
    - ``active``: True if the job is queued or running
    - ``job_id``, ``status``, ``step``, ``percent``, ``message``,
      ``detail``, ``node_count``, ``edge_count``, ``elapsed_seconds``
    """
    job = await jobs_db.get_active_job_for_user(user_id)
    if job is None:
        return None

    status: str = job["status"]
    step: str | None = job.get("step")
    pct: int = job.get("progress_pct") or 0
    detail: str = job.get("progress_detail") or ""
    text_chars: int = job.get("text_chars") or 0

    created_at = job.get("created_at")
    elapsed = int(time.time() - created_at.timestamp()) if created_at is not None else 0

    # Simulated ease-out progress during the classification step
    if step == "classifying" and status == "running":
        started_at = job.get("started_at")
        if started_at is not None:
            elapsed_since_start = time.time() - started_at.timestamp()
        else:
            elapsed_since_start = float(elapsed)

        chars = max(text_chars, 2000)
        estimated_duration = min(15 + chars * 0.007, 180)
        fraction = min(elapsed_since_start / estimated_duration, 1.0)
        eased = 1 - (1 - fraction) ** 2  # quadratic ease-out
        pct = 35 + int(53 * eased)

        # Rotate substep labels proportionally to progress
        substeps = [
            "Identifying work experiences...",
            "Extracting education entries...",
            "Recognizing skills and technologies...",
            "Parsing publications and projects...",
            "Detecting certifications and awards...",
            "Mapping skill relationships...",
            "Validating extracted entries...",
        ]
        substep_idx = min(int(fraction * len(substeps)), len(substeps) - 1)
        detail = substeps[substep_idx]

    message = STEP_MESSAGE.get(step or "", "")
    if status == "queued" and not step:
        message = "Queued for processing..."
    elif status == "succeeded":
        message = "Done!"
        pct = 100

    return {
        "active": status in ("queued", "running"),
        "job_id": job["job_id"],
        "status": status,
        "step": step,
        "percent": pct,
        "message": message,
        "detail": detail,
        "node_count": job.get("node_count"),
        "edge_count": job.get("edge_count"),
        "elapsed_seconds": elapsed,
    }
