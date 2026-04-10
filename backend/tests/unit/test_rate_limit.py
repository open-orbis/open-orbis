import logging
from unittest.mock import AsyncMock, patch

from app.main import app
from app.rate_limit import limiter
from tests.unit.conftest import MockNode


def test_limiter_exists():
    """Limiter instance is importable and configured."""
    assert limiter is not None
    assert limiter._default_limits == []


def test_app_has_rate_limit_state():
    """The limiter is attached to app.state."""
    assert hasattr(app.state, "limiter")


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


@patch("app.orbs.router.validate_share_token")
def test_public_orb_rate_limit(mock_validate, client, mock_db):
    """GET /orbs/{orb_id} returns 429 after exceeding 30 requests/minute."""
    mock_validate.return_value = {"orb_id": "rate-limit-orb", "keywords": []}
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record("rate-limit-orb"))
    )

    for _ in range(30):
        resp = client.get("/orbs/rate-limit-orb?token=valid")
        assert resp.status_code == 200

    resp = client.get("/orbs/rate-limit-orb?token=valid")
    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["detail"]


@patch("app.orbs.router.validate_share_token")
def test_public_orb_access_logging(mock_validate, client, mock_db, caplog):
    """GET /orbs/{orb_id} logs access with IP and orb_id."""
    mock_validate.return_value = {"orb_id": "test-orb", "keywords": []}
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record("test-orb"))
    )

    with caplog.at_level(logging.INFO):
        resp = client.get("/orbs/test-orb?token=valid")

    assert resp.status_code == 200
    assert any(
        "PUBLIC_ACCESS" in r.message and "orb_id=test-orb" in r.message
        for r in caplog.records
    )


@patch("app.export.router.validate_share_token")
@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_rate_limit(mock_decrypt, mock_validate, client, mock_db):
    """GET /export/{orb_id} returns 429 after exceeding 30 requests/minute."""
    mock_validate.return_value = {"orb_id": "export-orb", "keywords": []}
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record("export-orb"))
    )

    for _ in range(30):
        resp = client.get("/export/export-orb?token=valid")
        assert resp.status_code == 200

    resp = client.get("/export/export-orb?token=valid")
    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["detail"]


@patch("app.export.router.validate_share_token")
@patch("app.export.router.decrypt_properties", side_effect=lambda x: x)
def test_export_orb_access_logging(
    mock_decrypt, mock_validate, client, mock_db, caplog
):
    """GET /export/{orb_id} logs access with IP and orb_id."""
    mock_validate.return_value = {"orb_id": "export-log-orb", "keywords": []}
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record("export-log-orb"))
    )

    with caplog.at_level(logging.INFO):
        client.get("/export/export-log-orb?token=valid")

    assert any(
        "PUBLIC_ACCESS" in r.message and "orb_id=export-log-orb" in r.message
        for r in caplog.records
    )
