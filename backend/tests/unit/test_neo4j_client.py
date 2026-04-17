"""Regression tests for the Neo4j driver monkey-patches.

Two interacting bugs kept surfacing as HTTP 500s on first DB-touching
requests after Cloud Run + VPC idle (notably /auth/google):

1. Under uvloop, ``StreamWriter.write`` on a dead ``TCPTransport`` raises
   ``RuntimeError``, not ``OSError``. The neo4j driver catches ``OSError``
   uniformly but not ``RuntimeError`` — so the exception escaped every
   layer (``Outbox.flush``, ``AsyncBolt.close``, pool ``health_check``,
   pool ``release``) and reached the endpoint.
2. Even with the ``RuntimeError`` translated, the pool's
   ``_acquire_from_pool_checked`` calls ``close()`` on the unhealthy
   connection. We keep a belt-and-suspenders wrapper there in case a
   future driver body drifts.

These tests don't spin up Neo4j — they poke the patched functions with
doubles that reproduce the failure modes.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from neo4j._async.io import _pool as _pool_mod
from neo4j._async_compat.network import _bolt_socket as _socket_mod

# Importing the module applies the monkey-patches as a side effect.
from app.graph import neo4j_client


def test_pool_patch_is_applied_and_idempotent() -> None:
    patched = _pool_mod.AsyncIOPool._acquire_from_pool_checked
    assert getattr(patched, "_orbis_patched", False) is True

    neo4j_client._patch_neo4j_pool_close_resilience()
    assert _pool_mod.AsyncIOPool._acquire_from_pool_checked is patched


def test_sendall_patch_is_applied_and_idempotent() -> None:
    patched = _socket_mod.AsyncBoltSocketBase.sendall
    assert getattr(patched, "_orbis_patched", False) is True

    neo4j_client._patch_neo4j_uvloop_transport_resilience()
    assert _socket_mod.AsyncBoltSocketBase.sendall is patched


@pytest.mark.asyncio
async def test_sendall_translates_uvloop_runtime_error_to_oserror() -> None:
    """uvloop's ``RuntimeError`` on a dead transport must become ``OSError``
    so ``Outbox.flush`` catches it and marks the connection defunct
    instead of letting the exception escape to the endpoint."""
    # The real ``sendall`` body is:
    #   self._writer.write(data)
    #   return await self._wait_for_io(self._writer.drain)
    # Making ``write`` raise the uvloop-specific RuntimeError reproduces
    # the production failure inside the wrapper's ``try`` block.
    sock = MagicMock(spec=_socket_mod.AsyncBoltSocketBase)
    sock._writer = MagicMock()
    sock._writer.write = MagicMock(
        side_effect=RuntimeError(
            "unable to perform operation on <TCPTransport closed=True "
            "reading=False>; the handler is closed"
        )
    )
    sock._wait_for_io = AsyncMock()

    # Bind the patched method to our mock socket and expect OSError.
    bound = _socket_mod.AsyncBoltSocketBase.sendall.__get__(
        sock, _socket_mod.AsyncBoltSocketBase
    )
    with pytest.raises(OSError) as exc_info:
        await bound(b"bolt data")

    assert "bolt transport closed" in str(exc_info.value)
    assert isinstance(exc_info.value.__cause__, RuntimeError)


@pytest.mark.asyncio
async def test_sendall_passes_through_normal_exceptions() -> None:
    """OSError from the underlying writer must NOT be rewrapped — the
    driver already handles it."""
    sock = MagicMock(spec=_socket_mod.AsyncBoltSocketBase)
    sock._writer = MagicMock()
    sock._writer.write = MagicMock(side_effect=OSError("EPIPE"))
    sock._wait_for_io = AsyncMock()

    bound = _socket_mod.AsyncBoltSocketBase.sendall.__get__(
        sock, _socket_mod.AsyncBoltSocketBase
    )
    with pytest.raises(OSError) as exc_info:
        await bound(b"bolt data")

    # Must be the original, not wrapped in another OSError chain.
    assert str(exc_info.value) == "EPIPE"
    assert exc_info.value.__cause__ is None


@pytest.mark.asyncio
async def test_pool_stale_close_failure_is_swallowed() -> None:
    """Regression for the original crash: close() on a stale conn raises —
    pool must drop it and retry instead of propagating."""
    dead_conn = MagicMock(name="dead_conn")
    dead_conn.close = AsyncMock(
        side_effect=RuntimeError(
            "unable to perform operation on <TCPTransport closed=True>; "
            "the handler is closed"
        )
    )
    healthy_conn = MagicMock(name="healthy_conn")

    pool = MagicMock()
    pool._acquire_from_pool = AsyncMock(side_effect=[dead_conn, healthy_conn])
    pool._remove_connection = MagicMock()

    health_check = AsyncMock(side_effect=[False, True])
    deadline = MagicMock()
    deadline.expired = MagicMock(return_value=False)

    result = await _pool_mod.AsyncIOPool._acquire_from_pool_checked(
        pool, address=("neo4j", 7687), health_check=health_check, deadline=deadline
    )

    assert result is healthy_conn
    dead_conn.close.assert_awaited_once()
    pool._remove_connection.assert_called_once_with(dead_conn)


@pytest.mark.asyncio
async def test_pool_deadline_expired_returns_none() -> None:
    pool = MagicMock()
    pool._acquire_from_pool = AsyncMock()
    deadline = MagicMock()
    deadline.expired = MagicMock(return_value=True)

    result = await _pool_mod.AsyncIOPool._acquire_from_pool_checked(
        pool,
        address=("neo4j", 7687),
        health_check=AsyncMock(),
        deadline=deadline,
    )

    assert result is None
    pool._acquire_from_pool.assert_not_called()


@pytest.mark.asyncio
async def test_pool_empty_pool_returns_none() -> None:
    pool = MagicMock()
    pool._acquire_from_pool = AsyncMock(return_value=None)
    deadline = MagicMock()
    deadline.expired = MagicMock(return_value=False)

    result = await _pool_mod.AsyncIOPool._acquire_from_pool_checked(
        pool,
        address=("neo4j", 7687),
        health_check=AsyncMock(),
        deadline=deadline,
    )

    assert result is None


def test_driver_version_guard_accepts_current_pin() -> None:
    """Current install satisfies the ``neo4j==5.x`` contract — the guard
    must not raise."""
    # Already called at import; re-invoke to confirm no side effects.
    neo4j_client._assert_supported_driver_version()


def test_driver_version_guard_rejects_unsupported_major(monkeypatch) -> None:
    """If a future ``uv lock`` pulls in neo4j 6.x, the guard must fail
    loudly so we review the patches rather than silently revert."""
    import neo4j

    monkeypatch.setattr(neo4j, "__version__", "6.0.0")
    with pytest.raises(RuntimeError, match="neo4j==5.x"):
        neo4j_client._assert_supported_driver_version()
