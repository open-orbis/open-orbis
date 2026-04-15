import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from neo4j import AsyncDriver
from pydantic import BaseModel

from app.admin.service import (
    activate_person,
    consume_access_code,
    is_invite_code_required,
)
from app.auth.mcp_keys import (
    create_api_key,
    list_api_keys,
    revoke_api_key,
)
from app.auth.models import (
    OAuthCodeRequest,
    TokenResponse,
    UserInfo,
)
from app.auth.refresh_tokens import (
    issue_refresh_token,
    revoke_all_for_user,
    revoke_refresh_token,
    rotate_refresh_token,
)
from app.auth.service import (
    REFRESH_COOKIE,
    clear_auth_cookies,
    create_jwt,
    exchange_google_code,
    exchange_linkedin_code,
    generate_orb_id,
    set_auth_cookies,
)
from app.config import settings
from app.dependencies import get_current_user, get_db
from app.email.service import send_activation_email
from app.graph.encryption import decrypt_value, encrypt_value
from app.graph.queries import CREATE_PERSON, GET_PERSON_BY_USER_ID
from app.rate_limit import limiter

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
) -> bool:
    """Create a Person node if it doesn't exist yet. Returns activation status.

    In the new flow, registration always succeeds — the invite code gate
    happens later on the /auth/activate endpoint, not at signup time.
    If the platform is open (invite code not required), the user is
    auto-activated with a special signup_code so they stay activated
    even if the admin later closes the platform.
    """
    invite_required = await is_invite_code_required(db)

    async with db.session() as session:
        result = await session.run(GET_PERSON_BY_USER_ID, user_id=user_id)
        record = await result.single()
        if record is not None:
            person = dict(record["p"])
            is_admin_user = bool(person.get("is_admin", False))
            has_code = person.get("signup_code") is not None
            return not invite_required or is_admin_user or has_code

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
    # New user: activated only if platform is open
    return not invite_required


async def _issue_session(
    response: Response,
    *,
    db: AsyncDriver,
    user_id: str,
    email: str,
    user_agent: str,
) -> str:
    """Mint an access+refresh pair and attach them as cookies. Returns the
    access token so the legacy TokenResponse body can still populate its
    access_token field during the frontend migration window."""
    access_token = create_jwt(user_id, email)
    refresh_raw, _token_id, refresh_expires_at = await issue_refresh_token(
        db,
        user_id=user_id,
        ttl_days=settings.refresh_token_expire_days,
        user_agent=user_agent,
    )
    set_auth_cookies(
        response,
        access_token=access_token,
        refresh_raw=refresh_raw,
        refresh_expires_at=refresh_expires_at,
    )
    return access_token


