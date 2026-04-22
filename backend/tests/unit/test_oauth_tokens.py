"""Tests for OAuth token generation and hashing utilities (pure functions)."""

from __future__ import annotations

import re

from app.oauth.tokens import generate_opaque_token, hash_token


class TestGenerateOpaqueToken:
    def test_has_expected_prefix(self):
        tok = generate_opaque_token("oauth")
        assert tok.startswith("oauth_")

    def test_is_url_safe(self):
        tok = generate_opaque_token("oauth")
        # urlsafe_b64 produces only [A-Za-z0-9_-]
        body = tok[len("oauth_") :]
        assert re.fullmatch(r"[A-Za-z0-9_-]+", body)

    def test_is_random(self):
        seen = {generate_opaque_token("oauth") for _ in range(50)}
        assert len(seen) == 50

    def test_length_is_sufficient_entropy(self):
        tok = generate_opaque_token("oauth")
        # 32 random bytes → ~43 urlsafe chars
        body = tok[len("oauth_") :]
        assert len(body) >= 40


class TestHashToken:
    def test_hash_is_sha256_hex(self):
        h = hash_token("oauth_abc")
        assert len(h) == 64
        int(h, 16)  # must be valid hex

    def test_hash_is_deterministic(self):
        assert hash_token("oauth_abc") == hash_token("oauth_abc")

    def test_different_tokens_hash_differently(self):
        assert hash_token("oauth_a") != hash_token("oauth_b")
