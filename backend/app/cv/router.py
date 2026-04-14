from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from neo4j import AsyncDriver

from app.config import settings
from app.cv import counter, progress
from app.cv.models import ConfirmRequest, ExtractedData
from app.cv.ollama_classifier import SYSTEM_PROMPT as EXTRACTION_PROMPT
from app.cv.ollama_classifier import classify_entries
from app.cv.pdf_extractor import extract_text as pdf_extract
from app.cv.progress import CVStep
from app.cv.text_extractor import extract_text as multi_extract
from app.cv_storage import db as cv_db
from app.cv_storage.storage import (
    evict_oldest_if_at_limit,
    load_document_async,
    save_document,
)
from app.dependencies import get_current_user, get_db, require_gdpr_consent
from app.graph.encryption import encrypt_properties, encrypt_value
from app.graph.llm_usage import record_llm_usage
from app.graph.node_schema import sanitize_node_properties
from app.graph.provenance import create_processing_record, ensure_ontology_version
from app.graph.queries import (
    ADD_NODE,
    DELETE_USER_GRAPH,
    LINK_SKILL,
    NODE_TYPE_LABELS,
    NODE_TYPE_MERGE_KEYS,
    NODE_TYPE_RELATIONSHIPS,
    UPDATE_PERSON,
)
from app.http_helpers import safe_content_disposition
from app.rate_limit import limiter
from app.snapshots.service import create_snapshot as create_orb_snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["cv"])


