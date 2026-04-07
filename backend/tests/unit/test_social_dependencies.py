from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.social.dependencies import get_social_db


@pytest.mark.asyncio
async def test_get_social_db_returns_driver():
    """get_social_db returns the social Neo4j driver."""
    mock_driver = MagicMock()

    with patch(
        "app.social.dependencies.get_social_driver",
        AsyncMock(return_value=mock_driver),
    ):
        driver = await get_social_db()
        assert driver is mock_driver
