"""POST /oauth/token — code exchange + refresh rotation + reuse detection."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Form, HTTPException

from app.config import settings
from app.db.postgres import get_pool
from app.oauth import db as oauth_db
from app.oauth.pkce import verify_pkce_s256
from app.oauth.tokens import generate_opaque_token, hash_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])


def _parse_client_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as e:
        raise HTTPException(400, "invalid client_id") from e


async def _issue_token_pair(
    pool,
    *,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    scope: str,
) -> dict:
    access = generate_opaque_token("oauth")
    refresh = generate_opaque_token("refresh")
    await oauth_db.issue_access_token(
        pool,
        token_hash=hash_token(access),
        client_id=client_id,
        user_id=user_id,
        share_token_id=share_token_id,
        scope=scope,
        ttl_seconds=settings.oauth_access_token_ttl_seconds,
    )
    await oauth_db.issue_refresh_token(
        pool,
        token_hash=hash_token(refresh),
        client_id=client_id,
        user_id=user_id,
        share_token_id=share_token_id,
        ttl_seconds=settings.oauth_refresh_token_ttl_seconds,
    )
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": settings.oauth_access_token_ttl_seconds,
        "refresh_token": refresh,
        "scope": scope,
    }


async def _handle_authorization_code(
    pool,
    *,
    cid: uuid.UUID,
    code: str | None,
    redirect_uri: str | None,
    code_verifier: str | None,
) -> dict:
    if not code or not redirect_uri or not code_verifier:
        raise HTTPException(400, "missing authorization_code params")
    row = await oauth_db.consume_authorization_code(pool, code)
    if row is None:
        raise HTTPException(400, "invalid or expired code")
    if row["client_id"] != cid:
        raise HTTPException(400, "code issued to a different client")
    if row["redirect_uri"] != redirect_uri:
        raise HTTPException(
            400, "redirect_uri does not match the one used at /authorize"
        )
    if not verify_pkce_s256(code_verifier, row["code_challenge"]):
        raise HTTPException(400, "PKCE verification failed")
    return await _issue_token_pair(
        pool,
        client_id=cid,
        user_id=row["user_id"],
        share_token_id=row["share_token_id"],
        scope=row["scope"],
    )


async def _handle_refresh_token(
    pool,
    *,
    cid: uuid.UUID,
    refresh_token: str | None,
) -> dict:
    if not refresh_token:
        raise HTTPException(400, "missing refresh_token")
    old_hash = hash_token(refresh_token)

    existing = await oauth_db.get_refresh_token(pool, old_hash)
    if existing is None:
        raise HTTPException(400, "invalid refresh_token")
    if existing["revoked_at"] is not None or existing["rotated_to"] is not None:
        logger.warning(
            "Refresh token reuse detected — revoking chain. client=%s user=%s",
            existing["client_id"],
            existing["user_id"],
        )
        await oauth_db.revoke_refresh_chain(pool, old_hash)
        raise HTTPException(400, "refresh_token reused — chain revoked")

    new_refresh = generate_opaque_token("refresh")
    rotated = await oauth_db.rotate_refresh_token(
        pool,
        old_hash=old_hash,
        new_hash=hash_token(new_refresh),
    )
    if rotated is None:
        raise HTTPException(400, "refresh_token could not be rotated")

    access = generate_opaque_token("oauth")
    await oauth_db.issue_access_token(
        pool,
        token_hash=hash_token(access),
        client_id=rotated["client_id"],
        user_id=rotated["user_id"],
        share_token_id=rotated["share_token_id"],
        scope="orbis.read",
        ttl_seconds=settings.oauth_access_token_ttl_seconds,
    )
    await oauth_db.issue_refresh_token(
        pool,
        token_hash=hash_token(new_refresh),
        client_id=rotated["client_id"],
        user_id=rotated["user_id"],
        share_token_id=rotated["share_token_id"],
        ttl_seconds=settings.oauth_refresh_token_ttl_seconds,
    )
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": settings.oauth_access_token_ttl_seconds,
        "refresh_token": new_refresh,
        "scope": "orbis.read",
    }


@router.post("/token")
async def token_endpoint(
    grant_type: str = Form(...),
    # authorization_code params
    code: str | None = Form(None),
    redirect_uri: str | None = Form(None),
    client_id: str = Form(...),
    code_verifier: str | None = Form(None),
    # refresh_token params
    refresh_token: str | None = Form(None),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")

    cid = _parse_client_id(client_id)
    pool = await get_pool()

    if grant_type == "authorization_code":
        return await _handle_authorization_code(
            pool,
            cid=cid,
            code=code,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier,
        )

    if grant_type == "refresh_token":
        return await _handle_refresh_token(pool, cid=cid, refresh_token=refresh_token)

    raise HTTPException(400, "unsupported grant_type")
