from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_db, require_gdpr_consent
from app.main import app
from app.rate_limit import limiter


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Clear SlowAPI counters between tests so back-to-back requests
    from the shared TestClient IP don't trip shared per-minute limits."""
    limiter.reset()
    yield
    limiter.reset()


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
    """Default ``TestClient`` with auth + consent short-circuited.

    Most tests don't care about the GDPR gate and would otherwise need
    to remember to mock a ``{"consent": True}`` row before any write
    endpoint. This override bypasses the ``require_gdpr_consent`` DB
    lookup entirely; tests that actually exercise the consent path
    (``test_gdpr_consent.py``) delete the override with
    ``app.dependency_overrides.pop(require_gdpr_consent, None)``.
    """
    fake_user = {"user_id": "test-user", "email": "test@example.com"}
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[require_gdpr_consent] = lambda: fake_user

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
