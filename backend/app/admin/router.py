"""Admin API endpoints — all require admin JWT."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.admin import service
from app.admin.auth import (
    create_admin_jwt,
    get_current_admin,
    verify_password,
)
from app.admin.db import get_admin_pool
from app.admin.schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    EventsResponse,
    FunnelResponse,
    LLMUsageResponse,
    OverviewResponse,
    RealtimeResponse,
    TrendsResponse,
    UserActivityResponse,
    UserListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(req: AdminLoginRequest):
    """Authenticate admin and return JWT."""
    try:
        pool = await get_admin_pool()
    except RuntimeError:
        raise HTTPException(
            status_code=503, detail="Admin database not available"
        ) from None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT admin_id, password_hash FROM orbis_admin.admin_users WHERE username = $1",
            req.username,
        )

    if row is None or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Update last_login
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE orbis_admin.admin_users SET last_login = now() WHERE admin_id = $1",
            row["admin_id"],
        )

    token = create_admin_jwt(str(row["admin_id"]))
    return AdminLoginResponse(access_token=token)


@router.get("/overview", response_model=OverviewResponse)
async def admin_overview(admin_id: str = Depends(get_current_admin)):
    return await service.get_overview()


@router.get("/users", response_model=UserListResponse)
async def admin_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_users(limit=limit, offset=offset)


@router.get("/users/{user_id}/activity", response_model=UserActivityResponse)
async def admin_user_activity(
    user_id: str,
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_user_activity(user_id)


@router.get("/llm-usage", response_model=LLMUsageResponse)
async def admin_llm_usage(
    user_id: str | None = Query(None),
    model: str | None = Query(None),
    operation: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_llm_usage(
        user_id=user_id,
        model=model,
        operation=operation,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/events", response_model=EventsResponse)
async def admin_events(
    event_type: str | None = Query(None),
    user_id: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin_id: str = Depends(get_current_admin),
):
    return await service.get_events(
        event_type=event_type,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/funnel", response_model=FunnelResponse)
async def admin_funnel(admin_id: str = Depends(get_current_admin)):
    return await service.get_funnel()


@router.get("/trends", response_model=TrendsResponse)
async def admin_trends(
    events: str = Query(..., description="Comma-separated event names"),
    interval: str = Query("day"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    admin_id: str = Depends(get_current_admin),
):
    event_list = [e.strip() for e in events.split(",")]
    return await service.get_trends(
        events=event_list,
        interval=interval,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/realtime", response_model=RealtimeResponse)
async def admin_realtime(admin_id: str = Depends(get_current_admin)):
    return await service.get_realtime()
