from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

OrbVisibility = Literal["private", "public", "restricted"]


class NodeCreate(BaseModel):
    node_type: str  # education, work_experience, skill, etc.
    properties: dict


class NodeUpdate(BaseModel):
    properties: dict


class PersonUpdate(BaseModel):
    headline: str | None = None
    location: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    twitter_url: str | None = None
    instagram_url: str | None = None
    scholar_url: str | None = None
    website_url: str | None = None
    open_to_work: bool | None = None
    visibility: OrbVisibility | None = None


class OrbIdUpdate(BaseModel):
    orb_id: str


class VisibilityUpdate(BaseModel):
    visibility: OrbVisibility


# ── Share Tokens ──


class ShareTokenCreate(BaseModel):
    keywords: list[str] = []  # empty = full access, no filtering
    hidden_node_types: list[
        str
    ] = []  # node labels to exclude (e.g. ["Skill", "Language"])
    label: str | None = None  # optional human-readable name
    expires_in_days: int | None = None  # None = use server default


class ShareTokenResponse(BaseModel):
    token_id: str
    orb_id: str
    keywords: list[str]
    hidden_node_types: list[str]
    label: str | None
    created_at: datetime
    expires_at: datetime | None
    revoked: bool


class ShareTokenListResponse(BaseModel):
    tokens: list[ShareTokenResponse]


# ── Access grants (restricted-mode allowlist) ──


class AccessGrantCreate(BaseModel):
    email: str  # normalized lowercase server-side
    keywords: list[str] = []  # empty = no keyword exclusions
    hidden_node_types: list[str] = []  # labels to exclude (e.g. ["Skill"])


class AccessGrantResponse(BaseModel):
    grant_id: str
    orb_id: str
    email: str
    keywords: list[str] = []
    hidden_node_types: list[str] = []
    created_at: datetime
    revoked: bool


class AccessGrantListResponse(BaseModel):
    grants: list[AccessGrantResponse]


class AccessGrantFiltersUpdate(BaseModel):
    keywords: list[str] = []
    hidden_node_types: list[str] = []


# ── Connection Requests ──


class ConnectionRequestResponse(BaseModel):
    request_id: str
    requester_user_id: str
    requester_email: str
    requester_name: str
    status: str
    created_at: str
    resolved_at: str | None = None


class ConnectionRequestListResponse(BaseModel):
    requests: list[ConnectionRequestResponse]


class AcceptConnectionRequestBody(BaseModel):
    keywords: list[str] = []
    hidden_node_types: list[str] = []


class PublicFiltersUpdate(BaseModel):
    keywords: list[str] = []
    hidden_node_types: list[str] = []
