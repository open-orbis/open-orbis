from __future__ import annotations

import logging
from pathlib import Path

from cryptography.fernet import Fernet, MultiFernet

from app.config import settings

logger = logging.getLogger(__name__)

_primary: Fernet | None = None
_multi: MultiFernet | None = None

# Dev-only persistent fallback. Lives at backend/.local_encryption_key and is
# gitignored. Persisting instead of regenerating avoids losing access to PII
# encrypted during a previous run.
_DEV_KEY_FILE = Path(__file__).resolve().parents[2] / ".local_encryption_key"


def _load_or_generate_dev_key() -> str:
    if _DEV_KEY_FILE.exists():
        existing = _DEV_KEY_FILE.read_text().strip()
        if existing:
            return existing
    key = Fernet.generate_key().decode()
    _DEV_KEY_FILE.write_text(key + "\n")
    try:
        _DEV_KEY_FILE.chmod(0o600)
    except OSError:
        pass
    logger.warning(
        "ENCRYPTION_KEY not set — generated and persisted a dev key at %s. "
        "Set ENCRYPTION_KEY in .env to override.",
        _DEV_KEY_FILE,
    )
    return key


def _init_fernet() -> None:
    global _primary, _multi
    if _primary is not None:
        return

    key = settings.encryption_key
    if not key:
        if settings.env == "development":
            key = _load_or_generate_dev_key()
        else:
            raise RuntimeError(
                "ENCRYPTION_KEY is required when ENV != development. "
                "Refusing to start without a persistent key — generating an "
                "ephemeral one would make all encrypted PII unrecoverable."
            )

    try:
        primary = Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        raise RuntimeError(
            "ENCRYPTION_KEY is not a valid urlsafe-base64 Fernet key: "
            f"{exc}. Generate one with "
            "`python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'`"
        ) from exc

    historic: list[Fernet] = []
    if settings.encryption_keys_historic:
        for raw in settings.encryption_keys_historic.split(","):
            raw = raw.strip()
            if not raw:
                continue
            try:
                historic.append(Fernet(raw.encode()))
            except Exception as exc:
                logger.warning(
                    "Ignoring invalid key in ENCRYPTION_KEYS_HISTORIC: %s", exc
                )

    _primary = primary
    _multi = MultiFernet([primary, *historic])


def _get_primary() -> Fernet:
    _init_fernet()
    assert _primary is not None
    return _primary


def _get_multi() -> MultiFernet:
    _init_fernet()
    assert _multi is not None
    return _multi


ENCRYPTED_FIELDS = {"email", "phone", "address"}


def encrypt_value(value: str) -> str:
    return _get_primary().encrypt(value.encode()).decode()


def decrypt_value(value: str) -> str:
    return _get_multi().decrypt(value.encode()).decode()


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
