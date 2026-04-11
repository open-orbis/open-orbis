# LLM Token Usage Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track per-user LLM usage (cost, duration, tokens) and surface aggregate statistics in the admin dashboard.

**Architecture:** Extend `call_claude()` to return usage metadata from the CLI JSON envelope. Create `LLMUsage` nodes in Neo4j linked to users. Add aggregate queries to admin insights and per-user detail to the user detail endpoint. Display in the frontend admin dashboard.

**Tech Stack:** Python/FastAPI, Neo4j (Cypher), React/TypeScript

---

### Task 1: Extend `call_claude()` to return usage metadata

**Files:**
- Modify: `backend/app/cv/claude_classifier.py:12-67`
- Test: `backend/tests/unit/test_claude_classifier.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_claude_classifier.py
import json
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_call_claude_returns_usage_metadata():
    envelope = {
        "result": '{"nodes": []}',
        "cost_usd": 0.042,
        "duration_ms": 1500,
    }
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (
        json.dumps(envelope).encode(),
        b"",
    )
    mock_process.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        from app.cv.claude_classifier import call_claude

        result = await call_claude("system", "user")

    assert result["content"] == '{"nodes": []}'
    assert result["cost_usd"] == 0.042
    assert result["duration_ms"] == 1500
    assert result["input_tokens"] is None
    assert result["output_tokens"] is None


@pytest.mark.asyncio
async def test_call_claude_handles_non_json_output():
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"plain text", b"")
    mock_process.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        from app.cv.claude_classifier import call_claude

        result = await call_claude("system", "user")

    assert result["content"] == "plain text"
    assert result["cost_usd"] is None
    assert result["duration_ms"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_claude_classifier.py -v`
Expected: FAIL — `call_claude` returns `str` not `dict`

- [ ] **Step 3: Write minimal implementation**

Replace the `call_claude` function in `backend/app/cv/claude_classifier.py`:

```python
async def call_claude(
    system_prompt: str,
    user_message: str,
    model: str | None = None,
) -> dict:
    """Call Claude Code CLI in print mode and return response with usage metadata.

    Returns a dict with keys: content, cost_usd, duration_ms,
    input_tokens, output_tokens. Usage fields are None when not
    available from the CLI.
    """
    cmd = ["claude", "-p", "--output-format", "json"]

    if model:
        cmd.extend(["--model", model])

    cmd.extend(["--system-prompt", system_prompt])

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(input=user_message.encode("utf-8")),
            timeout=1800,
        )
    except asyncio.TimeoutError:
        process.kill()
        logger.error("Claude CLI timed out after 30 minutes")
        raise RuntimeError("Claude CLI timed out after 30 minutes") from None

    if process.returncode != 0:
        error_msg = stderr.decode("utf-8", errors="replace").strip()
        logger.error(
            "Claude CLI failed (code %d): %s", process.returncode, error_msg[:500]
        )
        raise RuntimeError(
            f"Claude CLI exited with code {process.returncode}: {error_msg}"
        )

    output = stdout.decode("utf-8").strip()
    logger.info("Claude CLI response received (%d chars)", len(output))

    try:
        envelope = json.loads(output)
        return {
            "content": envelope.get("result", ""),
            "cost_usd": envelope.get("cost_usd"),
            "duration_ms": envelope.get("duration_ms"),
            "input_tokens": envelope.get("input_tokens"),
            "output_tokens": envelope.get("output_tokens"),
        }
    except json.JSONDecodeError:
        logger.warning(
            "Claude CLI output is not JSON, returning raw (%d chars)", len(output)
        )
        return {
            "content": output,
            "cost_usd": None,
            "duration_ms": None,
            "input_tokens": None,
            "output_tokens": None,
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_claude_classifier.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/claude_classifier.py backend/tests/unit/test_claude_classifier.py
git commit -m "feat: return usage metadata from call_claude (#91)"
```

---

### Task 2: Update callers to handle new `call_claude` return type

