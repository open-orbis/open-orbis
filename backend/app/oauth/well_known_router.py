"""GET /.well-known/oauth-authorization-server — RFC 8414 metadata."""

from __future__ import annotations

from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server_metadata() -> dict:
    base = settings.frontend_url.rstrip("/")
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "revocation_endpoint": f"{base}/oauth/revoke",
        "scopes_supported": ["orbis.read"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
        "code_challenge_methods_supported": ["S256"],
    }
