from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from app.config import settings
from app.dependencies import get_current_user, get_db


async def test_get_db():
    with patch("app.dependencies.get_driver", AsyncMock(return_value="driver")):
        db = await get_db()
        assert db == "driver"


async def test_get_current_user_success():
    payload = {"sub": "user-123", "email": "test@example.com"}
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    credentials = MagicMock()
    credentials.credentials = token

    user = await get_current_user(credentials)
    assert user["user_id"] == "user-123"
    assert user["email"] == "test@example.com"


async def test_get_current_user_invalid_token():
    credentials = MagicMock()
    credentials.credentials = "invalid-token"

    with pytest.raises(HTTPException) as exc:
        await get_current_user(credentials)
    assert exc.value.status_code == 401


async def test_get_current_user_no_sub():
    payload = {"email": "test@example.com"}  # Missing 'sub'
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    credentials = MagicMock()
    credentials.credentials = token

    with pytest.raises(HTTPException) as exc:
        await get_current_user(credentials)
    assert exc.value.status_code == 401


async def test_get_current_user_expired_token():
    """An expired JWT should raise 401."""
    payload = {
        "sub": "user-123",
        "email": "test@example.com",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    credentials = MagicMock()
    credentials.credentials = token

    with pytest.raises(HTTPException) as exc:
        await get_current_user(credentials)
    assert exc.value.status_code == 401