**Files:**
- Modify: `backend/app/cv/ollama_classifier.py:236-375` (the `classify_entries` function where `call_claude` is called)
- Modify: `backend/app/notes/router.py:201-237` (the `enhance_note` endpoint)
- Modify: `backend/app/cv/models.py:52-59` (add usage fields to `ExtractionMetadata`)

- [ ] **Step 1: Add usage fields to ExtractionMetadata**

In `backend/app/cv/models.py`, add to `ExtractionMetadata`:

```python
class ExtractionMetadata(BaseModel):
    """Metadata about how a CV extraction was performed."""

    llm_provider: str
    llm_model: str
    extraction_method: str
    prompt_content: str
    prompt_hash: str
    cost_usd: float | None = None
    duration_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
```

- [ ] **Step 2: Update `classify_entries` in `ollama_classifier.py`**

Find the line in `classify_entries` that calls `call_claude` (around line 270-280). The call currently looks like:

```python
result = await call_claude(
    system_prompt=SYSTEM_PROMPT,
    user_message=raw_text,
    model=settings.claude_model or None,
)
```

And `result` is used as a string. Change it to extract content and store usage:

```python
claude_response = await call_claude(
    system_prompt=SYSTEM_PROMPT,
    user_message=raw_text,
    model=settings.claude_model or None,
)
result = claude_response["content"]
llm_usage = {
    "cost_usd": claude_response.get("cost_usd"),
    "duration_ms": claude_response.get("duration_ms"),
    "input_tokens": claude_response.get("input_tokens"),
    "output_tokens": claude_response.get("output_tokens"),
}
```

Then when building the `ExtractionMetadata` (around line 350-360), pass the usage fields:

```python
metadata=ExtractionMetadata(
    llm_provider=provider,
    llm_model=model_name,
    extraction_method="primary",
    prompt_content=SYSTEM_PROMPT,
    prompt_hash=hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest(),
    cost_usd=llm_usage.get("cost_usd"),
    duration_ms=llm_usage.get("duration_ms"),
    input_tokens=llm_usage.get("input_tokens"),
    output_tokens=llm_usage.get("output_tokens"),
),
```

For the Ollama path and fallback paths, `llm_usage` fields stay `None`.

- [ ] **Step 3: Update `enhance_note` in `notes/router.py`**

Change `backend/app/notes/router.py` lines 216-227. Currently:

```python
if provider == "claude":
    from app.cv.claude_classifier import call_claude
    result = await call_claude(...)
else:
    result = await _call_ollama(system_prompt, user_message)
return _parse_enhance_result(result, valid_skill_uids)
```

Change to:

```python
llm_usage = {}
if provider == "claude":
    from app.cv.claude_classifier import call_claude
    claude_response = await call_claude(
        system_prompt=system_prompt,
        user_message=user_message,
        model=settings.claude_model or None,
    )
    result = claude_response["content"]
    llm_usage = {
        "cost_usd": claude_response.get("cost_usd"),
        "duration_ms": claude_response.get("duration_ms"),
        "input_tokens": claude_response.get("input_tokens"),
        "output_tokens": claude_response.get("output_tokens"),
    }
else:
    result = await _call_ollama(system_prompt, user_message)

# Store usage — will be wired in Task 4
logger.info("LLM usage for note enhance: %s", llm_usage)

return _parse_enhance_result(result, valid_skill_uids)
```

- [ ] **Step 4: Run existing tests to verify nothing is broken**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/models.py backend/app/cv/ollama_classifier.py backend/app/notes/router.py
git commit -m "feat: propagate LLM usage metadata through callers (#91)"
```

---

### Task 3: Add Neo4j schema and queries for LLMUsage

**Files:**
- Modify: `infra/neo4j/init.cypher`
- Modify: `backend/app/graph/queries.py`

- [ ] **Step 1: Add constraint and index to `infra/neo4j/init.cypher`**

Append:

```cypher
// LLM usage tracking
CREATE CONSTRAINT llm_usage_id IF NOT EXISTS FOR (u:LLMUsage) REQUIRE u.usage_id IS UNIQUE;
CREATE INDEX llm_usage_endpoint IF NOT EXISTS FOR (u:LLMUsage) ON (u.endpoint);
```

- [ ] **Step 2: Add Cypher queries to `backend/app/graph/queries.py`**

Append after the Processing Records section:

```python
# ── LLM Usage Tracking ──

