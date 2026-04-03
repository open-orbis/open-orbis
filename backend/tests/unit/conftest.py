from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_db
from app.main import app


class MockNode(dict):
    """Simulate a Neo4j Node object (dict + .labels)."""

    def __init__(self, data, labels=None):
        super().__init__(data)
        self.labels = labels or []


@pytest.fixture(autouse=True)
def mock_neo4j_driver():
    """Mock the global Neo4j driver used in app lifespan."""
    mock_driver = MagicMock()

    mock_session = AsyncMock()
    mock_session_context = MagicMock()
    mock_session_context.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_context.__aexit__ = AsyncMock()

    mock_driver.session.return_value = mock_session_context
    mock_driver.close = AsyncMock()

    with (
        patch("app.main.get_driver", AsyncMock(return_value=mock_driver)),
        patch("app.main.close_driver", AsyncMock()),
    ):
        yield mock_driver


@pytest.fixture
def mock_db():
    mock = MagicMock()
    session_mock = AsyncMock()
    mock.session.return_value.__aenter__.return_value = session_mock

    result_mock = AsyncMock()
    session_mock.run.return_value = result_mock

    return mock


def mock_db_single(mock_db, return_value):
    """Shortcut: set the return value for mock_db.session...run...single()."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=return_value)
    )


@pytest.fixture
def empty_async_result():
    """A MagicMock whose async iteration yields nothing."""

    async def _empty(*args, **kwargs):
        if False:
            yield
        return

    result = MagicMock()
    result.__aiter__ = _empty
    return result


@pytest.fixture
def client(mock_db, mock_neo4j_driver):
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "test-user",
        "email": "test@example.com",
    }

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