@router.post("/upload", response_model=ExtractedData)
@limiter.limit("3/minute")
async def upload_cv(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_gdpr_consent),
    db: AsyncDriver = Depends(get_db),
):
    """Upload a PDF CV: extract text via Docling, classify via LLM."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Magic-byte check: every real PDF begins with ``%PDF-`` (possibly
    # preceded by a few junk bytes which PyMuPDF tolerates but our text
    # extractor should not). Reject obvious content-type mismatches
    # early, before spinning up the LLM pipeline.
    if not pdf_bytes.lstrip()[:5] == b"%PDF-":
        raise HTTPException(status_code=400, detail="File is not a valid PDF")

    user_id = current_user.get("user_id", "")
    document_id = str(uuid.uuid4())

    # Store the original PDF (encrypted) before processing
    await evict_oldest_if_at_limit(user_id)
    await save_document(
        user_id=user_id,
        document_id=document_id,
        pdf_bytes=pdf_bytes,
        filename=file.filename or "cv-upload.pdf",
        page_count=0,
    )

    counter.increment()
    try:
        # Step 1: Read PDF
        progress.set_progress(user_id, CVStep.READING_PDF)
        logger.info("Starting PDF extraction for user %s", user_id)

        # Step 2: Extract text
        progress.set_progress(
            user_id,
            CVStep.EXTRACTING_TEXT,
            f"{len(pdf_bytes) // 1024}KB document",
        )
        raw_text = await pdf_extract(pdf_bytes)

        if not raw_text.strip():
            progress.set_progress(user_id, CVStep.FAILED, "No text found")
            raise HTTPException(
                status_code=400, detail="Could not extract text from PDF"
            )

        # Step 3: Classify entries via LLM
        progress.set_progress(
            user_id,
            CVStep.CLASSIFYING,
            f"Analyzing {len(raw_text):,} characters",
            text_chars=len(raw_text),
        )
        logger.info(
            "Classifying entries (%d chars), chain=%s",
            len(raw_text),
            settings.llm_fallback_chain,
        )
        result = await classify_entries(
            raw_text,
            progress_callback=lambda detail: progress.set_progress(
                user_id, CVStep.CLASSIFYING, detail, text_chars=len(raw_text)
            ),
        )

        # Step 4: Parse response
        progress.set_progress(
            user_id,
            CVStep.PARSING_RESPONSE,
            f"Found {len(result.nodes)} entries",
        )

        if not result.nodes and not result.unmatched:
            progress.set_progress(user_id, CVStep.FAILED, "No entries extracted")
            raise HTTPException(
                status_code=400,
                detail="No entries could be extracted. Try a different CV.",
            )

        progress.set_progress(user_id, CVStep.DONE)

        from app.cv.models import ExtractedProfile

        extracted_profile = None
        if result.profile:
            extracted_profile = ExtractedProfile(**result.profile)

        return ExtractedData(
            nodes=result.nodes,
            unmatched=result.unmatched,
            skipped_nodes=result.skipped,
            relationships=result.relationships,
            truncated=result.truncated,
            cv_owner_name=result.cv_owner_name,
            profile=extracted_profile,
            document_id=document_id,
            llm_provider=result.metadata.llm_provider if result.metadata else None,
            llm_model=result.metadata.llm_model if result.metadata else None,
            extraction_method=result.metadata.extraction_method
            if result.metadata
            else None,
            prompt_hash=result.metadata.prompt_hash if result.metadata else None,
        )

    except HTTPException:
        raise
    except TimeoutError:
        logger.warning("PDF extraction timeout for user %s", user_id)
        progress.set_progress(user_id, CVStep.FAILED, "Timed out")
        raise HTTPException(
            status_code=504, detail="PDF processing timed out. Please try again."
        ) from None
    except Exception as e:
        # Log the exception type + id at ERROR, stash the full traceback at
        # DEBUG. The raw str(e) is NOT surfaced to the client because LLM
        # and extractor exceptions routinely contain slice of the PDF text,
        # prompt content, or HTTPX response bodies.
        logger.error(
            "CV upload pipeline error for user %s (%s)",
            user_id,
            type(e).__name__,
        )
        logger.debug("CV upload traceback", exc_info=True)
        progress.set_progress(user_id, CVStep.FAILED, "Processing failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to process CV. Please try again.",
        ) from None
    finally:
        counter.decrement()
        # Clean up progress after a delay so the frontend can show "Done"
        import asyncio

        async def _cleanup():
            await asyncio.sleep(5)
            progress.clear_progress(user_id)

        asyncio.create_task(_cleanup())


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Download a specific stored document (decrypted)."""
    user_id = current_user["user_id"]
    docs = await cv_db.list_documents(user_id)
    doc = next((d for d in docs if d["document_id"] == document_id), None)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    pdf_bytes = await load_document_async(user_id, document_id)
    if pdf_bytes is None:
        raise HTTPException(status_code=404, detail="Document file not found")

    filename = doc.get("original_filename", "document.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )


@router.get("/download")
async def download_cv(
    current_user: dict = Depends(get_current_user),
):
    """Download the latest uploaded CV (backward compat)."""
    user_id = current_user["user_id"]
    docs = await cv_db.list_documents(user_id)
    if not docs:
        raise HTTPException(status_code=404, detail="No CV stored")
    return await download_document(docs[0]["document_id"], current_user)


@router.get("/documents")
async def list_documents(
    current_user: dict = Depends(get_current_user),
):
    """List all document metadata for the current user (up to 3)."""
    return await cv_db.list_documents(current_user["user_id"])


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".text"}


