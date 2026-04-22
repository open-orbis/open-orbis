"""OAuth Postgres DAL.

All functions take the asyncpg pool from `app.db.postgres.get_pool` —
the same pool CV jobs use. DB calls are parameterized; no user input
is ever concatenated into SQL.
"""

from __future__ import annotations

import pathlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg


async def register_client(
    pool: asyncpg.Pool,
    *,
    client_name: str,
    redirect_uris: list[str],
    token_endpoint_auth_method: str,
    client_secret_hash: str | None,
    registered_from_ip: str | None,
    registered_user_agent: str | None,
) -> uuid.UUID:
    client_id = uuid.uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_clients (
              client_id, client_secret_hash, client_name, redirect_uris,
              token_endpoint_auth_method, registered_from_ip, registered_user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            client_id,
            client_secret_hash,
            client_name,
            redirect_uris,
            token_endpoint_auth_method,
            registered_from_ip,
            registered_user_agent,
        )
    return client_id


async def get_client(pool: asyncpg.Pool, client_id: uuid.UUID) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM oauth_clients WHERE client_id = $1", client_id
        )
    return dict(row) if row else None


async def get_active_client(
    pool: asyncpg.Pool, client_id: uuid.UUID
) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM oauth_clients WHERE client_id = $1 AND disabled_at IS NULL",
            client_id,
        )
    return dict(row) if row else None


async def disable_client(pool: asyncpg.Pool, client_id: uuid.UUID) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE oauth_clients SET disabled_at = now() WHERE client_id = $1",
            client_id,
        )


async def issue_authorization_code(
    pool: asyncpg.Pool,
    *,
    code: str,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    scope: str,
    redirect_uri: str,
    code_challenge: str,
    code_challenge_method: str,
    ttl_seconds: int,
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_authorization_codes (
              code, client_id, user_id, share_token_id, scope,
              redirect_uri, code_challenge, code_challenge_method, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            code,
            client_id,
            user_id,
            share_token_id,
            scope,
            redirect_uri,
            code_challenge,
            code_challenge_method,
            expires_at,
        )


async def consume_authorization_code(
    pool: asyncpg.Pool, code: str
) -> dict[str, Any] | None:
    """Atomically mark the code consumed and return its row, or None.

    Returns None if the code doesn't exist, is expired, or has already
    been consumed.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE oauth_authorization_codes
               SET consumed_at = now()
             WHERE code = $1
               AND consumed_at IS NULL
               AND expires_at > now()
         RETURNING *
            """,
            code,
        )
    return dict(row) if row else None


async def issue_access_token(
    pool: asyncpg.Pool,
    *,
    token_hash: str,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    scope: str,
    ttl_seconds: int,
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_access_tokens (
              token_hash, client_id, user_id, share_token_id, scope, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            """,
            token_hash,
            client_id,
            user_id,
            share_token_id,
            scope,
            expires_at,
        )


async def resolve_access_token(
    pool: asyncpg.Pool, token_hash: str
) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT client_id, user_id, share_token_id, scope
              FROM oauth_access_tokens
             WHERE token_hash = $1
               AND revoked_at IS NULL
               AND expires_at > now()
            """,
            token_hash,
        )
    return dict(row) if row else None


async def touch_access_token(pool: asyncpg.Pool, token_hash: str) -> None:
    """Fire-and-forget last_used_at update. Swallows exceptions."""
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE oauth_access_tokens SET last_used_at = now() WHERE token_hash = $1",
                token_hash,
            )
    except Exception:
        pass  # telemetry must never block the response


async def revoke_access_token(pool: asyncpg.Pool, token_hash: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE oauth_access_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
            token_hash,
        )