CREATE_LLM_USAGE = """
MATCH (p:Person {user_id: $user_id})
CREATE (p)-[:HAS_LLM_USAGE]->(u:LLMUsage {
    usage_id: $usage_id,
    endpoint: $endpoint,
    llm_provider: $llm_provider,
    llm_model: $llm_model,
    input_tokens: $input_tokens,
    output_tokens: $output_tokens,
    total_tokens: $total_tokens,
    cost_usd: $cost_usd,
    duration_ms: $duration_ms,
    created_at: datetime()
})
RETURN u
"""

GET_USER_LLM_USAGE = """
MATCH (p:Person {user_id: $user_id})-[:HAS_LLM_USAGE]->(u:LLMUsage)
RETURN u
ORDER BY u.created_at DESC
"""

GET_LLM_USAGE_AGGREGATE = """
MATCH (:Person)-[:HAS_LLM_USAGE]->(u:LLMUsage)
WITH count(u) AS total_calls,
     sum(CASE WHEN u.cost_usd IS NOT NULL THEN u.cost_usd ELSE 0 END) AS total_cost,
     collect(u.cost_usd) AS costs,
     collect(u.duration_ms) AS durations,
     collect(u.total_tokens) AS tokens
WITH total_calls, total_cost, costs, durations, tokens,
     [x IN costs WHERE x IS NOT NULL] AS valid_costs,
     [x IN durations WHERE x IS NOT NULL] AS valid_durations,
     [x IN tokens WHERE x IS NOT NULL] AS valid_tokens
RETURN total_calls, total_cost,
       CASE WHEN size(valid_costs) > 0 THEN reduce(s = 0.0, x IN valid_costs | s + x) / size(valid_costs) ELSE null END AS cost_mean,
       CASE WHEN size(valid_costs) > 1 THEN reduce(s = 0.0, x IN valid_costs | s + (x - reduce(s2 = 0.0, y IN valid_costs | s2 + y) / size(valid_costs))^2) / (size(valid_costs) - 1) ELSE null END AS cost_variance,
       CASE WHEN size(valid_costs) > 0 THEN reduce(s = valid_costs[0], x IN valid_costs | CASE WHEN x < s THEN x ELSE s END) ELSE null END AS cost_min,
       CASE WHEN size(valid_costs) > 0 THEN reduce(s = valid_costs[0], x IN valid_costs | CASE WHEN x > s THEN x ELSE s END) ELSE null END AS cost_max,
       CASE WHEN size(valid_durations) > 0 THEN reduce(s = 0.0, x IN valid_durations | s + x) / size(valid_durations) ELSE null END AS duration_mean,
       CASE WHEN size(valid_durations) > 1 THEN reduce(s = 0.0, x IN valid_durations | s + (x - reduce(s2 = 0.0, y IN valid_durations | s2 + y) / size(valid_durations))^2) / (size(valid_durations) - 1) ELSE null END AS duration_variance,
       CASE WHEN size(valid_durations) > 0 THEN reduce(s = valid_durations[0], x IN valid_durations | CASE WHEN x < s THEN x ELSE s END) ELSE null END AS duration_min,
       CASE WHEN size(valid_durations) > 0 THEN reduce(s = valid_durations[0], x IN valid_durations | CASE WHEN x > s THEN x ELSE s END) ELSE null END AS duration_max,
       CASE WHEN size(valid_tokens) > 0 THEN reduce(s = 0.0, x IN valid_tokens | s + x) / size(valid_tokens) ELSE null END AS token_mean,
       CASE WHEN size(valid_tokens) > 1 THEN reduce(s = 0.0, x IN valid_tokens | s + (x - reduce(s2 = 0.0, y IN valid_tokens | s2 + y) / size(valid_tokens))^2) / (size(valid_tokens) - 1) ELSE null END AS token_variance
"""

