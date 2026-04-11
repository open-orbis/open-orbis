from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_record_llm_usage_creates_node():
    mock_session = AsyncMock()
    mock_result = AsyncMock()
    mock_result.single.return_value = {"u": {"usage_id": "test-123"}}
    mock_session.run.return_value = mock_result

    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)

    from app.graph.llm_usage import record_llm_usage

    usage_id = await record_llm_usage(
        db=mock_db,
        user_id="user-1",
        endpoint="cv_upload",
        llm_provider="claude",
        llm_model="claude-opus-4-6",
        cost_usd=0.05,
        duration_ms=2000,
    )

    assert usage_id is not None
    mock_session.run.assert_called_once()
    call_kwargs = mock_session.run.call_args
    assert call_kwargs.kwargs["endpoint"] == "cv_upload"
    assert call_kwargs.kwargs["cost_usd"] == 0.05
    assert call_kwargs.kwargs["duration_ms"] == 2000


@pytest.mark.asyncio
async def test_record_llm_usage_handles_none_fields():
    mock_session = AsyncMock()
    mock_result = AsyncMock()
    mock_result.single.return_value = {"u": {"usage_id": "test-456"}}
    mock_session.run.return_value = mock_result

    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)

    from app.graph.llm_usage import record_llm_usage

    usage_id = await record_llm_usage(
        db=mock_db,
        user_id="user-1",
        endpoint="note_enhance",
        llm_provider="ollama",
        llm_model="llama3.2:3b",
    )

    assert usage_id is not None
    call_kwargs = mock_session.run.call_args
    assert call_kwargs.kwargs["cost_usd"] is None
    assert call_kwargs.kwargs["duration_ms"] is None
    assert call_kwargs.kwargs["input_tokens"] is None
