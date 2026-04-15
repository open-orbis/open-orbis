"""HTML email templates for the closed-beta invitation system.

Design notes — spam-friendly:
- White/light background, dark text (Gmail-safe)
- Minimal inline CSS, no external stylesheets or animations
- Purple brand orb as CSS gradient circles
- Single CTA button with brand purple
"""

from __future__ import annotations

from jinja2 import Environment

_env = Environment(autoescape=True)

# ── Shared layout with orb header ──

_LAYOUT = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background-color:#0f0a1a;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2dce8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0a1a;">
    <tr><td align="center" style="padding:40px 16px 32px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header with orb -->
        <tr><td style="background:linear-gradient(135deg,#1a1025 0%,#2d1b4e 40%,#1a1025 100%);border-radius:16px 16px 0 0;padding:40px 32px 36px;text-align:center;">
          <!-- Orb — simple table-based circle, no position:absolute or radial-gradient -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="width:56px;height:56px;border-radius:50%;background-color:#8b5cf6;text-align:center;vertical-align:middle;font-size:24px;line-height:56px;box-shadow:0 0 20px rgba(139,92,246,0.5);">
                  <span style="color:#e9e0ff;font-size:24px;">&#9679;</span>
                </td></tr>
              </table>
            </td></tr>
          </table>
          <!-- Brand name -->
          <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;margin-bottom:6px;">OpenOrbis</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.45);font-weight:400;">Your career as a knowledge graph</div>
        </td></tr>

        <!-- Content card -->
        <tr><td style="background-color:#1a1228;padding:36px 32px;border-left:1px solid #2d2440;border-right:1px solid #2d2440;">
          {{ content }}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#130e1e;border:1px solid #2d2440;border-top:none;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#9a8cb5;line-height:1.5;">
            Beyond the CV. Reimagined for the AI era.
          </p>
          <p style="margin:0;font-size:11px;color:#7a6d94;">
            &copy; {{ year }} Open Orbis &middot; <a href="https://open-orbis.com" style="color:#a78bfa;text-decoration:none;">open-orbis.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""

# ── CTA button (reusable) ──

_BUTTON = """\
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 0;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="background:linear-gradient(135deg,#9333ea 0%,#7c3aed 100%);border-radius:10px;box-shadow:0 2px 8px rgba(147,51,234,0.3);">
        <a href="{{ url }}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
          {{ label }}
        </a>
      </td></tr>
    </table>
  </td></tr>
</table>
"""

# ── Activation email (admin activates user) ──

_ACTIVATION_CONTENT = """\
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#f0ecf4;">
  You're in!
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#7c3aed;font-weight:500;">
  Your OpenOrbis account is ready
</p>
<p style="margin:0 0 16px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  Great news &mdash; your account has been approved for the beta program!
  You now have full access to build your career knowledge graph &mdash;
  queryable, shareable, and portable.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="width:4px;background:linear-gradient(180deg,#a78bfa,#7c3aed);border-radius:4px;"></td>
    <td style="padding:12px 16px;">
      <p style="margin:0;font-size:14px;color:#a89bc0;line-height:1.6;">
        Sign in and upload your CV to watch it transform into an interactive
        graph that both humans and AI agents can understand.
      </p>
    </td>
  </tr>
</table>
""" + _BUTTON.replace("{{ label }}", "Sign in to OpenOrbis")

# ── Invite code email ──

_INVITE_CODE_CONTENT = """\
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#f0ecf4;">
  You're invited.
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#7c3aed;font-weight:500;">
  Early access to OpenOrbis
</p>
<p style="margin:0 0 24px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  We're rolling out gradually and you've been selected for early access.
  Use the invite code below to activate your account.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
  <tr><td style="background:linear-gradient(135deg,#1e1535 0%,#251a40 100%);border:1px solid #3d2d5c;border-radius:12px;padding:20px;text-align:center;">
    <div style="font-size:11px;font-weight:600;color:#9a8cb5;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Your invite code</div>
    <div style="font-size:26px;font-weight:700;letter-spacing:4px;color:#7c3aed;font-family:'Courier New',Courier,monospace;">
      {{ code }}
    </div>
  </td></tr>
</table>
<p style="margin:16px 0 0;font-size:14px;color:#a89bc0;line-height:1.6;">
  Click the button below or enter the code manually on the activation page.
  This code is single-use.
</p>
""" + _BUTTON.replace("{{ label }}", "Activate your account")

# ── Compile templates ──

_activation_tpl = _env.from_string(
    _LAYOUT.replace("{{ content }}", _ACTIVATION_CONTENT)
)

_invite_code_tpl = _env.from_string(
    _LAYOUT.replace("{{ content }}", _INVITE_CODE_CONTENT)
)


# ── Access grant email (orb owner shares restricted orb with a recipient) ──

