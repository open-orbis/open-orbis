from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from neo4j import AsyncDriver
from pydantic import BaseModel

from app.dependencies import get_current_user, get_db
from app.graph.embeddings import generate_embedding
from app.orbs.share_token import node_matches_filters, validate_share_token
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


class SemanticSearchRequest(BaseModel):
    query: str
    top_k: int = 5
    orb_id: str | None = None  # If None, search own orb


VECTOR_SEARCH_QUERY = """
CALL db.index.vector.queryNodes($index_name, $top_k, $embedding)
YIELD node, score
MATCH (p:Person)-[]->(node)
WHERE p.user_id = $user_id OR p.orb_id = $orb_id
RETURN node, score, labels(node) AS node_labels
ORDER BY score DESC
"""


@router.post("/semantic")
async def semantic_search(
    data: SemanticSearchRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    embedding = await generate_embedding(data.query)
    if embedding is None:
        raise HTTPException(status_code=503, detail="Embedding service unavailable")

    results = []
    # Search across each vector index
    index_names = [
        "education_embedding",
        "work_experience_embedding",
        "certification_embedding",
        "publication_embedding",
        "project_embedding",
    ]

    async with db.session() as session:
        for index_name in index_names:
            try:
                result = await session.run(
                    VECTOR_SEARCH_QUERY,
                    index_name=index_name,
                    top_k=data.top_k,
                    embedding=embedding,
                    user_id=current_user["user_id"],
                    orb_id=data.orb_id or "",
                )
                async for record in result:
                    node = dict(record["node"])
                    node.pop("embedding", None)
                    node["_labels"] = record["node_labels"]
                    node["_score"] = record["score"]
                    results.append(node)
            except Exception as e:
                logger.debug("Vector index '%s' query skipped: %s", index_name, e)
                continue

    # Sort by score and take top_k
    results.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return results[: data.top_k]


# ── Simple text search (no embeddings required) ──


class TextSearchRequest(BaseModel):
    query: str


# Search fields per label
_SEARCH_FIELDS: dict[str, list[str]] = {
    "Skill": ["name", "category", "proficiency"],
    "Language": ["name", "proficiency"],
    "Education": ["institution", "degree", "field_of_study", "location", "description"],
    "WorkExperience": ["company", "title", "location", "description"],
    "Certification": ["name", "issuing_organization"],
    "Publication": ["title", "venue", "abstract"],
    "Project": ["name", "role", "description"],
    "Patent": ["title", "patent_number", "description", "inventors"],
}


def _fuzzy_match(text: str, terms: list[str], threshold: float = 0.6) -> bool:
    """Check if any search term fuzzy-matches the text using simple ratio."""
    if not text:
        return False
    text_lower = text.lower()
    for term in terms:
        if term in text_lower:
            return True
        # Simple character overlap ratio for fuzzy matching
        if len(term) >= 3:
            # Check if any substring of similar length has good overlap
            for i in range(max(0, len(text_lower) - len(term) + 1)):
                window = text_lower[i : i + len(term)]
                common = sum(1 for a, b in zip(window, term) if a == b)
                if common / max(len(term), 1) >= threshold:
                    return True
    return False


def _best_window_similarity(text: str, term: str) -> float:
    """Best character overlap ratio for a term inside text."""
    if not text or not term:
        return 0.0
    if len(text) < len(term):
        common = sum(1 for a, b in zip(text, term) if a == b)
        return common / max(len(term), 1)

    best = 0.0
    for i in range(max(0, len(text) - len(term) + 1)):
        window = text[i : i + len(term)]
        common = sum(1 for a, b in zip(window, term) if a == b)
        best = max(best, common / max(len(term), 1))
    return best


def _field_match_score(text: str, raw_term: str, terms: list[str]) -> float:
    """Compute a normalized relevance score [0, 1] for one field."""
    if not text:
        return 0.0
    text_lower = text.lower()
    score = 0.0

    if raw_term and raw_term in text_lower:
        term_ratio = min(1.0, len(raw_term) / max(len(text_lower), 1))
        score = max(score, 0.75 + (0.2 * term_ratio))

    matched_terms = sum(1 for t in terms if t and t in text_lower)
    if terms and matched_terms > 0:
        coverage = matched_terms / len(terms)
        score = max(score, 0.55 + (0.35 * coverage))

    for term in terms:
        if len(term) < 3:
            continue
        best_similarity = _best_window_similarity(text_lower, term)
        if best_similarity >= 0.6:
            score = max(score, 0.35 + (0.5 * best_similarity))

    return min(1.0, score)


def _node_match_score(
    node: dict, fields: list[str], raw_term: str, terms: list[str]
) -> float:
    """Compute a normalized node relevance score [0, 1]."""
    field_scores = [
        _field_match_score(str(node.get(field, "")), raw_term, terms)
        for field in fields
        if node.get(field)
    ]
    if not field_scores:
        return 0.0
    top_score = max(field_scores)
    extra_matches = max(0, sum(1 for s in field_scores if s >= 0.6) - 1)
    return min(1.0, top_score + (0.03 * extra_matches))


@router.post("/text")
async def text_search(  # noqa: C901
    data: TextSearchRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Fuzzy text search across all node properties."""
    raw_term = data.query.strip().lower()
    # Split into terms for multi-word queries
    terms = [t for t in raw_term.split() if len(t) >= 2]
    if not terms:
        terms = [raw_term]

    # First: exact substring match via Cypher
    results = []
    seen_uids: set[str] = set()

    async with db.session() as session:
        for label, fields in _SEARCH_FIELDS.items():
            where_clauses = " OR ".join(
                f"toLower(toString(n.{f})) CONTAINS $term" for f in fields
            )
            cypher = (
                f"MATCH (p:Person {{user_id: $user_id}})-[r]->(n:{label}) "
                f"WHERE {where_clauses} "
                f"RETURN n, labels(n) AS node_labels"
            )
            try:
                result = await session.run(
                    cypher, user_id=current_user["user_id"], term=raw_term
                )
                async for record in result:
                    node = dict(record["n"])
                    node.pop("embedding", None)
                    node["_labels"] = record["node_labels"]
                    node["score"] = _node_match_score(node, fields, raw_term, terms)
                    if node.get("uid") not in seen_uids:
                        seen_uids.add(node.get("uid", ""))
                        results.append(node)
            except Exception as e:
                logger.warning("Text search query failed for label %s: %s", label, e)
                continue

    # Second: if few results, do fuzzy matching on all nodes
    if len(results) < 3:
        async with db.session() as session:
            for label, fields in _SEARCH_FIELDS.items():
                cypher = (
                    f"MATCH (p:Person {{user_id: $user_id}})-[r]->(n:{label}) "
                    f"RETURN n, labels(n) AS node_labels"
                )
                try:
                    result = await session.run(cypher, user_id=current_user["user_id"])
                    async for record in result:
                        node = dict(record["n"])
                        uid = node.get("uid", "")
                        if uid in seen_uids:
                            continue
                        # Check fuzzy match against all searchable fields
                        matched = False
                        for f in fields:
                            val = node.get(f)
                            if val and _fuzzy_match(str(val), terms):
                                matched = True
                                break
                        if matched:
                            node.pop("embedding", None)
                            node["_labels"] = record["node_labels"]
                            node["score"] = _node_match_score(
                                node, fields, raw_term, terms
                            )
                            seen_uids.add(uid)
                            results.append(node)
                except Exception as e:
                    logger.warning(
                        "Fuzzy search query failed for label %s: %s", label, e
                    )
                    continue

    results.sort(key=lambda n: n.get("score", 0), reverse=True)
    return results


class PublicTextSearchRequest(BaseModel):
    query: str
    orb_id: str
    token: str


@router.post("/text/public")
@limiter.limit("30/minute")
async def public_text_search(  # noqa: C901
    request: Request,
    data: PublicTextSearchRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Fuzzy text search across a public orb's nodes (requires share token)."""
    # Validate the share token
    token_data = await validate_share_token(db, data.token)
    if token_data is None:
        raise HTTPException(status_code=403, detail="Invalid or expired share token.")
    if token_data["orb_id"] != data.orb_id:
        raise HTTPException(
            status_code=403, detail="Token does not grant access to this orb."
        )
    filter_keywords = token_data["keywords"]

    raw_term = data.query.strip().lower()
    terms = [t for t in raw_term.split() if len(t) >= 2]
    if not terms:
        terms = [raw_term]

    results = []
    seen_uids: set[str] = set()

    async with db.session() as session:
        for label, fields in _SEARCH_FIELDS.items():
            where_clauses = " OR ".join(
                f"toLower(toString(n.{f})) CONTAINS $term" for f in fields
            )
            cypher = (
                f"MATCH (p:Person {{orb_id: $orb_id}})-[r]->(n:{label}) "
                f"WHERE {where_clauses} "
                f"RETURN n, labels(n) AS node_labels"
            )
            try:
                result = await session.run(cypher, orb_id=data.orb_id, term=raw_term)
                async for record in result:
                    node = dict(record["n"])
                    node.pop("embedding", None)
                    node["_labels"] = record["node_labels"]
                    node["score"] = _node_match_score(node, fields, raw_term, terms)
                    if node.get("uid") not in seen_uids:
                        if filter_keywords and node_matches_filters(
                            node, filter_keywords
                        ):
                            continue
                        seen_uids.add(node.get("uid", ""))
                        results.append(node)
            except Exception as e:
                logger.warning(
                    "Public text search failed for label %s on orb %s: %s",
                    label,
                    data.orb_id,
                    e,
                )
                continue

    if len(results) < 3:
        async with db.session() as session:
            for label, fields in _SEARCH_FIELDS.items():
                cypher = (
                    f"MATCH (p:Person {{orb_id: $orb_id}})-[r]->(n:{label}) "
                    f"RETURN n, labels(n) AS node_labels"
                )
                try:
                    result = await session.run(cypher, orb_id=data.orb_id)
                    async for record in result:
                        node = dict(record["n"])
                        uid = node.get("uid", "")
                        if uid in seen_uids:
                            continue
                        if filter_keywords and node_matches_filters(
                            node, filter_keywords
                        ):
                            continue
                        matched = False
                        for f in fields:
                            val = node.get(f)
                            if val and _fuzzy_match(str(val), terms):
                                matched = True
                                break
                        if matched:
                            node.pop("embedding", None)
                            node["_labels"] = record["node_labels"]
                            node["score"] = _node_match_score(
                                node, fields, raw_term, terms
                            )
                            seen_uids.add(uid)
                            results.append(node)
                except Exception as e:
                    logger.warning(
                        "Public fuzzy search failed for label %s on orb %s: %s",
                        label,
                        data.orb_id,
                        e,
                    )
                    continue

    results.sort(key=lambda n: n.get("score", 0), reverse=True)
    return results