async def issue_refresh_token(
    pool: asyncpg.Pool,
    *,
    token_hash: str,
    client_id: uuid.UUID,
    user_id: str,
    share_token_id: str | None,
    ttl_seconds: int,
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO oauth_refresh_tokens (
              token_hash, client_id, user_id, share_token_id, expires_at
            ) VALUES ($1, $2, $3, $4, $5)
            """,
            token_hash,
            client_id,
            user_id,
            share_token_id,
            expires_at,
        )


async def rotate_refresh_token(
    pool: asyncpg.Pool, *, old_hash: str, new_hash: str
) -> dict[str, Any] | None:
    """Atomically mark old refresh token revoked + rotated, return its row.

    Returns None if the token is missing, already revoked, already
    rotated, or expired. On re-use of a previously-rotated token, the
    caller (token endpoint) must trigger chain-wide revocation — see
    `revoke_refresh_chain`.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE oauth_refresh_tokens
               SET revoked_at = now(), rotated_to = $2
             WHERE token_hash = $1
               AND revoked_at IS NULL
               AND rotated_to IS NULL
               AND expires_at > now()
         RETURNING client_id, user_id, share_token_id
            """,
            old_hash,
            new_hash,
        )
    return dict(row) if row else None


async def get_refresh_token(
    pool: asyncpg.Pool, token_hash: str
) -> dict[str, Any] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM oauth_refresh_tokens WHERE token_hash = $1",
            token_hash,
        )
    return dict(row) if row else None


async def revoke_refresh_chain(pool: asyncpg.Pool, leaked_hash: str) -> None:
    """Revoke every refresh token descended from `leaked_hash`.

    A refresh-token chain is a linked list via `rotated_to`. If the
    leaked token was rotated, follow the chain and revoke every child.
    Also revoke the leaked token itself and all sibling access tokens
    for the same user_id + client_id.

    Every token in a rotation chain shares the same (user_id, client_id)
    by design — rotation never changes the principal. We therefore capture
    those values from the FIRST valid row so that a mid-chain deletion
    (row is None before we reach the tail) does not silently drop the
    access-token cascade.
    """
    user_id = None
    client_id = None
    async with pool.acquire() as conn, conn.transaction():
        to_revoke = {leaked_hash}
        cursor = leaked_hash
        while True:
            row = await conn.fetchrow(
                "SELECT rotated_to, user_id, client_id FROM oauth_refresh_tokens WHERE token_hash = $1",
                cursor,
            )
            if row is None:
                break
            # Capture principal from the FIRST valid row; every token in
            # a rotation chain shares the same (user_id, client_id) by
            # design, so any row is representative. Capturing early means
            # a mid-chain deletion doesn't silently drop the cascade.
            if user_id is None:
                user_id = row["user_id"]
                client_id = row["client_id"]
            nxt = row["rotated_to"]
            if nxt is None:
                break
            to_revoke.add(nxt)
            cursor = nxt
        await conn.execute(
            "UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = ANY($1::text[]) AND revoked_at IS NULL",
            list(to_revoke),
        )
        # Only cascade access tokens if we actually saw at least one row
        # in the chain. If the leaked token was never issued (user_id
        # stays None), there's nothing to cascade.
        if user_id is not None:
            await conn.execute(
                """
                UPDATE oauth_access_tokens
                   SET revoked_at = now()
                 WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL
                """,
                user_id,
                client_id,
            )


async def revoke_refresh_token(pool: asyncpg.Pool, token_hash: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
            token_hash,
        )


async def ensure_oauth_schema(pool: asyncpg.Pool) -> None:
    """Apply the OAuth DDL idempotently. Called once at app startup."""
    schema_path = pathlib.Path(__file__).parent / "schema.sql"
    ddl = schema_path.read_text(encoding="utf-8")
    async with pool.acquire() as conn:
        await conn.execute(ddl)


async def cascade_revoke_oauth_by_share_token(pool, share_token_id: str) -> None:
    """Revoke every OAuth access + refresh token bound to this share token.

    Called when the share token itself is revoked (e.g. user clicks Revoke
    in the Share panel). The OAuth grant is no longer meaningful without
    the share context it was bound to.
    """
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute(
            "UPDATE oauth_access_tokens SET revoked_at = now() "
            "WHERE share_token_id = $1 AND revoked_at IS NULL",
            share_token_id,
        )
        await conn.execute(
            "UPDATE oauth_refresh_tokens SET revoked_at = now() "
            "WHERE share_token_id = $1 AND revoked_at IS NULL",
            share_token_id,
        )


async def cascade_delete_user_oauth(pool, user_id: str) -> None:
    """Delete every OAuth artifact belonging to this user.

    Called from the user-deletion cleanup path. Access tokens, refresh
    tokens, and any remaining authorization codes are all purged.
    """
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute(
            "DELETE FROM oauth_access_tokens WHERE user_id = $1", user_id
        )
        await conn.execute(
            "DELETE FROM oauth_refresh_tokens WHERE user_id = $1", user_id
        )
        await conn.execute(
            "DELETE FROM oauth_authorization_codes WHERE user_id = $1", user_id
        )
