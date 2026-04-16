"""Pydantic models for draft notes."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DraftCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)


class DraftUpdate(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)


class DraftOut(BaseModel):
    uid: str
    text: str
    created_at: datetime
    updated_at: datetime
