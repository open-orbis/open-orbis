"""Dev-login endpoint — available only when ENV=development.

Bypasses OAuth to create a fully operational test user in one API call:
creates the Person node, grants GDPR consent, auto-activates, and mints
a complete session (access + refresh cookies).  Returns 404 in production.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from neo4j import AsyncDriver
from pydantic import BaseModel

from app.auth.models import TokenResponse, UserInfo
from app.auth.refresh_tokens import issue_refresh_token
from app.auth.service import create_jwt, generate_orb_id, set_auth_cookies
from app.config import settings
from app.dependencies import get_db
from app.graph.encryption import encrypt_value
from app.graph.queries import CREATE_PERSON

dev_router = APIRouter()


class DevLoginRequest(BaseModel):
    name: str
    email: str


@dev_router.post("/dev-login", response_model=TokenResponse)
async def dev_login(
    request: Request,
    response: Response,
    body: DevLoginRequest,
    db: AsyncDriver = Depends(get_db),
):
    """Create or reuse a dev user and issue a full session.

    The user is auto-activated and GDPR-consented so they can immediately
    navigate the app without manual steps.
    """
    if settings.env != "development":
        raise HTTPException(status_code=404)

    user_id = f"dev-{uuid.uuid4().hex[:12]}"

    # Reuse existing user if email matches
    async with db.session() as session:
        result = await session.run(
            "MATCH (p:Person) WHERE p.email = $enc_email RETURN p.user_id AS uid",
            enc_email=encrypt_value(body.email),
        )
        record = await result.single()
        if record:
            user_id = record["uid"]
        else:
            orb_id = await generate_orb_id(body.name, db)
            await session.run(
                CREATE_PERSON,
                user_id=user_id,
                email=encrypt_value(body.email),
                name=body.name,
                orb_id=orb_id,
                picture="",
                provider="dev",
                signup_code="dev-auto",
            )

    # Auto-grant GDPR consent and activate
    async with db.session() as session:
        await session.run(
            "MATCH (p:Person {user_id: $uid}) "
            "SET p.gdpr_consent = true, "
            "    p.gdpr_consent_at = $now, "
            "    p.signup_code = coalesce(p.signup_code, 'dev-auto')",
            uid=user_id,
            now=datetime.now(timezone.utc).isoformat(),
        )

    # Issue session (access + refresh cookies)
    access_token = create_jwt(user_id, body.email)
    refresh_raw, _token_id, refresh_expires_at = await issue_refresh_token(
        db,
        user_id=user_id,
        ttl_days=settings.refresh_token_expire_days,
        user_agent=request.headers.get("user-agent", ""),
    )
    set_auth_cookies(
        response,
        access_token=access_token,
        refresh_raw=refresh_raw,
        refresh_expires_at=refresh_expires_at,
    )

    return TokenResponse(
        access_token=access_token,
        user=UserInfo(
            user_id=user_id,
            email=body.email,
            name=body.name,
            gdpr_consent=True,
            activated=True,
        ),
    )
