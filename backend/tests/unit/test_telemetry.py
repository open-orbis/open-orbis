import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.dependencies import get_current_user, get_db
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_db():
    mock = MagicMock()
    mock.session = MagicMock()
    async_session = AsyncMock()
    mock.session.return_value.__aenter__.return_value = async_session
    return mock

@pytest.fixture
def mock_user():
    return {"user_id": "test-user-123", "email": "test@example.com"}

@pytest.mark.asyncio
async def test_log_event(mock_db, mock_user):
    # Override dependencies
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        event_data = {
            "event_type": "test_event",
            "page_path": "/test",
            "component_name": "TestComponent",
            "properties": {"foo": "bar"}
        }
        response = await client.post("/telemetry/event", json=event_data)
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    # Clear overrides
    app.dependency_overrides = {}
