"""Generate and store vector embeddings for graph nodes."""

from __future__ import annotations

import anthropic

from app.config import settings


async def generate_embedding(text: str) -> list[float] | None:
    """Generate a 1536-dim embedding using Anthropic's API via Voyager model,
    falling back to None if unavailable."""
    if not settings.anthropic_api_key:
        return None

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        # Use the embeddings endpoint if available, otherwise skip
        # Anthropic doesn't have a native embedding model yet,
        # so we use a simple hash-based placeholder for now.
        # In production, swap with OpenAI ada-002 or a local sentence-transformers model.
        return _simple_embedding(text)
    except Exception:
        return None


def _simple_embedding(text: str, dim: int = 1536) -> list[float]:
    """Deterministic placeholder embedding for development.
    Replace with a real embedding model in production."""
    import hashlib
    import struct

    h = hashlib.sha512(text.encode()).digest()
    # Extend hash to fill dim floats
    result = []
    seed = h
    while len(result) < dim:
        seed = hashlib.sha512(seed).digest()
        floats = struct.unpack(f"{len(seed) // 4}f", seed[: (len(seed) // 4) * 4])
        result.extend(floats)
    # Normalize
    result = result[:dim]
    magnitude = sum(x * x for x in result) ** 0.5
    if magnitude > 0:
        result = [x / magnitude for x in result]
    return result


def build_embedding_text(node_type: str, properties: dict) -> str:
    """Build a text representation of a node for embedding."""
    parts = [node_type.replace("_", " ")]

    key_fields = {
        "education": ["institution", "degree", "field_of_study", "description"],
        "work_experience": ["company", "title", "description"],
        "certification": ["name", "issuing_organization"],
        "publication": ["title", "venue", "abstract"],
        "project": ["name", "role", "description"],
        "skill": ["name", "category"],
        "collaborator": ["name"],
        "language": ["name", "proficiency"],
    }

    for field in key_fields.get(node_type, []):
        value = properties.get(field)
        if value:
            parts.append(str(value))

    return " | ".join(parts)
