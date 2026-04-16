"""Draft notes REST API — persisted in SQLite, separate from the orb graph."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.drafts import db
from app.drafts.models import DraftCreate, DraftOut, DraftUpdate

router = APIRouter(prefix="/drafts", tags=["drafts"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("", response_model=list[DraftOut])
async def list_drafts(current_user: dict = Depends(get_current_user)):
    """List all drafts for the authenticated user, newest first."""
    return await db.list_drafts(current_user["user_id"])


@router.post("", response_model=DraftOut, status_code=status.HTTP_201_CREATED)
async def create_draft(
    body: DraftCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new draft note."""
    uid = str(uuid.uuid4())
    return await db.create_draft(uid, current_user["user_id"], body.text, _now())


@router.put("/{uid}", response_model=DraftOut)
async def update_draft(
    uid: str,
    body: DraftUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a draft's text."""
    result = await db.update_draft(uid, current_user["user_id"], body.text, _now())
    if result is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return result


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft(
    uid: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a draft note."""
    if not await db.delete_draft(uid, current_user["user_id"]):
        raise HTTPException(status_code=404, detail="Draft not found")
