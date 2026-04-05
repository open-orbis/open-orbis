from app.rate_limit import limiter


def test_limiter_exists():
    """Limiter instance is importable and configured."""
    assert limiter is not None
    assert limiter._default_limits == []
