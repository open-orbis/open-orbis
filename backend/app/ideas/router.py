"""API routes for user idea/feedback submission and admin listing."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_current_user, require_admin
from app.ideas import db

router = APIRouter(tags=["ideas"])


class IdeaCreate(BaseModel):
    text: str
    source: str = "idea"  # "idea" or "feedback"


class IdeaResponse(BaseModel):
    idea_id: str
    user_id: str
    text: str
    created_at: str
    source: str = "idea"


@router.post("/ideas", response_model=IdeaResponse, status_code=201)
async def submit_idea(
    body: IdeaCreate,
    current_user: dict = Depends(get_current_user),
):
    """Submit a new idea or feedback (any authenticated user)."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    source = body.source if body.source in ("idea", "feedback") else "idea"
    return await db.insert_idea(
        user_id=current_user["user_id"], text=text, source=source
    )


@router.get("/admin/ideas", response_model=list[IdeaResponse])
async def list_ideas(
    source: str | None = Query(None),
    _admin: dict = Depends(require_admin),
):
    """List all submitted ideas/feedback (admin only). Filter by source."""
    return await db.list_ideas(source=source)


@router.delete("/admin/ideas/{idea_id}", status_code=204)
async def delete_idea(
    idea_id: str,
    _admin: dict = Depends(require_admin),
):
    """Delete an idea or feedback (admin only)."""
    if not await db.delete_idea(idea_id):
        raise HTTPException(status_code=404, detail="Not found")
