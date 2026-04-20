"""FastAPI router for CV background job status and processing."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from neo4j import AsyncDriver

from app.config import settings
from app.cv import jobs_db
from app.cv.cloud_tasks import verify_oidc_token
from app.dependencies import get_current_user, get_db
from app.graph.encryption import decrypt_properties

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


@router.post("/process-job")
async def process_job(
    request: Request,
    db: AsyncDriver = Depends(get_db),
):
    """Internal endpoint called by Cloud Tasks to run CV extraction pipeline."""
    caller = verify_oidc_token(request.headers.get("Authorization"))
    if caller is None:
        raise HTTPException(status_code=401, detail="Invalid or missing OIDC token")

    body = await request.json()
    job_id: str = body.get("job_id", "")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")

    job = await jobs_db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    # Idempotency: skip if already picked up or completed
    if job["status"] != "queued":
        logger.info("Job %s already in status %s — skipping", job_id, job["status"])
        return {"status": "skipped"}

    user_id: str = job["user_id"]
    document_id: str = job.get("document_id", "")

    await jobs_db.update_job_status(job_id, "running")

    try:
        # Step 1: Load stored PDF
        await jobs_db.update_job_progress(
            job_id, step="reading_pdf", pct=10, detail="Loading document"
        )
        from app.cv_storage.storage import load_document_async

        pdf_bytes = await load_document_async(user_id, document_id)
        if not pdf_bytes:
            raise RuntimeError("Document not found in storage")

        # Step 2: Extract text from PDF
        await jobs_db.update_job_progress(
            job_id,
            step="extracting_text",
            pct=25,
            detail=f"{len(pdf_bytes) // 1024}KB document",
        )
        from app.cv.pdf_extractor import extract_text as pdf_extract

        raw_text = await pdf_extract(pdf_bytes)
        if not raw_text.strip():
            raise RuntimeError("No text could be extracted from the PDF")

        # Step 3: Classify via LLM
        text_chars = len(raw_text)
        await jobs_db.update_job_progress(
            job_id,
            step="classifying",
            pct=40,
            detail=f"Analyzing {text_chars:,} characters",
            text_chars=text_chars,
        )
        from app.cv.ollama_classifier import classify_entries

        async def _progress_cb(detail: str) -> None:
            await jobs_db.update_job_progress(
                job_id,
                step="classifying",
                pct=60,
                detail=detail,
                text_chars=text_chars,
            )

        result = await classify_entries(raw_text, progress_callback=_progress_cb)

        # classify_entries returns a metadata-only result with
        # llm_provider="none" when every provider in the fallback chain
        # fails (timeout, quota, empty response). Previously such jobs
        # were silently stored as "succeeded" with 0 nodes, leaving the
        # user staring at an empty graph with no failure email. Raise so
        # the existing failure path fires.
        if (
            result.metadata is not None
            and result.metadata.llm_provider == "none"
            and not result.nodes
        ):
            raise RuntimeError(
                "All LLM providers in the fallback chain failed "
                "(timeout, quota, or empty response). See upstream logs."
            )

        # Step 4: Store result
        await jobs_db.update_job_progress(
            job_id,
            step="storing_result",
            pct=90,
            detail=f"Found {len(result.nodes)} entries",
        )

        result_payload = {
            "nodes": [
                n.model_dump() if hasattr(n, "model_dump") else n for n in result.nodes
            ],
            "unmatched": result.unmatched,
            "skipped": [
                s.model_dump() if hasattr(s, "model_dump") else s
                for s in (result.skipped or [])
            ],
            "relationships": [
                r.model_dump() if hasattr(r, "model_dump") else r
                for r in (result.relationships or [])
            ],
            "truncated": result.truncated,
            "cv_owner_name": result.cv_owner_name,
            "profile": result.profile,
        }
        if result.metadata:
            result_payload["metadata"] = {
                "llm_provider": result.metadata.llm_provider,
                "llm_model": result.metadata.llm_model,
                "extraction_method": result.metadata.extraction_method,
                "prompt_hash": result.metadata.prompt_hash,
            }

        node_count = len(result.nodes)
        edge_count = len(result.relationships or [])

        await jobs_db.update_job_result(
            job_id,
            status="succeeded",
            result_json=json.dumps(result_payload),
            node_count=node_count,
            edge_count=edge_count,
            llm_provider=result.metadata.llm_provider if result.metadata else None,
            llm_model=result.metadata.llm_model if result.metadata else None,
        )

        # Send success email (best-effort)
        await _send_success_email(user_id, db, job_id, node_count, edge_count)

        logger.info(
            "Job %s succeeded: %d nodes, %d edges", job_id, node_count, edge_count
        )
        return {"status": "ok", "job_id": job_id}

    except Exception as exc:
        logger.error("Job %s failed (%s): %s", job_id, type(exc).__name__, exc)
        logger.debug("Job processing traceback", exc_info=True)
        error_msg = str(exc)
        await jobs_db.update_job_result(
            job_id,
            status="failed",
            error_message=error_msg,
        )
        await _send_failure_email(user_id, db)
        return {"status": "failed", "job_id": job_id}


async def _send_success_email(
    user_id: str,
    db: AsyncDriver,
    job_id: str,
    node_count: int,
    edge_count: int,
) -> None:
    """Fetch encrypted email from Neo4j, decrypt, and send CV ready notification."""
    try:
        async with db.session() as session:
            result = await session.run(
                "MATCH (p:Person {user_id: $user_id}) RETURN p.email AS email",
                user_id=user_id,
            )
            record = await result.single()
        if record is None or not record["email"]:
            logger.warning(
                "No email found for user %s — skipping success email", user_id
            )
            return
        props = decrypt_properties({"email": record["email"]})
        email = props.get("email")
        if not email:
            return
        from app.email.service import send_cv_ready_email

        await send_cv_ready_email(
            to=email,
            job_id=job_id,
            node_count=node_count,
            edge_count=edge_count,
            frontend_url=settings.frontend_url,
        )
    except Exception as exc:
        logger.warning("Failed to send success email for user %s: %s", user_id, exc)


async def _send_failure_email(user_id: str, db: AsyncDriver) -> None:
    """Fetch encrypted email from Neo4j, decrypt, and send CV failure notification."""
    try:
        async with db.session() as session:
            result = await session.run(
                "MATCH (p:Person {user_id: $user_id}) RETURN p.email AS email",
                user_id=user_id,
            )
            record = await result.single()
        if record is None or not record["email"]:
            logger.warning(
                "No email found for user %s — skipping failure email", user_id
            )
            return
        props = decrypt_properties({"email": record["email"]})
        email = props.get("email")
        if not email:
            return
        from app.email.service import send_cv_failed_email

        await send_cv_failed_email(to=email, frontend_url=settings.frontend_url)
    except Exception as exc:
        logger.warning("Failed to send failure email for user %s: %s", user_id, exc)
