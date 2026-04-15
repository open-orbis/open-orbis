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
        subject="You're in! Your OpenOrbis account is ready",
        html_body=html,
    )


async def send_invite_code_email(*, to: str, code: str, frontend_url: str) -> bool:
    """Send an invite code to a user so they can self-activate."""
    from app.email.templates import render_invite_code_email

    activate_url = f"{frontend_url}/activate?code={code}"
    html = render_invite_code_email(code=code, activate_url=activate_url)
    return await send_email(
        to=to,
        subject="Your OpenOrbis invite code",
        html_body=html,
    )


async def send_access_grant_email(*, to: str, owner_name: str, orb_url: str) -> bool:
    """Notify a recipient that an owner granted them access to a restricted orb."""
    from app.email.templates import render_access_grant_email

    html = render_access_grant_email(owner_name=owner_name, orb_url=orb_url)
    return await send_email(
        to=to,
        subject=f"{owner_name} shared their Orbis with you",
        html_body=html,
    )


async def send_cv_ready_email(
    *, to: str, job_id: str, node_count: int, edge_count: int, frontend_url: str
) -> bool:
    """Notify user that CV processing succeeded."""
    from app.email.templates import render_cv_ready_email

    review_url = f"{frontend_url}/myorbis?review={job_id}"
    html = render_cv_ready_email(
        review_url=review_url, node_count=node_count, edge_count=edge_count
    )
    return await send_email(to=to, subject="Your Orbis is ready!", html_body=html)


async def send_cv_failed_email(*, to: str, frontend_url: str) -> bool:
    """Notify user that CV processing failed."""
    from app.email.templates import render_cv_failed_email

    html = render_cv_failed_email(retry_url=f"{frontend_url}/create")
    return await send_email(to=to, subject="CV processing needs attention", html_body=html)


async def send_cv_cancelled_email(*, to: str, frontend_url: str) -> bool:
    """Notify user that an admin cancelled their CV processing."""
    from app.email.templates import render_cv_cancelled_email

    html = render_cv_cancelled_email(retry_url=f"{frontend_url}/create")
    return await send_email(to=to, subject="CV processing was stopped", html_body=html)