@router.post("/import", response_model=ExtractedData)
@limiter.limit("3/minute")
async def import_document(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_gdpr_consent),
    db: AsyncDriver = Depends(get_db),
):
    """Import a supplementary document (PDF, DOCX, TXT) to enrich the orb."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    user_id = current_user.get("user_id", "")
    document_id = str(uuid.uuid4())

    # Store the original document (encrypted) before processing
    await evict_oldest_if_at_limit(user_id)
    await save_document(
        user_id=user_id,
        document_id=document_id,
        pdf_bytes=file_bytes,
        filename=file.filename or "document",
        page_count=0,
    )

    try:
        progress.set_progress(user_id, CVStep.EXTRACTING_TEXT, file.filename)
        raw_text = await multi_extract(file_bytes, file.filename)

        if not raw_text.strip():
            raise HTTPException(
                status_code=400, detail="Could not extract text from file"
            )

        progress.set_progress(
            user_id,
            CVStep.CLASSIFYING,
            f"Analyzing {len(raw_text):,} characters",
            text_chars=len(raw_text),
        )
        result = await classify_entries(
            raw_text,
            progress_callback=lambda detail: progress.set_progress(
                user_id, CVStep.CLASSIFYING, detail, text_chars=len(raw_text)
            ),
        )

        if not result.nodes and not result.unmatched:
            raise HTTPException(
                status_code=400,
                detail="No entries could be extracted from the document.",
            )

        progress.set_progress(user_id, CVStep.DONE)

        from app.cv.models import ExtractedProfile

        extracted_profile = None
        if result.profile:
            extracted_profile = ExtractedProfile(**result.profile)

        return ExtractedData(
            nodes=result.nodes,
            unmatched=result.unmatched,
            skipped_nodes=result.skipped,
            relationships=result.relationships,
            truncated=result.truncated,
            cv_owner_name=result.cv_owner_name,
            profile=extracted_profile,
            document_id=document_id,
            llm_provider=result.metadata.llm_provider if result.metadata else None,
            llm_model=result.metadata.llm_model if result.metadata else None,
            extraction_method=result.metadata.extraction_method
            if result.metadata
            else None,
            prompt_hash=result.metadata.prompt_hash if result.metadata else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Document import error for user %s (%s)",
            user_id,
            type(e).__name__,
        )
        logger.debug("Document import traceback", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Failed to process document. Please try again."
        ) from None


@router.post("/import-confirm")
async def import_confirm(
    data: ConfirmRequest,
    current_user: dict = Depends(require_gdpr_consent),
    db: AsyncDriver = Depends(get_db),
):
    """Merge imported nodes into existing orb (no deletion of existing data)."""
    user_id = current_user["user_id"]

    if data.document_id:
        await evict_oldest_if_at_limit(user_id)

    result, valid_ids = await _persist_nodes(
        data, current_user, db, wipe_existing=False
    )

    # --- Provenance tracking ---
    try:
        from pathlib import Path

        project_root = str(Path(__file__).resolve().parent.parent.parent)
        prompt_content = data.prompt_content or EXTRACTION_PROMPT

        async with db.session() as session:
            ontology_version_id = await ensure_ontology_version(
                session, project_root, prompt_content
            )

            if data.llm_provider:
                await create_processing_record(
                    session=session,
                    user_id=user_id,
                    document_id=data.document_id or "",
                    ontology_version_id=ontology_version_id,
                    llm_provider=data.llm_provider,
                    llm_model=data.llm_model or "",
                    extraction_method=data.extraction_method or "primary",
                    prompt_hash=data.prompt_hash or "",
                    nodes_extracted=len(valid_ids),
                    edges_extracted=len(data.relationships),
                    node_uids=valid_ids,
                )
    except Exception as e:
        logger.warning("Failed to create provenance record: %s", e)

    if data.llm_provider:
        await record_llm_usage(
            db=db,
            user_id=user_id,
            endpoint="cv_upload",
            llm_provider=data.llm_provider,
            llm_model=data.llm_model or "",
            cost_usd=data.cost_usd,
            duration_ms=data.duration_ms,
            input_tokens=data.input_tokens,
            output_tokens=data.output_tokens,
        )

    if data.document_id:
        try:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc).isoformat()
            await cv_db.insert_document(
                document_id=data.document_id,
                user_id=user_id,
                filename=data.original_filename or "document-import",
                size=data.file_size_bytes or 0,
                page_count=data.page_count or 0,
                entities_count=len(data.nodes),
                edges_count=len(data.relationships),
                now=now,
            )
        except Exception:
            logger.debug(
                "Document %s already recorded, skipping insert", data.document_id
            )

    return result


@router.get("/processing-count")
async def get_processing_count():
    """Return the number of PDFs currently being processed."""
    return {"count": counter.get_count()}


@router.get("/progress")
async def get_cv_progress(
    current_user: dict = Depends(get_current_user),
):
    """Return granular progress for the current user's CV processing."""
    user_id = current_user["user_id"]
    p = progress.get_progress(user_id)
    if p is None:
        return {
            "active": False,
            "step": None,
            "percent": 0,
            "message": None,
            "detail": None,
            "elapsed_seconds": 0,
        }
    import time

    return {
        "active": p.step not in ("done", "failed"),
        "step": p.step,
        "percent": p.percent,
        "message": p.message,
        "detail": p.detail,
        "elapsed_seconds": round(time.time() - p.started_at),
    }


