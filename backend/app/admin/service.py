"""Business logic for admin dashboard — PostHog API queries and aggregation."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _get_headers() -> dict:
    return {"Authorization": f"Bearer {settings.posthog_api_key}"}


async def _posthog_get(path: str, params: dict | None = None) -> dict:
    url = f"{settings.posthog_host}/api/projects/{settings.posthog_project_id}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_get_headers(), params=params or {})
        resp.raise_for_status()
        return resp.json()


async def _posthog_post(path: str, body: dict) -> dict:
    url = f"{settings.posthog_host}/api/projects/{settings.posthog_project_id}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=_get_headers(), json=body)
        resp.raise_for_status()
        return resp.json()


async def get_overview() -> dict:
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["count()"],
            "after": week_ago,
        },
    )
    recent = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["*"],
            "orderBy": ["-timestamp"],
            "limit": 20,
        },
    )
    users_result = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["count(distinct person_id)"],
            "after": week_ago,
        },
    )
    return {
        "total_users": {
            "label": "Total Users",
            "value": users_result.get("results", [[0]])[0][0],
            "sparkline": [],
        },
        "active_today": {"label": "Active Today", "value": 0, "sparkline": []},
        "signups_this_week": {
            "label": "Signups This Week",
            "value": 0,
            "sparkline": [],
        },
        "llm_tokens_today": {"label": "LLM Tokens Today", "value": 0, "sparkline": []},
        "recent_events": recent.get("results", []),
    }


async def get_users(limit: int = 50, offset: int = 0) -> dict:
    result = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["person_id", "count()", "min(timestamp)", "max(timestamp)"],
            "groupBy": ["person_id"],
            "orderBy": ["-count()"],
            "limit": limit,
            "offset": offset,
        },
    )
    users = []
    for row in result.get("results", []):
        users.append(
            {
                "user_id": row[0] or "anonymous",
                "event_count": row[1],
                "first_seen": row[2],
                "last_seen": row[3],
                "llm_tokens": 0,
            }
        )
    return {"users": users, "total": len(users)}


async def get_user_activity(user_id: str) -> dict:
    events = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["*"],
            "where": [f"person_id = '{user_id}'"],
            "orderBy": ["-timestamp"],
            "limit": 100,
        },
    )
    llm_events = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["*"],
            "where": [f"person_id = '{user_id}'", "event = 'llm_usage'"],
            "orderBy": ["-timestamp"],
            "limit": 50,
        },
    )
    return {
        "events": events.get("results", []),
        "llm_usage": llm_events.get("results", []),
    }


async def get_llm_usage(
    user_id: str | None = None,
    model: str | None = None,
    operation: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    where = ["event = 'llm_usage'"]
    if user_id:
        where.append(f"person_id = '{user_id}'")
    if model:
        where.append(f"properties.model = '{model}'")
    if operation:
        where.append(f"properties.operation = '{operation}'")

    params: dict = {
        "kind": "EventsQuery",
        "select": [
            "properties.model",
            "properties.operation",
            "properties.provider",
            "sum(toInt64OrZero(properties.input_tokens))",
            "sum(toInt64OrZero(properties.output_tokens))",
            "count()",
        ],
        "where": where,
        "groupBy": ["properties.model", "properties.operation", "properties.provider"],
    }
    if date_from:
        params["after"] = date_from
    if date_to:
        params["before"] = date_to

    result = await _posthog_post("/query/", params)
    by_model = []
    by_operation = []
    for row in result.get("results", []):
        by_model.append(
            {
                "model": row[0],
                "input_tokens": row[3],
                "output_tokens": row[4],
                "count": row[5],
            }
        )
        by_operation.append(
            {
                "operation": row[1],
                "input_tokens": row[3],
                "output_tokens": row[4],
                "count": row[5],
            }
        )

    over_time = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": [
                "toDate(timestamp)",
                "sum(toInt64OrZero(properties.input_tokens))",
                "sum(toInt64OrZero(properties.output_tokens))",
            ],
            "where": where,
            "groupBy": ["toDate(timestamp)"],
            "orderBy": ["toDate(timestamp)"],
        },
    )
    top_users = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": [
                "person_id",
                "sum(toInt64OrZero(properties.input_tokens))",
                "sum(toInt64OrZero(properties.output_tokens))",
            ],
            "where": where,
            "groupBy": ["person_id"],
            "orderBy": ["-sum(toInt64OrZero(properties.input_tokens))"],
            "limit": 20,
        },
    )
    return {
        "by_model": by_model,
        "by_operation": by_operation,
        "over_time": [
            {"date": r[0], "input_tokens": r[1], "output_tokens": r[2]}
            for r in over_time.get("results", [])
        ],
        "top_users": [
            {"user_id": r[0], "input_tokens": r[1], "output_tokens": r[2]}
            for r in top_users.get("results", [])
        ],
    }


async def get_events(
    event_type: str | None = None,
    user_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    where = []
    if event_type:
        where.append(f"event = '{event_type}'")
    if user_id:
        where.append(f"person_id = '{user_id}'")
    params: dict = {
        "kind": "EventsQuery",
        "select": ["*"],
        "where": where,
        "orderBy": ["-timestamp"],
        "limit": limit,
        "offset": offset,
    }
    if date_from:
        params["after"] = date_from
    if date_to:
        params["before"] = date_to
    result = await _posthog_post("/query/", params)
    return {
        "events": result.get("results", []),
        "total": len(result.get("results", [])),
    }


async def get_funnel() -> dict:
    result = await _posthog_post(
        "/query/",
        {
            "kind": "FunnelsQuery",
            "series": [
                {"event": "user_signup", "kind": "EventsNode"},
                {"event": "cv_upload_completed", "kind": "EventsNode"},
                {"event": "orb_id_claimed", "kind": "EventsNode"},
                {"event": "orb_shared", "kind": "EventsNode"},
            ],
            "funnelWindowInterval": 30,
            "funnelWindowIntervalUnit": "day",
        },
    )
    return {"steps": result.get("results", [])}


async def get_trends(
    events: list[str],
    interval: str = "day",
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    series = [{"event": e, "kind": "EventsNode"} for e in events]
    params: dict = {
        "kind": "TrendsQuery",
        "series": series,
        "interval": interval,
    }
    if date_from:
        params["dateRange"] = {"date_from": date_from}
        if date_to:
            params["dateRange"]["date_to"] = date_to
    result = await _posthog_post("/query/", params)
    return {"series": result.get("results", [])}


async def get_realtime() -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    events_today = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["count()"],
            "after": today_start,
        },
    )
    active_users = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["count(distinct person_id)"],
            "after": today_start,
        },
    )
    llm_tokens = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": [
                "sum(toInt64OrZero(properties.input_tokens))",
                "sum(toInt64OrZero(properties.output_tokens))",
            ],
            "where": ["event = 'llm_usage'"],
            "after": today_start,
        },
    )
    recent = await _posthog_post(
        "/query/",
        {
            "kind": "EventsQuery",
            "select": ["*"],
            "orderBy": ["-timestamp"],
            "after": today_start,
            "limit": 20,
        },
    )
    llm_row = llm_tokens.get("results", [[0, 0]])[0]
    return {
        "events_today": events_today.get("results", [[0]])[0][0],
        "active_users": active_users.get("results", [[0]])[0][0],
        "llm_tokens_today": (llm_row[0] or 0) + (llm_row[1] or 0),
        "recent_events": recent.get("results", []),
    }
