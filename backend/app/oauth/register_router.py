"""POST /oauth/register — RFC 7591 Dynamic Client Registration."""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request
from slowapi.util import get_remote_address

from app.config import settings
from app.db.postgres import get_pool
from app.oauth import db as oauth_db
from app.oauth.models import RegisterRequest, RegisterResponse
from app.oauth.tokens import generate_opaque_token, hash_token
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

_ALLOWED_AUTH_METHODS = {"none", "client_secret_post"}
_ALLOWED_GRANT_TYPES = {"authorization_code", "refresh_token"}
_ALLOWED_RESPONSE_TYPES = {"code"}


def _validate_redirect_uri(uri: str) -> bool:
    """HTTPS required except for localhost/127.0.0.1 (dev-friendly).

    Also rejects URIs with a fragment component per RFC 7591 §2.
    """
    parsed = urlparse(uri)
    if parsed.fragment:
        return False
    if parsed.scheme == "https":
        return True
    return parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}


@router.post("/register", status_code=201, response_model_exclude_none=True)
@limiter.limit(
    settings.oauth_register_rate_limit,
    key_func=lambda request: f"oauth_register:{get_remote_address(request)}",
)
async def register_client(
    request: Request,
    body: RegisterRequest,
) -> RegisterResponse:
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

    for gt in body.grant_types:
        if gt not in _ALLOWED_GRANT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"unsupported grant_type: {gt!r}; "
                    f"allowed: {sorted(_ALLOWED_GRANT_TYPES)}"
                ),
            )
    for rt in body.response_types:
        if rt not in _ALLOWED_RESPONSE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"unsupported response_type: {rt!r}; "
                    f"allowed: {sorted(_ALLOWED_RESPONSE_TYPES)}"
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

    return RegisterResponse(
        client_id=str(client_id),
        client_name=body.client_name,
        redirect_uris=body.redirect_uris,
        token_endpoint_auth_method=body.token_endpoint_auth_method,
        grant_types=body.grant_types,
        response_types=body.response_types,
        client_secret=secret,
    )
