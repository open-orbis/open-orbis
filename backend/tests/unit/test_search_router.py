from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.unit.conftest import MockNode


@pytest.fixture
def mock_search_results():
    node1 = MockNode({"uid": "node-1", "name": "Python"}, ["Skill"])
    node2 = MockNode(
        {"uid": "node-2", "company": "Google", "title": "SWE"}, ["WorkExperience"]
    )
    return [
        {"node": node1, "score": 0.9, "node_labels": ["Skill"]},
        {"node": node2, "score": 0.8, "node_labels": ["WorkExperience"]},
    ]


@patch("app.search.router.generate_embedding")
def test_semantic_search_success(mock_gen, client, mock_db, mock_search_results):
    mock_gen.return_value = [0.1, 0.2, 0.3]

    # Mock result iteration
    async def mock_async_iter(*args, **kwargs):
        for r in mock_search_results:
            yield r

    result_mock = MagicMock()
    result_mock.__aiter__ = mock_async_iter
    mock_db.session.return_value.__aenter__.return_value.run.return_value = result_mock

    response = client.post("/search/semantic", json={"query": "coding", "top_k": 5})
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0]["uid"] == "node-1"


@patch("app.search.router.generate_embedding")
def test_semantic_search_service_unavailable(mock_gen, client):
    mock_gen.return_value = None
    response = client.post("/search/semantic", json={"query": "coding"})
    assert response.status_code == 503


