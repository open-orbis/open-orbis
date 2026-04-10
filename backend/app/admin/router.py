"""Admin endpoints for the closed-beta invitation system and user management."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver

from app.admin.models import (
    AccessCodeBatchCreate,
    AccessCodeCreate,
    AccessCodeResponse,
    AccessCodeUpdate,
    BatchActivateRequest,
    BetaConfigResponse,
    BetaConfigUpdate,
    InviteCodeCounts,
    PendingUser,
    StatsResponse,
    UserDetailResponse,
    UserResponse,
)
from app.admin.service import (
    activate_user_by_admin,
    consume_access_code,
    count_access_codes,
    count_pending_persons,
    count_persons,
    create_access_code,
    create_batch_access_codes,
    delete_access_code,
    delete_user,
    get_access_code,
    get_beta_config,
    get_user_detail,
    grant_admin,
    list_access_codes,
    list_all_users,
    list_pending_persons,
    revoke_admin,
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


def _serialize_user(node: dict) -> UserResponse:
    return UserResponse(
        user_id=node.get("user_id", ""),
        name=node.get("name", "") or "",
        email=node.get("email", ""),
        provider=node.get("provider", "") or "",
        is_admin=bool(node.get("is_admin", False)),
        signup_code=node.get("signup_code"),
        activated_at=str(node["activated_at"]) if node.get("activated_at") else None,
        created_at=str(node.get("created_at", "")),
    )


def _serialize_user_detail(node: dict) -> UserDetailResponse:
    return UserDetailResponse(
        user_id=node.get("user_id", ""),
        name=node.get("name", "") or "",
        email=node.get("email", ""),
        provider=node.get("provider", "") or "",
        is_admin=bool(node.get("is_admin", False)),
        signup_code=node.get("signup_code"),
        activated_at=str(node["activated_at"]) if node.get("activated_at") else None,
        created_at=str(node.get("created_at", "")),
        orb_id=node.get("orb_id", "") or "",
        picture=node.get("picture", "") or "",
        headline=node.get("headline", "") or "",
        location=node.get("location", "") or "",
        node_count=node.get("node_count", 0),
        gdpr_consent=bool(node.get("gdpr_consent", False)),
        deletion_requested_at=(
            str(node["deletion_requested_at"])
            if node.get("deletion_requested_at")
            else None
        ),
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


# ── User Management ──


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    return [_serialize_user(u) for u in await list_all_users(db)]


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user(
    user_id: str,
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    user = await get_user_detail(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize_user_detail(user)


@router.post("/users/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    """Activate a pending user by generating an admin-assigned code."""
    code = f"admin-{uuid.uuid4().hex[:8]}"
    await create_access_code(db, code=code, label="admin-grant", created_by=admin["user_id"])
    user = await activate_user_by_admin(db, user_id, code)
    if user is None:
        raise HTTPException(
            status_code=400, detail="User not found or already activated"
        )
    await consume_access_code(db, code, user_id)
    return _serialize_user(user)


@router.post("/users/activate-batch", response_model=list[UserResponse])
async def activate_users_batch(
    body: BatchActivateRequest,
    admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    """Activate multiple pending users at once."""
    activated = []
    for uid in body.user_ids:
        code = f"admin-{uuid.uuid4().hex[:8]}"
        await create_access_code(
            db, code=code, label="admin-grant", created_by=admin["user_id"]
        )
        user = await activate_user_by_admin(db, uid, code)
        if user is not None:
            await consume_access_code(db, code, uid)
            activated.append(_serialize_user(user))
    return activated


@router.post("/users/{user_id}/promote", response_model=UserResponse)
async def promote_user(
    user_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot promote yourself")
    user = await grant_admin(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize_user(user)


@router.post("/users/{user_id}/demote", response_model=UserResponse)
async def demote_user(
    user_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    user = await revoke_admin(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize_user(user)


@router.delete("/users/{user_id}", status_code=204)
async def remove_user(
    user_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    found = await delete_user(db, user_id)
    if not found:
        raise HTTPException(status_code=404, detail="User not found")
    # Clean up secondary storage
    _cleanup_secondary_storage(user_id)
    return None


def _cleanup_secondary_storage(user_id: str) -> None:
    """Best-effort cleanup of CV, drafts and snapshot storage."""
    import contextlib

    with contextlib.suppress(Exception):
        from app.cv_storage.storage import delete_all_for_user as delete_cvs

        delete_cvs(user_id)
    with contextlib.suppress(Exception):
        from app.drafts.db import delete_all_for_user as delete_drafts

        delete_drafts(user_id)
    with contextlib.suppress(Exception):
        from app.snapshots.db import delete_all_for_user as delete_snapshots

        delete_snapshots(user_id)
