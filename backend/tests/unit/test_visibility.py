from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.orbs.visibility import (
    assert_orb_accessible,
    assert_user_can_access_restricted,
    get_orb_visibility,
)
from tests.unit.conftest import MockNode


def _mock_driver_with_record(record):
    driver = MagicMock()
    session_mock = AsyncMock()
    driver.session.return_value.__aenter__.return_value = session_mock
    result_mock = AsyncMock()
    session_mock.run.return_value = result_mock
    result_mock.single = AsyncMock(return_value=record)
    return driver


@pytest.mark.asyncio
async def test_get_orb_visibility_returns_value():
    driver = _mock_driver_with_record({"visibility": "public"})
    result = await get_orb_visibility(driver, "test-orb")
    assert result == "public"


@pytest.mark.asyncio
async def test_get_orb_visibility_returns_none_when_not_found():
    driver = _mock_driver_with_record(None)
    result = await get_orb_visibility(driver, "missing-orb")
    assert result is None


def test_assert_orb_accessible_private_raises_403():
    with pytest.raises(HTTPException) as exc:
        assert_orb_accessible("private")
    assert exc.value.status_code == 403
    assert "private" in exc.value.detail.lower()


def test_assert_orb_accessible_public_passes():
    # Should not raise
    assert_orb_accessible("public")


def test_assert_orb_accessible_restricted_passes():
    # restricted passes the basic gate; allowlist is enforced separately
    assert_orb_accessible("restricted")


def test_assert_orb_accessible_none_raises_404():
    with pytest.raises(HTTPException) as exc:
        assert_orb_accessible(None)
    assert exc.value.status_code == 404


# ── Restricted-mode allowlist ──


@pytest.mark.asyncio
async def test_assert_restricted_no_user_raises_401():
    driver = MagicMock()
    with pytest.raises(HTTPException) as exc:
        await assert_user_can_access_restricted(driver, "test-orb", None)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_assert_restricted_owner_passes():
    """Owner always has access regardless of allowlist."""
    person = MockNode({"user_id": "owner-1", "orb_id": "test-orb"}, ["Person"])
    driver = _mock_driver_with_record({"p": person})
    # Should not raise
    await assert_user_can_access_restricted(
        driver, "test-orb", {"user_id": "owner-1", "email": "owner@x.com"}
    )


@pytest.mark.asyncio
async def test_assert_restricted_no_email_raises_403():
    """Logged-in user without email on JWT is rejected."""
    person = MockNode({"user_id": "owner-1", "orb_id": "test-orb"}, ["Person"])
    driver = _mock_driver_with_record({"p": person})
    with pytest.raises(HTTPException) as exc:
        await assert_user_can_access_restricted(
            driver, "test-orb", {"user_id": "viewer-1", "email": ""}
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
@patch("app.orbs.visibility.get_access_grant_for_user", new_callable=AsyncMock)
async def test_assert_restricted_allowed_email_passes(mock_get_grant):
    person = MockNode({"user_id": "owner-1", "orb_id": "test-orb"}, ["Person"])
    driver = _mock_driver_with_record({"p": person})
    mock_get_grant.return_value = {
        "grant_id": "g-1",
        "keywords": ["python"],
        "hidden_node_types": ["Skill"],
    }
    # Should not raise
    await assert_user_can_access_restricted(
        driver, "test-orb", {"user_id": "viewer-1", "email": "alice@x.com"}
    )
    mock_get_grant.assert_awaited_once()


@pytest.mark.asyncio
@patch("app.orbs.visibility.get_access_grant_for_user", new_callable=AsyncMock)
async def test_assert_restricted_unallowed_email_raises_403(mock_get_grant):
    person = MockNode({"user_id": "owner-1", "orb_id": "test-orb"}, ["Person"])
    driver = _mock_driver_with_record({"p": person})
    mock_get_grant.return_value = None
    with pytest.raises(HTTPException) as exc:
        await assert_user_can_access_restricted(
            driver, "test-orb", {"user_id": "viewer-1", "email": "bob@x.com"}
        )
    assert exc.value.status_code == 403
    assert "access" in exc.value.detail.lower()
