"""Pydantic request/response models for admin API."""

from __future__ import annotations

from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MetricCard(BaseModel):
    label: str
    value: int | float
    sparkline: list[int | float] = []


class OverviewResponse(BaseModel):
    total_users: MetricCard
    active_today: MetricCard
    signups_this_week: MetricCard
    llm_tokens_today: MetricCard
    recent_events: list[dict]


class UserSummary(BaseModel):
    user_id: str
    first_seen: str
    last_seen: str
    event_count: int
    llm_tokens: int


class UserListResponse(BaseModel):
    users: list[UserSummary]
    total: int


class UserActivityResponse(BaseModel):
    events: list[dict]
    llm_usage: list[dict]


class LLMUsageResponse(BaseModel):
    by_model: list[dict]
    by_operation: list[dict]
    over_time: list[dict]
    top_users: list[dict]


class EventsResponse(BaseModel):
    events: list[dict]
    total: int


class FunnelResponse(BaseModel):
    steps: list[dict]


class TrendsResponse(BaseModel):
    series: list[dict]


class RealtimeResponse(BaseModel):
    active_users: int
    events_today: int
    llm_tokens_today: int
    recent_events: list[dict]
