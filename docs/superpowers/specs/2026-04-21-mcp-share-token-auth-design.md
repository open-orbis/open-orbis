# MCP Share-Token Transport Auth — Design Spec

**Date:** 2026-04-21
**Status:** Design approved, awaiting implementation plan

## Goal

Let an orb owner share their orb with an AI agent by copy-pasting a single
snippet into an MCP client config (Cursor, Cline, Windsurf, etc.). The
snippet embeds a share token that authenticates against the MCP server
directly — no user account needed on the recipient side, and the recipient
never sees the owner's personal `orbk_` key.

## Problem

The MCP server has two orthogonal auth layers today:

1. **Transport auth** (`backend/mcp_server/auth.py:44-76`) — every request
   must carry `X-MCP-Key: orbk_...`, resolved to a `user_id`. No header → 401.
2. **Tool-level scoping** (`backend/mcp_server/tools.py`) — each tool takes
   `orb_id` + optional `token` (share token). The share token gates
   non-owners and applies keyword / node-type filters.

The share-token system is plumbed through to tool level already, but the
transport layer only accepts user-scoped `orbk_` keys. Handing out a user
key defeats the point (full access, no filters, single revocation nukes
every share). Today's net result: there is no safe copy-paste MCP path
for non-owners, and no on-product UI to mint one anyway.

## Design Decisions

| # | Question | Choice | Why |
|---|----------|--------|-----|
| 1 | Opt-in per token? | **No flag — every share token is an MCP token.** | No existing users. YAGNI on a toggle no one has asked for. Purely additive change later if someone does. |
| 2 | Wire format? | **Reuse `X-MCP-Key`, prefix `orbs_` for share tokens.** | Stripe/Linear pattern. Single header keeps client config uniform. `orbk_` / `orbs_` discriminator already matches the naming in `mcp_keys.py`. |
| 3 | `orb_id` arg in share mode? | **Ignored; share context is authoritative (option Y).** | Simplest. LLM can't trip itself with a hallucinated orb_id — we serve the scoped orb regardless. Mismatch is logged at `warning` level for debuggability. |
| 4 | PR scope? | **Full** — backend auth + tool changes + per-share-token rate limit + audit counters + frontend copy-paste UI + tests + docs. | Rate limiting is the only concern that's hard to retrofit safely once tokens are in the wild. Audit counters are cheap and ship-ready. |

## Architecture

```
┌────────────────────────┐       X-MCP-Key: orbs_<share-token>
│  MCP client (Cursor,   │──────────────────────────────────┐
│  Cline, Windsurf, etc.)│                                  ▼
└────────────────────────┘       ┌────────────────────────────────┐
                                  │  MCP server (Cloud Run)        │
                                  │  ┌──────────────────────────┐  │
                                  │  │ APIKeyMiddleware         │  │
                                  │  │  ├─ orbk_ → user_id      │  │
                                  │  │  └─ orbs_ → ShareContext │  │
                                  │  └───────┬──────────────────┘  │
                                  │          │                     │
                                  │  ┌───────▼──────────┐          │
                                  │  │ Rate limit       │          │
                                  │  │ (per credential) │          │
                                  │  └───────┬──────────┘          │
                                  │          │                     │
                                  │  ┌───────▼──────────┐          │
                                  │  │ Tools read ctx   │          │
                                  │  │ + inject filters │          │
                                  │  └───────┬──────────┘          │
                                  └──────────┼─────────────────────┘
                                             ▼
                                         Neo4j
                                   (also: increment
                                    mcp_use_count on
                                    ShareToken)
```

## Backend

### Middleware (`backend/mcp_server/auth.py`)

**New type.**

```python
@dataclass(frozen=True)
class ShareContext:
    orb_id: str
    keywords: list[str]
    hidden_node_types: list[str]
    token_id: str  # for audit counter + rate-limit keying
```

**New ContextVar.**

