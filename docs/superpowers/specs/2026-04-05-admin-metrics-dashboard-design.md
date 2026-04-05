# Admin Metrics Dashboard & LLM Token Tracking

**Issue:** #91 — Track per-user LLM token usage for developer metrics
**Date:** 2026-04-05
**Scope:** Admin dashboard with full analytics, LLM token tracking, user behavior metrics

---

## Overview

Add an admin metrics dashboard to Orbis that provides visibility into user behavior, LLM token consumption, registration funnels, and platform growth. The dashboard lives at `/admin` within the existing React app, uses self-hosted PostHog for analytics storage, and has its own authentication system independent from Google OAuth.

## Architecture

### Data Distribution

| Store | Purpose |
|-------|---------|
| **Neo4j** | Graph data only (Person, Skills, WorkExperience, etc.) |
| **PostHog** | All analytics events + LLM token usage as custom events |
| **PostgreSQL (PostHog's)** | `admin_users` table (isolated `orbis_admin` schema) |

### Data Flow

```
Frontend (posthog-js)    ──→  PostHog  (page views, navigation, UI actions)
Backend (posthog-python) ──→  PostHog  (server-side actions, LLM token usage)
Admin Dashboard          ←──  PostHog API (all analytics) + PostgreSQL (admin auth)
```

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

## LLM Token Tracking

Core of issue #91. LLM token usage stored as PostHog custom events.

### Event Schema

```python
posthog.capture(user_id, "llm_usage", {
    "operation": "cv_classification",    # or "note_enhancement"
    "model": "llama3.2:3b",             # or "claude-opus-4-6"
    "provider": "ollama",                # or "anthropic"
    "input_tokens": 1200,
    "output_tokens": 450,
    "latency_ms": 2300
})
```

### Token Capture Points

| File | Provider | How |
|------|----------|-----|
| `cv/ollama_classifier.py` | Ollama | Parse `prompt_eval_count` and `eval_count` from response |
| `cv/claude_classifier.py` | Anthropic | Read `usage.input_tokens` and `usage.output_tokens` from response |
| `notes/router.py` | Anthropic | Read `usage.input_tokens` and `usage.output_tokens` from response |

---

## Analytics Event Tracking

### Frontend Events (posthog-js)

`posthog-js` initialized in `App.tsx` with **autocapture enabled** — gets page views, clicks, and inputs automatically.

Manual captures for specific events:

| Event | Trigger Point |
|-------|--------------|
| `orb_shared` | Filter token creation / copy share link |
| `orb_filter_applied` | Node type filter toggled |
| `cv_export_started` | Export button clicked (PDF/JSON) |
| `search_performed` | Search submitted |
| `graph_interaction` | Node click, zoom, rotate in 3D view |

`posthog.identify()` called on login to link anonymous sessions to authenticated users.

### Backend Events (posthog-python)

`posthog-python` SDK initialized in `analytics/posthog_client.py`.

| File | Events |
|------|--------|
| `auth/router.py` | `user_signup`, `user_login` |
| `cv/router.py` | `cv_upload_started`, `cv_upload_completed` |
| `cv/ollama_classifier.py` | `llm_usage` |
| `cv/claude_classifier.py` | `llm_usage` |
| `orbs/router.py` | `node_created`, `node_updated`, `node_deleted`, `skill_linked`, `skill_unlinked`, `orb_id_claimed`, `profile_image_uploaded`, `profile_image_deleted`, `filter_token_created` |
| `notes/router.py` | `note_enhanced`, `llm_usage` |
| `search/router.py` | `search_semantic`, `search_text` |
| `export/router.py` | `cv_export_pdf`, `cv_export_json` |
| `messages/router.py` | `message_sent`, `message_read`, `message_replied`, `message_deleted` |
| `mcp_server/tools.py` | `mcp_tool_called` (with tool name in metadata) |

All backend events sent asynchronously via `BackgroundTasks` to avoid blocking requests.

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
│   ├── posthog_client.py  # PostHog SDK initialization
│   └── tracker.py         # Helper: capture events to PostHog via BackgroundTasks
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

**Trends:**
- Line charts for key metrics over time (selectable: daily/weekly/monthly)
- Metrics: DAU, signups, CV uploads, exports, LLM tokens, messages sent
- Date range picker

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

---

## Integration Concerns

### Error Isolation

Analytics failures must never break core functionality:
- Backend: `posthog.capture()` calls wrapped in try/except — log warning on failure, never propagate
- Frontend: `posthog-js` fails silently by default — no error toasts for analytics issues

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

## Registration Metrics

Two separate metrics forming a funnel:

- **Sign-up**: first Google OAuth login (Person node created)
- **Activation**: first CV upload completed

PostHog funnel query chains: `user_signup` → `cv_upload_completed` → `orb_id_claimed` → `orb_shared`

---

## Acceptance Criteria

- [ ] PostHog self-hosted running via docker-compose
- [ ] Admin login system with separate credentials (PostgreSQL-backed)
- [ ] Each LLM API call sends token usage to PostHog with user ID, operation, model, provider
- [ ] Frontend autocapture enabled + manual captures for key UI events
- [ ] Backend tracks all listed server-side events to PostHog
- [ ] Admin dashboard with overview, trends, users, LLM usage, and events explorer pages
- [ ] Charts: sparklines, line/area/pie charts, heatmap, funnel visualization
- [ ] Real-time metrics for current day
- [ ] Analytics failures never break core app functionality
- [ ] Existing LLM flows remain fully functional
- [ ] No PII in analytics events
