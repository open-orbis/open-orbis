"""Unit tests for app.graph.encryption module."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet

import app.graph.encryption as enc_mod
from app.graph.encryption import (
    ENCRYPTED_FIELDS,
    decrypt_properties,
    decrypt_value,
    encrypt_properties,
    encrypt_value,
)

# Use a fixed Fernet key for deterministic tests
TEST_KEY = Fernet.generate_key()


@pytest.fixture(autouse=True)
def _reset_fernet():
    """Reset the module-level Fernet singleton before each test."""
    enc_mod._fernet = None
    yield
    enc_mod._fernet = None


@pytest.fixture(autouse=True)
def _mock_settings():
    """Provide a valid encryption key via settings."""
    with patch.object(enc_mod, "settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY.decode()
        yield


# ── encrypt_value / decrypt_value roundtrip ──


class TestEncryptDecryptValue:
    def test_roundtrip(self):
        original = "hello@example.com"
        encrypted = encrypt_value(original)
        assert encrypted != original
        assert decrypt_value(encrypted) == original

    def test_empty_string(self):
        encrypted = encrypt_value("")
        assert decrypt_value(encrypted) == ""


# ── encrypt_properties / decrypt_properties ──


class TestEncryptDecryptProperties:
    def test_roundtrip_all_encrypted_fields(self):
        props = {
            "email": "alice@test.com",
            "phone": "+39 123 456 7890",
            "address": "Via Roma 42",
            "name": "Alice",
        }
        encrypted = encrypt_properties(props)
        # Encrypted fields should change
        for field in ENCRYPTED_FIELDS:
            assert encrypted[field] != props[field]
        # Non-encrypted fields stay the same
        assert encrypted["name"] == "Alice"
        # Roundtrip
        decrypted = decrypt_properties(encrypted)
        assert decrypted == props

    def test_missing_encrypted_fields(self):
        props = {"name": "Bob", "title": "Engineer"}
        encrypted = encrypt_properties(props)
        assert encrypted == props

    def test_empty_values_not_encrypted(self):
        props = {"email": "", "phone": None, "name": "Carol"}
        encrypted = encrypt_properties(props)
        assert encrypted["email"] == ""
        assert encrypted["phone"] is None

    def test_original_dict_not_mutated(self):
        props = {"email": "test@test.com"}
        original_email = props["email"]
        encrypt_properties(props)
        assert props["email"] == original_email

    def test_decrypt_handles_corrupt_ciphertext(self):
        props = {"email": "not-a-valid-ciphertext", "name": "Dave"}
        result = decrypt_properties(props)
        # Should keep the corrupt value and not raise
        assert result["email"] == "not-a-valid-ciphertext"
        assert result["name"] == "Dave"


# ── _get_fernet fallback ──


class TestGetFernet:
    def test_invalid_key_falls_back(self):
        enc_mod._fernet = None
        with patch.object(enc_mod, "settings") as mock_settings:
            mock_settings.encryption_key = "not-valid-base64-key"
            fernet = enc_mod._get_fernet()
            assert isinstance(fernet, Fernet)

    def test_singleton_reused(self):
        f1 = enc_mod._get_fernet()
        f2 = enc_mod._get_fernet()
        assert f1 is f2


# ── ENCRYPTED_FIELDS ──


class TestEncryptedFields:
    def test_expected_fields(self):
        assert {"email", "phone", "address"} == ENCRYPTED_FIELDS
