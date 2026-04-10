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
    twitter_url: str | None = None
    website_url: str | None = None
    scholar_url: str | None = None


class ExtractedData(BaseModel):
    nodes: list[ExtractedNode]
    unmatched: list[str] = []
    skipped_nodes: list[SkippedNode] = []
    relationships: list[ExtractedRelationship] = []
    truncated: bool = False
    cv_owner_name: str | None = None
    profile: ExtractedProfile | None = None
    document_id: str | None = None
    # Provenance metadata
    llm_provider: str | None = None
    llm_model: str | None = None
    extraction_method: str | None = None
    prompt_hash: str | None = None


class ExtractionMetadata(BaseModel):
    """Metadata about how a CV extraction was performed."""

    llm_provider: str  # "claude", "ollama", "rule_based"
    llm_model: str  # "claude-opus-4-6", "llama3.2:3b", "rule_based_parser"
    extraction_method: str  # "primary", "fallback_rule_based", "fallback_raw_text"
    prompt_content: str  # Full system prompt used (empty for rule_based)
    prompt_hash: str  # SHA-256 of prompt_content


class ConfirmRequest(BaseModel):
    nodes: list[ExtractedNode]
    relationships: list[ExtractedRelationship] = []
    cv_owner_name: str | None = None
    profile: ExtractedProfile | None = None
    document_id: str | None = None
    original_filename: str | None = None
    file_size_bytes: int | None = None
    page_count: int | None = None
    # Provenance metadata
    llm_provider: str | None = None
    llm_model: str | None = None
    extraction_method: str | None = None
    prompt_hash: str | None = None
    prompt_content: str | None = None