@router.post("/progress/discard")
async def discard_cv_progress(
    current_user: dict = Depends(get_current_user),
):
    """Discard any tracked CV progress for the current user."""
    progress.clear_progress(current_user["user_id"])
    return {"status": "discarded"}


async def _persist_nodes(data, current_user, db, *, wipe_existing: bool):  # noqa: C901
    """Shared logic for confirm_cv and import_confirm.

    All writes run inside a single Neo4j transaction so a mid-import
    failure rolls back atomically instead of leaving orphaned nodes.
    """
    created: list[str | None] = []
    async with db.session() as session:
        tx = await session.begin_transaction()
        try:
            await _persist_nodes_inner(
                tx, data, current_user, created, wipe_existing=wipe_existing
            )
            await tx.commit()
        except Exception:
            await tx.rollback()
            raise

    valid_ids = [uid for uid in created if uid is not None]
    return {"created": len(valid_ids), "node_ids": valid_ids}, valid_ids


async def _persist_nodes_inner(  # noqa: C901
    tx, data, current_user, created, *, wipe_existing
):
    """Inner logic running inside a Neo4j transaction."""
    if wipe_existing:
        await tx.run(DELETE_USER_GRAPH, user_id=current_user["user_id"])

    person_updates = _build_person_updates(data)
    if person_updates:
        await tx.run(
            UPDATE_PERSON,
            user_id=current_user["user_id"],
            properties=person_updates,
        )

    for node in data.nodes:
        if node.node_type not in NODE_TYPE_LABELS:
            created.append(None)
            continue
        label = NODE_TYPE_LABELS[node.node_type]
        rel_type = NODE_TYPE_RELATIONSHIPS[node.node_type]
        uid = str(uuid.uuid4())
        safe_props = sanitize_node_properties(node.node_type, node.properties)
        properties = encrypt_properties(safe_props)

        merge_keys = NODE_TYPE_MERGE_KEYS.get(node.node_type)
        if merge_keys:
            merge_key_values = {k: properties.get(k, "") for k in merge_keys}
            has_all = all(merge_key_values.values())
            if has_all:
                merge_match = ", ".join(f"{k}: $merge_{k}" for k in merge_keys)
                query = (
                    f"MATCH (p:Person {{user_id: $user_id}}) "
                    f"MERGE (p)-[:{rel_type}]->(n:{label} {{{merge_match}}}) "
                    f"ON CREATE SET n += $properties, n.uid = $uid "
                    f"ON MATCH SET n += $properties "
                    f"RETURN n"
                )
                params = {
                    "user_id": current_user["user_id"],
                    "properties": properties,
                    "uid": uid,
                }
                for k, v in merge_key_values.items():
                    params[f"merge_{k}"] = v
                result = await tx.run(query, **params)
            else:
                query = ADD_NODE.replace("{label}", label).replace(
                    "{rel_type}", rel_type
                )
                result = await tx.run(
                    query,
                    user_id=current_user["user_id"],
                    properties=properties,
                    uid=uid,
                )
        else:
            query = ADD_NODE.replace("{label}", label).replace("{rel_type}", rel_type)
            result = await tx.run(
                query,
                user_id=current_user["user_id"],
                properties=properties,
                uid=uid,
            )

        record = await result.single()
        if record:
            actual_uid = dict(record["n"]).get("uid", uid)
            created.append(actual_uid)
        else:
            created.append(None)

    for rel in data.relationships:
        if rel.type != "USED_SKILL":
            continue
        if 0 <= rel.from_index < len(created) and 0 <= rel.to_index < len(created):
            from_uid = created[rel.from_index]
            to_uid = created[rel.to_index]
            if from_uid and to_uid:
                try:
                    await tx.run(LINK_SKILL, node_uid=from_uid, skill_uid=to_uid)
                except Exception as e:
                    logger.warning("Failed to link %s -> %s: %s", from_uid, to_uid, e)