def test_text_search_success(client, mock_db):
    node_data = {"uid": "node-1", "name": "Python"}
    node_mock = MockNode(node_data, ["Skill"])

    async def mock_async_iter(*args, **kwargs):
        yield {"n": node_mock, "node_labels": ["Skill"]}

    result_mock = MagicMock()
    result_mock.__aiter__ = mock_async_iter
    mock_db.session.return_value.__aenter__.return_value.run.return_value = result_mock

    response = client.post("/search/text", json={"query": "Python"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Python"


@patch("app.search.router.get_orb_visibility", new_callable=AsyncMock)
@patch("app.search.router.validate_share_token")
def test_public_text_search_success(mock_validate, mock_visibility, client, mock_db):
    mock_validate.return_value = {"orb_id": "test-orb", "keywords": []}
    mock_visibility.return_value = "public"

    node_data = {"uid": "node-1", "name": "Python"}
    node_mock = MockNode(node_data, ["Skill"])

    async def mock_async_iter(*args, **kwargs):
        yield {"n": node_mock, "node_labels": ["Skill"]}

    result_mock = MagicMock()
    result_mock.__aiter__ = mock_async_iter
    mock_db.session.return_value.__aenter__.return_value.run.return_value = result_mock

    payload = {"query": "Python", "orb_id": "test-orb", "token": "valid-token"}
    response = client.post("/search/text/public", json=payload)
    assert response.status_code == 200
    assert len(response.json()) == 1


@patch("app.search.router.get_orb_visibility", new_callable=AsyncMock)
@patch("app.search.router.validate_share_token")
def test_public_text_search_private_returns_403(
    mock_validate, mock_visibility, client, mock_db
):
    """Public text search rejects private orbs."""
    mock_validate.return_value = {"orb_id": "test-orb", "keywords": []}
    mock_visibility.return_value = "private"

    payload = {"query": "Python", "orb_id": "test-orb", "token": "valid-token"}
    response = client.post("/search/text/public", json=payload)
    assert response.status_code == 403


@patch("app.search.router.get_orb_visibility", new_callable=AsyncMock)
@patch("app.search.router.validate_share_token")
def test_public_text_search_fuzzy_trigger(
    mock_validate, mock_visibility, client, mock_db
):
    mock_validate.return_value = {"orb_id": "test-orb", "keywords": []}
    mock_visibility.return_value = "public"

    node_data = {"uid": "node-fuzzy", "name": "Javascript"}
    node_mock = MockNode(node_data, ["Skill"])

    async def mock_async_iter_empty(*args, **kwargs):
        if False:
            yield
        return

    async def mock_async_iter_full(*args, **kwargs):
        yield {"n": node_mock, "node_labels": ["Skill"]}

    result_empty = MagicMock()
    result_empty.__aiter__ = mock_async_iter_empty

    result_full = MagicMock()
    result_full.__aiter__ = mock_async_iter_full

    run_mock = mock_db.session.return_value.__aenter__.return_value.run
    # 1 call for the exact UNION, 1 for the fuzzy all-nodes query
    run_mock.side_effect = [result_empty, result_full]

    payload = {"query": "Javscript", "orb_id": "test-orb", "token": "valid-token"}
    response = client.post("/search/text/public", json=payload)
    assert response.status_code == 200
    assert len(response.json()) >= 1


def test_fuzzy_match_edge_cases():
    from app.search.router import _fuzzy_match

    assert _fuzzy_match("", ["test"]) is False
    assert _fuzzy_match("exact match", ["exact"]) is True
    # Trigger substring overlap
    assert _fuzzy_match("Javascript", ["Jav"]) is True


def test_text_search_short_query(client, mock_db):
    # Query with single short word
    async def mock_async_iter_empty(*args, **kwargs):
        if False:
            yield
        return

    result_empty = MagicMock()
    result_empty.__aiter__ = mock_async_iter_empty
    mock_db.session.return_value.__aenter__.return_value.run.return_value = result_empty

    response = client.post("/search/text", json={"query": "a"})
    assert response.status_code == 200


@patch("app.search.router.get_orb_visibility", new_callable=AsyncMock)
@patch("app.search.router.validate_share_token")
def test_public_text_search_short_query(
    mock_validate, mock_visibility, client, mock_db
):
    mock_validate.return_value = {"orb_id": "test", "keywords": []}
    mock_visibility.return_value = "public"

    async def mock_async_iter_empty(*args, **kwargs):
        if False:
            yield
        return

    result_empty = MagicMock()
    result_empty.__aiter__ = mock_async_iter_empty
    mock_db.session.return_value.__aenter__.return_value.run.return_value = result_empty

    response = client.post(
        "/search/text/public",
        json={"query": "a", "orb_id": "test", "token": "valid-token"},
    )
    assert response.status_code == 200


@patch("app.search.router.get_orb_visibility", new_callable=AsyncMock)
@patch("app.search.router.validate_share_token")
def test_public_text_search_query_error(
    mock_validate, mock_visibility, client, mock_db
):
    mock_validate.return_value = {"orb_id": "test", "keywords": []}
    mock_visibility.return_value = "public"
    mock_db.session.return_value.__aenter__.return_value.run.side_effect = Exception(
        "DB Error"
    )
    response = client.post(
        "/search/text/public",
        json={"query": "test", "orb_id": "test", "token": "valid-token"},
    )
    assert response.status_code == 200
    assert response.json() == []


@patch("app.search.router.generate_embedding")
def test_semantic_search_query_skipped_on_error(mock_gen, client, mock_db):
    mock_gen.return_value = [0.1] * 1536

    async def mock_async_iter_empty(*args, **kwargs):
        if False:
            yield
        return

    result_ok = MagicMock()
    result_ok.__aiter__ = mock_async_iter_empty

    # First index fails, remaining succeed with empty results
    run_mock = mock_db.session.return_value.__aenter__.return_value.run
    run_mock.side_effect = [Exception("DB Error")] + [result_ok] * 4

    response = client.post("/search/semantic", json={"query": "test"})
    assert response.status_code == 200
    assert response.json() == []


def test_text_search_query_skipped_on_error(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.side_effect = Exception(
        "DB Error"
    )
    response = client.post("/search/text", json={"query": "test"})
    assert response.status_code == 200
    assert response.json() == []


def test_text_search_fuzzy_trigger(client, mock_db):
    """Exact UNION returns empty → fuzzy all-nodes query fires and finds a match."""
    node_data = {"uid": "node-fuzzy", "name": "Javascript"}
    node_mock = MockNode(node_data, ["Skill"])

    async def mock_async_iter_empty(*args, **kwargs):
        if False:
            yield
        return

    async def mock_async_iter_full(*args, **kwargs):
        yield {"n": node_mock, "node_labels": ["Skill"]}

    result_empty = MagicMock()
    result_empty.__aiter__ = mock_async_iter_empty

    result_full = MagicMock()
    result_full.__aiter__ = mock_async_iter_full

    run_mock = mock_db.session.return_value.__aenter__.return_value.run
    # 1 call for the exact UNION, 1 for the fuzzy all-nodes query
    run_mock.side_effect = [result_empty, result_full]

    response = client.post("/search/text", json={"query": "Javscript"})  # Typo
    assert response.status_code == 200
    assert len(response.json()) >= 1


@patch("app.search.router.get_orb_visibility", new_callable=AsyncMock)
@patch("app.search.router.validate_share_token")
def test_public_text_search_with_keyword_filters(
    mock_validate, mock_visibility, client, mock_db
):
    mock_validate.return_value = {"orb_id": "test-orb", "keywords": ["private"]}
    mock_visibility.return_value = "public"

    node_data = {
        "uid": "node-1",
        "name": "Secret Project",
        "description": "private info",
    }
    node_mock = MockNode(node_data, ["Project"])

    async def mock_async_iter(*args, **kwargs):
        yield {"n": node_mock, "node_labels": ["Project"]}

    result_mock = MagicMock()
    result_mock.__aiter__ = mock_async_iter
    mock_db.session.return_value.__aenter__.return_value.run.return_value = result_mock

    payload = {"query": "Secret", "orb_id": "test-orb", "token": "valid-token"}
    response = client.post("/search/text/public", json=payload)
    assert response.status_code == 200
    assert len(response.json()) == 0  # Should be filtered out
