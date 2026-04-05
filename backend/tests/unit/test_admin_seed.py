from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.admin.seed import seed_admin


@pytest.mark.asyncio
async def test_seed_admin_creates_user():
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_ctx = MagicMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = mock_ctx
    mock_conn.fetchrow.return_value = None  # user doesn't exist yet

    with patch("app.admin.seed.get_admin_pool", AsyncMock(return_value=mock_pool)):
        await seed_admin("admin", "secretpass")

    mock_conn.execute.assert_called_once()
    call_args = mock_conn.execute.call_args
    assert "INSERT INTO orbis_admin.admin_users" in call_args[0][0]
    assert call_args[0][1] == "admin"


@pytest.mark.asyncio
async def test_seed_admin_skips_existing_user():
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_ctx = MagicMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = mock_ctx
    mock_conn.fetchrow.return_value = {"admin_id": "existing-id"}  # user exists

    with patch("app.admin.seed.get_admin_pool", AsyncMock(return_value=mock_pool)):
        await seed_admin("admin", "secretpass")

    mock_conn.execute.assert_not_called()
