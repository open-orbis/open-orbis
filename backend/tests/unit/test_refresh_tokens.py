"""Unit tests for refresh token rotation + reuse detection.

The tests stub Neo4j to a minimal in-memory store so we exercise the
rotation logic without spinning up a real graph.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.auth.refresh_tokens as rt_mod


class _FakeRecord(dict):
    """Stub for the neo4j record interface: subscriptable + .single() returns self."""


class _FakeResult:
    def __init__(self, record: dict | None):
        self._record = record

    async def single(self):
        return self._record


class _FakeSession:
    def __init__(self, store: dict):
        self._store = store
        self.run = AsyncMock(side_effect=self._run)

    async def _run(self, query: str, **kwargs):  # noqa: C901
        # Dispatch by a distinctive fragment of each query constant. The
        # branch count mirrors the Cypher query surface — splitting it
        # would scatter the stub across many helpers and hurt readability.
        if "CREATE (p)-[:HAS_REFRESH_TOKEN]->" in query:
            self._store[kwargs["token_id"]] = {
                "token_id": kwargs["token_id"],
                "hash": kwargs["hash"],
                "user_id": kwargs["user_id"],
                "expires_at": kwargs["expires_at"],
                "revoked": False,
                "replaced_by": None,
            }
            return _FakeResult(None)
        if "MATCH (p:Person)-[:HAS_REFRESH_TOKEN]->(rt:RefreshToken {hash:" in query:
            target = kwargs["hash"]
            for rec in self._store.values():
                if rec["hash"] == target:
                    return _FakeResult(
                        _FakeRecord(
                            {"rt": rec, "user_id": rec["user_id"], "email": "x@y"}
                        )
                    )
            return _FakeResult(None)
        if (
            "MATCH (rt:RefreshToken {token_id:" in query
            and "SET rt.revoked = true,\n    rt.revoked_at" in query
        ):
            # MARK_REFRESH_TOKEN_ROTATED
            rec = self._store.get(kwargs["token_id"])
            if rec:
                rec["revoked"] = True
                rec["replaced_by"] = kwargs["replaced_by"]
            return _FakeResult(None)
        if (
            "MATCH (rt:RefreshToken {token_id:" in query
            and "SET rt.revoked = true, rt.revoked_at = datetime()" in query
        ):
            # REVOKE_REFRESH_TOKEN
            rec = self._store.get(kwargs["token_id"])
            if rec:
                rec["revoked"] = True
            return _FakeResult(None)
        if (
            "REVOKE_REFRESH_TOKEN_FAMILY" in query
            or "MATCH (start:RefreshToken" in query
        ):
            start_id = kwargs["token_id"]
            # Walk replaced_by chain forward + any records that point to start_id transitively
            count = 0
            visited: set[str] = set()
            stack = [start_id]
            while stack:
                cur = stack.pop()
                if cur in visited:
                    continue
                visited.add(cur)
                rec = self._store.get(cur)
                if rec is None:
                    continue
                rec["revoked"] = True
                count += 1
                if rec.get("replaced_by"):
                    stack.append(rec["replaced_by"])
                # Also find ancestors
                for other_id, other_rec in self._store.items():
                    if other_rec.get("replaced_by") == cur and other_id not in visited:
                        stack.append(other_id)
            return _FakeResult(_FakeRecord({"revoked_count": count}))
        if "REVOKE_ALL_REFRESH_TOKENS_FOR_USER" in query or (
            "MATCH (p:Person {user_id:" in query and "WHERE rt.revoked = false" in query
        ):
            count = 0
            for rec in self._store.values():
                if rec["user_id"] == kwargs["user_id"] and not rec["revoked"]:
                    rec["revoked"] = True
                    count += 1
            return _FakeResult(_FakeRecord({"revoked_count": count}))
        if "PURGE_EXPIRED" in query or "DETACH DELETE rt" in query:
            now_iso = datetime.now(timezone.utc).isoformat()
            expired = [
                tid for tid, r in self._store.items() if r["expires_at"] < now_iso
            ]
            for tid in expired:
                del self._store[tid]
            return _FakeResult(_FakeRecord({"deleted": len(expired)}))
        raise AssertionError(f"unhandled query: {query[:120]}")


class _FakeDriver:
    def __init__(self):
        self.store: dict = {}

    def session(self):
        session = _FakeSession(self.store)
        ctx = MagicMock()
        ctx.__aenter__ = AsyncMock(return_value=session)
        ctx.__aexit__ = AsyncMock(return_value=None)
        return ctx


@pytest.fixture
def driver():
    return _FakeDriver()


# ── issue + rotate happy path ───────────────────────────────────────────


async def test_issue_creates_persisted_hash(driver):
    raw, token_id, expires_at = await rt_mod.issue_refresh_token(
        driver, user_id="u1", ttl_days=7
    )
    assert raw and len(raw) > 30
    assert token_id in driver.store
    stored = driver.store[token_id]
    assert stored["hash"] == hashlib.sha256(raw.encode()).hexdigest()
    assert stored["revoked"] is False
    assert expires_at > datetime.now(timezone.utc)


async def test_rotate_happy_path_mints_new_and_revokes_old(driver):
    raw, token_id, _ = await rt_mod.issue_refresh_token(
        driver, user_id="u1", ttl_days=7
    )
    result = await rt_mod.rotate_refresh_token(driver, raw_token=raw, ttl_days=7)
    assert result is not None
    raw_new, token_id_new, user_id, _ = result
    assert raw_new != raw
    assert token_id_new != token_id
    assert user_id == "u1"
    old = driver.store[token_id]
    new = driver.store[token_id_new]
    assert old["revoked"] is True
    assert old["replaced_by"] == token_id_new
    assert new["revoked"] is False


# ── reuse detection ─────────────────────────────────────────────────────


async def test_reuse_of_rotated_token_revokes_family(driver):
    raw1, _, _ = await rt_mod.issue_refresh_token(driver, user_id="u1", ttl_days=7)
    # First rotation — legitimate
    result1 = await rt_mod.rotate_refresh_token(driver, raw_token=raw1, ttl_days=7)
    assert result1 is not None
    raw2, token_id2, _, _ = result1

    # Legit continues — rotate raw2 once more
    result2 = await rt_mod.rotate_refresh_token(driver, raw_token=raw2, ttl_days=7)
    assert result2 is not None
    raw3, token_id3, _, _ = result2
    assert not driver.store[token_id3]["revoked"]

    # Attacker presents raw1 — it's already revoked. Must trigger family revoke.
    result3 = await rt_mod.rotate_refresh_token(driver, raw_token=raw1, ttl_days=7)
    assert result3 is None

    # The entire chain is now revoked — subsequent rotates on any descendant fail.
    result4 = await rt_mod.rotate_refresh_token(driver, raw_token=raw3, ttl_days=7)
    assert result4 is None
    assert driver.store[token_id3]["revoked"] is True


async def test_unknown_token_returns_none(driver):
    result = await rt_mod.rotate_refresh_token(
        driver, raw_token="not-a-real-token", ttl_days=7
    )
    assert result is None


async def test_expired_token_returns_none(driver):
    # Hand-craft an expired record.
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    expired_raw = "expired-raw-token"
    driver.store["t-old"] = {
        "token_id": "t-old",
        "hash": hashlib.sha256(expired_raw.encode()).hexdigest(),
        "user_id": "u1",
        "expires_at": past,
        "revoked": False,
        "replaced_by": None,
    }
    result = await rt_mod.rotate_refresh_token(
        driver, raw_token=expired_raw, ttl_days=7
    )
    assert result is None


async def test_revoke_by_token_marks_record(driver):
    raw, token_id, _ = await rt_mod.issue_refresh_token(
        driver, user_id="u1", ttl_days=7
    )
    assert await rt_mod.revoke_refresh_token(driver, raw_token=raw) is True
    assert driver.store[token_id]["revoked"] is True


async def test_revoke_unknown_raw_is_noop(driver):
    assert await rt_mod.revoke_refresh_token(driver, raw_token="nope") is False


async def test_revoke_all_for_user(driver):
    await rt_mod.issue_refresh_token(driver, user_id="u1", ttl_days=7)
    await rt_mod.issue_refresh_token(driver, user_id="u1", ttl_days=7)
    await rt_mod.issue_refresh_token(driver, user_id="u2", ttl_days=7)
    revoked = await rt_mod.revoke_all_for_user(driver, user_id="u1")
    assert revoked == 2
    assert all(r["revoked"] for r in driver.store.values() if r["user_id"] == "u1")
    assert all(not r["revoked"] for r in driver.store.values() if r["user_id"] == "u2")
