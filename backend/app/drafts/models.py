from __future__ import annotations

from pydantic import BaseModel


class DraftNoteResponse(BaseModel):
    uid: str
    text: str
    from_voice: bool
    created_at: str
    updated_at: str


class DraftNoteCreate(BaseModel):
    text: str
    from_voice: bool = False


class DraftNoteUpdate(BaseModel):
    text: str
