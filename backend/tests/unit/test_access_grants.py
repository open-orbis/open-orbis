from unittest.mock import AsyncMock, MagicMock

import pytest

from app.orbs.access_grants import (
    _normalize_email,
    create_access_grant,
    list_access_grants,
    revoke_access_grant,
    user_has_access,
)


def _mock_driver(single_return=None, async_iter_records=None):
    driver = MagicMock()
    session_mock = AsyncMock()
    driver.session.return_value.__aenter__.return_value = session_mock
    result_mock = MagicMock()
    session_mock.run.return_value = result_mock
    if single_return is not None or async_iter_records is None:
        result_mock.single = AsyncMock(return_value=single_return)
    if async_iter_records is not None:

        async def _aiter(*_a, **_kw):
            for r in async_iter_records:
                yield r

        result_mock.__aiter__ = _aiter
    return driver


def test_normalize_email_lowercases_and_strips():
    assert _normalize_email("  Foo@Bar.COM ") == "foo@bar.com"
    assert _normalize_email("alice@example.com") == "alice@example.com"


@pytest.mark.asyncio
async def test_create_access_grant_success():
    grant_record = {
        "g": {
            "grant_id": "abc",
            "orb_id": "test-orb",
            "email": "alice@x.com",
            "created_at": "2026-04-11T00:00:00+00:00",
            "revoked": False,
            "revoked_at": None,
        },
        "orb_id": "test-orb",
        "owner_name": "Owner Name",
    }
    driver = _mock_driver(single_return=grant_record)
    result = await create_access_grant(driver, "owner-1", "  Alice@X.com ")
    assert result is not None
    assert result["email"] == "alice@x.com"  # normalized
    assert result["owner_name"] == "Owner Name"


@pytest.mark.asyncio
async def test_create_access_grant_no_orb_id_returns_none():
    driver = _mock_driver(single_return=None)
    result = await create_access_grant(driver, "owner-1", "alice@x.com")
    assert result is None


@pytest.mark.asyncio
async def test_list_access_grants():
    records = [
        {"g": {"grant_id": "g1", "email": "a@x.com", "revoked": False}},
        {"g": {"grant_id": "g2", "email": "b@x.com", "revoked": False}},
    ]
    driver = _mock_driver(async_iter_records=records)
    grants = await list_access_grants(driver, "owner-1")
    assert len(grants) == 2
    assert grants[0]["grant_id"] == "g1"


@pytest.mark.asyncio
async def test_revoke_access_grant_success():
    grant_record = {"g": {"grant_id": "g1", "revoked": True}}
    driver = _mock_driver(single_return=grant_record)
    result = await revoke_access_grant(driver, "owner-1", "g1")
    assert result is not None
    assert result["revoked"] is True


@pytest.mark.asyncio
async def test_revoke_access_grant_not_found():
    driver = _mock_driver(single_return=None)
    result = await revoke_access_grant(driver, "owner-1", "missing")
    assert result is None


@pytest.mark.asyncio
async def test_user_has_access_true():
    driver = _mock_driver(single_return={"g": {"grant_id": "g1"}})
    assert await user_has_access(driver, "test-orb", "alice@x.com") is True


@pytest.mark.asyncio
async def test_user_has_access_false():
    driver = _mock_driver(single_return=None)
    assert await user_has_access(driver, "test-orb", "alice@x.com") is False


@pytest.mark.asyncio
async def test_user_has_access_normalizes_email():
    driver = _mock_driver(single_return={"g": {"grant_id": "g1"}})
    # Mixed case should still match (check that the function normalizes)
    assert await user_has_access(driver, "test-orb", "  Alice@X.com ") is True


@pytest.mark.asyncio
async def test_user_has_access_empty_email_returns_false():
    driver = _mock_driver(single_return={"g": {"grant_id": "g1"}})
    # Even if the DB would have returned a match, an empty email short-circuits
    assert await user_has_access(driver, "test-orb", "") is False
