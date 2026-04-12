from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest

from app.dependencies import require_gdpr_consent
from app.main import app
from tests.unit.conftest import MockNode


def _patch_invite():
    return patch(
        "app.auth.router.is_invite_code_required", AsyncMock(return_value=False)
    )


@pytest.fixture
def consent_gated_client(client):
    """Client fixture that exercises the real ``require_gdpr_consent`` DB
    lookup instead of the default override used by the rest of the
    suite. Used only in this file to assert the 403 response."""
    app.dependency_overrides.pop(require_gdpr_consent, None)
    yield client
    # ``client`` teardown re-clears all overrides anyway, but be explicit.


def test_grant_gdpr_consent(client, mock_db):
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value = AsyncMock()

    response = client.post("/auth/gdpr-consent")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    call_args = session_mock.run.call_args
    assert "gdpr_consent" in call_args[0][0]
    assert call_args[1]["user_id"] == "test-user"


def test_get_me_returns_gdpr_consent(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={
                "p": MockNode(
                    {"user_id": "test-user", "name": "Test User", "gdpr_consent": True}
                )
            }
        )
    )

    with _patch_invite():
        response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["gdpr_consent"] is True


def test_get_me_defaults_consent_to_false(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={"p": MockNode({"user_id": "test-user", "name": "Test User"})}
        )
    )

    with _patch_invite():
        response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["gdpr_consent"] is False


@patch("app.cv.router.pdf_extract")
@patch("app.cv.router.classify_entries")
@patch("app.cv.router.counter")
def test_upload_cv_rejected_without_consent(
    mock_counter, mock_classify, mock_docling, consent_gated_client, mock_db
):
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(return_value={"consent": False})

    file_content = b"%PDF-1.4 test content"
    file = BytesIO(file_content)

    response = consent_gated_client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]


def test_confirm_cv_rejected_without_consent(consent_gated_client, mock_db):
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(return_value={"consent": False})

    response = consent_gated_client.post(
        "/cv/confirm",
        json={"nodes": [], "relationships": []},
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]


def test_notes_enhance_rejected_without_consent(consent_gated_client, mock_db):
    """L3: /notes/enhance was missing the consent gate before this fix."""
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(return_value={"consent": False})

    response = consent_gated_client.post(
        "/notes/enhance",
        json={"text": "led team", "target_language": "en", "existing_skills": []},
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]


def test_orbs_add_node_rejected_without_consent(consent_gated_client, mock_db):
    """L3: POST /orbs/me/nodes was missing the consent gate."""
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(return_value={"consent": False})

    response = consent_gated_client.post(
        "/orbs/me/nodes",
        json={"node_type": "skill", "properties": {"name": "Python"}},
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]


def test_orbs_update_profile_rejected_without_consent(consent_gated_client, mock_db):
    """L3: PUT /orbs/me was missing the consent gate."""
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(return_value={"consent": False})

    response = consent_gated_client.put("/orbs/me", json={"headline": "New headline"})
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]
