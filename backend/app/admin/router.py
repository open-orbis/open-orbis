"""Admin endpoints for the closed-beta invitation system.

All endpoints require an authenticated user whose Person node has
`is_admin = true`. The first admin must be granted out-of-band via
`backend/scripts/grant_admin.py`.
"""

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
    StatsResponse,
    WaitlistContactedUpdate,
    WaitlistEntry,
    WaitlistReasonCounts,
)
from app.admin.service import (
    count_access_codes,
    count_persons,
    create_access_code,
    create_batch_access_codes,
    delete_access_code,
    get_access_code,
    get_beta_config,
    list_access_codes,
    list_waitlist,
    mark_waitlist_contacted,
    set_access_code_active,
    update_beta_config,
    waitlist_stats,
)
from app.dependencies import get_db, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _serialize_beta_config(node: dict) -> BetaConfigResponse:
    return BetaConfigResponse(
        max_users=int(node.get("max_users", 0)),
        registration_enabled=bool(node.get("registration_enabled", True)),
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


def _serialize_waitlist(node: dict) -> WaitlistEntry:
    return WaitlistEntry(
        email=node.get("email", ""),
        name=node.get("name", "") or "",
        provider=node.get("provider", "") or "",
        attempted_code=node.get("attempted_code"),
        reason=node.get("reason", ""),
        first_attempt_at=str(node.get("first_attempt_at", "")),
        last_attempt_at=str(node.get("last_attempt_at", "")),
        attempts=int(node.get("attempts", 1)),
        contacted=bool(node.get("contacted", False)),
        contacted_at=(str(node["contacted_at"]) if node.get("contacted_at") else None),
    )


# ── Stats ──


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    config = await get_beta_config(db)
    registered = await count_persons(db)
    code_counts = await count_access_codes(db)
    by_reason_raw = await waitlist_stats(db)
    by_reason = WaitlistReasonCounts(
        no_code=by_reason_raw.get("no_code", 0),
        invalid_code=by_reason_raw.get("invalid_code", 0),
        code_already_used=by_reason_raw.get("code_already_used", 0),
        registration_closed=by_reason_raw.get("registration_closed", 0),
    )
    return StatsResponse(
        registered=registered,
        registration_enabled=bool(config.get("registration_enabled", True)),
        invite_codes=InviteCodeCounts(**code_counts),
        waitlist_total=sum(by_reason_raw.values()),
        waitlist_by_reason=by_reason,
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
    if body.max_users is not None:
        properties["max_users"] = body.max_users
    if body.registration_enabled is not None:
        properties["registration_enabled"] = body.registration_enabled
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
    """Generate `count` unique single-use codes with auto-generated suffixes."""
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


# ── Waitlist ──


@router.get("/waitlist", response_model=list[WaitlistEntry])
async def get_waitlist(
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    return [_serialize_waitlist(w) for w in await list_waitlist(db)]


@router.patch("/waitlist/{email}", response_model=WaitlistEntry)
async def patch_waitlist_contacted(
    email: str,
    body: WaitlistContactedUpdate,
    _admin: dict = Depends(require_admin),
    db: AsyncDriver = Depends(get_db),
):
    node = await mark_waitlist_contacted(db, email, body.contacted)
    if node is None:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    return _serialize_waitlist(node)
