"""In-process CV job worker — replaces the Google Cloud Tasks dispatch loop.

The upload endpoint only INSERTs a cv_jobs row with status='queued'; this
worker (started from the FastAPI lifespan) polls Postgres, claims jobs with
FOR UPDATE SKIP LOCKED, and runs the extraction pipeline in-process. Job
state stays in Postgres, so retry-after-restart is handled by
``jobs_db.requeue_orphaned_running_jobs`` at boot, and admin cancellation is
a status flag checked cooperatively at pipeline checkpoints.
"""

from __future__ import annotations

import asyncio
import json
import logging

from neo4j import AsyncDriver

from app.config import settings
from app.cv import jobs_db
from app.graph.encryption import decrypt_properties

logger = logging.getLogger(__name__)

POLL_SECONDS = 3


class JobCancelled(Exception):
    """Raised at a checkpoint when an admin cancelled the job mid-run."""


async def _get_driver() -> AsyncDriver:
    """Indirection over the Neo4j driver factory (patchable in tests)."""
    from app.graph.neo4j_client import get_driver

    return await get_driver()


async def _raise_if_cancelled(job_id: str) -> None:
    job = await jobs_db.get_job(job_id)
    if job is not None and job["status"] == "cancelled":
        raise JobCancelled(job_id)


async def cv_worker_loop() -> None:
    """Poll for queued jobs forever. Started once from the app lifespan."""
    driver = await _get_driver()
    logger.info("CV worker loop started (poll every %ss)", POLL_SECONDS)
    while True:
        job_id = await jobs_db.claim_next_queued_job()
        if job_id is None:
            await asyncio.sleep(POLL_SECONDS)
            continue
        try:
            await run_cv_job(job_id, driver=driver)
        except Exception:
            # run_cv_job handles pipeline errors itself; this guards the
            # loop against unexpected crashes (DB down, etc.).
            logger.exception("CV job %s crashed outside the pipeline", job_id)


async def run_cv_job(job_id: str, *, driver: AsyncDriver) -> None:
    """Run the CV extraction pipeline for an already-claimed job.

    The caller (worker loop) has set status='running' via the claim query.
    """
    job = await jobs_db.get_job(job_id)
    if job is None:
        logger.warning("Claimed job %s disappeared — skipping", job_id)
        return

    user_id: str = job["user_id"]
    document_id: str = job.get("document_id", "")

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

        # Cancellation checkpoint before the expensive LLM step.
        await _raise_if_cancelled(job_id)

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
            await _raise_if_cancelled(job_id)
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
        # fails (timeout, quota, empty response). Raise so the failure
        # path fires instead of storing an empty "succeeded" graph.
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

        await _send_success_email(user_id, driver, job_id, node_count, edge_count)

        logger.info(
            "Job %s succeeded: %d nodes, %d edges", job_id, node_count, edge_count
        )

    except JobCancelled:
        # Admin set status='cancelled' (and sent the email) — leave it be.
        logger.info("Job %s cancelled mid-run — aborting", job_id)

    except Exception as exc:
        logger.error("Job %s failed (%s): %s", job_id, type(exc).__name__, exc)
        logger.debug("Job processing traceback", exc_info=True)
        await jobs_db.update_job_result(
            job_id,
            status="failed",
            error_message=str(exc),
        )
        await _send_failure_email(user_id, driver)


async def _fetch_user_email(user_id: str, driver: AsyncDriver) -> str | None:
    """Fetch and decrypt the Person email for a user, or None."""
    async with driver.session() as session:
        result = await session.run(
            "MATCH (p:Person {user_id: $user_id}) RETURN p.email AS email",
            user_id=user_id,
        )
        record = await result.single()
    if record is None or not record["email"]:
        return None
    props = decrypt_properties({"email": record["email"]})
    return props.get("email") or None


async def _send_success_email(
    user_id: str,
    driver: AsyncDriver,
    job_id: str,
    node_count: int,
    edge_count: int,
) -> None:
    """Send the CV-ready notification (best-effort)."""
    try:
        email = await _fetch_user_email(user_id, driver)
        if not email:
            logger.warning(
                "No email found for user %s — skipping success email", user_id
            )
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


async def _send_failure_email(user_id: str, driver: AsyncDriver) -> None:
    """Send the CV-failed notification (best-effort)."""
    try:
        email = await _fetch_user_email(user_id, driver)
        if not email:
            logger.warning(
                "No email found for user %s — skipping failure email", user_id
            )
            return
        from app.email.service import send_cv_failed_email

        await send_cv_failed_email(to=email, frontend_url=settings.frontend_url)
    except Exception as exc:
        logger.warning("Failed to send failure email for user %s: %s", user_id, exc)
