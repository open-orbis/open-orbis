"""Tests for _resolve_scope + share-context handling in the MCP tool stack."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

# ── _resolve_scope in server.py ─────────────────────────────────────────


class TestResolveScope:
    """Translates tool args based on whether share context is set."""

    def test_passes_through_when_no_share_context(self):
        from mcp_server.server import _resolve_scope

        # Baseline: no context set
        assert _resolve_scope("orb-123", "tok-xyz") == ("orb-123", "tok-xyz")

    def test_uses_share_context_when_set(self):
        from mcp_server.auth import ShareContext, _current_share_context
        from mcp_server.server import _resolve_scope

        ctx = ShareContext(
            orb_id="orb-from-share",
            keywords=("secret",),
            hidden_node_types=("skill",),
            token_id="tok-scoped",
        )
        reset = _current_share_context.set(ctx)
        try:
            # LLM passes empty values — we fill from context
            assert _resolve_scope("", "") == ("orb-from-share", "tok-scoped")
            # LLM passes matching orb_id — same outcome
            assert _resolve_scope("orb-from-share", "anything") == (
                "orb-from-share",
                "tok-scoped",
            )
        finally:
            _current_share_context.reset(reset)

    def test_logs_warning_on_orb_id_mismatch(self, caplog):
        import hashlib

        from mcp_server.auth import ShareContext, _current_share_context
        from mcp_server.server import _resolve_scope

        ctx = ShareContext(
            orb_id="orb-A",
            keywords=(),
            hidden_node_types=(),
            token_id="tok-A",
        )
        reset = _current_share_context.set(ctx)
        try:
            with caplog.at_level("WARNING", logger="mcp_server.server"):
                orb, tok = _resolve_scope("orb-B", "")
            assert orb == "orb-A"  # share context wins
            assert tok == "tok-A"
            # The WARNING must reveal the mismatch but NEVER the raw token_id
            expected_hint = hashlib.sha256(b"tok-A").hexdigest()[:12]
            assert any(
                "mismatched orb_id" in r.message
                and expected_hint in r.message
                and "tok-A" not in r.message  # raw token must NOT leak
                for r in caplog.records
            )
        finally:
            _current_share_context.reset(reset)


# ── _check_access in tools.py under share context ───────────────────────


class TestCheckAccessUnderShareContext:
    """_check_access returns filters directly from share context, no DB round-trip."""

    async def test_returns_filters_from_share_context(self):
        from mcp_server.auth import ShareContext, _current_share_context
        from mcp_server.tools import _check_access

        ctx = ShareContext(
            orb_id="orb-shared",
            keywords=("secret",),
            hidden_node_types=("skill",),
            token_id="tok-s",
        )
        reset = _current_share_context.set(ctx)
        try:
            driver = MagicMock()
            access = await _check_access(driver, "orb-shared", "tok-s")
            assert access == {
                "keywords": ["secret"],  # list, not tuple — downstream expects lists
                "hidden_node_types": ["skill"],
            }
            # Must NOT have hit the DB: driver.session never opened
            driver.session.assert_not_called()
        finally:
            _current_share_context.reset(reset)

    async def test_rejects_mismatched_orb_id(self):
        """Defense in depth: if a caller bypasses _resolve_scope and reaches
        _check_access with a mismatched orb_id, refuse."""
        from mcp_server.auth import ShareContext, _current_share_context
        from mcp_server.tools import _check_access

        ctx = ShareContext(
            orb_id="orb-A",
            keywords=(),
            hidden_node_types=(),
            token_id="tok-A",
        )
        reset = _current_share_context.set(ctx)
        try:
            driver = MagicMock()
            access = await _check_access(driver, "orb-B", "tok-A")
            assert "error" in access
            assert "not accessible" in access["error"]
        finally:
            _current_share_context.reset(reset)

    async def test_rejects_empty_orb_id_in_share_context(self):
        """Defense-in-depth: an empty share_ctx.orb_id must not match
        an empty LLM-supplied orb_id."""
        from mcp_server.auth import ShareContext, _current_share_context
        from mcp_server.tools import _check_access

        # Degenerate ShareContext somehow got constructed with an empty
        # orb_id. This should never happen via the middleware, but the
        # dataclass doesn't enforce it.
        ctx = ShareContext(
            orb_id="",
            keywords=(),
            hidden_node_types=(),
            token_id="tok",
        )
        reset = _current_share_context.set(ctx)
        try:
            driver = MagicMock()
            access = await _check_access(driver, "", "tok")
            assert "error" in access
            assert "not accessible" in access["error"]
        finally:
            _current_share_context.reset(reset)


# ── Tool wiring: server.py tools call _resolve_scope ────────────────────


class TestToolWiring:
    """Each tool calls _resolve_scope before delegating to tools.py helpers."""

    async def test_orbis_get_summary_resolves_scope_first(self):
        from mcp_server import server as mcp_server_mod
        from mcp_server.auth import ShareContext, _current_share_context

        ctx = ShareContext(
            orb_id="orb-ctx",
            keywords=(),
            hidden_node_types=(),
            token_id="tok-ctx",
        )
        reset = _current_share_context.set(ctx)
        captured: dict = {}

        async def fake_get_orb_summary(driver, orb_id, token):
            captured["orb_id"] = orb_id
            captured["token"] = token
            return {"ok": True}

        try:
            with (
                patch.object(
                    mcp_server_mod,
                    "get_orb_summary",
                    side_effect=fake_get_orb_summary,
                ),
                patch.object(
                    mcp_server_mod,
                    "_get_driver",
                    AsyncMock(return_value=MagicMock()),
                ),
            ):
                # LLM passed an UNRELATED orb_id and token — must be replaced
                # by the share context's values.
                result = await mcp_server_mod.orbis_get_summary(
                    orb_id="orb-llm-guessed",
                    token="tok-llm-guessed",
                )

            assert result == {"ok": True}
            assert captured["orb_id"] == "orb-ctx"
            assert captured["token"] == "tok-ctx"
        finally:
            _current_share_context.reset(reset)
