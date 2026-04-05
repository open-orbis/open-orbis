import time
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.analytics.middleware import AnalyticsMiddleware


def _make_app() -> FastAPI:
    """Create a minimal FastAPI app with the analytics middleware."""
    test_app = FastAPI()
    test_app.add_middleware(AnalyticsMiddleware)

    @test_app.get("/test")
    async def test_endpoint():
        return {"ok": True}

    @test_app.get("/health")
    async def health():
        return {"status": "ok"}

    return test_app


@patch("app.analytics.middleware.posthog_client")
def test_middleware_captures_request(mock_ph):
    """Middleware sends an http_request event to PostHog."""
    app = _make_app()
    client = TestClient(app)
    response = client.get("/test")
    assert response.status_code == 200

    mock_ph.capture.assert_called_once()
    call_args = mock_ph.capture.call_args
    assert call_args[0][1] == "http_request"
    props = call_args[1]["properties"] if "properties" in call_args[1] else call_args[0][2]
    assert props["method"] == "GET"
    assert props["path"] == "/test"
    assert props["status_code"] == 200
    assert "duration_ms" in props


@patch("app.analytics.middleware.posthog_client")
def test_middleware_skips_excluded_paths(mock_ph):
    """Middleware does not track /health or /docs."""
    app = _make_app()
    client = TestClient(app)
    client.get("/health")
    mock_ph.capture.assert_not_called()


@patch("app.analytics.middleware.posthog_client")
def test_middleware_flushes_event_bus(mock_ph):
    """Middleware flushes event bus events after request."""
    from app.analytics.event_bus import emit

    app = _make_app()

    @app.get("/llm-endpoint")
    async def llm_endpoint():
        emit("llm_usage", {"model": "llama3.2:3b", "input_tokens": 100, "output_tokens": 50})
        return {"ok": True}

    client = TestClient(app)
    client.get("/llm-endpoint")

    # Should have 2 calls: one for http_request, one for llm_usage
    assert mock_ph.capture.call_count == 2
    event_names = [call[0][1] for call in mock_ph.capture.call_args_list]
    assert "http_request" in event_names
    assert "llm_usage" in event_names
