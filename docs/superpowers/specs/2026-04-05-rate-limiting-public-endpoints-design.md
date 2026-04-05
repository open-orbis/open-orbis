# Rate Limiting Public Endpoints

**Issue:** [#92 — Security: prevent orb_id enumeration and data scraping](https://github.com/Brotherhood94/orb_project/issues/92)
**Date:** 2026-04-05
**Status:** Draft

## Problem

The public endpoints `GET /orbs/{orb_id}` and `GET /export/{orb_id}` accept user-chosen orb IDs with no rate limiting. An attacker can iterate through common names or dictionary words to enumerate and scrape all public profiles and their full graph data.

## Decision: Keep User-Friendly IDs

Orb IDs remain short, user-chosen strings (e.g., `alessandro`). Enumeration is mitigated through per-IP rate limiting and access logging rather than adding random suffixes to IDs.

## Design

### 1. Rate Limiting with slowapi

Add the `slowapi` library to apply per-IP rate limits on public endpoints.

**Endpoints affected:**
- `GET /orbs/{orb_id}` — 30 requests/minute per IP
- `GET /export/{orb_id}` — 30 requests/minute per IP

**Behavior when exceeded:**
- HTTP 429 response with body: `{"detail": "Rate limit exceeded. Try again in X seconds."}`

**Implementation details:**
- `slowapi` `Limiter` instance created in `main.py` with `key_func=get_remote_address`
- `SlowAPIMiddleware` added to the FastAPI app
- A global exception handler registered for `RateLimitExceeded` to return a JSON 429 response
- In-memory storage backend (default) — sufficient for single-instance deployment
- Authenticated endpoints (`/orbs/me`, `/orbs/me/*`, etc.) are not rate limited

### 2. Access Logging

Add structured logging to public endpoints for monitoring and detecting enumeration patterns.

**What is logged per request:**
- IP address (from `request.client.host`)
- Requested `orb_id`
- Timestamp (via standard logging)
- Response status (200 or 404)

**Log format:**
```
PUBLIC_ACCESS | ip=192.168.1.1 | orb_id=alessandro | status=200
```

**Scope:**
- Logging only — no automated alerting or blocking
- Works behind reverse proxies when uvicorn runs with `--proxy-headers`

### 3. What Is NOT Changed

- **Orb ID scheme** — user-friendly, no random suffix
- **Authenticated endpoints** — no rate limiting applied
- **Response scoping** — public endpoint continues to return the full graph (can be scoped separately in a future issue)

## Files Changed

| File | Change |
|------|--------|
| `backend/pyproject.toml` | Add `slowapi` dependency |
| `backend/app/main.py` | Create `Limiter`, add `SlowAPIMiddleware`, register 429 exception handler |
| `backend/app/orbs/router.py` | Apply `@limiter.limit("30/minute")` to `get_public_orb`, add access logging |
| `backend/app/export/router.py` | Apply `@limiter.limit("30/minute")` to `export_orb`, add access logging |
| `backend/tests/unit/test_rate_limit.py` | New test verifying 429 behavior when limit is exceeded |

## Acceptance Criteria

- [ ] Public endpoints have per-IP rate limiting (30 req/min)
- [ ] Exceeding the rate limit returns HTTP 429 with a clear JSON message
- [ ] Access to public endpoints is logged with IP and orb_id
- [ ] No regressions in authenticated endpoint performance
- [ ] Test coverage for rate limit behavior
