from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from app.admin.auth import create_admin_jwt, verify_admin_jwt, hash_password, verify_password
from app.config import settings


def test_hash_and_verify_password():
    hashed = hash_password("test-password")
    assert hashed != "test-password"
    assert verify_password("test-password", hashed)
    assert not verify_password("wrong-password", hashed)


def test_create_admin_jwt_contains_admin_type():
    token = create_admin_jwt("test-admin-id")
    payload = jwt.decode(
        token,
        settings.admin_jwt_secret,
        algorithms=[settings.admin_jwt_algorithm],
    )
    assert payload["type"] == "admin"
    assert payload["admin_id"] == "test-admin-id"


def test_verify_admin_jwt_valid():
    token = create_admin_jwt("test-admin-id")
    admin_id = verify_admin_jwt(token)
    assert admin_id == "test-admin-id"


def test_verify_admin_jwt_rejects_user_jwt():
    """User JWTs must not be accepted as admin JWTs."""
    user_token = jwt.encode(
        {"sub": "user-1", "email": "u@test.com", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(HTTPException) as exc_info:
        verify_admin_jwt(user_token)
    assert exc_info.value.status_code == 401


def test_verify_admin_jwt_rejects_expired():
    expired_token = jwt.encode(
        {"type": "admin", "admin_id": "test", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        settings.admin_jwt_secret,
        algorithm=settings.admin_jwt_algorithm,
    )
    with pytest.raises(HTTPException) as exc_info:
        verify_admin_jwt(expired_token)
    assert exc_info.value.status_code == 401
