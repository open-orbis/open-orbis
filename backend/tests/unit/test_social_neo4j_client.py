from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.social.neo4j_client import close_social_driver, get_social_driver


@pytest.mark.asyncio
async def test_get_social_driver_creates_driver():
    """get_social_driver creates a new AsyncDriver on first call."""
    mock_driver = MagicMock()

    with patch(
        "app.social.neo4j_client.AsyncGraphDatabase.driver",
        return_value=mock_driver,
    ):
        import app.social.neo4j_client as mod

        mod._driver = None

        driver = await get_social_driver()
        assert driver is mock_driver


@pytest.mark.asyncio
async def test_get_social_driver_returns_singleton():
    """get_social_driver returns the same driver on subsequent calls."""
    mock_driver = MagicMock()

    with patch(
        "app.social.neo4j_client.AsyncGraphDatabase.driver",
        return_value=mock_driver,
    ):
        import app.social.neo4j_client as mod

        mod._driver = None

        driver1 = await get_social_driver()
        driver2 = await get_social_driver()
        assert driver1 is driver2


@pytest.mark.asyncio
async def test_close_social_driver():
    """close_social_driver closes and resets the driver."""
    mock_driver = MagicMock()
    mock_driver.close = AsyncMock()

    import app.social.neo4j_client as mod

    mod._driver = mock_driver

    await close_social_driver()
    mock_driver.close.assert_awaited_once()
    assert mod._driver is None


@pytest.mark.asyncio
async def test_close_social_driver_noop_when_none():
    """close_social_driver does nothing if no driver exists."""
    import app.social.neo4j_client as mod

    mod._driver = None

    await close_social_driver()
    assert mod._driver is None