```python
_current_share_context: ContextVar[ShareContext | None] = ContextVar(
    "mcp_current_share_context", default=None
)

def get_share_context() -> ShareContext | None:
    return _current_share_context.get()
```

`get_current_user_id()` stays. Exactly one of the two context vars is set
per request.

**Middleware dispatch flow:**

```
1. Read X-MCP-Key header. If missing → 401.
2. If starts with "orbk_":
     user_id = resolve_api_key(driver, raw_key)
     if None → 401
     set _current_user_id = user_id
3. Elif starts with "orbs_":
     bare_token = raw_key[len("orbs_"):]
     ctx = await validate_share_token_for_mcp(driver, bare_token)
     if None → 401
     set _current_share_context = ctx
4. Else → 401 "unrecognized credential prefix"
5. Run rate limiter against the resolved credential id.
6. Fire-and-forget audit update (share-mode only).
7. call_next(request)
8. Finally: reset whichever ContextVar was set.
```

**Wire-only prefix.** `ShareToken.token_id` in Neo4j stays bare (no `orbs_`
prefix stored). The prefix is stripped in the middleware before lookup.
Existing web sharing URLs (`/api/orbs/shared/{token}`) keep working
unchanged.

### Share-token validation (`backend/app/orbs/share_token.py`)

**New helper** (reuses existing `VALIDATE_SHARE_TOKEN` Cypher):

```python
async def validate_share_token_for_mcp(
    driver: AsyncDriver, bare_token: str
) -> ShareContext | None:
    """Resolve a bare share token to a ShareContext. Returns None if the
    token is missing, revoked, or expired."""
```

This wraps the existing `validate_share_token` and maps the result
(orb_id, keywords, hidden_node_types, token_id) into a `ShareContext`.

### Tools (`backend/mcp_server/server.py` + `tools.py`)

**New scope resolver.** Each tool currently opens with
`driver = await _get_driver()` and then calls into `tools.py`. Add one
helper at the top of each tool handler:

```python
def _resolve_scope(orb_id_arg: str, token_arg: str) -> tuple[str, str]:
    """Returns the (orb_id, token) the tool should actually query.

    In share mode the caller-supplied orb_id and token are both ignored
    from the LLM's point of view — the share context is authoritative.
    We pass `ctx.token_id` as the internal `token` so that the existing
    filter code in `tools.py` (which expects a token string to
    `validate_share_token`) runs its keyword / hidden_node_types logic
    unchanged. No second filter implementation.
    """
    ctx = get_share_context()
    if ctx is not None:
        if orb_id_arg and orb_id_arg != ctx.orb_id:
            logger.warning(
                "Share-scoped MCP call with mismatched orb_id: "
                "requested=%s scoped=%s token=%s",
                orb_id_arg, ctx.orb_id, ctx.token_id,
            )
        return ctx.orb_id, ctx.token_id
    return orb_id_arg, token_arg
```

Each of the 5 tools gains one line:

```python
@mcp.tool()
async def orbis_get_summary(orb_id: str, token: str = "") -> dict:
    orb_id, token = _resolve_scope(orb_id, token)
    driver = await _get_driver()
    return await get_orb_summary(driver, orb_id, token)
```

No tool signatures change. User-key callers see identical behavior.

### Rate limiting (`backend/mcp_server/rate_limit.py` — new file)

New module with a Starlette-compatible middleware. Keys on:
- `"u:<user_id>"` if `_current_user_id` is set → **300 req/min**
- `"s:<token_id>"` if `_current_share_context` is set → **120 req/min**

Implementation: `slowapi` with a custom `key_func` that reads the
ContextVar. Runs *after* `APIKeyMiddleware` in the stack. 429 response
carries `Retry-After`.

**In-memory vs Redis.** Per-instance in-memory limiter for v1. The MCP
service runs `min-instances=0`, `max-instances=10`, so the worst-case
effective ceiling for a leaked share token is 1200 req/min (10 × 120).
That's tolerable for v1. Redis-backed slowapi is a clean drop-in
upgrade if abuse becomes a pattern — call out in the spec as a
follow-up trigger, not a day-one requirement.

