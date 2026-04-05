# Rate Limiting Public Endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-IP rate limiting and access logging to the two public endpoints (`GET /orbs/{orb_id}`, `GET /export/{orb_id}`) to prevent orb_id enumeration and data scraping.

**Architecture:** Add `slowapi` as a dependency with a `Limiter` instance in `main.py`. Apply `@limiter.limit("30/minute")` decorators to the two public route handlers. Add structured access logging inside each handler. A shared `limiter` module avoids circular imports between `main.py` and the routers.

**Tech Stack:** FastAPI, slowapi, Python standard logging

---

### Task 1: Add slowapi dependency

**Files:**
- Modify: `backend/pyproject.toml:6-22`

- [ ] **Step 1: Add slowapi to dependencies**

In `backend/pyproject.toml`, add `slowapi` to the `dependencies` list:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "neo4j>=5.20.0",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "python-jose[cryptography]>=3.3.0",
    "authlib>=1.3.0",
    "httpx>=0.27.0",
    "anthropic>=0.40.0",
    "pymupdf>=1.24.0",
    "python-docx>=1.1.0",
    "cryptography>=43.0.0",
    "python-multipart>=0.0.9",
    "mcp[cli]>=1.0.0",
    "fpdf2>=2.8.7",
    "slowapi>=0.1.9",
]
```

- [ ] **Step 2: Install the dependency**

Run: `cd backend && pip install -e .`
Expected: slowapi installs successfully

- [ ] **Step 3: Commit**

```bash
git add backend/pyproject.toml
git commit -m "chore: add slowapi dependency for rate limiting"
```

---

### Task 2: Create shared limiter module

**Files:**
- Create: `backend/app/rate_limit.py`

slowapi's `Limiter` must be created once and shared between `main.py` (which registers the middleware/exception handler) and the routers (which apply `@limiter.limit()`). A small module avoids circular imports.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_rate_limit.py`:

```python
from app.rate_limit import limiter


def test_limiter_exists():
    """Limiter instance is importable and configured."""
    assert limiter is not None
    assert limiter._default_limits == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py::test_limiter_exists -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.rate_limit'`

- [ ] **Step 3: Create the limiter module**

Create `backend/app/rate_limit.py`:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py::test_limiter_exists -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/rate_limit.py backend/tests/unit/test_rate_limit.py
git commit -m "feat: add shared slowapi limiter module"
```

---

### Task 3: Register limiter in FastAPI app

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/unit/test_rate_limit.py`:

```python
from app.main import app


def test_app_has_rate_limit_state():
    """The limiter is attached to app.state."""
    assert hasattr(app.state, "limiter")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py::test_app_has_rate_limit_state -v`
Expected: FAIL with `AssertionError`

- [ ] **Step 3: Wire limiter into main.py**

In `backend/app/main.py`, add imports and registration after the CORS middleware:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.auth.router import router as auth_router
from app.config import settings
from app.cv.router import router as cv_router
from app.export.router import router as export_router
from app.graph.neo4j_client import close_driver, get_driver
from app.messages.router import router as messages_router
from app.notes.router import router as notes_router
from app.orbs.router import router as orbs_router
from app.rate_limit import limiter
from app.search.router import router as search_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Neo4j connection
    driver = await get_driver()
    async with driver.session() as session:
        await session.run("RETURN 1")
    yield
    # Shutdown
    await close_driver()


app = FastAPI(title="Orbis API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded. Try again in {exc.detail} seconds."},
    )


