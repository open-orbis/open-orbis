"""Global in-memory counter for PDFs currently being processed."""

from __future__ import annotations

import threading

_lock = threading.Lock()
_count = 0


def increment() -> None:
    global _count
    with _lock:
        _count += 1


def decrement() -> None:
    global _count
    with _lock:
        _count = max(0, _count - 1)


def get_count() -> int:
    return _count
