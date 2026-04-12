"""Small HTTP-response helpers shared across routers."""

from __future__ import annotations

import re
from pathlib import Path

_UNSAFE_FILENAME_CHARS = re.compile(r'[\x00-\x1f"\\/]+')


def safe_content_disposition(filename: str) -> str:
    """Return a safe ``Content-Disposition: attachment; filename="..."`` value.

    User-supplied filenames are used only in this response header so the
    attack we care about is header injection via CR/LF and double-quote
    escaping, plus path traversal if the header ever leaks into a file
    system sink. We strip path components with ``Path.name``, replace
    control characters, slashes, backslashes and double quotes with
    underscores, and cap the length. Falls back to ``document.pdf`` if
    nothing usable remains.
    """
    base = Path(filename or "").name
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", base).strip()
    if not cleaned or cleaned in (".", ".."):
        cleaned = "document.pdf"
    cleaned = cleaned[:200]
    return f'attachment; filename="{cleaned}"'
