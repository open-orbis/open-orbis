"""Unit tests for verify_google_id_token."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from google.auth.exceptions import TransportError

from app.auth.service import verify_google_id_token


@pytest.mark.asyncio
async def test_happy_path_returns_claims():
    fake_claims = {
        "sub": "google-sub-123",
        "email": "alice@example.com",
        "email_verified": True,
        "name": "Alice",
        "picture": "https://example.com/a.png",
        "iss": "https://accounts.google.com",
        "aud": "test-client-id",
    }
    with (
        patch("app.auth.service.settings") as mock_settings,
        patch(
            "app.auth.service.google_id_token.verify_oauth2_token",
            return_value=fake_claims,
        ),
    ):
        mock_settings.google_client_id = "test-client-id"
        claims = await verify_google_id_token("fake.jwt.token")
    assert claims["sub"] == "google-sub-123"
    assert claims["email"] == "alice@example.com"


@pytest.mark.asyncio
async def test_invalid_signature_raises_401():
    with (
        patch(
            "app.auth.service.google_id_token.verify_oauth2_token",
            side_effect=ValueError("invalid signature"),
        ),
        pytest.raises(HTTPException) as exc,
    ):
        await verify_google_id_token("bad.token")
    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid_id_token"


@pytest.mark.asyncio
async def test_wrong_issuer_raises_401():
    fake_claims = {
        "sub": "x",
        "email": "x@x.com",
        "email_verified": True,
        "iss": "https://evil.example.com",  # not Google
        "aud": "test-client-id",
    }
    with (
        patch("app.auth.service.settings") as mock_settings,
        patch(
            "app.auth.service.google_id_token.verify_oauth2_token",
            return_value=fake_claims,
        ),
    ):
        mock_settings.google_client_id = "test-client-id"
        with pytest.raises(HTTPException) as exc:
            await verify_google_id_token("fake.jwt.token")
    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid_id_token"


@pytest.mark.asyncio
async def test_jwks_transport_error_raises_503():
    with (
        patch(
            "app.auth.service.google_id_token.verify_oauth2_token",
            side_effect=TransportError("jwks fetch failed"),
        ),
        pytest.raises(HTTPException) as exc,
    ):
        await verify_google_id_token("fake.jwt.token")
    assert exc.value.status_code == 503
    assert exc.value.detail == "verify_unavailable"
