"""Admin router: OAuth client visibility + disable."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.db.postgres import get_pool
from app.dependencies import require_admin
from app.oauth import db as oauth_db

router = APIRouter(prefix="/admin/oauth", tags=["admin-oauth"])


@router.get("/clients")
async def list_clients(_admin: dict = Depends(require_admin)) -> dict:
    """List the 200 most recent OAuth client registrations."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT client_id, client_name, token_endpoint_auth_method,
                   registered_at, registered_from_ip, registered_user_agent,
                   disabled_at
              FROM oauth_clients
          ORDER BY registered_at DESC
             LIMIT 200
            """
        )
    return {
        "clients": [
            {
                "client_id": str(row["client_id"]),
                "client_name": row["client_name"],
                "token_endpoint_auth_method": row["token_endpoint_auth_method"],
                "registered_at": row["registered_at"].isoformat(),
                "registered_from_ip": (
                    str(row["registered_from_ip"])
                    if row["registered_from_ip"]
                    else None
                ),
                "registered_user_agent": row["registered_user_agent"],
                "disabled": row["disabled_at"] is not None,
            }
            for row in rows
        ]
    }


@router.post("/clients/{client_id}/disable")
async def disable_client(
    client_id: str,
    _admin: dict = Depends(require_admin),
) -> dict:
    """Disable a client — prevents new auth flows; existing tokens keep working."""
    try:
        cid = uuid.UUID(client_id)
    except ValueError as e:
        raise HTTPException(400, "invalid client_id") from e
    pool = await get_pool()
    await oauth_db.disable_client(pool, cid)
    return {"status": "disabled"}
