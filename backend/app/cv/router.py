from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from neo4j import AsyncDriver

from app.cv import counter
from app.cv.docling_extractor import extract_text as docling_extract
from app.cv.models import ConfirmRequest, ExtractedData
from app.cv.ollama_classifier import classify_entries
from app.dependencies import get_current_user, get_db
from app.graph.encryption import encrypt_properties
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

    counter.increment()
    try:
        # Step 1: Extract text via Docling (local, free)
        logger.info("Starting PDF extraction for user %s", current_user.get("user_id"))
        raw_text = await docling_extract(pdf_bytes)

        if not raw_text.strip():
            raise HTTPException(
                status_code=400, detail="Could not extract text from PDF"
            )

        # Step 2: Classify entries via LLM
        logger.info("Classifying entries with Ollama (%d chars)", len(raw_text))
        result = await classify_entries(raw_text)

        if not result.nodes and not result.unmatched:
            raise HTTPException(
                status_code=400,
                detail="No entries could be extracted. Try a different CV.",
            )

        return ExtractedData(
            nodes=result.nodes,
            unmatched=result.unmatched,
            skipped_nodes=result.skipped,
            relationships=result.relationships,
            truncated=result.truncated,
            cv_owner_name=result.cv_owner_name,
        )

    except HTTPException:
        raise
    except TimeoutError as e:
        logger.error("PDF extraction timeout: %s", e)
        raise HTTPException(
            status_code=504, detail="PDF processing timed out. Please try again."
        ) from None
    except Exception as e:
        logger.error("CV upload pipeline error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process CV: {str(e)}",
        ) from None
    finally:
        counter.decrement()


@router.get("/processing-count")
async def get_processing_count():
    """Return the number of PDFs currently being processed."""
    return {"count": counter.get_count()}


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

        # Update Person node name from CV owner if provided
        if data.cv_owner_name:
            await session.run(
                UPDATE_PERSON,
                user_id=current_user["user_id"],
                properties={"name": data.cv_owner_name},
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