GET_LLM_USAGE_BY_ENDPOINT = """
MATCH (:Person)-[:HAS_LLM_USAGE]->(u:LLMUsage)
RETURN u.endpoint AS endpoint,
       count(u) AS count,
       sum(CASE WHEN u.cost_usd IS NOT NULL THEN u.cost_usd ELSE 0 END) AS total_cost
ORDER BY count DESC
"""

GET_LLM_USAGE_BY_MODEL = """
MATCH (:Person)-[:HAS_LLM_USAGE]->(u:LLMUsage)
RETURN u.llm_model AS model,
       count(u) AS count,
       sum(CASE WHEN u.cost_usd IS NOT NULL THEN u.cost_usd ELSE 0 END) AS total_cost
ORDER BY count DESC
"""
```

- [ ] **Step 3: Run init.cypher against Neo4j**

```bash
cat infra/neo4j/init.cypher | docker exec -i orb_project-neo4j-1 cypher-shell -u neo4j -p orbis_dev_password
```

- [ ] **Step 4: Commit**

```bash
git add infra/neo4j/init.cypher backend/app/graph/queries.py
git commit -m "feat: add LLMUsage schema and Cypher queries (#91)"
```

---

### Task 4: Create LLM usage recording service and wire into endpoints

**Files:**
- Create: `backend/app/graph/llm_usage.py`
- Modify: `backend/app/cv/router.py:304-365` (import-confirm endpoint)
- Modify: `backend/app/cv/router.py:518-588` (confirm endpoint)
- Modify: `backend/app/notes/router.py:201-237` (enhance endpoint)
- Test: `backend/tests/unit/test_llm_usage.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_llm_usage.py
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_record_llm_usage_creates_node():
    mock_session = AsyncMock()
    mock_result = AsyncMock()
    mock_result.single.return_value = {"u": {"usage_id": "test-123"}}
    mock_session.run.return_value = mock_result

    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)

    from app.graph.llm_usage import record_llm_usage

    usage_id = await record_llm_usage(
        db=mock_db,
        user_id="user-1",
        endpoint="cv_upload",
        llm_provider="claude",
        llm_model="claude-opus-4-6",
        cost_usd=0.05,
        duration_ms=2000,
    )

    assert usage_id is not None
    mock_session.run.assert_called_once()
    call_kwargs = mock_session.run.call_args
    assert call_kwargs.kwargs["endpoint"] == "cv_upload"
    assert call_kwargs.kwargs["cost_usd"] == 0.05
    assert call_kwargs.kwargs["duration_ms"] == 2000


