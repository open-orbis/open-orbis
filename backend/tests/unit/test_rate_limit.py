from app.rate_limit import limiter


def test_limiter_exists():
    """Limiter instance is importable and configured."""
    assert limiter is not None
    assert limiter._default_limits == []


from app.main import app


def test_app_has_rate_limit_state():
    """The limiter is attached to app.state."""
    assert hasattr(app.state, "limiter")
