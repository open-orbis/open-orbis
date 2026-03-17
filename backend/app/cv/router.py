from __future__ import annotations

import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from neo4j import AsyncDriver

from app.cv.models import ConfirmRequest, ExtractedData, ExtractedNode
from app.cv.parser import extract_text, rule_based_extract, rule_based_to_nodes
from app.cv.refiner import refine_with_llm
from app.dependencies import get_current_user, get_db
from app.graph.encryption import encrypt_properties
from app.graph.queries import ADD_NODE, NODE_TYPE_LABELS, NODE_TYPE_RELATIONSHIPS

router = APIRouter(prefix="/cv", tags=["cv"])


@router.post("/upload", response_model=ExtractedData)
async def upload_cv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".pdf", ".docx"):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Step 1: Extract text
        raw_text = extract_text(tmp_path)

        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from file")

        # Step 2: Rule-based extraction
        partial = rule_based_extract(raw_text)

        # Step 3: LLM refinement (or fallback to rule-based nodes)
        refined_nodes = await refine_with_llm(raw_text, partial)

        if not refined_nodes:
            # Fallback: convert rule-based extraction to nodes directly
            refined_nodes = rule_based_to_nodes(partial)

        # Convert to response model
        nodes = []
        for node in refined_nodes:
            node_type = node.get("node_type", "")
            if node_type in NODE_TYPE_LABELS:
                nodes.append(ExtractedNode(
                    node_type=node_type,
                    properties=node.get("properties", {}),
                ))

        return ExtractedData(nodes=nodes)
    finally:
        os.unlink(tmp_path)


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
