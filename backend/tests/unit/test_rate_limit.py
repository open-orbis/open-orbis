from app.rate_limit import limiter


def test_limiter_exists():
    """Limiter instance is importable and configured."""
    assert limiter is not None
    assert limiter._default_limits == []


from app.main import app


def test_app_has_rate_limit_state():
    """The limiter is attached to app.state."""
    assert hasattr(app.state, "limiter")


from unittest.mock import AsyncMock

from tests.unit.conftest import MockNode


def _make_orb_record(orb_id="test-orb"):
    person_node = MockNode(
        {"user_id": "u1", "orb_id": orb_id, "name": "Test"}, ["Person"]
    )
    return {
        "p": person_node,
        "connections": [],
        "cross_skill_nodes": [],
        "cross_links": [],
    }


def test_public_orb_rate_limit(client, mock_db):
    """GET /orbs/{orb_id} returns 429 after exceeding 30 requests/minute."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record("rate-limit-orb"))
    )

    for _ in range(30):
        resp = client.get("/orbs/rate-limit-orb")
        assert resp.status_code == 200

    resp = client.get("/orbs/rate-limit-orb")
    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["detail"]


def test_public_orb_access_logging(client, mock_db, caplog):
    """GET /orbs/{orb_id} logs access with IP and orb_id."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record("test-orb"))
    )

    import logging

    with caplog.at_level(logging.INFO):
        resp = client.get("/orbs/test-orb")

    assert resp.status_code == 200
    assert any("PUBLIC_ACCESS" in r.message and "orb_id=test-orb" in r.message for r in caplog.records)
