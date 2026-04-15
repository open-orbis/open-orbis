import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Response
from jose import jwt
from neo4j import AsyncDriver

from app.config import settings
from app.graph.queries import GET_PERSON_BY_ORB_ID

logger = logging.getLogger(__name__)

# Cookie names. The refresh cookie is scoped to /auth so it is never sent
# with regular API traffic — minimizes exposure.
ACCESS_COOKIE = "orbis_access"
REFRESH_COOKIE = "orbis_refresh"
REFRESH_COOKIE_PATH = "/"


def create_jwt(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _cookie_flags() -> dict:
    is_prod = settings.env != "development"
    return {
        "httponly": True,
        "secure": is_prod,
        "samesite": "none" if is_prod else "lax",
        "domain": settings.cookie_domain or None,
    }


def set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_raw: str,
    refresh_expires_at: datetime,
) -> None:
    """Attach access + refresh cookies to a response.

    Access cookie: short-lived, path=/ so every /api request carries it.
    Refresh cookie: long-lived, path=/auth so only /auth/refresh and
    /auth/logout see it, reducing leak surface via XSS bugs elsewhere.
    """
    flags = _cookie_flags()
    now = datetime.now(timezone.utc)
    access_max_age = settings.jwt_expire_minutes * 60
    refresh_max_age = max(int((refresh_expires_at - now).total_seconds()), 0)

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=access_max_age,
        path="/",
        **flags,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_raw,
        max_age=refresh_max_age,
        path=REFRESH_COOKIE_PATH,
        **flags,
    )


def clear_auth_cookies(response: Response) -> None:
    flags = _cookie_flags()
    response.delete_cookie(key=ACCESS_COOKIE, path="/", **flags)
    response.delete_cookie(key=REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, **flags)


async def exchange_google_code(code: str) -> dict:
    """Exchange a Google authorization code for user info."""
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": "postmessage",
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_resp.raise_for_status()
        info = userinfo_resp.json()

    return {
        "sub": info["sub"],
        "email": info.get("email", ""),
        "name": info.get("name", ""),
        "picture": info.get("picture", ""),
    }


async def exchange_linkedin_code(
    code: str,
    redirect_uri: str,
    client_id: str | None = None,
    client_secret: str | None = None,
    fetch_userinfo: bool = True,
) -> dict:
    """Exchange a LinkedIn authorization code for access token (+ optional user info).

    Args:
        client_id/client_secret: Override credentials (needed because login and
            data-portability use two separate LinkedIn apps).
        fetch_userinfo: If False, skip the userinfo call (data-portability app
            does not have the openid scope).
    """
    cid = client_id or settings.linkedin_client_id
    csecret = client_secret or settings.linkedin_client_secret

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://www.linkedin.com/oauth/v2/accessToken",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": cid,
                "client_secret": csecret,
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()
        access_token = tokens["access_token"]

        if fetch_userinfo:
            userinfo_resp = await client.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_resp.raise_for_status()
            info = userinfo_resp.json()
        else:
            info = {}

    return {
        "sub": info.get("sub", ""),
        "email": info.get("email", ""),
        "name": info.get("name", ""),
        "picture": info.get("picture", ""),
        "access_token": access_token,
    }


async def generate_orb_id(name: str, db: AsyncDriver) -> str:
    """Generate a unique orb_id slug from the user's name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug:
        slug = "user"

    candidate = slug
    async with db.session() as session:
        result = await session.run(GET_PERSON_BY_ORB_ID, orb_id=candidate)
        if await result.single() is None:
            return candidate

        # Append short suffix until unique
        for _ in range(10):
            candidate = f"{slug}-{uuid.uuid4().hex[:4]}"
            result = await session.run(GET_PERSON_BY_ORB_ID, orb_id=candidate)
            if await result.single() is None:
                return candidate

    # Fallback: fully random
    return f"user-{uuid.uuid4().hex[:8]}"