_ACCESS_GRANT_CONTENT = """\
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#f0ecf4;">
  {{ owner_name }} shared their Orbis with you.
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#7c3aed;font-weight:500;">
  Restricted access invitation
</p>
<p style="margin:0 0 16px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  You've been granted access to view {{ owner_name }}'s career
  knowledge graph on OpenOrbis. Sign in with this email address to
  open it.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="width:4px;background:linear-gradient(180deg,#a78bfa,#7c3aed);border-radius:4px;"></td>
    <td style="padding:12px 16px;">
      <p style="margin:0;font-size:14px;color:#a89bc0;line-height:1.6;">
        This invitation is tied to your email. Only people the owner has
        explicitly invited can view this Orbis.
      </p>
    </td>
  </tr>
</table>
""" + _BUTTON.replace("{{ label }}", "Open the Orbis")

_access_grant_tpl = _env.from_string(
    _LAYOUT.replace("{{ content }}", _ACCESS_GRANT_CONTENT)
)


def render_activation_email(*, activate_url: str) -> str:
    """Render the email sent when an admin activates a user directly."""
    from datetime import datetime, timezone

    return _activation_tpl.render(
        url=activate_url,
        year=datetime.now(timezone.utc).year,
    )


def render_invite_code_email(*, code: str, activate_url: str) -> str:
    """Render the email sent when an admin sends an invite code."""
    from datetime import datetime, timezone

    return _invite_code_tpl.render(
        code=code,
        url=activate_url,
        year=datetime.now(timezone.utc).year,
    )


def render_access_grant_email(*, owner_name: str, orb_url: str) -> str:
    """Render the email sent when an owner grants access to their orb."""
    from datetime import datetime, timezone

    return _access_grant_tpl.render(
        owner_name=owner_name,
        url=orb_url,
        year=datetime.now(timezone.utc).year,
    )


# ── CV ready email (processing succeeded) ──

_CV_READY_CONTENT = """\
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#f0ecf4;">
  Your Orbis is ready!
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#7c3aed;font-weight:500;">
  Processing complete
</p>
<p style="margin:0 0 16px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  We've finished analyzing your CV and extracted:
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr><td style="background:linear-gradient(135deg,#1e1535 0%,#251a40 100%);border:1px solid #3d2d5c;border-radius:12px;padding:20px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#7c3aed;font-family:'Courier New',Courier,monospace;">
      {{ node_count }} nodes &middot; {{ edge_count }} relationships
    </div>
  </td></tr>
</table>
<p style="margin:0 0 16px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  Thank you for your patience &mdash; we take care to produce a high-quality Orbis for each user.
</p>
<p style="margin:0 0 16px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  Review your extracted entries and make any adjustments before publishing.
</p>
""" + _BUTTON.replace("{{ label }}", "Review your Orbis")

# ── CV failed email (processing error) ──

_CV_FAILED_CONTENT = """\
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#f0ecf4;">
  CV processing needs attention
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#e65100;font-weight:500;">
  We hit a problem
</p>
<p style="margin:0 0 16px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  We couldn't fully process your CV. Please try uploading again or use manual entry to build your Orbis.
</p>
""" + _BUTTON.replace("{{ label }}", "Try again")

# ── CV cancelled email (admin stopped processing) ──

_CV_CANCELLED_CONTENT = """\
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#f0ecf4;">
  CV processing was stopped
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#e65100;font-weight:500;">
  Action needed
</p>
<p style="margin:0 0 16px;font-size:15px;color:#c4bbd4;line-height:1.7;">
  Your CV processing was stopped by our team. This usually happens when we detect an issue. Please try uploading again.
</p>
""" + _BUTTON.replace("{{ label }}", "Upload again")

# ── Compile templates ──

_cv_ready_tpl = _env.from_string(_LAYOUT.replace("{{ content }}", _CV_READY_CONTENT))

_cv_failed_tpl = _env.from_string(_LAYOUT.replace("{{ content }}", _CV_FAILED_CONTENT))

_cv_cancelled_tpl = _env.from_string(
    _LAYOUT.replace("{{ content }}", _CV_CANCELLED_CONTENT)
)


def render_cv_ready_email(*, review_url: str, node_count: int, edge_count: int) -> str:
    """Render the email sent when CV processing succeeds."""
    from datetime import datetime, timezone

    return _cv_ready_tpl.render(
        url=review_url,
        node_count=node_count,
        edge_count=edge_count,
        year=datetime.now(timezone.utc).year,
    )


def render_cv_failed_email(*, retry_url: str) -> str:
    """Render the email sent when CV processing fails."""
    from datetime import datetime, timezone

    return _cv_failed_tpl.render(
        url=retry_url,
        year=datetime.now(timezone.utc).year,
    )


def render_cv_cancelled_email(*, retry_url: str) -> str:
    """Render the email sent when an admin cancels CV processing."""
    from datetime import datetime, timezone

    return _cv_cancelled_tpl.render(
        url=retry_url,
        year=datetime.now(timezone.utc).year,
    )
