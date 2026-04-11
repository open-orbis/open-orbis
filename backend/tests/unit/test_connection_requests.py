from unittest.mock import AsyncMock, MagicMock

import pytest


_SENTINEL = object()


def _mock_db(records=None, single=_SENTINEL):
    mock_session = AsyncMock()
    mock_result = AsyncMock()
    if single is not _SENTINEL:
        mock_result.single.return_value = single
    if records is not None:
        mock_result.__aiter__ = lambda self: iter(records)
    mock_session.run.return_value = mock_result
    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)
    return mock_db, mock_session


@pytest.mark.asyncio
async def test_create_connection_request_success():
    cr_node = {
        "request_id": "req-1",
        "requester_user_id": "user-2",
        "requester_email": "bob@example.com",
        "requester_name": "Bob",
        "status": "pending",
        "created_at": "2026-04-11T00:00:00Z",
        "resolved_at": None,
    }
    db, session = _mock_db(single={"cr": cr_node, "owner_user_id": "user-1"})

    from app.orbs.connection_requests import create_connection_request

    result = await create_connection_request(
        db=db, orb_id="test-orb",
        user={"user_id": "user-2", "email": "bob@example.com", "name": "Bob"},
    )
    assert result is not None
    assert result["request_id"] == "req-1"
    assert result["status"] == "pending"


@pytest.mark.asyncio
async def test_create_connection_request_duplicate_returns_none():
    db, session = _mock_db(single=None)

    from app.orbs.connection_requests import create_connection_request

    result = await create_connection_request(
        db=db, orb_id="test-orb",
        user={"user_id": "user-2", "email": "bob@example.com", "name": "Bob"},
    )
    assert result is None


@pytest.mark.asyncio
async def test_get_my_connection_request():
    cr_node = {"request_id": "req-1", "status": "pending", "created_at": "2026-04-11T00:00:00Z", "resolved_at": None}
    db, _ = _mock_db(single={"cr": cr_node})

    from app.orbs.connection_requests import get_my_connection_request

    result = await get_my_connection_request(db=db, orb_id="test-orb", user_id="user-2")
    assert result is not None
    assert result["status"] == "pending"


@pytest.mark.asyncio
async def test_get_my_connection_request_not_found():
    db, _ = _mock_db(single=None)

    from app.orbs.connection_requests import get_my_connection_request

    result = await get_my_connection_request(db=db, orb_id="test-orb", user_id="user-2")
    assert result is None


@pytest.mark.asyncio
async def test_reject_request():
    cr_node = {"request_id": "req-1", "status": "rejected"}
    db, _ = _mock_db(single={"cr": cr_node})

    from app.orbs.connection_requests import reject_request

    result = await reject_request(db=db, user_id="user-1", request_id="req-1")
    assert result is not None
    assert result["status"] == "rejected"


@pytest.mark.asyncio
async def test_reject_request_not_found():
    db, _ = _mock_db(single=None)

    from app.orbs.connection_requests import reject_request

    result = await reject_request(db=db, user_id="user-1", request_id="nonexistent")
    assert result is None
