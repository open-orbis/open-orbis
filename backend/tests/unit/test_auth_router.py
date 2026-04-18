from unittest.mock import AsyncMock, MagicMock, patch

import pytest


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


def _build_person_lookup_db(stored_email_ciphertext: str):
    """Build a mock driver whose first session.run → GET_PERSON_BY_USER_ID
    returns a person row with the given encrypted email, and whose
    subsequent runs return an empty result. Returns (db, session_mock)."""
    db = MagicMock()
    session_mock = AsyncMock()
    db.session.return_value.__aenter__.return_value = session_mock

    person_record = {
        "p": {
            "user_id": "google-123",
            "email": stored_email_ciphertext,
            "is_admin": False,
            "signup_code": "open-registration",
            "gdpr_consent": True,
            "profile_image": "",
        }
    }
    person_result = MagicMock()
    person_result.single = AsyncMock(return_value=person_record)

    empty_result = MagicMock()
    empty_result.single = AsyncMock(return_value=None)

    session_mock.run = AsyncMock(
        side_effect=[person_result, empty_result, empty_result]
    )
    return db, session_mock


@pytest.mark.asyncio
async def test_get_or_create_person_heals_drifted_email():
    """Regression guard for #394: if :Person.email drifted away from the
    OAuth email (e.g. an older session confirmed a CV that overwrote it
    before the fix), the next OAuth login must rewrite it back to the
    authoritative value from the provider."""
    from app.auth.router import _get_or_create_person
    from app.graph.encryption import decrypt_value, encrypt_value

    stale = encrypt_value("cv-parsed@example.com")
    db, session_mock = _build_person_lookup_db(stale)

    with patch(
        "app.auth.router.is_invite_code_required", AsyncMock(return_value=False)
    ):
        await _get_or_create_person(
            db,
            user_id="google-123",
            email="oauth@example.com",
            name="Test",
            picture="",
            provider="google",
        )

    # Two session.run calls: the initial GET_PERSON_BY_USER_ID and a
    # follow-up UPDATE_PERSON that writes the fresh encrypted email.
    assert session_mock.run.await_count >= 2
    second_call = session_mock.run.await_args_list[1]
    args, kwargs = second_call
    # UPDATE_PERSON template + user_id / properties kwargs
    assert "p += $properties" in args[0]
    assert kwargs["user_id"] == "google-123"
    props = kwargs["properties"]
    assert "email" in props
    assert decrypt_value(props["email"]) == "oauth@example.com"


@pytest.mark.asyncio
async def test_get_or_create_person_skips_update_when_email_matches():
    """No spurious write when the stored email already matches the OAuth
    email — avoids churning updated_at on every login."""
    from app.auth.router import _get_or_create_person
    from app.graph.encryption import encrypt_value

    stored = encrypt_value("oauth@example.com")
    db, session_mock = _build_person_lookup_db(stored)

    with patch(
        "app.auth.router.is_invite_code_required", AsyncMock(return_value=False)
    ):
        await _get_or_create_person(
            db,
            user_id="google-123",
            email="oauth@example.com",
            name="Test",
            picture="",
            provider="google",
        )

    # Only the initial lookup — no UPDATE_PERSON follow-up.
    assert session_mock.run.await_count == 1
