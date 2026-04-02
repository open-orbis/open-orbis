from __future__ import annotations

from pydantic import BaseModel


class ExtractedNode(BaseModel):
    node_type: str
    properties: dict


class SkippedNode(BaseModel):
    original: dict
    reason: str


class ExtractedRelationship(BaseModel):
    from_index: int
    to_index: int
    type: str = "USED_SKILL"


class ExtractedData(BaseModel):
    nodes: list[ExtractedNode]
    unmatched: list[str] = []
    skipped_nodes: list[SkippedNode] = []
    relationships: list[ExtractedRelationship] = []
    truncated: bool = False
    cv_owner_name: str | None = None


class ConfirmRequest(BaseModel):
    nodes: list[ExtractedNode]
    relationships: list[ExtractedRelationship] = []
    cv_owner_name: str | None = None
