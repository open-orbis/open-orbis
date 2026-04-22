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


class GeminiExtractionOutput(BaseModel):
    """LLM output contract for CV extraction — used as `response_schema`
    on the Gemini 2.5 Pro Vertex AI call to enforce structured output.

    Mirrors the top-level JSON shape documented in
    `ollama_classifier.SYSTEM_PROMPT`. Intentionally distinct from
    `ExtractedData`: this is what the LLM must produce (profile fields
    flat at the top level, no provenance metadata), not what Orbis
    stores internally.
    """

    cv_owner_name: str | None = None
    headline: str | None = None
    location: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    twitter_url: str | None = None
    website_url: str | None = None
    scholar_url: str | None = None
    nodes: list[ExtractedNode] = []
    relationships: list[ExtractedRelationship] = []
    unmatched: list[str] = []


class ExtractionMetadata(BaseModel):
    """Metadata about how a CV extraction was performed."""

    llm_provider: str  # "claude", "gemini", "ollama", "rule_based", or "none"
    llm_model: (
        str  # e.g. "claude-opus-4-6", "gemini-2.5-pro", "rule_based_parser", "none"
    )
    extraction_method: str  # "primary", "fallback_<provider>", "fallback_rule_based", "fallback_raw_text"
    prompt_content: str  # Full system prompt used (empty when no LLM was invoked)
    prompt_hash: str  # SHA-256 of prompt_content
    cost_usd: float | None = None
    duration_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


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
    # LLM usage metrics
    cost_usd: float | None = None
    duration_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
