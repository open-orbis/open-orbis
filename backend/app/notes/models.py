from __future__ import annotations

from pydantic import BaseModel


class ExistingSkill(BaseModel):
    uid: str
    name: str


class EnhanceNoteRequest(BaseModel):
    text: str
    target_language: str = "en"
    existing_skills: list[ExistingSkill] = []


class EnhanceNoteResponse(BaseModel):
    node_type: str
    properties: dict
    suggested_skill_uids: list[str] = []
