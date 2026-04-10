"""Email sending service via Resend."""

from __future__ import annotations

import logging

import resend

from app.config import settings

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    return bool(settings.resend_api_key)


async def send_email(*, to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via Resend. Returns True on success, False if
    Resend is not configured or sending fails (best-effort, never raises)."""
    if not _is_configured():
        logger.debug("Resend not configured — skipping email to %s", to)
        return False

    resend.api_key = settings.resend_api_key

    try:
        resend.Emails.send(
            {
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html_body,
            }
        )
        logger.info("Email sent to %s — subject: %s", to, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


async def send_activation_email(*, to: str, frontend_url: str) -> bool:
    """Send activation confirmation email to a user activated by admin."""
    from app.email.templates import render_activation_email

    html = render_activation_email(activate_url=frontend_url)
    return await send_email(
        to=to,
        subject="Your OpenOrbis account is active",
        html_body=html,
    )


async def send_invite_code_email(
    *, to: str, code: str, frontend_url: str
) -> bool:
    """Send an invite code to a user so they can self-activate."""
    from app.email.templates import render_invite_code_email

    activate_url = f"{frontend_url}/activate?code={code}"
    html = render_invite_code_email(code=code, activate_url=activate_url)
    return await send_email(
        to=to,
        subject="Your OpenOrbis invite code",
        html_body=html,
    )
