"""API routes for user idea submission and admin listing."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_user, require_admin
from app.ideas import db

router = APIRouter(tags=["ideas"])


class IdeaCreate(BaseModel):
    text: str


class IdeaResponse(BaseModel):
    idea_id: str
    user_id: str
    text: str
    created_at: str


@router.post("/ideas", response_model=IdeaResponse, status_code=201)
async def submit_idea(
    body: IdeaCreate,
    current_user: dict = Depends(get_current_user),
):
    """Submit a new idea (any authenticated user)."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Idea text cannot be empty")
    return await db.insert_idea(user_id=current_user["user_id"], text=text)


@router.get("/admin/ideas", response_model=list[IdeaResponse])
async def list_ideas(
    _admin: dict = Depends(require_admin),
):
    """List all submitted ideas (admin only)."""
    return await db.list_ideas()


@router.delete("/admin/ideas/{idea_id}", status_code=204)
async def delete_idea(
    idea_id: str,
    _admin: dict = Depends(require_admin),
):
    """Delete an idea (admin only)."""
    if not await db.delete_idea(idea_id):
        raise HTTPException(status_code=404, detail="Idea not found")