### Audit counters (`ShareToken` schema + middleware)

**New fields on `ShareToken`:**

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `mcp_last_used_at` | datetime | yes | Updated on every successful share-mode MCP request |
| `mcp_use_count` | integer | no | Default 0. Atomically incremented |

**Cypher update** (dispatched via `asyncio.create_task` so the response
isn't blocked by a slow Neo4j write; counter is eventually consistent):

```cypher
MATCH (st:ShareToken {token_id: $token_id})
SET st.mcp_last_used_at = datetime(),
    st.mcp_use_count = coalesce(st.mcp_use_count, 0) + 1
```

The task wraps its own `try/except`; failures log at `warning` level
and are otherwise swallowed so the MCP response is unaffected. We
accept occasional under-counting over blocking tool calls on an audit
write.

**API surface:** `GET /api/orbs/share-tokens` already lists tokens; the
response object gains `mcp_last_used_at` and `mcp_use_count`. No new
endpoint.

## Frontend

### Where it lives

Inline in the existing share-token management UI
(`frontend/src/components/sharing/`). No new top-level modal. Each
share-token row gains two things:

1. Right-side metadata line: `Last MCP use: 3h ago · 47 queries` (only
   shown when `mcp_use_count > 0`).
2. New `[Copy MCP config]` button alongside existing `[Copy web link]`
   and `[Revoke]` actions.

### `[Copy MCP config]` popover

Small inline popover (not a fullscreen modal). Content:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Paste this into your MCP client config
  (Cursor, Cline, Windsurf — any streamable-http client)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    "mcpServers": {
      "orbis-<label>": {
        "url": "{VITE_MCP_URL}",
        "headers": {
          "X-MCP-Key": "orbs_<share-token>"
        }
      }
    }
  }

  [ Copy snippet ]

  › For Claude Desktop: use `mcp-proxy` as a bridge (docs link)
  › For testing with cURL: show example
```

- `<label>` = token label, normalized: lowercase, non-alphanumeric → `-`, collapsed repeats, trimmed. Empty / all-symbol label falls back to `orbis-<first-8-of-token>`.
- `{VITE_MCP_URL}` = build-time env var, default `http://localhost:8081/mcp`
  in dev, `https://orbis-mcp-o5zg3whvrq-ew.a.run.app/mcp` in prod.
- Reminder line below: `"This token grants AI agents access to your orb. Revoke below if misused."`
- Copy uses `navigator.clipboard.writeText` with a toast confirmation.

### Config plumbing

- Add `VITE_MCP_URL` to `frontend/.env.example`.
- Read via `import.meta.env.VITE_MCP_URL` at the one site that templates
  the snippet.
- Follow-up (out of scope): vanity domain `mcp.open-orbis.com`.

### API wiring

Zero new endpoints. The share-token list response just gains the two new
fields from Section "Audit counters" above. Frontend types update
accordingly in `frontend/src/api/orbs.ts` (or wherever share-token
responses are typed).

## Testing

### Backend unit tests (`backend/tests/unit/`)

**`test_mcp_server_auth.py` (existing, extended):**
- `test_middleware_accepts_orbk_prefix` — current behavior, regression lock.
- `test_middleware_accepts_orbs_prefix` → sets ShareContext.
- `test_middleware_rejects_orbs_with_invalid_token` → 401.
- `test_middleware_rejects_orbs_with_expired_token` → 401.
- `test_middleware_rejects_orbs_with_revoked_token` → 401.
- `test_middleware_rejects_unrecognized_prefix` → 401.

**`test_mcp_share_context.py` (new):**
- `test_resolve_scope_uses_share_context_orb_id` — tool sees share
  context's orb_id regardless of `orb_id_arg`.
- `test_resolve_scope_logs_warning_on_mismatch` — mismatch is logged
  once.
- `test_resolve_scope_uses_arg_when_no_share_context` — user-key mode
  unchanged.
