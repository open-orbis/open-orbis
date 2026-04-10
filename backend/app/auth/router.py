import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver
from pydantic import BaseModel

from app.admin.service import (
    activate_person,
    consume_access_code,
    is_invite_code_required,
    validate_access_code,
)
from app.auth.models import (
    OAuthCodeRequest,
    TokenResponse,
    UserInfo,
)
from app.auth.service import (
    create_jwt,
    exchange_google_code,
    exchange_linkedin_code,
    generate_orb_id,
)
from app.config import settings
from app.dependencies import get_current_user, get_db
from app.email.service import send_activation_email
from app.graph.encryption import encrypt_value
from app.graph.queries import CREATE_PERSON, GET_PERSON_BY_USER_ID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


async def _get_or_create_person(
    db: AsyncDriver,
    *,
    user_id: str,
    email: str,
    name: str,
    picture: str,
    provider: str,
) -> None:
    """Create a Person node if it doesn't exist yet.

    In the new flow, registration always succeeds — the invite code gate
    happens later on the /auth/activate endpoint, not at signup time.
    If the platform is open (invite code not required), the user is
    auto-activated with a special signup_code so they stay activated
    even if the admin later closes the platform.
    """
    async with db.session() as session:
        result = await session.run(GET_PERSON_BY_USER_ID, user_id=user_id)
        if await result.single() is not None:
            return

    invite_required = await is_invite_code_required(db)
    signup_code = None if invite_required else "open-registration"

    orb_id = await generate_orb_id(name, db)
    async with db.session() as session:
        await session.run(
            CREATE_PERSON,
            user_id=user_id,
            email=encrypt_value(email),
            name=name,
            orb_id=orb_id,
            picture=picture,
            provider=provider,
            signup_code=signup_code,
        )


@router.post("/google", response_model=TokenResponse)
async def google_login(
    body: OAuthCodeRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Exchange a Google authorization code for a JWT."""
    try:
        userinfo = await exchange_google_code(body.code)
    except Exception as e:
        logger.error("Google OAuth failed: %s", e)
        raise HTTPException(
            status_code=401, detail="Google authentication failed"
        ) from None

    user_id = f"google-{userinfo['sub']}"
    email = userinfo["email"]
    name = userinfo["name"]
    picture = userinfo["picture"]

    await _get_or_create_person(
        db, user_id=user_id, email=email, name=name, picture=picture, provider="google"
    )

    token = create_jwt(user_id, email)
    return TokenResponse(
        access_token=token,
        user=UserInfo(user_id=user_id, email=email, name=name, picture=picture),
    )


@router.post("/linkedin", response_model=TokenResponse)
async def linkedin_login(
    body: OAuthCodeRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Exchange a LinkedIn authorization code for a JWT."""
    try:
        userinfo = await exchange_linkedin_code(
            body.code, settings.linkedin_redirect_uri
        )
    except Exception as e:
        logger.error("LinkedIn OAuth failed: %s", e)
        raise HTTPException(
            status_code=401, detail="LinkedIn authentication failed"
        ) from None

    user_id = f"linkedin-{userinfo['sub']}"
    email = userinfo["email"]
    name = userinfo["name"]
    picture = userinfo["picture"]

    await _get_or_create_person(
        db,
        user_id=user_id,
        email=email,
        name=name,
        picture=picture,
        provider="linkedin",
    )

    token = create_jwt(user_id, email)
    return TokenResponse(
        access_token=token,
        user=UserInfo(user_id=user_id, email=email, name=name, picture=picture),
    )


@router.get("/me", response_model=UserInfo)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(
            GET_PERSON_BY_USER_ID, user_id=current_user["user_id"]
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")

        person = dict(record["p"])
        is_admin_user = bool(person.get("is_admin", False))
        has_code = person.get("signup_code") is not None
        invite_required = await is_invite_code_required(db)
        activated = not invite_required or is_admin_user or has_code
        deletion_at = person.get("deletion_requested_at")
        days_left = _days_remaining(str(deletion_at)) if deletion_at else None

        return UserInfo(
            user_id=person["user_id"],
            email=current_user["email"],
            name=person.get("name", ""),
            picture=person.get("picture", ""),
            profile_image=person.get("profile_image", ""),
            gdpr_consent=bool(person.get("gdpr_consent", False)),
            is_admin=is_admin_user,
            activated=activated,
            deletion_requested_at=str(deletion_at) if deletion_at else None,
            deletion_days_remaining=days_left,
        )


class ActivateRequest(BaseModel):
    code: str


@router.post("/activate")
async def activate(
    body: ActivateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Validate and consume an invite code, activating the current user.

    This is the gate that blocks platform access after login: the frontend
    redirects non-activated users here until they provide a valid code.
    """
    user_id = current_user["user_id"]

    # Validate (non-atomic, for a precise error message)
    rejection = await validate_access_code(db, body.code)
    if rejection is not None:
        detail = (
            "code_already_used"
            if rejection == "code_already_used"
            else "invalid_access_code"
        )
        raise HTTPException(status_code=403, detail=detail)

    # Atomically consume (race-safe)
    consumed = await consume_access_code(db, body.code, user_id)
    if not consumed:
        raise HTTPException(status_code=403, detail="code_already_used")

    # Mark the Person as activated
    await activate_person(db, user_id, body.code)

    # Best-effort confirmation email
    email = current_user.get("email")
    if email:
        await send_activation_email(to=email, frontend_url=settings.frontend_url)

    return {"status": "activated"}


@router.post("/gdpr-consent")
async def grant_gdpr_consent(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Record GDPR consent for the current user."""
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "SET p.gdpr_consent = true, p.gdpr_consent_at = $now",
            user_id=current_user["user_id"],
            now=datetime.now(timezone.utc).isoformat(),
        )
    return {"status": "ok"}


GRACE_PERIOD_DAYS = 30


def _days_remaining(deletion_requested_at: str) -> int:
    """Calculate days remaining before permanent deletion."""
    requested = datetime.fromisoformat(deletion_requested_at)
    if requested.tzinfo is None:
        requested = requested.replace(tzinfo=timezone.utc)
    deadline = requested + __import__("datetime").timedelta(days=GRACE_PERIOD_DAYS)
    remaining = (deadline - datetime.now(timezone.utc)).days
    return max(0, remaining)


@router.delete("/me")
async def delete_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Schedule account for deletion. Data is permanently removed after 30 days."""
    now = datetime.now(timezone.utc).isoformat()
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) SET p.deletion_requested_at = $now",
            user_id=current_user["user_id"],
            now=now,
        )
    return {
        "status": "scheduled",
        "message": f"Account scheduled for deletion. You have {GRACE_PERIOD_DAYS} days to recover it.",
    }


@router.post("/me/recover")
async def recover_account(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Cancel a pending account deletion and restore the account."""
    async with db.session() as session:
        result = await session.run(
            GET_PERSON_BY_USER_ID, user_id=current_user["user_id"]
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")

        person = dict(record["p"])
        if not person.get("deletion_requested_at"):
            return {"status": "ok", "message": "Account is not scheduled for deletion."}

        await session.run(
            "MATCH (p:Person {user_id: $user_id}) REMOVE p.deletion_requested_at",
            user_id=current_user["user_id"],
        )
    return {"status": "recovered", "message": "Account restored successfully."}
