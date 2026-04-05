from io import BytesIO
from unittest.mock import AsyncMock, patch

from tests.unit.conftest import MockNode


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

    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["gdpr_consent"] is True


def test_get_me_defaults_consent_to_false(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(
            return_value={"p": MockNode({"user_id": "test-user", "name": "Test User"})}
        )
    )

    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["gdpr_consent"] is False


@patch("app.cv.router.pdf_extract")
@patch("app.cv.router.classify_entries")
@patch("app.cv.router.counter")
def test_upload_cv_rejected_without_consent(
    mock_counter, mock_classify, mock_docling, client, mock_db
):
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(return_value={"consent": False})

    file_content = b"%PDF-1.4 test content"
    file = BytesIO(file_content)

    response = client.post(
        "/cv/upload", files={"file": ("test.pdf", file, "application/pdf")}
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]


def test_confirm_cv_rejected_without_consent(client, mock_db):
    session_mock = mock_db.session.return_value.__aenter__.return_value
    session_mock.run.return_value.single = AsyncMock(return_value={"consent": False})

    response = client.post(
        "/cv/confirm",
        json={"nodes": [], "relationships": []},
    )
    assert response.status_code == 403
    assert "GDPR consent required" in response.json()["detail"]
