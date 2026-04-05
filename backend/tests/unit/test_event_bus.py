from app.analytics.event_bus import collect_events, emit, setup_request_context


def test_emit_without_context_does_not_raise():
    """emit() is safe to call outside middleware (no context)."""
    emit("llm_usage", {"model": "test"})  # should not raise


def test_setup_and_collect_events():
    """Events emitted between setup and collect are returned."""
    setup_request_context()
    emit("llm_usage", {"model": "llama3.2:3b", "input_tokens": 100})
    emit("llm_usage", {"model": "llama3.2:3b", "input_tokens": 200})
    events = collect_events()
    assert len(events) == 2
    assert events[0] == ("llm_usage", {"model": "llama3.2:3b", "input_tokens": 100})
    assert events[1] == ("llm_usage", {"model": "llama3.2:3b", "input_tokens": 200})


def test_collect_clears_events():
    """After collect, the event list is empty."""
    setup_request_context()
    emit("llm_usage", {"model": "test"})
    collect_events()
    events = collect_events()
    assert events == []


def test_emit_with_exception_in_data_does_not_raise():
    """emit() never raises even with weird data."""
    setup_request_context()
    emit("llm_usage", None)  # type: ignore
    events = collect_events()
    assert len(events) == 1
