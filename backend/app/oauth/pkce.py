"""PKCE S256 verifier."""

from __future__ import annotations

import base64
import hashlib
import hmac


def verify_pkce_s256(code_verifier: str, code_challenge: str) -> bool:
    """Return True iff base64url(sha256(code_verifier)) == code_challenge.

    Uses `hmac.compare_digest` for constant-time equality to avoid
    leaking length through timing side channels.
    """
    if not code_verifier or not code_challenge:
        return False
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return hmac.compare_digest(computed, code_challenge)
