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
from app.cv_storage.db import get_metadata as get_cv_metadata
from app.cv_storage.storage import load_cv
from app.cv_storage.storage import save_cv as store_cv_file
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

    # Best-effort: store the original PDF encrypted for future recovery
    try:
        import fitz

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pc = len(doc)
        doc.close()
        store_cv_file(user_id, pdf_bytes, file.filename or "upload.pdf", pc)
    except Exception as e:
        logger.warning("Failed to store CV file: %s", e)

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


@router.get("/download")
async def download_cv(
    current_user: dict = Depends(get_current_user),
):
    """Download the latest uploaded CV (decrypted)."""
    user_id = current_user["user_id"]
    meta = get_cv_metadata(user_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="No CV stored")

    pdf_bytes = load_cv(user_id)
    if pdf_bytes is None:
        raise HTTPException(status_code=404, detail="CV file not found")

    filename = meta.get("original_filename", "cv.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    created: list[str | None] = []

    async with db.session() as session:
        # Wipe existing graph nodes (keep Person) so CV import replaces, not merges
        await session.run(DELETE_USER_GRAPH, user_id=current_user["user_id"])

        # Store CV owner name and extracted profile on the Person node
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

            # Try MERGE with key properties for dedup, fall back to CREATE
            merge_keys = NODE_TYPE_MERGE_KEYS.get(node.node_type, [])
            merge_key_values = {
                k: properties.get(k) for k in merge_keys if properties.get(k)
            }

            if merge_key_values and len(merge_key_values) == len(merge_keys):
                key_clause = ", ".join(f"{k}: $merge_{k}" for k in merge_key_values)
                query = (
                    f"MATCH (p:Person {{user_id: $user_id}}) "
                    f"MERGE (p)-[:{rel_type}]->(n:{label} {{{key_clause}}}) "
                    f"ON CREATE SET n += $properties, n.uid = $uid "
                    f"ON MATCH SET n += $properties "
                    f"RETURN n"
                )
                params: dict = {
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

            record = await result.single()
            if record:
                actual_uid = dict(record["n"]).get("uid", uid)
                created.append(actual_uid)
            else:
                created.append(None)

        # Create cross-entity links (USED_SKILL)
        for rel in data.relationships:
            if rel.type != "USED_SKILL":
                continue
            if 0 <= rel.from_index < len(created) and 0 <= rel.to_index < len(created):
                from_uid = created[rel.from_index]
                to_uid = created[rel.to_index]
                if from_uid and to_uid:
                    try:
                        await session.run(
                            LINK_SKILL,
                            node_uid=from_uid,
                            skill_uid=to_uid,
                        )
                    except Exception as e:
                        logger.warning(
                            "Failed to create USED_SKILL link %s -> %s: %s",
                            from_uid,
                            to_uid,
                            e,
                        )

    valid_ids = [uid for uid in created if uid is not None]
    return {"created": len(valid_ids), "node_ids": valid_ids}
