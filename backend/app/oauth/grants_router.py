"""User-facing GET /api/oauth/grants + DELETE /api/oauth/grants/{client_id}."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.db.postgres import get_pool
from app.dependencies import get_current_user

router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.get("/grants")
async def list_grants(user: dict = Depends(get_current_user)) -> dict:
    """Return the current user's active OAuth grants.

    Groups by (client_id, share_token_id) so a user sees one row per
    (AI client, access-mode). Refresh tokens that have been rotated
    (rotated_to IS NOT NULL) are excluded — only the latest in each
    chain is considered active.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.client_id,
                   c.client_name,
                   r.share_token_id,
                   MIN(r.issued_at) AS connected_at,
                   (SELECT MAX(a.last_used_at)
                      FROM oauth_access_tokens a
                     WHERE a.client_id = c.client_id
                       AND a.user_id = $1
                       AND (r.share_token_id IS NULL
                            OR a.share_token_id = r.share_token_id)
                   ) AS last_used_at
              FROM oauth_refresh_tokens r
              JOIN oauth_clients c USING (client_id)
             WHERE r.user_id = $1
               AND r.revoked_at IS NULL
               AND r.rotated_to IS NULL
               AND r.expires_at > now()
          GROUP BY c.client_id, c.client_name, r.share_token_id
          ORDER BY MIN(r.issued_at) ASC
            """,
            user["user_id"],
        )
    return {
        "grants": [
            {
                "client_id": str(row["client_id"]),
                "client_name": row["client_name"],
                "share_token_id": row["share_token_id"],
                "share_token_label": None,  # frontend joins with /share-tokens
                "connected_at": row["connected_at"].isoformat(),
                "last_used_at": (
                    row["last_used_at"].isoformat() if row["last_used_at"] else None
                ),
            }
            for row in rows
        ]
    }


@router.delete("/grants/{client_id}")
async def revoke_grant(
    client_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """Revoke every live access + refresh token for (current user, client_id).

    Idempotent — unknown client_id or no matching tokens returns 200 with
    empty status. The orb owner cannot revoke another user's grants even
    if they share a client_id.
    """
    try:
        cid = uuid.UUID(client_id)
    except ValueError as e:
        raise HTTPException(400, "invalid client_id") from e

    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute(
            """
            UPDATE oauth_access_tokens
               SET revoked_at = now()
             WHERE client_id = $1 AND user_id = $2 AND revoked_at IS NULL
            """,
            cid,
            user["user_id"],
        )
        await conn.execute(
            """
            UPDATE oauth_refresh_tokens
               SET revoked_at = now()
             WHERE client_id = $1 AND user_id = $2 AND revoked_at IS NULL
            """,
            cid,
            user["user_id"],
        )
    return {"status": "revoked"}
