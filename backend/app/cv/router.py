from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from neo4j import AsyncDriver

from app.config import settings
from app.cv import counter, progress
from app.cv.docling_extractor import extract_text as pdf_extract
from app.cv.models import ConfirmRequest, ExtractedData
from app.cv.ollama_classifier import classify_entries
from app.cv.progress import CVStep
from app.cv.text_extractor import extract_text as multi_extract
from app.cv_storage import db as cv_db
from app.cv_storage.storage import (
    evict_oldest_if_at_limit,
    load_document,
)
from app.dependencies import get_current_user, get_db
from app.graph.encryption import encrypt_properties, encrypt_value
from app.graph.queries import (
    ADD_NODE,
    DELETE_USER_GRAPH,
    LINK_SKILL,
    NODE_TYPE_LABELS,
    NODE_TYPE_MERGE_KEYS,
    NODE_TYPE_RELATIONSHIPS,
    UPDATE_PERSON,
)
from app.snapshots.service import create_snapshot as create_orb_snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["cv"])


async def _require_consent(current_user: dict, db: AsyncDriver) -> None:
    """Raise 403 if user hasn't given GDPR consent."""
    async with db.session() as session:
        result = await session.run(
            "MATCH (p:Person {user_id: $user_id}) RETURN p.gdpr_consent AS consent",
            user_id=current_user["user_id"],
        )
        record = await result.single()
        if not record or not record["consent"]:
            raise HTTPException(status_code=403, detail="GDPR consent required")


@router.post("/upload", response_model=ExtractedData)
async def upload_cv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Upload a PDF CV: extract text via Docling, classify via LLM."""
    await _require_consent(current_user, db)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    user_id = current_user.get("user_id", "")
    document_id = str(uuid.uuid4())

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
        )
        logger.info(
            "Classifying entries with %s (%d chars)",
            settings.llm_provider,
            len(raw_text),
        )
        result = await classify_entries(raw_text)

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
        )

    except HTTPException:
        raise
    except TimeoutError as e:
        logger.error("PDF extraction timeout: %s", e)
        progress.set_progress(user_id, CVStep.FAILED, "Timed out")
        raise HTTPException(
            status_code=504, detail="PDF processing timed out. Please try again."
        ) from None
    except Exception as e:
        logger.error("CV upload pipeline error: %s", e, exc_info=True)
        progress.set_progress(user_id, CVStep.FAILED, str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process CV: {str(e)}",
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
    docs = cv_db.list_documents(user_id)
    doc = next((d for d in docs if d["document_id"] == document_id), None)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    pdf_bytes = load_document(user_id, document_id)
    if pdf_bytes is None:
        raise HTTPException(status_code=404, detail="Document file not found")

    filename = doc.get("original_filename", "document.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/download")
async def download_cv(
    current_user: dict = Depends(get_current_user),
):
    """Download the latest uploaded CV (backward compat)."""
    user_id = current_user["user_id"]
    docs = cv_db.list_documents(user_id)
    if not docs:
        raise HTTPException(status_code=404, detail="No CV stored")
    return await download_document(docs[0]["document_id"], current_user)


@router.get("/documents")
async def list_documents(
    current_user: dict = Depends(get_current_user),
):
    """List all document metadata for the current user (up to 3)."""
    return cv_db.list_documents(current_user["user_id"])


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".text"}


@router.post("/import", response_model=ExtractedData)
async def import_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Import a supplementary document (PDF, DOCX, TXT) to enrich the orb."""
    await _require_consent(current_user, db)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    from pathlib import Path as P

    ext = P(file.filename).suffix.lower()
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
        )
        result = await classify_entries(raw_text)

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
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Document import error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to process document: {e!s}"
        ) from None


@router.post("/import-confirm")
async def import_confirm(
    data: ConfirmRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Merge imported nodes into existing orb (no deletion of existing data)."""
    await _require_consent(current_user, db)
    user_id = current_user["user_id"]

    if data.document_id:
        evict_oldest_if_at_limit(user_id)

    result = await _persist_nodes(data, current_user, db, wipe_existing=False)

    if data.document_id:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        cv_db.insert_document(
            document_id=data.document_id,
            user_id=user_id,
            filename=data.original_filename or "document-import",
            size=data.file_size_bytes or 0,
            page_count=data.page_count or 0,
            entities_count=len(data.nodes),
            edges_count=len(data.relationships),
            now=now,
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


async def _persist_nodes(data, current_user, db, *, wipe_existing: bool):  # noqa: C901
    """Shared logic for confirm_cv and import_confirm."""
    created: list[str | None] = []
    async with db.session() as session:
        if wipe_existing:
            await session.run(DELETE_USER_GRAPH, user_id=current_user["user_id"])

        person_updates = _build_person_updates(data)
        if person_updates:
            await session.run(
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
            properties = encrypt_properties(node.properties)

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
                    result = await session.run(query, **params)
                else:
                    query = ADD_NODE.replace("{label}", label).replace(
                        "{rel_type}", rel_type
                    )
                    result = await session.run(
                        query,
                        user_id=current_user["user_id"],
                        properties=properties,
                        uid=uid,
                    )
            else:
                query = ADD_NODE.replace("{label}", label).replace(
                    "{rel_type}", rel_type
                )
                result = await session.run(
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
                        await session.run(
                            LINK_SKILL, node_uid=from_uid, skill_uid=to_uid
                        )
                    except Exception as e:
                        logger.warning(
                            "Failed to link %s -> %s: %s", from_uid, to_uid, e
                        )

    valid_ids = [uid for uid in created if uid is not None]
    return {"created": len(valid_ids), "node_ids": valid_ids}


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
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Persist confirmed CV nodes to Neo4j with dedup and cross-entity linking."""
    await _require_consent(current_user, db)
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
        evict_oldest_if_at_limit(user_id)

    result = await _persist_nodes(data, current_user, db, wipe_existing=True)

    if data.document_id:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        cv_db.insert_document(
            document_id=data.document_id,
            user_id=user_id,
            filename=data.original_filename or "cv-upload",
            size=data.file_size_bytes or 0,
            page_count=data.page_count or 0,
            entities_count=len(data.nodes),
            edges_count=len(data.relationships),
            now=now,
        )

    return result