@pytest.mark.asyncio
async def test_record_llm_usage_handles_none_fields():
    mock_session = AsyncMock()
    mock_result = AsyncMock()
    mock_result.single.return_value = {"u": {"usage_id": "test-456"}}
    mock_session.run.return_value = mock_result

    mock_db = MagicMock()
    mock_db.session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_db.session.return_value.__aexit__ = AsyncMock(return_value=False)

    from app.graph.llm_usage import record_llm_usage

    usage_id = await record_llm_usage(
        db=mock_db,
        user_id="user-1",
        endpoint="note_enhance",
        llm_provider="ollama",
        llm_model="llama3.2:3b",
    )

    assert usage_id is not None
    call_kwargs = mock_session.run.call_args
    assert call_kwargs.kwargs["cost_usd"] is None
    assert call_kwargs.kwargs["duration_ms"] is None
    assert call_kwargs.kwargs["input_tokens"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_llm_usage.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Create `backend/app/graph/llm_usage.py`**

```python
"""Service for recording LLM usage in Neo4j."""

from __future__ import annotations

import logging
import uuid

from neo4j import AsyncDriver

from app.graph.queries import CREATE_LLM_USAGE

logger = logging.getLogger(__name__)


async def record_llm_usage(
    db: AsyncDriver,
    user_id: str,
    endpoint: str,
    llm_provider: str,
    llm_model: str,
    cost_usd: float | None = None,
    duration_ms: int | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> str | None:
    """Create an LLMUsage node linked to the user. Returns usage_id."""
    usage_id = str(uuid.uuid4())
    total_tokens = None
    if input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens

    try:
        async with db.session() as session:
            await session.run(
                CREATE_LLM_USAGE,
                usage_id=usage_id,
                user_id=user_id,
                endpoint=endpoint,
                llm_provider=llm_provider,
                llm_model=llm_model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                cost_usd=cost_usd,
                duration_ms=duration_ms,
            )
        return usage_id
    except Exception:
        logger.exception("Failed to record LLM usage for user %s", user_id)
        return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_llm_usage.py -v`
Expected: PASS

- [ ] **Step 5: Wire into CV router**

In `backend/app/cv/router.py`, in both `import_confirm` (line ~334) and `confirm` (line ~557) endpoints, after the `create_processing_record` call, add:

```python
from app.graph.llm_usage import record_llm_usage

if data.llm_provider:
    await record_llm_usage(
        db=db,
        user_id=user_id,
        endpoint="cv_upload",
        llm_provider=data.llm_provider,
        llm_model=data.llm_model or "",
        cost_usd=data.cost_usd,
        duration_ms=data.duration_ms,
        input_tokens=data.input_tokens,
        output_tokens=data.output_tokens,
    )
```

Also add the usage fields to `ConfirmRequest` in `backend/app/cv/models.py`:

```python
class ConfirmRequest(BaseModel):
    ...existing fields...
    cost_usd: float | None = None
    duration_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
```

- [ ] **Step 6: Wire into notes router**

In `backend/app/notes/router.py`, in `enhance_note`, replace the `logger.info` line with:

```python
from app.graph.llm_usage import record_llm_usage

await record_llm_usage(
    db=db,
    user_id=current_user["user_id"],
    endpoint="note_enhance",
    llm_provider=provider,
    llm_model=settings.claude_model if provider == "claude" else settings.ollama_model,
    cost_usd=llm_usage.get("cost_usd"),
    duration_ms=llm_usage.get("duration_ms"),
    input_tokens=llm_usage.get("input_tokens"),
    output_tokens=llm_usage.get("output_tokens"),
)
```

Note: the `enhance_note` endpoint needs `db: AsyncDriver = Depends(get_db)` added to its signature.

- [ ] **Step 7: Run all tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/graph/llm_usage.py backend/app/cv/router.py backend/app/cv/models.py backend/app/notes/router.py backend/tests/unit/test_llm_usage.py
git commit -m "feat: record LLM usage on CV upload and note enhance (#91)"
```

---

### Task 5: Add LLM usage to admin backend (insights + user detail)

**Files:**
- Modify: `backend/app/admin/models.py`
- Modify: `backend/app/admin/service.py`
- Test: `backend/tests/unit/test_admin_service.py` (add tests)

- [ ] **Step 1: Add Pydantic models to `backend/app/admin/models.py`**

Append before the `# ── Funnel metrics ──` comment:

```python
# ── LLM Usage ──


class LLMUsageRecord(BaseModel):
    usage_id: str = ""
    endpoint: str = ""
    llm_provider: str = ""
    llm_model: str = ""
    cost_usd: float | None = None
    duration_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    created_at: str = ""


class LLMUsageSummary(BaseModel):
    total_calls: int = 0
    total_cost_usd: float = 0.0
    avg_cost_usd: float = 0.0
    avg_duration_ms: float = 0.0


class LLMUsageByEndpoint(BaseModel):
    endpoint: str
    count: int
    total_cost: float


class LLMUsageByModel(BaseModel):
    model: str
    count: int
    total_cost: float


class LLMCostStats(BaseModel):
    mean: float | None = None
    variance: float | None = None
    min: float | None = None
    max: float | None = None


class LLMDurationStats(BaseModel):
    mean_ms: float | None = None
    variance_ms: float | None = None
    min_ms: float | None = None
    max_ms: float | None = None


class LLMTokenStats(BaseModel):
    mean: float | None = None
    variance: float | None = None


class LLMUsageInsights(BaseModel):
    total_calls: int = 0
    total_cost_usd: float = 0.0
    by_endpoint: list[LLMUsageByEndpoint] = []
    by_model: list[LLMUsageByModel] = []
    cost_stats: LLMCostStats = LLMCostStats()
    duration_stats: LLMDurationStats = LLMDurationStats()
    token_stats: LLMTokenStats = LLMTokenStats()
```

- [ ] **Step 2: Add `llm_usage` to `InsightsResponse` and `UserDetailResponse`**

```python
class InsightsResponse(BaseModel):
    ...existing fields...
    llm_usage: LLMUsageInsights = LLMUsageInsights()


class UserDetailResponse(UserResponse):
    ...existing fields...
    llm_usage: list[LLMUsageRecord] = []
    llm_usage_summary: LLMUsageSummary = LLMUsageSummary()
```

- [ ] **Step 3: Add LLM usage queries to `get_insights()` in `backend/app/admin/service.py`**

At the end of `get_insights()`, before the return, add:

```python
from app.graph.queries import (
    GET_LLM_USAGE_AGGREGATE,
    GET_LLM_USAGE_BY_ENDPOINT,
    GET_LLM_USAGE_BY_MODEL,
)

# LLM usage aggregate
agg_result = await session.run(GET_LLM_USAGE_AGGREGATE)
agg = await agg_result.single()

by_ep_result = await session.run(GET_LLM_USAGE_BY_ENDPOINT)
by_endpoint = [
    {"endpoint": r["endpoint"], "count": r["count"], "total_cost": round(r["total_cost"], 4)}
    async for r in by_ep_result
]

by_model_result = await session.run(GET_LLM_USAGE_BY_MODEL)
by_model = [
    {"model": r["model"], "count": r["count"], "total_cost": round(r["total_cost"], 4)}
    async for r in by_model_result
]

llm_usage = {
    "total_calls": agg["total_calls"] if agg else 0,
    "total_cost_usd": round(agg["total_cost"], 4) if agg else 0.0,
    "by_endpoint": by_endpoint,
    "by_model": by_model,
    "cost_stats": {
        "mean": round(agg["cost_mean"], 6) if agg and agg["cost_mean"] is not None else None,
        "variance": round(agg["cost_variance"], 6) if agg and agg["cost_variance"] is not None else None,
        "min": round(agg["cost_min"], 6) if agg and agg["cost_min"] is not None else None,
        "max": round(agg["cost_max"], 6) if agg and agg["cost_max"] is not None else None,
    },
    "duration_stats": {
        "mean_ms": round(agg["duration_mean"], 1) if agg and agg["duration_mean"] is not None else None,
        "variance_ms": round(agg["duration_variance"], 1) if agg and agg["duration_variance"] is not None else None,
        "min_ms": agg["duration_min"] if agg else None,
        "max_ms": agg["duration_max"] if agg else None,
    },
    "token_stats": {
        "mean": round(agg["token_mean"], 1) if agg and agg["token_mean"] is not None else None,
        "variance": round(agg["token_variance"], 1) if agg and agg["token_variance"] is not None else None,
    },
}
```

Then include `"llm_usage": llm_usage` in the return dict.

- [ ] **Step 4: Add LLM usage to `get_user_detail()` in `backend/app/admin/service.py`**

After fetching processing records, add:

```python
from app.graph.queries import GET_USER_LLM_USAGE

usage_result = await session.run(GET_USER_LLM_USAGE, user_id=user_id)
llm_records = []
total_cost = 0.0
total_duration = 0.0
cost_count = 0
duration_count = 0

async for r in usage_result:
    u = dict(r["u"])
    cost = u.get("cost_usd")
    dur = u.get("duration_ms")
    if cost is not None:
        total_cost += cost
        cost_count += 1
    if dur is not None:
        total_duration += dur
        duration_count += 1
    llm_records.append({
        "usage_id": u.get("usage_id", ""),
        "endpoint": u.get("endpoint", ""),
        "llm_provider": u.get("llm_provider", ""),
        "llm_model": u.get("llm_model", ""),
        "cost_usd": cost,
        "duration_ms": dur,
        "input_tokens": u.get("input_tokens"),
        "output_tokens": u.get("output_tokens"),
        "created_at": u.get("created_at", ""),
    })
```

Then include in the return dict:

```python
"llm_usage": llm_records,
"llm_usage_summary": {
    "total_calls": len(llm_records),
    "total_cost_usd": round(total_cost, 4),
    "avg_cost_usd": round(total_cost / cost_count, 4) if cost_count else 0.0,
    "avg_duration_ms": round(total_duration / duration_count, 1) if duration_count else 0.0,
},
```

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/admin/models.py backend/app/admin/service.py
git commit -m "feat: add LLM usage metrics to admin insights and user detail (#91)"
```

---

### Task 6: Add LLM usage types and update frontend admin dashboard

**Files:**
- Modify: `frontend/src/api/admin.ts`
- Modify: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Add TypeScript types to `frontend/src/api/admin.ts`**

Add before the `Insights` interface:

```typescript
export interface LLMUsageRecord {
  usage_id: string;
  endpoint: string;
  llm_provider: string;
  llm_model: string;
  cost_usd: number | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export interface LLMUsageSummary {
  total_calls: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  avg_duration_ms: number;
}

export interface LLMUsageByEndpoint {
  endpoint: string;
  count: number;
  total_cost: number;
}

export interface LLMUsageByModel {
  model: string;
  count: number;
  total_cost: number;
}

export interface LLMCostStats {
  mean: number | null;
  variance: number | null;
  min: number | null;
  max: number | null;
}

export interface LLMDurationStats {
  mean_ms: number | null;
  variance_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
}

export interface LLMTokenStats {
  mean: number | null;
  variance: number | null;
}

export interface LLMUsageInsights {
  total_calls: number;
  total_cost_usd: number;
  by_endpoint: LLMUsageByEndpoint[];
  by_model: LLMUsageByModel[];
  cost_stats: LLMCostStats;
  duration_stats: LLMDurationStats;
  token_stats: LLMTokenStats;
}
```

Add `llm_usage` to the `Insights` interface:

```typescript
export interface Insights {
  ...existing fields...
  llm_usage: LLMUsageInsights;
}
```

Add to `AdminUserDetail`:

```typescript
export interface AdminUserDetail extends AdminUser {
  ...existing fields...
  llm_usage: LLMUsageRecord[];
  llm_usage_summary: LLMUsageSummary;
}
```

- [ ] **Step 2: Add LLM Usage insights card to the funnel tab**

In `frontend/src/pages/AdminPage.tsx`, find the insights rendering section (around line 1237, after the Code Efficiency section). Add an LLM Usage card:

```tsx
{/* ── LLM Usage ── */}
{insights.llm_usage && insights.llm_usage.total_calls > 0 && (
  <div className="bg-neutral-900/60 rounded-xl p-4 border border-white/5">
    <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">LLM Usage</h3>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div>
        <p className="text-[10px] text-white/30">Total Calls</p>
        <p className="text-lg font-bold text-white">{insights.llm_usage.total_calls}</p>
      </div>
      <div>
        <p className="text-[10px] text-white/30">Total Cost</p>
        <p className="text-lg font-bold text-green-400">${insights.llm_usage.total_cost_usd.toFixed(2)}</p>
      </div>
      <div>
        <p className="text-[10px] text-white/30">Avg Cost / Call</p>
        <p className="text-lg font-bold text-white">${insights.llm_usage.cost_stats.mean?.toFixed(4) ?? '—'}</p>
      </div>
      <div>
        <p className="text-[10px] text-white/30">Avg Duration</p>
        <p className="text-lg font-bold text-white">{insights.llm_usage.duration_stats.mean_ms?.toFixed(0) ?? '—'}ms</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div>
        <p className="text-[10px] text-white/30 mb-1">Cost Variance</p>
        <p className="text-sm text-white/70">{insights.llm_usage.cost_stats.variance?.toFixed(6) ?? '—'}</p>
      </div>
      <div>
        <p className="text-[10px] text-white/30 mb-1">Duration Variance</p>
        <p className="text-sm text-white/70">{insights.llm_usage.duration_stats.variance_ms?.toFixed(0) ?? '—'}ms²</p>
      </div>
    </div>
    {insights.llm_usage.by_model.length > 0 && (
      <div className="mb-3">
        <p className="text-[10px] text-white/30 mb-1">By Model</p>
        {insights.llm_usage.by_model.map((m) => (
          <div key={m.model} className="flex justify-between text-xs text-white/60 py-0.5">
            <span>{m.model}</span>
            <span>{m.count} calls · ${m.total_cost.toFixed(2)}</span>
          </div>
        ))}
      </div>
    )}
    {insights.llm_usage.by_endpoint.length > 0 && (
      <div>
        <p className="text-[10px] text-white/30 mb-1">By Endpoint</p>
        {insights.llm_usage.by_endpoint.map((e) => (
          <div key={e.endpoint} className="flex justify-between text-xs text-white/60 py-0.5">
            <span>{e.endpoint.replace('_', ' ')}</span>
            <span>{e.count} calls · ${e.total_cost.toFixed(2)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Add LLM usage to user detail view**

In `frontend/src/pages/AdminPage.tsx`, find the user detail dialog (around line 1360, after the Processing History section). Add:

```tsx
{/* ── LLM Usage ── */}
{userDetail.llm_usage && userDetail.llm_usage.length > 0 && (
  <>
    <div className="mt-4 border-t border-white/5 pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">LLM Usage Summary</h4>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <p className="text-[10px] text-white/30">Calls</p>
          <p className="text-sm font-bold text-white">{userDetail.llm_usage_summary.total_calls}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/30">Total Cost</p>
          <p className="text-sm font-bold text-green-400">${userDetail.llm_usage_summary.total_cost_usd.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/30">Avg Cost</p>
          <p className="text-sm font-bold text-white">${userDetail.llm_usage_summary.avg_cost_usd.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/30">Avg Duration</p>
          <p className="text-sm font-bold text-white">{userDetail.llm_usage_summary.avg_duration_ms.toFixed(0)}ms</p>
        </div>
      </div>
    </div>
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">Usage History</h4>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {userDetail.llm_usage.map((u) => (
          <div key={u.usage_id} className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-white/3">
            <div className="flex items-center gap-2">
              <span className="text-white/40">{u.endpoint.replace('_', ' ')}</span>
              <span className="text-white/60">{u.llm_model}</span>
            </div>
            <div className="flex items-center gap-3">
              {u.cost_usd != null && <span className="text-green-400">${u.cost_usd.toFixed(4)}</span>}
              {u.duration_ms != null && <span className="text-white/40">{u.duration_ms}ms</span>}
              <span className="text-white/20">{formatDate(u.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </>
)}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/admin.ts frontend/src/pages/AdminPage.tsx
git commit -m "feat: display LLM usage metrics in admin dashboard (#91)"
```

---

### Task 7: Pass usage metadata from frontend CV upload to confirm endpoint

**Files:**
- Modify: `frontend/src/api/orbs.ts` (the confirm/import-confirm API calls)
- Modify: `frontend/src/pages/OrbViewPage.tsx` or relevant CV upload component

- [ ] **Step 1: Check how the frontend passes metadata to confirm endpoints**

The CV upload flow is: frontend uploads PDF → backend extracts → frontend confirms. The extraction response already includes `ExtractionMetadata`. We need to pass `cost_usd`, `duration_ms`, `input_tokens`, `output_tokens` back in the confirm request.

Find the confirm API call in the frontend and add the usage fields from the extraction response. The exact files depend on how the confirm flow works — check `frontend/src/api/orbs.ts` for the `confirmCv` or `importConfirm` function and pass the metadata fields through.

- [ ] **Step 2: Update the extraction response to include usage fields**

In `backend/app/cv/router.py`, the upload endpoint returns `ExtractedData`. Ensure `cost_usd`, `duration_ms`, `input_tokens`, `output_tokens` from `ExtractionMetadata` are included in the response so the frontend can send them back on confirm.

- [ ] **Step 3: Run full test suite**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=75`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: pass LLM usage metadata through CV confirm flow (#91)"
```
