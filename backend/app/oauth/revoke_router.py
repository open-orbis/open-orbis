"""POST /oauth/revoke — RFC 7009 token revocation."""

from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException

from app.config import settings
from app.db.postgres import get_pool
from app.oauth import db as oauth_db
from app.oauth.tokens import hash_token

router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.post("/revoke")
async def revoke_endpoint(
    token: str = Form(...),
    token_type_hint: str | None = Form(None),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")

    pool = await get_pool()
    token_hash = hash_token(token)

    # RFC 7009: revocation is opaque and idempotent. Try both kinds
    # because we don't always know which one the caller sent.
    await oauth_db.revoke_access_token(pool, token_hash)
    await oauth_db.revoke_refresh_token(pool, token_hash)
    return {}
