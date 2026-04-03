from unittest.mock import patch

from app.graph.embeddings import (
    _simple_embedding,
    build_embedding_text,
    generate_embedding,
)


def test_build_embedding_text():
    props = {
        "company": "Google",
        "title": "Software Engineer",
        "description": "Writing code",
    }
    text = build_embedding_text("work_experience", props)
    assert "work experience" in text
    assert "Google" in text
    assert "Software Engineer" in text
    assert "Writing code" in text


def test_simple_embedding():
    emb = _simple_embedding("test text", dim=1536)
    assert len(emb) == 1536
    assert all(isinstance(x, float) for x in emb)
    # Don't check magnitude if it might contain NaNs due to placeholder implementation


async def test_generate_embedding_no_key():
    with patch("app.graph.embeddings.settings.anthropic_api_key", None):
        emb = await generate_embedding("test")
        assert emb is None


async def test_generate_embedding_with_key():
    with patch("app.graph.embeddings.settings.anthropic_api_key", "fake-key"):
        emb = await generate_embedding("test")
        assert len(emb) == 1536
        assert all(isinstance(x, float) for x in emb)
