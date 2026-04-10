"""Provenance tracking: ontology versioning and processing record management."""

from __future__ import annotations

import json
import logging
import uuid

from app.graph.ontology import hash_content, parse_ontology_markdown, read_ontology_file
from app.graph.queries import (
    CREATE_ONTOLOGY_VERSION,
    CREATE_PROCESSING_RECORD,
    GET_LATEST_ONTOLOGY_VERSION,
    LINK_ONTOLOGY_SUPERSEDES,
    LINK_PERSON_TO_PROCESSING_RECORD,
    LINK_PROCESSING_RECORD_TO_NODE,
    LINK_PROCESSING_RECORD_TO_ONTOLOGY,
)

logger = logging.getLogger(__name__)


async def ensure_ontology_version(
    session,
    project_root: str,
    current_prompt: str,
) -> str:
    """Ensure an OntologyVersion node exists for the current ontology.

    Reads ontology.md, hashes it, and either reuses the latest version
    (if hash matches) or creates a new one. Returns the version_id.
    """
    content = read_ontology_file(project_root)
    content_hash = hash_content(content)

    # Check latest version
    result = await session.run(GET_LATEST_ONTOLOGY_VERSION)
    record = await result.single()

    if record:
        existing = record["ov"]
        if existing["content_hash"] == content_hash:
            return existing["version_id"]

        # Ontology changed — check prompt consistency
        old_version_number = existing["version_number"]
        old_version_id = existing["version_id"]
        old_prompt = existing["extraction_prompt"]
        new_version_number = old_version_number + 1

        if old_prompt == current_prompt:
            logger.warning(
                "Ontology changed (v%d -> v%d) but extraction prompt is unchanged. "
                "Review the prompt to ensure it reflects the new schema.",
                old_version_number,
                new_version_number,
            )
        else:
            logger.info(
                "Ontology changed (v%d -> v%d) with updated extraction prompt. "
                "Mark as reviewed when confirmed.",
                old_version_number,
                new_version_number,
            )
    else:
        old_version_id = None
        new_version_number = 1

    # Create new version
    schema = parse_ontology_markdown(content)
    new_version_id = str(uuid.uuid4())

    await session.run(
        CREATE_ONTOLOGY_VERSION,
        version_id=new_version_id,
        version_number=new_version_number,
        content_hash=content_hash,
        schema_definition=json.dumps(schema),
        extraction_prompt=current_prompt,
        source_file="ontology.md",
        prompt_reviewed=False,
    )

    # Link supersedes
    if old_version_id:
        await session.run(
            LINK_ONTOLOGY_SUPERSEDES,
            newer_id=new_version_id,
            older_id=old_version_id,
        )

    return new_version_id


async def create_processing_record(
    session,
    user_id: str,
    document_id: str,
    ontology_version_id: str,
    llm_provider: str,
    llm_model: str,
    extraction_method: str,
    prompt_hash: str,
    nodes_extracted: int,
    edges_extracted: int,
    node_uids: list[str],
) -> str:
    """Create a ProcessingRecord node and link it to ontology, person, and extracted nodes."""
    record_id = str(uuid.uuid4())

    await session.run(
        CREATE_PROCESSING_RECORD,
        record_id=record_id,
        document_id=document_id,
        llm_provider=llm_provider,
        llm_model=llm_model,
        extraction_method=extraction_method,
        prompt_hash=prompt_hash,
        nodes_extracted=nodes_extracted,
        edges_extracted=edges_extracted,
    )

    await session.run(
        LINK_PROCESSING_RECORD_TO_ONTOLOGY,
        record_id=record_id,
        version_id=ontology_version_id,
    )

    await session.run(
        LINK_PERSON_TO_PROCESSING_RECORD,
        user_id=user_id,
        record_id=record_id,
    )

    for uid in node_uids:
        await session.run(
            LINK_PROCESSING_RECORD_TO_NODE,
            record_id=record_id,
            node_uid=uid,
        )

    return record_id
