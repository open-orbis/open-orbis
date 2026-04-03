from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user, get_db
from app.drafts.models import DraftNoteCreate, DraftNoteResponse, DraftNoteUpdate
from app.graph.queries import CREATE_DRAFT, DELETE_DRAFT, GET_DRAFTS, UPDATE_DRAFT
from app.orbs.router import _sanitize_neo4j_types

if TYPE_CHECKING:
    from neo4j import AsyncDriver


router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.get("", response_model=list[DraftNoteResponse])
async def list_drafts(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(GET_DRAFTS, user_id=current_user["user_id"])
        records = await result.all()
        return [_sanitize_neo4j_types(dict(record["d"])) for record in records]


@router.post("", response_model=DraftNoteResponse)
async def create_draft(
    data: DraftNoteCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    uid = str(uuid.uuid4())
    async with db.session() as session:
        result = await session.run(
            CREATE_DRAFT,
            user_id=current_user["user_id"],
            uid=uid,
            text=data.text,
            from_voice=data.from_voice,
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")
        return _sanitize_neo4j_types(dict(record["d"]))


@router.put("/{uid}", response_model=DraftNoteResponse)
async def update_draft(
    uid: str,
    data: DraftNoteUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(
            UPDATE_DRAFT,
            user_id=current_user["user_id"],
            uid=uid,
            text=data.text,
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="Draft not found")
        return _sanitize_neo4j_types(dict(record["d"]))


@router.delete("/{uid}")
async def delete_draft(
    uid: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        await session.run(DELETE_DRAFT, user_id=current_user["user_id"], uid=uid)
        return {"status": "deleted"}
