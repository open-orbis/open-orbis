"""GET + POST /oauth/authorize — user consent flow."""

from __future__ import annotations

import logging
import uuid
from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from neo4j import AsyncDriver
from pydantic import BaseModel

from app.config import settings
from app.db.postgres import get_pool
from app.dependencies import get_current_user_optional, get_db
from app.oauth import db as oauth_db
from app.oauth.tokens import generate_opaque_token
from app.orbs.share_token import get_share_token_row

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

_ALLOWED_SCOPES = {"orbis.read"}


def _parse_client_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as e:
        raise HTTPException(400, "invalid client_id") from e


@router.get("/authorize")
async def authorize_get(
    response_type: str = Query(...),
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    state: str = Query(...),
    code_challenge: str = Query(...),
    code_challenge_method: str = Query(...),
    scope: str = Query("orbis.read"),
    user: dict | None = Depends(get_current_user_optional),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")
    if response_type != "code":
        raise HTTPException(400, "only response_type=code is supported")
    if code_challenge_method != "S256":
        raise HTTPException(400, "only code_challenge_method=S256 is supported")
    if scope not in _ALLOWED_SCOPES:
        raise HTTPException(
            400, f"unsupported scope {scope!r}; allowed: {sorted(_ALLOWED_SCOPES)}"
        )

    cid = _parse_client_id(client_id)
    pool = await get_pool()

    client = await oauth_db.get_active_client(pool, cid)
    if client is None:
        raise HTTPException(403, "client disabled or unknown")
    if redirect_uri not in client["redirect_uris"]:
        raise HTTPException(400, "redirect_uri does not match a registered URI")

    if user is None:
        qs = urlencode(
            {
                "response_type": response_type,
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "scope": scope,
            }
        )
        return {"login_required": True, "next": f"/oauth/authorize?{qs}"}

    return {
        "login_required": False,
        "client_id": str(client["client_id"]),
        "client_name": client["client_name"],
        "registered_at": client["registered_at"].isoformat(),
        "registered_from_ip": (
            str(client["registered_from_ip"])
            if client.get("registered_from_ip")
            else None
        ),
        "redirect_uri": redirect_uri,
        "scope": scope,
    }


class AuthorizePostBody(BaseModel):
    client_id: str
    redirect_uri: str
    state: str
    code_challenge: str
    code_challenge_method: str
    scope: str = "orbis.read"
    access_mode: Literal["full", "restricted"]
    share_token_id: str | None = None


@router.post("/authorize")
async def authorize_post(
    body: AuthorizePostBody,
    user: dict | None = Depends(get_current_user_optional),
    db: AsyncDriver = Depends(get_db),
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(503, "OAuth disabled")
    if user is None:
        raise HTTPException(401, "authentication required")
    if body.code_challenge_method != "S256":
        raise HTTPException(400, "only S256 supported")
    if body.scope not in _ALLOWED_SCOPES:
        raise HTTPException(
            400, f"unsupported scope {body.scope!r}; allowed: {sorted(_ALLOWED_SCOPES)}"
        )
    if body.access_mode not in ("full", "restricted"):
        raise HTTPException(400, "access_mode must be 'full' or 'restricted'")
    if body.access_mode == "restricted" and not body.share_token_id:
        raise HTTPException(400, "restricted access requires share_token_id")

    cid = _parse_client_id(body.client_id)
    pool = await get_pool()
    client = await oauth_db.get_active_client(pool, cid)
    if client is None:
        raise HTTPException(403, "client disabled or unknown")
    if body.redirect_uri not in client["redirect_uris"]:
        raise HTTPException(400, "redirect_uri does not match a registered URI")

    share_token_id: str | None = None
    if body.access_mode == "restricted":
        row = await get_share_token_row(db, body.share_token_id)
        if row is None or row["user_id"] != user["user_id"]:
            raise HTTPException(403, "share token not found or not owned by you")
        share_token_id = body.share_token_id

    code = generate_opaque_token("ac")
    await oauth_db.issue_authorization_code(
        pool,
        code=code,
        client_id=cid,
        user_id=user["user_id"],
        share_token_id=share_token_id,
        scope=body.scope,
        redirect_uri=body.redirect_uri,
        code_challenge=body.code_challenge,
        code_challenge_method=body.code_challenge_method,
        ttl_seconds=settings.oauth_authorization_code_ttl_seconds,
    )
    logger.info(
        "OAuth consent granted: user=%s client=%s mode=%s share_token=%s",
        user["user_id"],
        cid,
        body.access_mode,
        bool(share_token_id),
    )
    return {"code": code, "state": body.state, "redirect_uri": body.redirect_uri}
