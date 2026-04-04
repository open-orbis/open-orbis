from __future__ import annotations

import logging

from cryptography.fernet import Fernet

from app.config import settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.encryption_key
        try:
            _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except (ValueError, Exception):
            logger.warning(
                "Invalid or missing ENCRYPTION_KEY — using auto-generated key (dev only)"
            )
            _fernet = Fernet(Fernet.generate_key())
    return _fernet


ENCRYPTED_FIELDS = {"email", "phone", "address"}


def encrypt_value(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_value(value: str) -> str:
    return _get_fernet().decrypt(value.encode()).decode()


def encrypt_properties(properties: dict) -> dict:
    result = dict(properties)
    for field in ENCRYPTED_FIELDS:
        if field in result and result[field]:
            result[field] = encrypt_value(result[field])
    return result


def decrypt_properties(properties: dict) -> dict:
    result = dict(properties)
    for field in ENCRYPTED_FIELDS:
        if field in result and result[field]:
            try:
                result[field] = decrypt_value(result[field])
            except Exception as e:
                logger.warning("Failed to decrypt field '%s': %s", field, e)
    return result
