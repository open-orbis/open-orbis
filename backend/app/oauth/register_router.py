"""POST /oauth/register — RFC 7591 Dynamic Client Registration."""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.db.postgres import get_pool
from app.oauth import db as oauth_db
from app.oauth.models import RegisterRequest
from app.oauth.tokens import generate_opaque_token, hash_token
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

_ALLOWED_AUTH_METHODS = {"none", "client_secret_post"}


def _validate_redirect_uri(uri: str) -> bool:
    """HTTPS required except for localhost/127.0.0.1 (dev-friendly)."""
    parsed = urlparse(uri)
    return parsed.scheme == "https" or (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    )


@router.post("/register", status_code=201)
@limiter.limit(settings.oauth_register_rate_limit)
async def register_client(
    request: Request,
    body: RegisterRequest,
) -> dict:
    if not settings.oauth_enabled:
        raise HTTPException(status_code=503, detail="OAuth disabled")

    if not body.redirect_uris:
        raise HTTPException(
            status_code=400, detail="at least one redirect_uri required"
        )
    for uri in body.redirect_uris:
        if not _validate_redirect_uri(uri):
            raise HTTPException(
                status_code=400,
                detail=f"redirect_uri must be HTTPS or localhost: {uri}",
            )

    if body.token_endpoint_auth_method not in _ALLOWED_AUTH_METHODS:
        raise HTTPException(
            status_code=400,
            detail=(
                "unsupported token_endpoint_auth_method; "
                f"allowed: {sorted(_ALLOWED_AUTH_METHODS)}"
            ),
        )

    pool = await get_pool()

    secret: str | None = None
    secret_hash: str | None = None
    if body.token_endpoint_auth_method == "client_secret_post":
        secret = generate_opaque_token("cs")
        secret_hash = hash_token(secret)

    client_id = await oauth_db.register_client(
        pool,
        client_name=body.client_name,
        redirect_uris=body.redirect_uris,
        token_endpoint_auth_method=body.token_endpoint_auth_method,
        client_secret_hash=secret_hash,
        registered_from_ip=request.client.host if request.client else None,
        registered_user_agent=request.headers.get("user-agent"),
    )

    logger.info(
        "OAuth client registered: client_id=%s name=%r auth=%s",
        client_id,
        body.client_name,
        body.token_endpoint_auth_method,
    )

    out = {
        "client_id": str(client_id),
        "client_name": body.client_name,
        "redirect_uris": body.redirect_uris,
        "token_endpoint_auth_method": body.token_endpoint_auth_method,
    }
    if secret is not None:
        out["client_secret"] = secret
    return out
