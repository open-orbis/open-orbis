"""Admin endpoints for the closed-beta invitation system."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver

from app.admin.models import (
    AccessCodeBatchCreate,
    AccessCodeCreate,
    AccessCodeResponse,
    AccessCodeUpdate,
    BetaConfigResponse,
    BetaConfigUpdate,
    InviteCodeCounts,
    PendingUser,
    StatsResponse,
)
from app.admin.service import (
    count_access_codes,
    count_pending_persons,
    count_persons,
    create_access_code,
    create_batch_access_codes,
    delete_access_code,
    get_access_code,
    get_beta_config,
    list_access_codes,
    list_pending_persons,
    set_access_code_active,
    update_beta_config,
)
from app.dependencies import get_db, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _serialize_beta_config(node: dict) -> BetaConfigResponse:
    return BetaConfigResponse(
        invite_code_required=bool(node.get("invite_code_required", True)),
        updated_at=str(node.get("updated_at", "")),
    )


def _serialize_access_code(node: dict) -> AccessCodeResponse:
    return AccessCodeResponse(
        code=node["code"],
        label=node.get("label", "") or "",
        active=bool(node.get("active", True)),
        created_at=str(node.get("created_at", "")),
        created_by=node.get("created_by", "") or "",
        used_at=str(node["used_at"]) if node.get("used_at") else None,
        used_by=node.get("used_by"),
    )


def _serialize_pending_user(node: dict) -> PendingUser:
    return PendingUser(
        user_id=node.get("user_id", ""),
        name=node.get("name", "") or "",
        email=node.get("email", ""),
        provider=node.get("provider", "") or "",
        created_at=str(node.get("created_at", "")),
    )


# ── Stats ──


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    config = await get_beta_config(db)
    registered = await count_persons(db)
    pending = await count_pending_persons(db)
    code_counts = await count_access_codes(db)
    return StatsResponse(
        registered=registered,
        pending_activation=pending,
        invite_code_required=bool(config.get("invite_code_required", True)),
        invite_codes=InviteCodeCounts(**code_counts),
    )


# ── BetaConfig ──


@router.get("/beta-config", response_model=BetaConfigResponse)
async def read_beta_config(
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    return _serialize_beta_config(await get_beta_config(db))


@router.patch("/beta-config", response_model=BetaConfigResponse)
async def patch_beta_config(
    body: BetaConfigUpdate,
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    properties: dict = {}
    if body.invite_code_required is not None:
        properties["invite_code_required"] = body.invite_code_required
    if not properties:
        raise HTTPException(status_code=400, detail="No fields to update")
    return _serialize_beta_config(await update_beta_config(db, properties))


# ── AccessCode ──


@router.get("/access-codes", response_model=list[AccessCodeResponse])
async def list_codes(
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    return [_serialize_access_code(c) for c in await list_access_codes(db)]


@router.post("/access-codes", response_model=AccessCodeResponse, status_code=201)
async def create_code(
    body: AccessCodeCreate,
    admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    existing = await get_access_code(db, body.code)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Code already exists")
    node = await create_access_code(
        db, code=body.code, label=body.label, created_by=admin["user_id"]
    )
    return _serialize_access_code(node)


@router.post(
    "/access-codes/batch",
    response_model=list[AccessCodeResponse],
    status_code=201,
)
async def create_codes_batch(
    body: AccessCodeBatchCreate,
    admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    nodes = await create_batch_access_codes(
        db,
        prefix=body.prefix,
        count=body.count,
        label=body.label,
        created_by=admin["user_id"],
    )
    return [_serialize_access_code(n) for n in nodes]


@router.patch("/access-codes/{code}", response_model=AccessCodeResponse)
async def update_code(
    code: str,
    body: AccessCodeUpdate,
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    node = await set_access_code_active(db, code, body.active)
    if node is None:
        raise HTTPException(status_code=404, detail="Code not found")
    return _serialize_access_code(node)


@router.delete("/access-codes/{code}", status_code=204)
async def remove_code(
    code: str,
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    existing = await get_access_code(db, code)
    if existing is None:
        raise HTTPException(status_code=404, detail="Code not found")
    await delete_access_code(db, code)
    return None


# ── Pending Users (registered but not activated) ──


@router.get("/pending-users", response_model=list[PendingUser])
async def get_pending_users(
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    return [_serialize_pending_user(p) for p in await list_pending_persons(db)]
