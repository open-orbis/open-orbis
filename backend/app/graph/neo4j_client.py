from __future__ import annotations

import contextlib
import logging

from neo4j import AsyncDriver, AsyncGraphDatabase

from app.config import settings

logger = logging.getLogger(__name__)

_driver: AsyncDriver | None = None


def _patch_neo4j_uvloop_transport_resilience() -> None:
    """Translate uvloop's ``RuntimeError`` on dead Bolt sockets into ``OSError``.

    Under uvloop, ``StreamWriter.write`` on a ``TCPTransport`` whose peer
    vanished (Cloud Run + VPC connector NAT idle drop is the classic case)
    raises ``RuntimeError: unable to perform operation on <TCPTransport
    closed=True>; the handler is closed`` — NOT ``OSError``.

    The neo4j driver's error-handling code uniformly catches ``OSError``
    (``Outbox.flush``, ``AsyncBolt.close``, the pool's liveness branch),
    but none of it catches ``RuntimeError``. The raw ``RuntimeError``
    therefore propagates out of ``_acquire_from_pool_checked`` /
    ``liveness_check`` / ``release`` and surfaces as an HTTP 500 on every
    first DB-touching request after idle.

    Converting the exception to ``OSError`` at the single socket-layer
    raise site lets the rest of the driver self-heal:

    - ``Outbox.flush`` catches ``OSError`` and invokes the ``on_error``
      hook ``_set_defunct_write`` (``_common.py:149-163``).
    - ``_set_defunct`` (``_bolt.py:901``) synchronously sets
      ``self._defunct = True``, calls ``self.close()`` (which guards its
      own ``_send_all`` with ``except (OSError, BoltError, DriverError)``),
      deactivates the pool address, and then **re-raises the error as
      ``SessionExpired``** (a ``DriverError``).
    - The ``SessionExpired`` propagates back up through ``flush`` →
      ``_send_all`` → ``send_all`` → ``reset`` → ``liveness_check``,
      where the pool's ``health_check`` catches it at ``_pool.py:357``
      (``except (OSError, ServiceUnavailable, SessionExpired)``) and
      returns ``False`` — the pool drops the dead conn and retries.
    - The ``release`` path catches ``SessionExpired`` via its
      ``except (Neo4jError, DriverError, BoltError)`` at ``_pool.py:499``.

    Remove once the driver upstream catches ``RuntimeError`` in
    ``Outbox.flush`` (or uvloop stops raising it for closed transports).
    """
    from neo4j._async_compat.network import _bolt_socket as _socket_mod

    original_sendall = _socket_mod.AsyncBoltSocketBase.sendall
    if getattr(original_sendall, "_orbis_patched", False):
        return

    async def sendall(self, data):
        try:
            return await original_sendall(self, data)
        except RuntimeError as exc:
            raise OSError(f"bolt transport closed: {exc}") from exc

    sendall._orbis_patched = True  # type: ignore[attr-defined]
    _socket_mod.AsyncBoltSocketBase.sendall = sendall


def _patch_neo4j_pool_close_resilience() -> None:
    """Swallow ``close()`` errors on already-dead pooled Bolt connections.

    Belt-and-suspenders for ``_patch_neo4j_uvloop_transport_resilience``:
    after that translation the pool's ``await connection.close()`` on a
    stale conn should not raise anymore, but we guard against driver-body
    drift by also wrapping the pool path in ``contextlib.suppress``.
    The connection is removed from the pool and the loop tries again.
    """
    from neo4j._async.io import _pool as _pool_mod

    original = _pool_mod.AsyncIOPool._acquire_from_pool_checked
    if getattr(original, "_orbis_patched", False):
        return

    async def _acquire_from_pool_checked(self, address, health_check, deadline):
        while not deadline.expired():
            connection = await self._acquire_from_pool(address)
            if not connection:
                return None
            if not await health_check(connection, deadline):
                with contextlib.suppress(Exception):
                    await connection.close()
                self._remove_connection(connection)
                continue
            return connection
        return None

    _acquire_from_pool_checked._orbis_patched = True  # type: ignore[attr-defined]
    _pool_mod.AsyncIOPool._acquire_from_pool_checked = _acquire_from_pool_checked


def _assert_supported_driver_version() -> None:
    """Fail loud if the neo4j driver's major version moves past the one we
    patched.

    The patches above reach into two private modules. A major bump can
    reshape ``AsyncIOPool._acquire_from_pool_checked`` or
    ``AsyncBoltSocketBase.sendall`` and silently revert us to buggy behavior.
    Pin the upper bound in ``pyproject.toml`` AND assert here so a stray
    ``uv lock`` upgrade is caught at import time, not in production.
    """
    import neo4j

    major = int(neo4j.__version__.split(".")[0])
    if major != 5:
        raise RuntimeError(
            "app.graph.neo4j_client expects neo4j==5.x (patches target "
            f"private driver internals); found neo4j=={neo4j.__version__}. "
            "Review the patches in this module before bumping."
        )


_assert_supported_driver_version()
_patch_neo4j_uvloop_transport_resilience()
_patch_neo4j_pool_close_resilience()


async def get_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        logger.info("Connecting to Neo4j at %s", settings.neo4j_uri)
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
            max_connection_pool_size=50,
            connection_acquisition_timeout=10,
            # VPC connector / NAT can silently drop idle Bolt TCP sockets; the
            # pool then hands out dead connections and the first request after
            # idle fails with "TCPTransport closed". Recycle aggressively and
            # liveness-check before reuse. RuntimeErrors raised while writing
            # to a dead transport are translated to OSError by
            # _patch_neo4j_uvloop_transport_resilience so the driver's normal
            # dead-connection handling takes over.
            max_connection_lifetime=60,
            liveness_check_timeout=30,
            keep_alive=True,
        )
    return _driver


async def close_driver() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
