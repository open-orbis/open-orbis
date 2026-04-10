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


# ── User management ──


class UserResponse(BaseModel):
    user_id: str
    name: str = ""
    email: str = ""
    provider: str = ""
    is_admin: bool = False
    signup_code: str | None = None
    activated_at: str | None = None
    created_at: str = ""


class UserDetailResponse(UserResponse):
    orb_id: str = ""
    picture: str = ""
    headline: str = ""
    location: str = ""
    node_count: int = 0
    gdpr_consent: bool = False
    deletion_requested_at: str | None = None


class BatchActivateRequest(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=100)


# ── Insights ──


class ProviderCount(BaseModel):
    provider: str
    count: int


class ActivationTimeStats(BaseModel):
    total: int
    avg_hours: float | None
    min_hours: float | None
    max_hours: float | None


class CodeAttributionEntry(BaseModel):
    label: str
    count: int


class EngagementBucket(BaseModel):
    bucket: str
    count: int


class InsightsResponse(BaseModel):
    providers: list[ProviderCount]
    activation_time: ActivationTimeStats
    code_attribution: list[CodeAttributionEntry]
    engagement: list[EngagementBucket]


# ── Funnel metrics ──


class DailyCount(BaseModel):
    date: str
    count: int


class FunnelResponse(BaseModel):
    signups: list[DailyCount]
    activations: list[DailyCount]
    total_signups: int
    total_activations: int
    conversion_rate: float