- For each of the 5 tools: `test_<tool>_under_share_context_applies_filters`
  — the share token's `keywords` and `hidden_node_types` are applied
  to the tool response.

**`test_mcp_rate_limit.py` (new):**
- `test_share_token_hits_120_per_minute_cap` — 121st request in a
  minute returns 429.
- `test_user_key_hits_300_per_minute_cap` — same for user keys.
- `test_rate_limit_buckets_are_separate` — exhausting one user's
  budget doesn't affect another user or share token.

**`test_share_token_audit.py` (new):**
- `test_successful_mcp_call_increments_use_count` — count goes from
  0 → 1 after one call.
- `test_audit_update_failure_does_not_block_tool_response` — Neo4j
  write raises → tool still returns data.

### Frontend unit tests (`frontend/src/...`)

- `CopyMcpConfigButton.test.tsx` — renders snippet with token correctly
  templated; copy button invokes `navigator.clipboard.writeText` with
  the expected JSON string.
- Share-token list test updated to assert `mcp_last_used_at` and
  `mcp_use_count` render when present, and are hidden when
  `mcp_use_count === 0`.

### Manual QA checklist (in PR description)

- [ ] Mint a share token, paste snippet into Cursor config, verify
  tool list populates.
- [ ] Issue a tool call from the AI client, confirm response contains
  the scoped orb.
- [ ] Check share-token UI shows updated `mcp_use_count` after the
  call.
- [ ] Revoke the share token in the UI, confirm subsequent tool calls
  return 401.
- [ ] Spam the token past 120/min, confirm 429 with `Retry-After`.

## Out of Scope (explicit follow-ups)

- **Vanity MCP domain** (`mcp.open-orbis.com`) — DNS + Cloud Run custom
  domain mapping. Zero code change in this PR.
- **Per-tool-call audit log** — only aggregate counter for now. If we
  later want "which tool was called at what time", add a
  `ShareTokenUsage` node per call.
- **Redis-backed rate limiter** — upgrade when abuse becomes a real
  pattern or when MCP traffic justifies horizontal-scaling accuracy.
- **`mcp_enabled` opt-out flag on ShareToken** — add only if / when an
  owner asks for web-only share tokens.
- **Claude Desktop native streamable-http support** — we document the
  `mcp-proxy` workaround, not bundle one.
- **Alerting on abnormal spikes** — manual monitoring via the owner's
  share-token UI for v1.

## Migration

None. Existing share tokens are immediately MCP-usable after deploy.
`mcp_use_count` is nullable-defaulting-to-0, so old rows work without
a backfill. `mcp_last_used_at` is nullable.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Leaked share token scraped at high QPS | Medium | 120 req/min per-token cap; owner sees `mcp_use_count` spike and can revoke. |
| Owner misunderstands that share tokens are now also MCP credentials | Medium | `[Copy MCP config]` button is only visible on share-token rows; reminder copy in the popover. Docs call it out. |
| FastMCP prefix-route collision | Low | FastMCP mounts streamable-http at `/mcp`; we don't alter routing. New middleware runs at Starlette layer, transparent to FastMCP. |
| ContextVar propagation bug under high concurrency | Low | ContextVar is the documented Starlette primitive; existing `_current_user_id` already uses it. Unit tests cover concurrent calls. |
| MCP client support variance (Claude Desktop vs Cursor vs Cline) | High | Only Cursor + Cline + Windsurf listed as supported in the snippet label; Claude Desktop users directed to `mcp-proxy`. |

## Success Criteria

- An owner mints a share token, copies the MCP config snippet, and a
  recipient successfully wires it into Cursor without editing the
  snippet.
- The 5 existing tools return correctly scoped data under the share
  context, with the share token's keyword / hidden-type filters
  applied.
- A leaked or revoked token returns 401 immediately; rate-limited
  tokens return 429 with `Retry-After`.
- The owner can see MCP usage per share token in the UI.
- All existing `orbk_` user-key flows are unchanged — zero regression
  on today's MCP behavior.
