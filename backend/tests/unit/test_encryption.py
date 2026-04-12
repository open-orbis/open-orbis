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
    """Reset module-level Fernet singletons before each test."""
    enc_mod._primary = None
    enc_mod._multi = None
    yield
    enc_mod._primary = None
    enc_mod._multi = None


@pytest.fixture(autouse=True)
def _mock_settings():
    """Provide a valid encryption key via settings."""
    with patch.object(enc_mod, "settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY.decode()
        mock_settings.encryption_keys_historic = ""
        mock_settings.env = "development"
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

    def test_decrypt_marks_corrupt_ciphertext(self):
        """L1: decryption failure must be visible to the caller.

        Pre-L1 behavior was to leave the ciphertext in place and log a
        warning, which silently leaked gibberish into API responses and
        made equality checks against the plaintext always fail. Now the
        field is blanked and ``_decryption_failed`` lists it.
        """
        props = {"email": "not-a-valid-ciphertext", "name": "Dave"}
        result = decrypt_properties(props)
        assert result["email"] is None
        assert result["name"] == "Dave"
        assert result["_decryption_failed"] == ["email"]

    def test_decrypt_successful_does_not_set_marker(self):
        props = {"email": "alice@example.com", "name": "Alice"}
        encrypted = encrypt_properties(props)
        result = decrypt_properties(encrypted)
        assert "_decryption_failed" not in result
        assert result["email"] == "alice@example.com"

    def test_decrypt_mixed_success_and_failure(self):
        """If some encrypted fields decrypt and others don't, only the
        failing ones are listed in the marker."""
        good = encrypt_properties({"email": "alice@example.com"})["email"]
        props = {
            "email": good,
            "phone": "corrupt-phone-ciphertext",
            "name": "Alice",
        }
        result = decrypt_properties(props)
        assert result["email"] == "alice@example.com"
        assert result["phone"] is None
        assert result["_decryption_failed"] == ["phone"]


# ── Fernet initialization ──


class TestFernetInit:
    def test_singleton_reused(self):
        f1 = enc_mod._get_primary()
        f2 = enc_mod._get_primary()
        assert f1 is f2

    def test_invalid_key_raises(self):
        enc_mod._primary = None
        enc_mod._multi = None
        with patch.object(enc_mod, "settings") as mock_settings:
            mock_settings.encryption_key = "not-valid-base64-key"
            mock_settings.encryption_keys_historic = ""
            mock_settings.env = "development"
            with pytest.raises(RuntimeError, match="not a valid urlsafe-base64"):
                enc_mod._get_primary()

    def test_missing_key_raises_in_production(self):
        enc_mod._primary = None
        enc_mod._multi = None
        with patch.object(enc_mod, "settings") as mock_settings:
            mock_settings.encryption_key = ""
            mock_settings.encryption_keys_historic = ""
            mock_settings.env = "production"
            with pytest.raises(RuntimeError, match="ENCRYPTION_KEY is required"):
                enc_mod._get_primary()

    def test_historic_keys_enable_legacy_decrypt(self):
        """Data encrypted with an old key must still decrypt after rotation."""
        old_key = Fernet.generate_key()
        new_key = Fernet.generate_key()
        ciphertext = Fernet(old_key).encrypt(b"legacy@example.com").decode()

        enc_mod._primary = None
        enc_mod._multi = None
        with patch.object(enc_mod, "settings") as mock_settings:
            mock_settings.encryption_key = new_key.decode()
            mock_settings.encryption_keys_historic = old_key.decode()
            mock_settings.env = "development"
            assert enc_mod.decrypt_value(ciphertext) == "legacy@example.com"


# ── ENCRYPTED_FIELDS ──


class TestEncryptedFields:
    def test_expected_fields(self):
        assert {"email", "phone", "address"} == ENCRYPTED_FIELDS