app.include_router(auth_router)
app.include_router(orbs_router)
app.include_router(cv_router)
app.include_router(export_router)
app.include_router(messages_router)
app.include_router(notes_router)
app.include_router(search_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite for regressions**

Run: `cd backend && python -m pytest tests/unit/ -v`
Expected: All existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/unit/test_rate_limit.py
git commit -m "feat: register slowapi limiter and 429 handler in FastAPI app"
```

---

### Task 4: Rate limit and log access on GET /orbs/{orb_id}

**Files:**
- Modify: `backend/app/orbs/router.py:347-384`
- Modify: `backend/tests/unit/test_rate_limit.py`

- [ ] **Step 1: Write the failing test for rate limiting**

Append to `backend/tests/unit/test_rate_limit.py`:

```python
from unittest.mock import AsyncMock, MagicMock, patch

from tests.unit.conftest import MockNode


def _make_orb_record():
    person_node = MockNode(
        {"user_id": "u1", "orb_id": "test-orb", "name": "Test"}, ["Person"]
    )
    return {
        "p": person_node,
        "connections": [],
        "cross_skill_nodes": [],
        "cross_links": [],
    }


def test_public_orb_rate_limit(client, mock_db):
    """GET /orbs/{orb_id} returns 429 after exceeding 30 requests/minute."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record())
    )

    for _ in range(30):
        resp = client.get("/orbs/test-orb")
        assert resp.status_code == 200

    resp = client.get("/orbs/test-orb")
    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["detail"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py::test_public_orb_rate_limit -v`
Expected: FAIL — the 31st request returns 200 instead of 429

- [ ] **Step 3: Write the failing test for access logging**

Append to `backend/tests/unit/test_rate_limit.py`:

```python
def test_public_orb_access_logging(client, mock_db, caplog):
    """GET /orbs/{orb_id} logs access with IP and orb_id."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record())
    )

    import logging

    with caplog.at_level(logging.INFO):
        client.get("/orbs/test-orb")

    assert any("PUBLIC_ACCESS" in r.message and "orb_id=test-orb" in r.message for r in caplog.records)
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py::test_public_orb_access_logging -v`
Expected: FAIL — no log record contains `PUBLIC_ACCESS`

- [ ] **Step 5: Add rate limit and logging to get_public_orb**

In `backend/app/orbs/router.py`, add the `Request` import and the `limiter` import, then update the endpoint:

Add to imports at the top of the file:

```python
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
```

```python
from app.rate_limit import limiter
```

Replace the `get_public_orb` function (lines 347-384):

```python
@router.get("/{orb_id}")
@limiter.limit("30/minute")
async def get_public_orb(
    request: Request,
    orb_id: str,
    filter_token: str | None = Query(None),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
        record = await result.single()
        if record is None:
            client_ip = request.client.host if request.client else "unknown"
            logger.info("PUBLIC_ACCESS | ip=%s | orb_id=%s | status=404", client_ip, orb_id)
            raise HTTPException(status_code=404, detail="Orb not found")

    orb_data = _serialize_orb(record)

    # Apply filter if a valid filter token is provided
    if filter_token:
        decoded = decode_filter_token(filter_token)
        if decoded and decoded["orb_id"] == orb_id:
            keywords = decoded["filters"]
            # Remove nodes that match any filter keyword
            filtered_nodes = []
            filtered_uids = set()
            for node in orb_data["nodes"]:
                if node_matches_filters(node, keywords):
                    filtered_uids.add(node.get("uid"))
                else:
                    filtered_nodes.append(node)
            # Remove links connected to filtered nodes
            filtered_links = [
                link
                for link in orb_data["links"]
                if link["target"] not in filtered_uids
                and link["source"] not in filtered_uids
            ]
            orb_data["nodes"] = filtered_nodes
            orb_data["links"] = filtered_links

    client_ip = request.client.host if request.client else "unknown"
    logger.info("PUBLIC_ACCESS | ip=%s | orb_id=%s | status=200", client_ip, orb_id)
    return orb_data
```

- [ ] **Step 6: Run rate limit and logging tests**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py -v`
Expected: All PASS

- [ ] **Step 7: Run full test suite for regressions**

Run: `cd backend && python -m pytest tests/unit/ -v`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/orbs/router.py backend/tests/unit/test_rate_limit.py
git commit -m "feat: add rate limiting and access logging to GET /orbs/{orb_id}"
```

---

### Task 5: Rate limit and log access on GET /export/{orb_id}

**Files:**
- Modify: `backend/app/export/router.py:196-304`
- Modify: `backend/tests/unit/test_rate_limit.py`

- [ ] **Step 1: Write the failing test for rate limiting**

Append to `backend/tests/unit/test_rate_limit.py`:

```python
def test_export_orb_rate_limit(client, mock_db):
    """GET /export/{orb_id} returns 429 after exceeding 30 requests/minute."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record())
    )

    for _ in range(30):
        resp = client.get("/export/test-orb")
        assert resp.status_code == 200

    resp = client.get("/export/test-orb")
    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["detail"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py::test_export_orb_rate_limit -v`
Expected: FAIL — the 31st request returns 200 instead of 429

- [ ] **Step 3: Write the failing test for access logging**

Append to `backend/tests/unit/test_rate_limit.py`:

```python
def test_export_orb_access_logging(client, mock_db, caplog):
    """GET /export/{orb_id} logs access with IP and orb_id."""
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=_make_orb_record())
    )

    import logging

    with caplog.at_level(logging.INFO):
        client.get("/export/test-orb")

    assert any("PUBLIC_ACCESS" in r.message and "orb_id=test-orb" in r.message for r in caplog.records)
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py::test_export_orb_access_logging -v`
Expected: FAIL — no log record contains `PUBLIC_ACCESS`

- [ ] **Step 5: Add rate limit and logging to export_orb**

In `backend/app/export/router.py`, add `Request` to the FastAPI import and add the `limiter` import:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, Request
```

```python
from app.rate_limit import limiter
```

Replace the `export_orb` function signature and add logging. The full updated function:

```python
@router.get("/{orb_id}")
@limiter.limit("30/minute")
async def export_orb(
    request: Request,
    orb_id: str,
    format: str = Query("json", pattern="^(json|jsonld|pdf)$"),
    filter_token: str | None = Query(None),
    filter_keyword: str | None = Query(None),
    include_photo: bool = Query(True),
    db: AsyncDriver = Depends(get_db),
):
    async with db.session() as session:
        try:
            result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
            record = await result.single()
        except Exception as e:
            logger.error(
                "Export DB query failed for orb %s: %s", orb_id, e, exc_info=True
            )
            raise HTTPException(
                status_code=500, detail="Failed to load orb data"
            ) from None
        if record is None:
            client_ip = request.client.host if request.client else "unknown"
            logger.info("PUBLIC_ACCESS | ip=%s | orb_id=%s | status=404", client_ip, orb_id)
            raise HTTPException(status_code=404, detail="Orb not found")

    try:
        person, nodes = _gather_orb(record)
    except Exception as e:
        logger.error(
            "Export orb data extraction failed for %s: %s", orb_id, e, exc_info=True
        )
        raise HTTPException(
            status_code=500, detail="Failed to process orb data"
        ) from None

    # Apply filter: either via signed token or direct keywords (for owner exports)
    active_filters: list[str] = []
    if filter_token:
        decoded = decode_filter_token(filter_token)
        if decoded and decoded["orb_id"] == orb_id:
            active_filters = decoded["filters"]
    elif filter_keyword:
        active_filters = [
            kw.strip().lower() for kw in filter_keyword.split(",") if kw.strip()
        ]

    if active_filters:
        nodes = [n for n in nodes if not node_matches_filters(n, active_filters)]

    client_ip = request.client.host if request.client else "unknown"
    logger.info("PUBLIC_ACCESS | ip=%s | orb_id=%s | status=200", client_ip, orb_id)

    if format == "pdf":
        try:
            pdf_bytes = _generate_pdf(
                person, nodes, orb_id, include_photo=include_photo
            )
        except Exception as e:
            logger.error(
                "PDF generation failed for orb %s: %s", orb_id, e, exc_info=True
            )
            raise HTTPException(
                status_code=500, detail="Failed to generate PDF"
            ) from None
        filename = f"{person.get('name', orb_id).replace(' ', '_')}_CV.pdf"
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if format == "jsonld":
        jsonld = {
            "@context": {
                "@vocab": "https://schema.org/",
                "orb": "https://orbis.io/schema/",
            },
            "@type": "Person",
            "@id": f"https://orbis.io/{orb_id}",
            "name": person.get("name", ""),
            "headline": person.get("headline", ""),
            "location": person.get("location", ""),
            "orb:nodes": [],
        }

        type_mapping = {
            "Education": "EducationalOccupationalCredential",
            "WorkExperience": "OrganizationRole",
            "Certification": "EducationalOccupationalCredential",
            "Skill": "DefinedTerm",
            "Publication": "ScholarlyArticle",
            "Project": "Project",
            "Language": "Language",
        }

        for node in nodes:
            node_type = node.pop("_type", "Thing")
            node.pop("_relationship", None)
            node.pop("uid", None)
            jsonld["orb:nodes"].append(
                {
                    "@type": type_mapping.get(node_type, "Thing"),
                    **{k: v for k, v in node.items() if v and not k.startswith("_")},
                }
            )

        return JSONResponse(content=jsonld, media_type="application/ld+json")

    # Plain JSON
    return {
        "orb_id": orb_id,
        "person": person,
        "nodes": nodes,
    }
```

- [ ] **Step 6: Run all rate limit tests**

Run: `cd backend && python -m pytest tests/unit/test_rate_limit.py -v`
Expected: All PASS

- [ ] **Step 7: Run full test suite for regressions**

Run: `cd backend && python -m pytest tests/unit/ -v`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/export/router.py backend/tests/unit/test_rate_limit.py
git commit -m "feat: add rate limiting and access logging to GET /export/{orb_id}"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run linter**

Run: `cd backend && python -m ruff check .`
Expected: No errors

- [ ] **Step 2: Run formatter**

Run: `cd backend && python -m ruff format --check .`
Expected: No formatting issues (or run `ruff format .` to fix)

- [ ] **Step 3: Run full test suite**

Run: `cd backend && python -m pytest tests/unit/ -v`
Expected: All tests PASS, no regressions
