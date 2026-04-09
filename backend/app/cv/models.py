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


class ExtractedProfile(BaseModel):
    """Person-level fields extracted from the CV."""

    headline: str | None = None
    location: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    website_url: str | None = None
    scholar_url: str | None = None
    orcid_url: str | None = None


class ExtractedData(BaseModel):
    nodes: list[ExtractedNode]
    unmatched: list[str] = []
    skipped_nodes: list[SkippedNode] = []
    relationships: list[ExtractedRelationship] = []
    truncated: bool = False
    cv_owner_name: str | None = None
    profile: ExtractedProfile | None = None
    document_id: str | None = None


class ConfirmRequest(BaseModel):
    nodes: list[ExtractedNode]
    relationships: list[ExtractedRelationship] = []
    cv_owner_name: str | None = None
    profile: ExtractedProfile | None = None
    document_id: str | None = None
    original_filename: str | None = None
    file_size_bytes: int | None = None
    page_count: int | None = None
