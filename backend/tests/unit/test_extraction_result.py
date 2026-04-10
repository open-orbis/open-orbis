"""Tests for ExtractionResult metadata in classification pipeline."""
from app.cv.models import ExtractionMetadata


def test_extraction_metadata_defaults():
    meta = ExtractionMetadata(
        llm_provider="claude",
        llm_model="claude-opus-4-6",
        extraction_method="primary",
        prompt_content="You are a CV parser...",
        prompt_hash="abc123",
    )
    assert meta.llm_provider == "claude"
    assert meta.llm_model == "claude-opus-4-6"
    assert meta.extraction_method == "primary"
    assert meta.prompt_content == "You are a CV parser..."
    assert meta.prompt_hash == "abc123"


def test_extraction_metadata_rule_based():
    meta = ExtractionMetadata(
        llm_provider="rule_based",
        llm_model="rule_based_parser",
        extraction_method="fallback_rule_based",
        prompt_content="",
        prompt_hash="",
    )
    assert meta.llm_provider == "rule_based"
    assert meta.prompt_content == ""
