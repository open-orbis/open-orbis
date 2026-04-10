from unittest.mock import AsyncMock, patch


def test_get_me_success(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"p": {"user_id": "test-user", "name": "Test User"}})
    )

    with patch(
        "app.auth.router.is_invite_code_required", AsyncMock(return_value=False)
    ):
        response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["user_id"] == "test-user"
    assert response.json()["name"] == "Test User"


def test_get_me_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )

    response = client.get("/auth/me")
    assert response.status_code == 404