@router.post("/google", response_model=TokenResponse)
@limiter.limit("5/minute")
async def google_login(
    request: Request,
    response: Response,
    body: OAuthCodeRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Exchange a Google authorization code for a session (access + refresh cookies)."""
    try:
        userinfo = await exchange_google_code(body.code)
    except Exception as e:
        # Log only the exception class — the %s of an httpx HTTPStatusError
        # can surface the Google token-endpoint response body, which may
        # contain the leaked authorization code or a correlation id useful
        # to replay against us.
        logger.error("Google OAuth failed (%s)", type(e).__name__)
        raise HTTPException(
            status_code=401, detail="Google authentication failed"
        ) from None

    user_id = f"google-{userinfo['sub']}"
    email = userinfo["email"]
    name = userinfo["name"]
    picture = userinfo["picture"]

    activated = await _get_or_create_person(
        db, user_id=user_id, email=email, name=name, picture=picture, provider="google"
    )

    access_token = await _issue_session(
        response,
        db=db,
        user_id=user_id,
        email=email,
        user_agent=request.headers.get("user-agent", ""),
    )
    return TokenResponse(
        access_token=access_token,
        user=UserInfo(
            user_id=user_id,
            email=email,
            name=name,
            picture=picture,
            activated=activated,
        ),
    )


@router.post("/linkedin", response_model=TokenResponse)
@limiter.limit("5/minute")
async def linkedin_login(
    request: Request,
    response: Response,
    body: OAuthCodeRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Exchange a LinkedIn authorization code for a session (access + refresh cookies)."""
    try:
        userinfo = await exchange_linkedin_code(
            body.code, settings.linkedin_redirect_uri
        )
    except Exception as e:
        logger.error("LinkedIn OAuth failed (%s)", type(e).__name__)
        raise HTTPException(
            status_code=401, detail="LinkedIn authentication failed"
        ) from None

    user_id = f"linkedin-{userinfo['sub']}"
    email = userinfo["email"]
    name = userinfo["name"]
    picture = userinfo["picture"]

    activated = await _get_or_create_person(
        db,
        user_id=user_id,
        email=email,
        name=name,
        picture=picture,
        provider="linkedin",
    )

    access_token = await _issue_session(
        response,
        db=db,
        user_id=user_id,
        email=email,
        user_agent=request.headers.get("user-agent", ""),
    )
    return TokenResponse(
        access_token=access_token,
        user=UserInfo(
            user_id=user_id,
            email=email,
            name=name,
            picture=picture,
            activated=activated,
        ),
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

        raw_waitlist_joined = person.get("waitlist_joined")
        waitlist_joined = (
            raw_waitlist_joined if isinstance(raw_waitlist_joined, bool) else False
        )

        return UserInfo(
            user_id=person["user_id"],
            email=current_user["email"],
            name=person.get("name", ""),
            picture=person.get("picture", ""),
            profile_image=person.get("profile_image", ""),
            gdpr_consent=bool(person.get("gdpr_consent", False)),
            is_admin=is_admin_user,
            activated=activated,
            waitlist_joined=waitlist_joined,
            waitlist_joined_at=(
                str(person["waitlist_joined_at"])
                if person.get("waitlist_joined_at")
                else None
            ),
            deletion_requested_at=str(deletion_at) if deletion_at else None,
            deletion_days_remaining=days_left,
        )


class ActivateRequest(BaseModel):
    code: str


@router.post("/activate")
@limiter.limit("5/minute")
async def activate(
    request: Request,
    body: ActivateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Validate and consume an invite code, activating the current user.

    This is the gate that blocks platform access after login: the frontend
    redirects non-activated users here until they provide a valid code.

    The validation/consume step used to be split in two queries for a
    precise error message. That leaked a timing side-channel: unused valid
    codes took two queries, everything else took one, letting an attacker
    enumerate the 16M-entry code space. We now run the single atomic
    CONSUME_ACCESS_CODE and return a unified error on any failure.
    """
    if not body.code:
        raise HTTPException(status_code=403, detail="invalid_access_code")

    user_id = current_user["user_id"]

    consumed = await consume_access_code(db, body.code, user_id)
    if not consumed:
        raise HTTPException(status_code=403, detail="invalid_access_code")

    await activate_person(db, user_id, body.code)

    # Best-effort confirmation email
    email = current_user.get("email")
    if email:
        await send_activation_email(to=email, frontend_url=settings.frontend_url)

    return {"status": "activated"}


def _refresh_failed(detail: str) -> JSONResponse:
    """Return a 401 with both auth cookies cleared in the same response.

    We cannot raise HTTPException here because raising would throw away
    any cookie mutations we made on the response object — FastAPI builds
    a fresh JSONResponse from the exception. Returning a hand-built
    JSONResponse lets us ship the Set-Cookie headers along with the 401.
    """
    resp = JSONResponse(status_code=401, content={"detail": detail})
    clear_auth_cookies(resp)
    return resp


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncDriver = Depends(get_db),
):
    """Rotate the refresh token cookie and mint a new access token.

    Called transparently by the frontend axios interceptor when an API
    call returns 401 because the access cookie expired. On success, the
    old refresh token is revoked (with replaced_by pointing to the new
    one) and fresh cookies are set. If the presented token is missing,
    expired, or already rotated (reuse attack), both cookies are cleared
    and the client is forced back to /login.
    """
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        return _refresh_failed("no refresh token")

    result = await rotate_refresh_token(
        db,
        raw_token=raw,
        ttl_days=settings.refresh_token_expire_days,
        user_agent=request.headers.get("user-agent", ""),
    )
    if result is None:
        return _refresh_failed("invalid refresh token")

    raw_new, _new_token_id, user_id, expires_at = result

    # The access token carries the email claim, so we need to fetch the
    # current email from Neo4j (it's encrypted at rest).
    email = ""
    async with db.session() as session:
        rec = await (await session.run(GET_PERSON_BY_USER_ID, user_id=user_id)).single()
        if rec is None:
            return _refresh_failed("user not found")
        person = dict(rec["p"])
        enc_email = person.get("email", "")
        if enc_email:
            try:
                email = decrypt_value(enc_email)
            except Exception as exc:
                logger.warning("refresh: could not decrypt email: %s", exc)

    access_token = create_jwt(user_id, email)
    set_auth_cookies(
        response,
        access_token=access_token,
        refresh_raw=raw_new,
        refresh_expires_at=expires_at,
    )
    return {"status": "refreshed"}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncDriver = Depends(get_db),
):
    """Revoke the current refresh token and clear both auth cookies."""
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        try:
            await revoke_refresh_token(db, raw_token=raw)
        except Exception as exc:
            logger.warning("logout: revoke failed: %s", exc)
    clear_auth_cookies(response)
    return {"status": "logged_out"}


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


@router.post("/waitlist/join")
@limiter.limit("10/minute")
async def join_waitlist(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Explicitly opt into the waitlist for non-activated users."""
    async with db.session() as session:
        result = await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "SET p.waitlist_joined = true, "
            "    p.waitlist_joined_at = coalesce(p.waitlist_joined_at, datetime()), "
            "    p.updated_at = datetime() "
            "RETURN p.waitlist_joined_at AS joined_at",
            user_id=current_user["user_id"],
        )
        record = await result.single()
        if record is None:
            raise HTTPException(status_code=404, detail="User not found")

    joined_at = record.get("joined_at")
    return {
        "status": "joined",
        "waitlist_joined_at": str(joined_at) if joined_at else None,
    }


# ── MCP API keys (machine credentials for the MCP server) ────────────


class ApiKeyCreateRequest(BaseModel):
    label: str = ""


@router.post("/api-keys")
@limiter.limit("10/minute")
async def create_api_key_endpoint(
    request: Request,
    body: ApiKeyCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Mint a new MCP API key for the current user.

    The raw key is returned exactly once; the server only persists its
    hash. The frontend must surface it to the user immediately with a
    "copy once, can't see again" note.
    """
    raw_key, meta = await create_api_key(
        db, user_id=current_user["user_id"], label=body.label
    )
    return {"api_key": raw_key, **meta}


@router.get("/api-keys")
async def list_api_keys_endpoint(
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """List the current user's MCP API keys (metadata only, never the raw key)."""
    keys = await list_api_keys(db, user_id=current_user["user_id"])
    return {"keys": keys}


@router.delete("/api-keys/{key_id}")
async def revoke_api_key_endpoint(
    key_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Revoke an MCP API key owned by the current user."""
    ok = await revoke_api_key(db, user_id=current_user["user_id"], key_id=key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "revoked"}


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
    response: Response,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Schedule account for deletion. Data is permanently removed after 30 days."""
    now = datetime.now(timezone.utc).isoformat()
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $user_id}) "
            "SET p.deletion_requested_at = $now, "
            "    p.waitlist_joined = false, "
            "    p.waitlist_joined_at = null, "
            "    p.updated_at = datetime()",
            user_id=current_user["user_id"],
            now=now,
        )
    # Revoke every refresh token so the grace-period UI can't be reached
    # from any stale device, and clear the current session cookies.
    try:
        await revoke_all_for_user(db, user_id=current_user["user_id"])
    except Exception as exc:
        logger.warning("delete_me: revoke refresh tokens failed: %s", exc)
    clear_auth_cookies(response)
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
