# Admin Metrics Dashboard & LLM Token Tracking

**Issue:** #91 — Track per-user LLM token usage for developer metrics
**Date:** 2026-04-05
**Scope:** Admin dashboard with full analytics, LLM token tracking, user behavior metrics

---

## Overview

Add an admin metrics dashboard to Orbis that provides visibility into user behavior, LLM token consumption, registration funnels, and platform growth. Analytics is implemented as a **second layer** that wraps the application — the app code itself has no knowledge of analytics. The system uses an ASGI middleware for request-level tracking, an in-process event bus for LLM-specific data, and self-hosted PostHog for storage and querying. The admin dashboard lives at `/admin` within the React app with its own independent authentication system.

## Core Principle: Analytics as a Second Layer

The analytics system wraps the app rather than being embedded in it:

1. **ASGI Middleware** intercepts all HTTP requests/responses — app routes are unaware
2. **Event Bus** is the only analytics touchpoint inside app code — classifiers emit lightweight events, never import PostHog or analytics modules
3. **Frontend Tracker** abstracts PostHog behind a thin interface — components never import PostHog directly

Analytics failures never break core functionality. All tracking is fire-and-forget.

---

## Architecture

### Data Distribution

| Store | Purpose |
|-------|---------|
| **Neo4j** | Graph data only (Person, Skills, WorkExperience, etc.) |
| **PostHog** | All analytics events + LLM token usage as custom events |
| **PostgreSQL (PostHog's)** | `admin_users` table (isolated `orbis_admin` schema) |

### Data Flow

```
ASGI Middleware           ──→  PostHog  (request timing, status, endpoint, user)
Event Bus (LLM events)   ──→  PostHog  (token counts, model, provider, latency)
Frontend Tracker          ──→  PostHog  (page views, UI actions via posthog-js)
Admin Dashboard           ←──  PostHog API (all analytics) + PostgreSQL (admin auth)
```

---

## Second Layer: ASGI Middleware

### `backend/app/analytics/middleware.py`

A single Starlette middleware that wraps every request:

**Captures automatically (no app code changes):**
- Endpoint path and HTTP method
- Response status code
- Response time (ms)
- User ID (extracted from JWT in Authorization header — read-only, no auth logic)
- Timestamp
- Request content length

**LLM event integration:**
- After each request completes, checks the event bus for any `llm_usage` events emitted during that request
- Bundles them with the request context (user ID, endpoint) and sends to PostHog
- Uses request-scoped context via Python `contextvars` to correlate events to requests

**Error isolation:**
- All PostHog calls wrapped in try/except — log warning on failure, never propagate
- Middleware never modifies the request or response

**Excluded paths:**
- `/docs`, `/openapi.json`, `/health` — no tracking for infrastructure endpoints
- `/api/admin/*` — admin requests not tracked (avoid recursion and noise)

### Event Schema — Request Tracking

```python
posthog.capture(user_id or "anonymous", "http_request", {
    "method": "POST",
    "path": "/cv/upload",
    "status_code": 200,
    "duration_ms": 1234,
    "content_length": 56789
})
```

---

## Second Layer: Event Bus

### `backend/app/analytics/event_bus.py`

Lightweight in-process pub/sub using Python `contextvars` for request scoping:

```python
# Public API — this is the ONLY analytics import app code ever uses
def emit(event_type: str, data: dict) -> None:
    """Fire-and-forget event emission. Never raises."""
```

**How it works:**
1. Middleware sets up a request-scoped event collector (via `contextvars.ContextVar`)
2. App code calls `event_bus.emit("llm_usage", {...})` — appends to the collector
3. After the request completes, middleware reads all collected events and sends to PostHog
4. If no middleware is present (e.g., testing), events are silently discarded

**LLM Usage Event Schema:**

```python
event_bus.emit("llm_usage", {
    "operation": "cv_classification",    # or "note_enhancement"
    "model": "llama3.2:3b",             # or "claude-opus-4-6"
    "provider": "ollama",                # or "anthropic"
    "input_tokens": 1200,
    "output_tokens": 450,
    "latency_ms": 2300
})
```

### Token Capture Points (minimal app code changes)

| File | Change |
|------|--------|
| `cv/ollama_classifier.py` | After Ollama HTTP response, emit `llm_usage` with `prompt_eval_count` and `eval_count` |
| `cv/claude_classifier.py` | After Claude CLI response, emit `llm_usage` with `usage.input_tokens` and `usage.output_tokens` |
| `notes/router.py` | After LLM call for note enhancement, emit `llm_usage` with token counts |

Each change is 3-5 lines: import `event_bus`, emit one event. No PostHog import, no analytics logic.

---

## Second Layer: Frontend Tracker

### `frontend/src/analytics/tracker.ts`

Thin abstraction over `posthog-js`:

```typescript
// Public API — components import this, never posthog-js directly
export function trackEvent(name: string, properties?: Record<string, unknown>): void
export function identifyUser(userId: string): void
export function resetUser(): void
```

**Initialization:**
- `initTracker()` called once in `App.tsx`
- Enables PostHog autocapture (page views, clicks, inputs — automatic)
- Calls `posthog.identify()` on login to link anonymous sessions

**Manual captures via tracker:**

| Event | Trigger Point |
|-------|--------------|
| `orb_shared` | Filter token creation / copy share link |
| `orb_filter_applied` | Node type filter toggled |
| `cv_export_started` | Export button clicked (PDF/JSON) |
| `search_performed` | Search submitted |
| `graph_interaction` | Node click, zoom, rotate in 3D view |

**Error isolation:**
- `trackEvent` wraps all calls in try/catch — never throws
- If PostHog fails to initialize, all tracker functions become no-ops

---

## Infrastructure

### PostHog Self-Hosted

Added to `docker-compose.yml` using PostHog's official compose stack:
- PostgreSQL (shared — PostHog's own + `orbis_admin` schema for admin auth)
- Redis
- ClickHouse
- Kafka
- PostHog worker + web

Accessible at `localhost:8000`.

### New Environment Variables

```
POSTHOG_API_KEY=phc_...           # Project API key
POSTHOG_HOST=http://localhost:8000 # Self-hosted instance URL
POSTHOG_PROJECT_ID=1               # Project ID for API queries

ADMIN_JWT_SECRET=...               # Separate from user JWT_SECRET
ADMIN_JWT_EXPIRE_MINUTES=60        # Shorter expiry than user tokens

ADMIN_DB_HOST=localhost            # PostHog's PostgreSQL
ADMIN_DB_PORT=5432
ADMIN_DB_NAME=posthog              # Same DB, different schema
ADMIN_DB_USER=posthog
ADMIN_DB_PASSWORD=...
```

---

## Admin Authentication

Fully independent from Google OAuth user auth.

### Database Schema (PostgreSQL — `orbis_admin` schema)

```sql
CREATE SCHEMA IF NOT EXISTS orbis_admin;

CREATE TABLE orbis_admin.admin_users (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);
```

### Auth Flow

1. Admin credentials seeded via CLI: `python -m app.admin.seed --username admin --password ...`
2. `POST /api/admin/login` validates credentials, returns admin JWT
3. Admin JWT contains `{"type": "admin", "admin_id": "..."}` claim
4. `get_current_admin` FastAPI dependency verifies admin JWT — completely separate from `get_current_user`
5. Admin JWT uses `ADMIN_JWT_SECRET` (separate secret) with 60-minute expiry

---

## Backend Module Structure

```
backend/app/
├── admin/
│   ├── router.py          # Admin API endpoints
│   ├── service.py         # Business logic (PostHog API queries, aggregation)
│   ├── auth.py            # Admin JWT auth + PostgreSQL credential check
│   ├── schemas.py         # Pydantic request/response models
│   ├── seed.py            # CLI to seed admin credentials
│   └── db.py              # PostgreSQL connection for admin schema
├── analytics/
│   ├── middleware.py       # ASGI middleware — request-level tracking
│   ├── event_bus.py        # In-process event bus (pub/sub with contextvars)
│   ├── posthog_client.py   # PostHog SDK initialization + singleton
│   └── tracker.py          # Backend helper: flush events to PostHog
```

### Admin API Endpoints

All require admin JWT.

| Endpoint | Method | Source | Purpose |
|----------|--------|--------|---------|
| `/api/admin/login` | POST | PostgreSQL | Admin login |
| `/api/admin/overview` | GET | PostHog API | Summary cards + sparklines |
| `/api/admin/users` | GET | PostHog API | User list with activity summaries |
| `/api/admin/users/{user_id}/activity` | GET | PostHog API | Detailed user activity |
| `/api/admin/llm-usage` | GET | PostHog API | Token usage (filterable by user, model, operation, date range) |
| `/api/admin/events` | GET | PostHog API | Raw event explorer with pagination + filters |
| `/api/admin/funnel` | GET | PostHog API | Sign-up → activation → retention funnel |
| `/api/admin/trends` | GET | PostHog API | Time-series for any metric (daily/weekly/monthly) |
| `/api/admin/realtime` | GET | PostHog API | Today's live metrics |

---

## Frontend Architecture

### Admin Routes

```
/admin/login    — standalone login page
/admin          — dashboard home (redirects to login if no admin JWT)
/admin/users    — user list & detail views
/admin/llm      — LLM token usage deep dive
/admin/events   — raw event explorer
```

### Admin Auth State

- Admin JWT stored in `sessionStorage` (cleared on tab close)
- Separate `adminAuthStore` Zustand store, fully independent from user `authStore`
- Axios instance with admin JWT interceptor for `/api/admin/*` calls

### Dashboard Pages

**Overview (home):**
- Summary cards: total users, active today, signups this week, LLM tokens consumed today
- Sparklines on each card showing 7-day trend
- Registration funnel: sign-ups → first CV upload → orb ID claimed → first share
- Real-time activity feed (last 20 events)

**Users:**
- Sortable table: name, signup date, last active, node count, LLM tokens used, action count
- Click into user detail: activity timeline, LLM usage breakdown, session history

**LLM Usage:**
- Total tokens by model (pie chart)
- Tokens over time by operation (stacked area chart)
- Per-user token leaderboard
- Cost estimation (configurable $/token rates)

**Events Explorer:**
- Filterable, paginated raw event log
- Filters: event type, category, user, date range
- Heatmap: events by hour-of-day x day-of-week (shows when users are most active)

### Charting Library

**Recharts** — React-native, composable, lightweight. Supports line, bar, area, pie, funnel charts.

### UI Style

Functional/utilitarian — clean Tailwind layout, focus on data clarity. No animations or fancy design.

---

## Registration Metrics

Two separate metrics forming a funnel:

- **Sign-up**: first Google OAuth login (Person node created)
- **Activation**: first CV upload completed

PostHog funnel query chains: `user_signup` → `cv_upload_completed` → `orb_id_claimed` → `orb_shared`

---

## Integration Concerns

### Error Isolation

Analytics failures must never break core functionality:
- Backend middleware: all PostHog calls wrapped in try/except — log warning on failure, never propagate
- Event bus: `emit()` never raises — silently discards on error
- Frontend tracker: `trackEvent()` wraps in try/catch — never throws
- Frontend `posthog-js`: fails silently by default — no error toasts

### Security

- Admin endpoints on separate router prefix (`/api/admin/`) with dedicated `get_current_admin` dependency
- Admin JWT uses different secret (`ADMIN_JWT_SECRET`) from user JWT
- PostHog instance not exposed externally (internal Docker network only)
- No PII in PostHog events — `user_id` only, never email or name
- `orbis_admin` PostgreSQL schema isolated from PostHog's own tables

### New Dependencies

**Backend:**
- `posthog` — Python SDK for event capture
- `bcrypt` — admin password hashing
- `asyncpg` — async PostgreSQL driver for admin auth

**Frontend:**
- `posthog-js` — JavaScript SDK for event capture + autocapture
- `recharts` — charting library

**Infrastructure:**
- PostHog self-hosted stack (added to docker-compose.yml)

---

## Acceptance Criteria

- [ ] PostHog self-hosted running via docker-compose
- [ ] ASGI middleware captures all request-level metrics without app code changes
- [ ] Event bus captures LLM token usage with minimal (3-5 lines per file) classifier changes
- [ ] Frontend tracker abstraction wraps posthog-js — no direct PostHog imports in components
- [ ] Admin login system with separate credentials (PostgreSQL-backed)
- [ ] Admin dashboard with overview, users, LLM usage, and events explorer pages
- [ ] Charts: sparklines, line/area/pie charts, heatmap, funnel visualization
- [ ] Real-time metrics for current day
- [ ] Analytics failures never break core app functionality
- [ ] Existing LLM flows remain fully functional
- [ ] No PII in analytics events
