"""Unit tests for MCP API key lifecycle."""

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.auth.mcp_keys as mcp_keys


class _FakeResult:
    def __init__(self, record=None, records=None):
        self._record = record
        self._records = records or []

    async def single(self):
        return self._record

    def __aiter__(self):
        async def gen():
            for r in self._records:
                yield r

        return gen()


class _FakeSession:
    def __init__(self, store: dict):
        self._store = store
        self.run = AsyncMock(side_effect=self._run)

    async def _run(self, query: str, **kwargs):
        if "CREATE (p)-[:HAS_MCP_KEY]->" in query:
            rec = {
                "key_id": kwargs["key_id"],
                "hash": kwargs["hash"],
                "label": kwargs.get("label", ""),
                "user_id": kwargs["user_id"],
                "revoked": False,
                "created_at": "2026-01-01T00:00:00+00:00",
                "last_used_at": None,
                "revoked_at": None,
            }
            self._store[kwargs["key_id"]] = rec
            return _FakeResult(record={"k": rec})
        if "MATCH (p:Person)-[:HAS_MCP_KEY]->(k:MCPApiKey {hash:" in query:
            for rec in self._store.values():
                if rec["hash"] == kwargs["hash"] and not rec["revoked"]:
                    return _FakeResult(record={"k": rec, "user_id": rec["user_id"]})
            return _FakeResult(record=None)
        if "MATCH (k:MCPApiKey {key_id:" in query and "last_used_at" in query:
            rec = self._store.get(kwargs["key_id"])
            if rec:
                rec["last_used_at"] = "2026-01-02T00:00:00+00:00"
            return _FakeResult(record=None)
        if "HAS_MCP_KEY]->(k:MCPApiKey {key_id:" in query:
            rec = self._store.get(kwargs["key_id"])
            if rec and rec["user_id"] == kwargs["user_id"]:
                rec["revoked"] = True
                return _FakeResult(record={"k": rec})
            return _FakeResult(record=None)
        if (
            "MATCH (p:Person {user_id:" in query
            and "HAS_MCP_KEY" in query
            and "RETURN k" in query
        ):
            recs = [
                {"k": r}
                for r in self._store.values()
                if r["user_id"] == kwargs["user_id"]
            ]
            return _FakeResult(records=recs)
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


async def test_create_key_returns_raw_with_prefix_and_hashes_in_store(driver):
    raw, meta = await mcp_keys.create_api_key(
        driver, user_id="u1", label="claude-desktop"
    )
    assert raw.startswith("orbk_")
    assert len(raw) > 30
    assert "hash" not in meta
    # Hash is persisted, raw is not.
    stored = next(iter(driver.store.values()))
    assert stored["hash"] == hashlib.sha256(raw.encode()).hexdigest()
    assert stored["label"] == "claude-desktop"


async def test_resolve_valid_key_returns_user_id(driver):
    raw, _ = await mcp_keys.create_api_key(driver, user_id="u1", label="x")
    assert await mcp_keys.resolve_api_key(driver, raw_key=raw) == "u1"


async def test_resolve_wrong_prefix_rejected_without_db_lookup(driver):
    # If a caller passes a non-prefixed value, we should not even hit the DB.
    assert (
        await mcp_keys.resolve_api_key(driver, raw_key="bearer-token-no-prefix") is None
    )


async def test_resolve_unknown_key_returns_none(driver):
    assert await mcp_keys.resolve_api_key(driver, raw_key="orbk_nope") is None


async def test_resolve_revoked_key_returns_none(driver):
    raw, meta = await mcp_keys.create_api_key(driver, user_id="u1", label="x")
    await mcp_keys.revoke_api_key(driver, user_id="u1", key_id=meta["key_id"])
    assert await mcp_keys.resolve_api_key(driver, raw_key=raw) is None


async def test_list_keys_strips_hash(driver):
    await mcp_keys.create_api_key(driver, user_id="u1", label="a")
    await mcp_keys.create_api_key(driver, user_id="u1", label="b")
    await mcp_keys.create_api_key(driver, user_id="u2", label="c")
    keys = await mcp_keys.list_api_keys(driver, user_id="u1")
    assert len(keys) == 2
    for k in keys:
        assert "hash" not in k
        assert "label" in k


async def test_revoke_scoped_to_owner(driver):
    raw, meta = await mcp_keys.create_api_key(driver, user_id="u1", label="x")
    # Another user can't revoke it.
    ok = await mcp_keys.revoke_api_key(
        driver, user_id="attacker", key_id=meta["key_id"]
    )
    assert ok is False
    # Raw key still resolves.
    assert await mcp_keys.resolve_api_key(driver, raw_key=raw) == "u1"
