"""Pydantic models for the admin / closed-beta invitation API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class InviteCodeCounts(BaseModel):
    total: int = 0
    used: int = 0
    available: int = 0


class StatsResponse(BaseModel):
    registered: int
    pending_activation: int
    invite_code_required: bool
    invite_codes: InviteCodeCounts


class PendingUser(BaseModel):
    user_id: str
    name: str = ""
    email: str = ""
    provider: str = ""
    created_at: str = ""


class AccessCodeCreate(BaseModel):
    code: str = Field(min_length=3, max_length=64)
    label: str = ""


class AccessCodeResponse(BaseModel):
    code: str
    label: str = ""
    active: bool
    created_at: str
    created_by: str = ""
    used_at: str | None = None
    used_by: str | None = None


class AccessCodeBatchCreate(BaseModel):
    prefix: str = Field(min_length=2, max_length=32)
    count: int = Field(ge=1, le=500)
    label: str = ""


class AccessCodeUpdate(BaseModel):
    active: bool


class BetaConfigResponse(BaseModel):
    invite_code_required: bool
    updated_at: str


class BetaConfigUpdate(BaseModel):
    invite_code_required: bool | None = None
