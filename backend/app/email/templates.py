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
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f1fa;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1fa;">
    <tr><td align="center" style="padding:40px 16px 32px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header with orb -->
        <tr><td style="background:linear-gradient(135deg,#1a1025 0%,#2d1b4e 40%,#1a1025 100%);border-radius:16px 16px 0 0;padding:40px 32px 36px;text-align:center;">
          <!-- Orb -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td>
              <div style="width:72px;height:72px;margin:0 auto;position:relative;">
                <!-- Outer glow -->
                <div style="width:72px;height:72px;border-radius:50%;background:radial-gradient(circle at 35% 35%,rgba(167,139,250,0.35) 0%,rgba(124,58,237,0.15) 50%,transparent 70%);"></div>
                <!-- Inner orb -->
                <div style="width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 38% 35%,#c4b5fd 0%,#a78bfa 30%,#8b5cf6 60%,#7c3aed 100%);position:absolute;top:14px;left:14px;box-shadow:0 0 24px rgba(167,139,250,0.5),0 0 48px rgba(124,58,237,0.25);"></div>
              </div>
            </td></tr>
          </table>
          <!-- Brand name -->
          <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;margin-bottom:6px;">OpenOrbis</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.45);font-weight:400;">Your career as a knowledge graph</div>
        </td></tr>

        <!-- Content card -->
        <tr><td style="background-color:#ffffff;padding:36px 32px;border-left:1px solid #e8e2f0;border-right:1px solid #e8e2f0;">
          {{ content }}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#faf8fc;border:1px solid #e8e2f0;border-top:none;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#9a8cb5;line-height:1.5;">
            Beyond the CV. Reimagined for the AI era.
          </p>
          <p style="margin:0;font-size:11px;color:#c4bbd4;">
            &copy; {{ year }} Open Orbis &middot; <a href="https://open-orbis.com" style="color:#9a8cb5;text-decoration:none;">open-orbis.com</a>
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
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#1a1025;">
  You're in.
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#7c3aed;font-weight:500;">
  Welcome to the early access program
</p>
<p style="margin:0 0 16px;font-size:15px;color:#4a4458;line-height:1.7;">
  Your OpenOrbis account has been activated. You now have full access
  to build your career knowledge graph &mdash; queryable, shareable, and
  portable.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="width:4px;background:linear-gradient(180deg,#a78bfa,#7c3aed);border-radius:4px;"></td>
    <td style="padding:12px 16px;">
      <p style="margin:0;font-size:14px;color:#6b5f7d;line-height:1.6;">
        Upload your CV and watch it transform into an interactive graph
        that both humans and AI agents can understand.
      </p>
    </td>
  </tr>
</table>
""" + _BUTTON.replace("{{ label }}", "Open OpenOrbis")

# ── Invite code email ──

_INVITE_CODE_CONTENT = """\
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#1a1025;">
  You're invited.
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#7c3aed;font-weight:500;">
  Early access to OpenOrbis
</p>
<p style="margin:0 0 24px;font-size:15px;color:#4a4458;line-height:1.7;">
  We're rolling out gradually and you've been selected for early access.
  Use the invite code below to activate your account.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
  <tr><td style="background:linear-gradient(135deg,#f5f0ff 0%,#ede5ff 100%);border:1px solid #e4ddf7;border-radius:12px;padding:20px;text-align:center;">
    <div style="font-size:11px;font-weight:600;color:#9a8cb5;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Your invite code</div>
    <div style="font-size:26px;font-weight:700;letter-spacing:4px;color:#7c3aed;font-family:'Courier New',Courier,monospace;">
      {{ code }}
    </div>
  </td></tr>
</table>
<p style="margin:16px 0 0;font-size:14px;color:#6b5f7d;line-height:1.6;">
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
<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#1a1025;">
  {{ owner_name }} shared their Orbis with you.
</h1>
<p style="margin:0 0 24px;font-size:14px;color:#7c3aed;font-weight:500;">
  Restricted access invitation
</p>
<p style="margin:0 0 16px;font-size:15px;color:#4a4458;line-height:1.7;">
  You've been granted access to view {{ owner_name }}'s career
  knowledge graph on OpenOrbis. Sign in with this email address to
  open it.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td style="width:4px;background:linear-gradient(180deg,#a78bfa,#7c3aed);border-radius:4px;"></td>
    <td style="padding:12px 16px;">
      <p style="margin:0;font-size:14px;color:#6b5f7d;line-height:1.6;">
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
