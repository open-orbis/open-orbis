"""Tests for the email service (Resend) and templates."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.email.templates import render_activation_email, render_invite_code_email

# ── Template rendering ──


def test_render_activation_email():
    html = render_activation_email(activate_url="https://app.example.com")
    assert "https://app.example.com" in html
    assert "OpenOrbis" in html
    assert "activated" in html
    assert "Open OpenOrbis" in html


def test_render_invite_code_email():
    html = render_invite_code_email(
        code="test-abc-123",
        activate_url="https://app.example.com/activate?code=test-abc-123",
    )
    assert "test-abc-123" in html
    assert "invited" in html.lower()
    assert "https://app.example.com/activate?code=test-abc-123" in html
    assert "Activate your account" in html


# ── Email sending ──


@pytest.mark.asyncio
async def test_send_email_skips_when_not_configured():
    from app.email.service import send_email

    with patch("app.email.service.settings") as mock_settings:
        mock_settings.resend_api_key = ""
        result = await send_email(
            to="user@example.com",
            subject="Test",
            html_body="<p>Hello</p>",
        )
    assert result is False


@pytest.mark.asyncio
async def test_send_email_calls_resend():
    from app.email.service import send_email

    mock_send = MagicMock(return_value={"id": "fake-id"})

    with (
        patch("app.email.service.settings") as mock_settings,
        patch("app.email.service.resend") as mock_resend,
    ):
        mock_settings.resend_api_key = "re_test_key"
        mock_settings.email_from = "OpenOrbis <noreply@example.com>"
        mock_resend.Emails.send = mock_send

        result = await send_email(
            to="user@example.com",
            subject="Test Subject",
            html_body="<p>Hello</p>",
        )

    assert result is True
    mock_send.assert_called_once_with(
        {
            "from": "OpenOrbis <noreply@example.com>",
            "to": ["user@example.com"],
            "subject": "Test Subject",
            "html": "<p>Hello</p>",
        }
    )


@pytest.mark.asyncio
async def test_send_email_returns_false_on_error():
    from app.email.service import send_email

    with (
        patch("app.email.service.settings") as mock_settings,
        patch("app.email.service.resend") as mock_resend,
    ):
        mock_settings.resend_api_key = "re_test_key"
        mock_settings.email_from = "OpenOrbis <noreply@example.com>"
        mock_resend.Emails.send.side_effect = Exception("API error")

        result = await send_email(
            to="user@example.com",
            subject="Test",
            html_body="<p>Hello</p>",
        )

    assert result is False


@pytest.mark.asyncio
async def test_send_activation_email():
    from app.email.service import send_activation_email

    with patch(
        "app.email.service.send_email",
        new_callable=AsyncMock,
        return_value=True,
    ) as mock_send:
        result = await send_activation_email(
            to="user@example.com",
            frontend_url="https://app.example.com",
        )

    assert result is True
    mock_send.assert_awaited_once()
    call_kwargs = mock_send.call_args[1]
    assert call_kwargs["to"] == "user@example.com"
    assert "active" in call_kwargs["subject"].lower()
    assert "OpenOrbis" in call_kwargs["html_body"]


@pytest.mark.asyncio
async def test_send_invite_code_email():
    from app.email.service import send_invite_code_email

    with patch(
        "app.email.service.send_email",
        new_callable=AsyncMock,
        return_value=True,
    ) as mock_send:
        result = await send_invite_code_email(
            to="user@example.com",
            code="my-code-123",
            frontend_url="https://app.example.com",
        )

    assert result is True
    mock_send.assert_awaited_once()
    call_kwargs = mock_send.call_args[1]
    assert call_kwargs["to"] == "user@example.com"
    assert "invite" in call_kwargs["subject"].lower()
    assert "my-code-123" in call_kwargs["html_body"]
    assert (
        "https://app.example.com/activate?code=my-code-123" in call_kwargs["html_body"]
    )
