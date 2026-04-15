from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from app.auth.service import SESSION_COOKIE
from app.config import settings
from app.dependencies import get_current_user, get_current_user_optional, get_db


def _request(*, cookies: dict | None = None, headers: dict | None = None) -> MagicMock:
    request = MagicMock()
    request.cookies = cookies or {}
    request.headers = headers or {}
    return request


def _token(payload: dict) -> str:
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def test_get_db():
    with patch("app.dependencies.get_driver", AsyncMock(return_value="driver")):
        db = await get_db()
        assert db == "driver"


# ── get_current_user ────────────────────────────────────────────────────


async def test_get_current_user_from_cookie():
    token = _token({"sub": "user-123", "email": "test@example.com"})
    request = _request(cookies={SESSION_COOKIE: f"{token}|dummy-refresh"})
    user = await get_current_user(request)
    assert user["user_id"] == "user-123"
    assert user["email"] == "test@example.com"


async def test_get_current_user_ignores_bearer_header():
    """Stage 5 of the cookie migration dropped the Bearer fallback.
    An Authorization header alone must no longer authenticate on /api —
    MCP agents carry X-MCP-Key instead, handled by a separate middleware."""
    token = _token({"sub": "user-456", "email": "b@example.com"})
    request = _request(headers={"authorization": f"Bearer {token}"})
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request)
    assert exc.value.status_code == 401


async def test_get_current_user_cookie_only():
    cookie_token = _token({"sub": "cookie-user", "email": "c@x"})
    header_token = _token({"sub": "header-user", "email": "h@x"})
    request = _request(
        cookies={SESSION_COOKIE: f"{cookie_token}|dummy-refresh"},
        headers={"authorization": f"Bearer {header_token}"},
    )
    user = await get_current_user(request)
    # The header is ignored entirely; the cookie wins by being the only
    # channel consulted at all.
    assert user["user_id"] == "cookie-user"


async def test_get_current_user_no_credentials_raises_401():
    request = _request()
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request)
    assert exc.value.status_code == 401


async def test_get_current_user_invalid_token_raises_401():
    request = _request(cookies={SESSION_COOKIE: "not-a-jwt|dummy-refresh"})
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request)
    assert exc.value.status_code == 401


async def test_get_current_user_no_sub_raises_401():
    token = _token({"email": "test@example.com"})
    request = _request(cookies={SESSION_COOKIE: f"{token}|dummy-refresh"})
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request)
    assert exc.value.status_code == 401


async def test_get_current_user_expired_token_raises_401():
    token = _token(
        {
            "sub": "user-123",
            "email": "test@example.com",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
    )
    request = _request(cookies={SESSION_COOKIE: f"{token}|dummy-refresh"})
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request)
    assert exc.value.status_code == 401


# ── get_current_user_optional ──────────────────────────────────────────


async def test_get_current_user_optional_no_credentials_returns_none():
    assert await get_current_user_optional(_request()) is None


async def test_get_current_user_optional_non_bearer_returns_none():
    request = _request(headers={"authorization": "Basic abc"})
    assert await get_current_user_optional(request) is None


async def test_get_current_user_optional_invalid_token_returns_none():
    request = _request(cookies={SESSION_COOKIE: "not-a-jwt|dummy-refresh"})
    assert await get_current_user_optional(request) is None


async def test_get_current_user_optional_cookie_returns_user():
    token = _token({"sub": "user-123", "email": "test@example.com"})
    request = _request(cookies={SESSION_COOKIE: f"{token}|dummy-refresh"})
    user = await get_current_user_optional(request)
    assert user is not None
    assert user["user_id"] == "user-123"


async def test_get_current_user_optional_ignores_bearer():
    """Optional auth also only consults cookies, consistent with the strict
    variant. A bearer header alone resolves to 'unauthenticated'."""
    token = _token({"sub": "user-123", "email": "test@example.com"})
    request = _request(headers={"authorization": f"Bearer {token}"})
    assert await get_current_user_optional(request) is None


async def test_get_current_user_optional_no_sub_returns_none():
    token = _token({"email": "test@example.com"})
    request = _request(cookies={SESSION_COOKIE: f"{token}|dummy-refresh"})
    assert await get_current_user_optional(request) is None
