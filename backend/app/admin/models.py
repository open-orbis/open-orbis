"""Pydantic models for the admin / closed-beta invitation API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WaitlistReasonCounts(BaseModel):
    no_code: int = 0
    invalid_code: int = 0
    cap_reached: int = 0
    registration_closed: int = 0


class StatsResponse(BaseModel):
    registered: int
    cap: int
    seats_left: int
    registration_enabled: bool
    waitlist_total: int
    waitlist_by_reason: WaitlistReasonCounts


class WaitlistEntry(BaseModel):
    email: str
    name: str = ""
    provider: str = ""
    attempted_code: str | None = None
    reason: str
    first_attempt_at: str
    last_attempt_at: str
    attempts: int
    contacted: bool = False
    contacted_at: str | None = None


class WaitlistContactedUpdate(BaseModel):
    contacted: bool


class AccessCodeCreate(BaseModel):
    code: str = Field(min_length=3, max_length=64)
    label: str = ""


class AccessCodeResponse(BaseModel):
    code: str
    label: str = ""
    active: bool
    created_at: str
    created_by: str = ""
    uses: int = 0


class AccessCodeUpdate(BaseModel):
    active: bool


class BetaConfigResponse(BaseModel):
    max_users: int
    registration_enabled: bool
    updated_at: str


class BetaConfigUpdate(BaseModel):
    max_users: int | None = Field(default=None, ge=0)
    registration_enabled: bool | None = None
