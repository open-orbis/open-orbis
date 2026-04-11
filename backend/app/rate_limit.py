from fastapi import Request
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth.service import ACCESS_COOKIE
from app.config import settings


def _user_or_ip(request: Request) -> str:
    """Rate-limit key: authenticated user_id when available, otherwise client IP.

    Per-user keying matters for expensive LLM endpoints — IP-based limits
    can be trivially bypassed by rotating proxies while the same account
    still drains the API budget. Reads the access token from the httpOnly
    cookie (Stage 5 dropped Authorization header support on /api).
    """
    token = request.cookies.get(ACCESS_COOKIE)
    if token:
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except JWTError:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_user_or_ip)
