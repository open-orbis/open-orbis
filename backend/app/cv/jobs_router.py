"""FastAPI router for CV background job status.

The processing pipeline itself lives in ``app.cv.worker`` (in-process worker
loop started from the app lifespan); this router only exposes job status to
the owner.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.cv import jobs_db
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["cv"])


@router.get("/job/{job_id}")
async def get_job_status(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return job status and result for the authenticated owner only."""
    job = await jobs_db.get_job(job_id)
    if job is None or job["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Job not found")

    response: dict = {
        "job_id": job["job_id"],
        "status": job["status"],
        "step": job.get("step"),
        "progress_pct": job.get("progress_pct"),
        "progress_detail": job.get("progress_detail"),
        "filename": job.get("filename"),
        "node_count": job.get("node_count"),
        "edge_count": job.get("edge_count"),
        "llm_provider": job.get("llm_provider"),
        "llm_model": job.get("llm_model"),
        "created_at": job.get("created_at").isoformat()
        if job.get("created_at")
        else None,
        "completed_at": job.get("completed_at").isoformat()
        if job.get("completed_at")
        else None,
    }

    if job["status"] == "succeeded" and job.get("result_json"):
        try:
            response["result"] = json.loads(job["result_json"])
        except (json.JSONDecodeError, TypeError):
            logger.warning("Failed to parse result_json for job %s", job_id)

    if job["status"] == "failed":
        response["error_message"] = job.get("error_message")

    return response
