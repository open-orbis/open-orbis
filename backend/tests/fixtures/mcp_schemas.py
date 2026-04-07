from __future__ import annotations

from typing import Any

from pydantic import BaseModel, RootModel


class ErrorResponse(BaseModel):
    """Schema for error responses from MCP tools."""

    error: str


class SummaryResponse(BaseModel):
    """Schema for orbis_get_summary response."""

    name: str
    headline: str
    location: str
    orb_id: str
    open_to_work: bool
    node_counts: dict[str, int]
    total_nodes: int


class FullOrbResponse(BaseModel):
    """Schema for orbis_get_full_orb response."""

    person: dict[str, Any]
    nodes: list[dict[str, Any]]


class NodeResponse(BaseModel):
    """Schema for a single node in a list (used by get_nodes_by_type and get_skills_for_experience)."""

    uid: str
    # Other fields are dynamic based on node type


class NodeListResponse(RootModel):
    """Schema for orbis_get_nodes_by_type and orbis_get_skills_for_experience responses."""

    root: list[dict[str, Any]]


class ConnectionItem(BaseModel):
    """Schema for a single connection in orbis_get_connections."""

    relationship: str
    node: dict[str, Any]


class ConnectionsResponse(BaseModel):
    """Schema for orbis_get_connections response."""

    node_uid: str
    connections: list[ConnectionItem]


class MessageResponse(BaseModel):
    """Schema for orbis_send_message response."""

    uid: str
    detail: str


# Union types for easy validation in tests
McpResponse = (
    SummaryResponse
    | FullOrbResponse
    | NodeListResponse
    | ConnectionsResponse
    | MessageResponse
    | ErrorResponse
)
