"""Tests for PKCE S256 verification (pure functions)."""

from __future__ import annotations

import base64
import hashlib

from app.oauth.pkce import verify_pkce_s256


def _compute_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


class TestVerifyPkceS256:
    def test_matching_verifier_and_challenge(self):
        verifier = "my-test-verifier-at-least-43-chars-long-abc123"
        challenge = _compute_challenge(verifier)
        assert verify_pkce_s256(verifier, challenge) is True

    def test_mismatching_verifier(self):
        challenge = _compute_challenge("original-verifier-abc")
        assert verify_pkce_s256("different-verifier", challenge) is False

    def test_empty_verifier_rejected(self):
        assert verify_pkce_s256("", "whatever") is False

    def test_empty_challenge_rejected(self):
        assert verify_pkce_s256("my-verifier", "") is False

    def test_constant_time_comparison(self):
        # Smoke: two wrong verifiers of different lengths both return False
        # and don't raise — if we used string == we'd leak length via timing.
        challenge = _compute_challenge("real-verifier-xyz")
        assert verify_pkce_s256("a", challenge) is False
        assert verify_pkce_s256("a" * 1000, challenge) is False