def _build_person_updates(data: ConfirmRequest) -> dict:
    """Build Person node property updates from CV extraction results."""
    updates: dict[str, str] = {}
    if data.cv_owner_name:
        updates["cv_display_name"] = data.cv_owner_name
    if data.profile:
        profile_dict = data.profile.model_dump(exclude_none=True)
        for pii_field in ("email", "phone"):
            if pii_field in profile_dict:
                profile_dict[pii_field] = encrypt_value(profile_dict[pii_field])
        updates.update(profile_dict)
    return updates


@router.post("/confirm")
async def confirm_cv(
    data: ConfirmRequest,
    current_user: dict = Depends(require_gdpr_consent),
    db: AsyncDriver = Depends(get_db),
):
    """Persist confirmed CV nodes to Neo4j with dedup and cross-entity linking."""
    user_id = current_user["user_id"]

    # Auto-snapshot before destructive CV import
    try:
        await create_orb_snapshot(
            user_id=user_id,
            db=db,
            trigger="cv_import",
            label="Before CV import",
        )
    except Exception as e:
        logger.warning("Failed to create pre-import snapshot: %s", e)

    if data.document_id:
        await evict_oldest_if_at_limit(user_id)

    result, valid_ids = await _persist_nodes(data, current_user, db, wipe_existing=True)

    # --- Provenance tracking ---
    try:
        from pathlib import Path

        project_root = str(Path(__file__).resolve().parent.parent.parent)
        prompt_content = data.prompt_content or EXTRACTION_PROMPT

        async with db.session() as session:
            ontology_version_id = await ensure_ontology_version(
                session, project_root, prompt_content
            )

            if data.llm_provider:
                await create_processing_record(
                    session=session,
                    user_id=user_id,
                    document_id=data.document_id or "",
                    ontology_version_id=ontology_version_id,
                    llm_provider=data.llm_provider,
                    llm_model=data.llm_model or "",
                    extraction_method=data.extraction_method or "primary",
                    prompt_hash=data.prompt_hash or "",
                    nodes_extracted=len(valid_ids),
                    edges_extracted=len(data.relationships),
                    node_uids=valid_ids,
                )
    except Exception as e:
        logger.warning("Failed to create provenance record: %s", e)

    if data.llm_provider:
        await record_llm_usage(
            db=db,
            user_id=user_id,
            endpoint="cv_upload",
            llm_provider=data.llm_provider,
            llm_model=data.llm_model or "",
            cost_usd=data.cost_usd,
            duration_ms=data.duration_ms,
            input_tokens=data.input_tokens,
            output_tokens=data.output_tokens,
        )

    if data.document_id:
        try:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc).isoformat()
            await cv_db.insert_document(
                document_id=data.document_id,
                user_id=user_id,
                filename=data.original_filename or "cv-upload",
                size=data.file_size_bytes or 0,
                page_count=data.page_count or 0,
                entities_count=len(data.nodes),
                edges_count=len(data.relationships),
                now=now,
            )
        except Exception:
            logger.debug(
                "Document %s already recorded, skipping insert", data.document_id
            )

    return result
