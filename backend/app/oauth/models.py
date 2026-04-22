"""Pydantic request/response models for OAuth endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    client_name: str
    redirect_uris: list[str]
    token_endpoint_auth_method: str = "none"
    grant_types: list[str] = ["authorization_code", "refresh_token"]
    response_types: list[str] = ["code"]


class RegisterResponse(BaseModel):
    client_id: str
    client_name: str
    redirect_uris: list[str]
    token_endpoint_auth_method: str
    grant_types: list[str]
    response_types: list[str]
    client_secret: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str
    scope: str


class GrantListItem(BaseModel):
    client_id: str
    client_name: str
    share_token_id: str | None
    share_token_label: str | None
    connected_at: str
    last_used_at: str | None


class GrantListResponse(BaseModel):
    grants: list[GrantListItem]
