from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from neo4j import AsyncDriver

from app.cv import counter
from app.cv.llmwhisperer import extract_text as whisperer_extract
from app.cv.models import ConfirmRequest, ExtractedData, ExtractedNode
from app.cv.ollama_classifier import classify_entries
from app.dependencies import get_current_user, get_db
from app.graph.encryption import encrypt_properties
from app.graph.queries import ADD_NODE, NODE_TYPE_LABELS, NODE_TYPE_RELATIONSHIPS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["cv"])


@router.post("/upload", response_model=ExtractedData)
async def upload_cv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a PDF CV: extract text via LLM Whisperer, classify via Ollama."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    counter.increment()
    try:
        # Step 1: Extract text via LLM Whisperer
        logger.info("Starting PDF extraction for user %s", current_user.get("user_id"))
        raw_text = await whisperer_extract(pdf_bytes)

        if not raw_text.strip():
            raise HTTPException(
                status_code=400, detail="Could not extract text from PDF"
            )

        # Step 2: Classify entries via local Ollama LLM
        logger.info("Classifying entries with Ollama (%d chars)", len(raw_text))
        nodes, unmatched = await classify_entries(raw_text)

        if not nodes and not unmatched:
            raise HTTPException(
                status_code=400,
                detail="No entries could be extracted. Try a different CV.",
            )

        return ExtractedData(nodes=nodes, unmatched=unmatched)

    except HTTPException:
        raise
    except TimeoutError as e:
        logger.error("LLM Whisperer timeout: %s", e)
        raise HTTPException(
            status_code=504, detail="PDF processing timed out. Please try again."
        )
    except Exception as e:
        logger.error("CV upload pipeline error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process CV: {str(e)}",
        )
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
    """Persist confirmed CV nodes to Neo4j."""
    created = []

    async with db.session() as session:
        for node in data.nodes:
            if node.node_type not in NODE_TYPE_LABELS:
                continue

            label = NODE_TYPE_LABELS[node.node_type]
            rel_type = NODE_TYPE_RELATIONSHIPS[node.node_type]
            uid = str(uuid.uuid4())
            properties = encrypt_properties(node.properties)

            query = ADD_NODE.replace("{label}", label).replace("{rel_type}", rel_type)
            result = await session.run(
                query,
                user_id=current_user["user_id"],
                properties=properties,
                uid=uid,
            )
            record = await result.single()
            if record:
                created.append(uid)

    return {"created": len(created), "node_ids": created}
