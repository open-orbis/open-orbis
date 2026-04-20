# LaTeX CV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fpdf2/window.print() CV export with a LaTeX template system — Jinja2 templating + Tectonic compilation + CodeMirror editor + react-pdf preview.

**Architecture:** Backend pipeline (Orb data → Jinja2 → .tex → Tectonic → PDF) with template bundles on GCS and metadata in PostgreSQL. Frontend replaces CvExportPage with template picker grid + split-pane editor (CodeMirror 6 left, react-pdf right).

**Tech Stack:** FastAPI, asyncpg, Jinja2, Tectonic (XeTeX/pdfTeX/LuaTeX), GCS, CodeMirror 6, react-pdf, pdfjs-dist

**Spec:** `docs/superpowers/specs/2026-04-15-latex-cv-export-design.md`

---

## File Structure

### Backend — new files

| File | Responsibility |
|------|---------------|
| `backend/app/cv/templates/__init__.py` | Module init |
| `backend/app/cv/templates/db.py` | PostgreSQL CRUD for `cv_templates` table |
| `backend/app/cv/templates/security.py` | Validate .tex content (block dangerous commands) |
| `backend/app/cv/templates/service.py` | Compilation pipeline: GCS fetch, Jinja2 render, Tectonic subprocess |
| `backend/app/cv/templates/models.py` | Pydantic request/response models |
| `backend/app/cv/templates/router.py` | FastAPI endpoints (list, detail, upload, compile) |

### Backend — modified files

| File | Change |
|------|--------|
| `backend/app/config.py` | Add `tectonic_timeout_seconds` setting |
| `backend/app/main.py` | Register templates router, call `ensure_templates_table()` on startup |
| `backend/pyproject.toml` | No new deps needed (jinja2 + google-cloud-storage already present) |

### Backend — test files

| File | Tests |
|------|-------|
| `backend/tests/unit/test_templates_security.py` | Security validation (blocked patterns) |
| `backend/tests/unit/test_templates_db.py` | DB CRUD operations |
| `backend/tests/unit/test_templates_service.py` | Jinja2 rendering, compilation pipeline |
| `backend/tests/unit/test_templates_router.py` | API endpoint tests |

### Frontend — new files

| File | Responsibility |
|------|---------------|
| `frontend/src/api/templates.ts` | API client for template endpoints |
| `frontend/src/components/cv/TemplatePicker.tsx` | Template grid with thumbnails |
| `frontend/src/components/cv/TemplateEditor.tsx` | Split-pane: CodeMirror + PDF preview |
| `frontend/src/components/cv/PdfPreview.tsx` | react-pdf wrapper with zoom/page controls |
| `frontend/src/components/cv/TemplateUploadDialog.tsx` | Upload custom template modal |

### Frontend — modified files

| File | Change |
|------|--------|
| `frontend/src/pages/CvExportPage.tsx` | Complete rewrite — template picker + editor flow |
| `frontend/package.json` | Add codemirror, @codemirror/lang-latex, react-pdf, pdfjs-dist |

---

## Task 1: Template Security Validation

**Files:**
- Create: `backend/app/cv/templates/__init__.py`
- Create: `backend/app/cv/templates/security.py`
- Test: `backend/tests/unit/test_templates_security.py`

- [ ] **Step 1: Write failing tests for security validation**

```python
# backend/tests/unit/test_templates_security.py
import pytest

from app.cv.templates.security import validate_tex_content


class TestValidateTexContent:
    def test_clean_template_passes(self):
        tex = r"""
\documentclass{article}
\begin{document}
\section{Experience}
<< person.name >>
\end{document}
"""
        errors = validate_tex_content(tex)
        assert errors == []

    def test_blocks_write18(self):
        tex = r"\immediate\write18{rm -rf /}"
        errors = validate_tex_content(tex)
        assert len(errors) == 1
        assert "write18" in errors[0].lower()

    def test_blocks_openin(self):
        tex = r"\openin\myfile=/etc/passwd"
        errors = validate_tex_content(tex)
        assert len(errors) == 1
        assert "openin" in errors[0].lower()

    def test_blocks_openout(self):
        tex = r"\openout\myfile=/tmp/evil"
        errors = validate_tex_content(tex)
        assert len(errors) == 1
        assert "openout" in errors[0].lower()

    def test_blocks_absolute_input(self):
        tex = r"\input{/etc/passwd}"
        errors = validate_tex_content(tex)
        assert len(errors) == 1
        assert "input" in errors[0].lower()

    def test_allows_relative_input(self):
        tex = r"\input{sections/experience.tex}"
        errors = validate_tex_content(tex)
        assert errors == []

    def test_blocks_catcode(self):
        tex = r"\catcode`\@=11"
        errors = validate_tex_content(tex)
        assert len(errors) == 1
        assert "catcode" in errors[0].lower()

    def test_multiple_violations(self):
        tex = r"""
\write18{whoami}
\openout\f=/tmp/x
\catcode`\@=11
"""
        errors = validate_tex_content(tex)
        assert len(errors) == 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_templates_security.py -v`
Expected: FAIL (ModuleNotFoundError: No module named 'app.cv.templates')

- [ ] **Step 3: Implement security module**

```python
# backend/app/cv/templates/__init__.py
```

```python
# backend/app/cv/templates/security.py
"""Validate LaTeX template content for dangerous commands."""

from __future__ import annotations

import re

_BLOCKED_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\\write18\b"), "write18 (shell escape) is not allowed"),
    (re.compile(r"\\immediate\s*\\write"), "\\immediate\\write is not allowed"),
    (re.compile(r"\\openin\b"), "\\openin (file read) is not allowed"),
    (re.compile(r"\\openout\b"), "\\openout (file write) is not allowed"),
    (re.compile(r"\\input\s*\{/"), "\\input with absolute path is not allowed"),
    (re.compile(r"\\catcode\b"), "\\catcode manipulation is not allowed"),
]


def validate_tex_content(tex: str) -> list[str]:
    """Return a list of security violation messages. Empty list means safe."""
    errors: list[str] = []
    for pattern, message in _BLOCKED_PATTERNS:
        if pattern.search(tex):
            errors.append(message)
    return errors
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_templates_security.py -v`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/templates/__init__.py backend/app/cv/templates/security.py backend/tests/unit/test_templates_security.py
git commit -m "feat(cv): add LaTeX template security validation (#346)"
```

---

## Task 2: Templates Database Layer

**Files:**
- Create: `backend/app/cv/templates/db.py`
- Test: `backend/tests/unit/test_templates_db.py`

- [ ] **Step 1: Write failing tests for DB CRUD**

```python
# backend/tests/unit/test_templates_db.py
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.cv.templates.db import (
    create_template,
    get_template,
    list_templates_for_user,
    delete_template,
    CREATE_TABLE_SQL,
)


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        yield pool


@pytest.mark.asyncio
async def test_create_template(mock_pool):
    mock_pool.fetchrow.return_value = {
        "id": "tpl-1",
        "user_id": None,
        "name": "Classic",
        "description": "A classic template",
        "engine": "xelatex",
        "license": "LPPL-1.3c",
        "is_preloaded": True,
        "gcs_bundle_path": "templates/classic/",
        "thumbnail_path": "templates/classic/thumbnail.png",
        "tex_content": "\\documentclass{article}",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }

    result = await create_template(
        template_id="tpl-1",
        name="Classic",
        description="A classic template",
        engine="xelatex",
        license="LPPL-1.3c",
        is_preloaded=True,
        gcs_bundle_path="templates/classic/",
        thumbnail_path="templates/classic/thumbnail.png",
        tex_content="\\documentclass{article}",
    )

    assert result["id"] == "tpl-1"
    assert result["is_preloaded"] is True
    mock_pool.fetchrow.assert_called_once()


@pytest.mark.asyncio
async def test_get_template(mock_pool):
    mock_pool.fetchrow.return_value = {"id": "tpl-1", "name": "Classic"}
    result = await get_template("tpl-1")
    assert result["id"] == "tpl-1"


@pytest.mark.asyncio
async def test_get_template_not_found(mock_pool):
    mock_pool.fetchrow.return_value = None
    result = await get_template("nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_list_templates_for_user(mock_pool):
    mock_pool.fetch.return_value = [
        {"id": "tpl-1", "is_preloaded": True},
        {"id": "tpl-2", "is_preloaded": False, "user_id": "user-1"},
    ]
    result = await list_templates_for_user("user-1")
    assert len(result) == 2


@pytest.mark.asyncio
async def test_delete_template(mock_pool):
    mock_pool.execute.return_value = "DELETE 1"
    await delete_template("tpl-1", "user-1")
    mock_pool.execute.assert_called_once()


def test_create_table_sql_has_required_columns():
    assert "id" in CREATE_TABLE_SQL
    assert "user_id" in CREATE_TABLE_SQL
    assert "tex_content" in CREATE_TABLE_SQL
    assert "gcs_bundle_path" in CREATE_TABLE_SQL
    assert "engine" in CREATE_TABLE_SQL
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_templates_db.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 3: Implement DB module**

```python
# backend/app/cv/templates/db.py
"""PostgreSQL CRUD for cv_templates — LaTeX template metadata and content."""

from __future__ import annotations

from app.db.postgres import get_pool

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cv_templates (
    id              TEXT PRIMARY KEY,
    user_id         TEXT,
    name            TEXT NOT NULL,
    description     TEXT,
    engine          TEXT NOT NULL DEFAULT 'xelatex',
    license         TEXT,
    is_preloaded    BOOLEAN NOT NULL DEFAULT FALSE,
    gcs_bundle_path TEXT NOT NULL,
    thumbnail_path  TEXT,
    tex_content     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cv_templates_user_id_idx ON cv_templates (user_id);
CREATE INDEX IF NOT EXISTS cv_templates_preloaded_idx ON cv_templates (is_preloaded);
"""


async def ensure_table() -> None:
    """Create the cv_templates table and indexes if they do not already exist."""
    pool = await get_pool()
    await pool.execute(CREATE_TABLE_SQL)


async def create_template(
    *,
    template_id: str,
    name: str,
    engine: str,
    gcs_bundle_path: str,
    tex_content: str,
    user_id: str | None = None,
    description: str | None = None,
    license: str | None = None,
    is_preloaded: bool = False,
    thumbnail_path: str | None = None,
) -> dict:
    """Insert a new template and return the full row."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO cv_templates (
            id, user_id, name, description, engine, license,
            is_preloaded, gcs_bundle_path, thumbnail_path, tex_content
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        """,
        template_id,
        user_id,
        name,
        description,
        engine,
        license,
        is_preloaded,
        gcs_bundle_path,
        thumbnail_path,
        tex_content,
    )
    return dict(row)


async def get_template(template_id: str) -> dict | None:
    """Fetch a single template by id, or None if not found."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM cv_templates WHERE id = $1",
        template_id,
    )
    return dict(row) if row else None


async def list_templates_for_user(user_id: str) -> list[dict]:
    """List all pre-loaded templates plus templates owned by this user."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT * FROM cv_templates
        WHERE is_preloaded = TRUE OR user_id = $1
        ORDER BY is_preloaded DESC, name ASC
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def delete_template(template_id: str, user_id: str) -> None:
    """Delete a user-owned template. Pre-loaded templates cannot be deleted."""
    pool = await get_pool()
    await pool.execute(
        "DELETE FROM cv_templates WHERE id = $1 AND user_id = $2 AND is_preloaded = FALSE",
        template_id,
        user_id,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_templates_db.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/templates/db.py backend/tests/unit/test_templates_db.py
git commit -m "feat(cv): add PostgreSQL CRUD for cv_templates (#346)"
```

---

## Task 3: Pydantic Models

**Files:**
- Create: `backend/app/cv/templates/models.py`
- Test: `backend/tests/unit/test_templates_models.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/unit/test_templates_models.py
import pytest
from pydantic import ValidationError

from app.cv.templates.models import (
    TemplateListItem,
    TemplateDetail,
    CompileRequest,
)


def test_template_list_item():
    item = TemplateListItem(
        id="awesome-cv",
        name="Awesome CV",
        description="Colorful sections",
        engine="xelatex",
        thumbnail_url="https://storage.googleapis.com/bucket/thumb.png",
        is_preloaded=True,
    )
    assert item.id == "awesome-cv"
    assert item.is_preloaded is True


def test_template_detail_includes_tex():
    detail = TemplateDetail(
        id="awesome-cv",
        name="Awesome CV",
        description="Colorful sections",
        engine="xelatex",
        license="LPPL-1.3c",
        thumbnail_url=None,
        is_preloaded=True,
        tex_content=r"\documentclass{awesome-cv}",
    )
    assert detail.tex_content.startswith("\\documentclass")


def test_compile_request_requires_template_id():
    req = CompileRequest(template_id="awesome-cv")
    assert req.template_id == "awesome-cv"
    assert req.tex_content is None


def test_compile_request_with_tex_content():
    req = CompileRequest(
        template_id="awesome-cv",
        tex_content=r"\documentclass{article}",
    )
    assert req.tex_content is not None


def test_compile_request_missing_template_id():
    with pytest.raises(ValidationError):
        CompileRequest()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_templates_models.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 3: Implement models**

```python
# backend/app/cv/templates/models.py
"""Pydantic models for LaTeX template endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class TemplateListItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    engine: str
    thumbnail_url: str | None = None
    is_preloaded: bool


class TemplateDetail(BaseModel):
    id: str
    name: str
    description: str | None = None
    engine: str
    license: str | None = None
    thumbnail_url: str | None = None
    is_preloaded: bool
    tex_content: str


class CompileRequest(BaseModel):
    template_id: str
    tex_content: str | None = None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_templates_models.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/cv/templates/models.py backend/tests/unit/test_templates_models.py
git commit -m "feat(cv): add Pydantic models for template endpoints (#346)"
```

---

## Task 4: Compilation Service

**Files:**
- Create: `backend/app/cv/templates/service.py`
- Modify: `backend/app/config.py` (add `tectonic_timeout_seconds`)
- Test: `backend/tests/unit/test_templates_service.py`

- [ ] **Step 1: Add tectonic config setting**

In `backend/app/config.py`, add after the `cleanup_interval_hours` line (line 115):

```python
    # LaTeX compilation timeout in seconds
    tectonic_timeout_seconds: int = 30
```

- [ ] **Step 2: Write failing tests for the service**

```python
# backend/tests/unit/test_templates_service.py
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.cv.templates.service import (
    render_tex_with_jinja,
    download_bundle_to_dir,
    compile_tex,
)


class TestRenderTexWithJinja:
    def test_renders_person_variables(self):
        tex = r"\name{<< person.name >>}"
        person = {"name": "Marco Rossi"}
        result = render_tex_with_jinja(tex, person, [])
        assert result == r"\name{Marco Rossi}"

    def test_renders_node_loop(self):
        tex = """<% for n in nodes if n._type == "Skill" %>
<< n.name >><% if not loop.last %>, <% endif %>
<% endfor %>"""
        nodes = [
            {"_type": "Skill", "name": "Python"},
            {"_type": "Skill", "name": "React"},
            {"_type": "WorkExperience", "name": "Dev"},
        ]
        result = render_tex_with_jinja(tex, {}, nodes)
        assert "Python" in result
        assert "React" in result
        assert "Dev" not in result

    def test_default_filter(self):
        tex = r"<< person.phone | default('N/A') >>"
        result = render_tex_with_jinja(tex, {}, [])
        assert result == "N/A"

    def test_escapes_latex_special_chars(self):
        tex = r"<< person.name >>"
        person = {"name": "O'Brien & Co."}
        result = render_tex_with_jinja(tex, person, [])
        assert r"\&" in result
        assert "O'Brien" in result


class TestDownloadBundle:
    @pytest.mark.asyncio
    async def test_downloads_files_to_dir(self, tmp_path):
        mock_blob1 = MagicMock()
        mock_blob1.name = "templates/classic/awesome-cv.cls"
        mock_blob1.download_to_filename = MagicMock()

        mock_blob2 = MagicMock()
        mock_blob2.name = "templates/classic/fonts/Roboto.ttf"
        mock_blob2.download_to_filename = MagicMock()

        mock_bucket = MagicMock()
        mock_bucket.list_blobs.return_value = [mock_blob1, mock_blob2]

        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        with patch("app.cv.templates.service.storage.Client", return_value=mock_client):
            await download_bundle_to_dir(
                "orbis-cv-files", "templates/classic/", tmp_path
            )

        mock_bucket.list_blobs.assert_called_once_with(prefix="templates/classic/")
        assert mock_blob1.download_to_filename.called
        assert mock_blob2.download_to_filename.called


class TestCompileTex:
    @pytest.mark.asyncio
    async def test_compile_returns_pdf_bytes(self, tmp_path):
        tex_file = tmp_path / "output.tex"
        tex_file.write_text(r"\documentclass{article}\begin{document}Hello\end{document}")
        pdf_file = tmp_path / "output.pdf"
        pdf_file.write_bytes(b"%PDF-1.4 fake pdf content")

        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"", b""))

        with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
            result = await compile_tex(tmp_path, "output.tex", engine="pdflatex")

        assert result == b"%PDF-1.4 fake pdf content"

    @pytest.mark.asyncio
    async def test_compile_raises_on_failure(self, tmp_path):
        tex_file = tmp_path / "output.tex"
        tex_file.write_text("invalid latex")

        mock_process = AsyncMock()
        mock_process.returncode = 1
        mock_process.communicate = AsyncMock(return_value=(b"", b"! LaTeX Error"))

        with patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_process)):
            with pytest.raises(RuntimeError, match="Tectonic compilation failed"):
                await compile_tex(tmp_path, "output.tex", engine="pdflatex")
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_templates_service.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 4: Implement the service**

```python
# backend/app/cv/templates/service.py
"""LaTeX template compilation pipeline: Jinja2 render + Tectonic compile."""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

from google.cloud import storage
from jinja2 import Environment

from app.config import settings

logger = logging.getLogger(__name__)

# Jinja2 with custom delimiters to avoid LaTeX brace conflicts
_jinja_env = Environment(
    variable_start_string="<<",
    variable_end_string=">>",
    block_start_string="<%",
    block_end_string="%>",
    comment_start_string="<#",
    comment_end_string="#>",
    autoescape=False,
)

# LaTeX special characters that need escaping
_LATEX_SPECIAL = re.compile(r"([&%$#_{}])")
_LATEX_TILDE = re.compile(r"~")
_LATEX_CARET = re.compile(r"\^")
_LATEX_BACKSLASH = re.compile(r"\\")


def _escape_latex(value: str) -> str:
    """Escape LaTeX special characters in a string."""
    if not isinstance(value, str):
        return value
    value = _LATEX_BACKSLASH.sub(r"\\textbackslash{}", value)
    value = _LATEX_SPECIAL.sub(r"\\\1", value)
    value = _LATEX_TILDE.sub(r"\\textasciitilde{}", value)
    value = _LATEX_CARET.sub(r"\\textasciicircum{}", value)
    return value


# Register as a Jinja2 filter
_jinja_env.filters["escape_latex"] = _escape_latex


def render_tex_with_jinja(
    tex_template: str, person: dict, nodes: list[dict]
) -> str:
    """Render a .tex Jinja2 template with Orb data.

    All string values in person and nodes are LaTeX-escaped by default.
    """

    def _escape_dict(d: dict) -> dict:
        return {
            k: _escape_latex(v) if isinstance(v, str) else v
            for k, v in d.items()
        }

    safe_person = _escape_dict(person)
    safe_nodes = [_escape_dict(n) for n in nodes]

    template = _jinja_env.from_string(tex_template)
    return template.render(person=safe_person, nodes=safe_nodes)


async def download_bundle_to_dir(
    bucket_name: str, prefix: str, dest_dir: Path
) -> None:
    """Download all files under a GCS prefix into a local directory."""

    def _download():
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blobs = bucket.list_blobs(prefix=prefix)
        for blob in blobs:
            # Strip the prefix to get the relative path
            relative = blob.name[len(prefix) :]
            if not relative:
                continue
            local_path = dest_dir / relative
            local_path.parent.mkdir(parents=True, exist_ok=True)
            blob.download_to_filename(str(local_path))

    await asyncio.to_thread(_download)


async def compile_tex(
    work_dir: Path,
    tex_filename: str,
    engine: str = "xelatex",
) -> bytes:
    """Compile a .tex file using Tectonic and return the PDF bytes.

    Raises RuntimeError if compilation fails.
    """
    timeout = settings.tectonic_timeout_seconds

    # Map engine to tectonic CLI flags
    # Tectonic uses XeTeX by default; --pdf for pdfTeX mode is not directly
    # supported — we pass the engine hint but Tectonic auto-detects.
    cmd = ["tectonic", str(work_dir / tex_filename), "--keep-logs"]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(work_dir),
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        process.kill()
        raise RuntimeError(
            f"Tectonic compilation timed out after {timeout}s"
        )

    if process.returncode != 0:
        error_msg = stderr.decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"Tectonic compilation failed:\n{error_msg}")

    pdf_path = work_dir / tex_filename.replace(".tex", ".pdf")
    if not pdf_path.exists():
        raise RuntimeError("Tectonic produced no PDF output")

    return pdf_path.read_bytes()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_templates_service.py -v`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/cv/templates/service.py backend/app/config.py backend/tests/unit/test_templates_service.py
git commit -m "feat(cv): add LaTeX compilation service (#346)"
```

---

## Task 5: API Router

**Files:**
- Create: `backend/app/cv/templates/router.py`
- Modify: `backend/app/main.py` (register router + ensure_table)
- Test: `backend/tests/unit/test_templates_router.py`

- [ ] **Step 1: Write failing tests for router endpoints**

```python
# backend/tests/unit/test_templates_router.py
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.unit.conftest import MockNode


FAKE_TEMPLATE = {
    "id": "awesome-cv",
    "user_id": None,
    "name": "Awesome CV",
    "description": "Colorful sections",
    "engine": "xelatex",
    "license": "LPPL-1.3c",
    "is_preloaded": True,
    "gcs_bundle_path": "templates/awesome-cv/",
    "thumbnail_path": "templates/awesome-cv/thumbnail.png",
    "tex_content": r"\documentclass{awesome-cv}\begin{document}<< person.name >>\end{document}",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
}


class TestListTemplates:
    @patch("app.cv.templates.router.templates_db.list_templates_for_user", new_callable=AsyncMock)
    def test_list_returns_templates(self, mock_list, client):
        mock_list.return_value = [FAKE_TEMPLATE]
        response = client.get("/cv/templates")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "awesome-cv"
        assert "tex_content" not in data[0]  # list should not include full tex


class TestGetTemplate:
    @patch("app.cv.templates.router.templates_db.get_template", new_callable=AsyncMock)
    def test_get_returns_detail(self, mock_get, client):
        mock_get.return_value = FAKE_TEMPLATE
        response = client.get("/cv/templates/awesome-cv")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "awesome-cv"
        assert "tex_content" in data

    @patch("app.cv.templates.router.templates_db.get_template", new_callable=AsyncMock)
    def test_get_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.get("/cv/templates/nonexistent")
        assert response.status_code == 404


class TestCompile:
    @patch("app.cv.templates.router.templates_db.get_template", new_callable=AsyncMock)
    @patch("app.cv.templates.router.service.download_bundle_to_dir", new_callable=AsyncMock)
    @patch("app.cv.templates.router.service.compile_tex", new_callable=AsyncMock)
    @patch("app.cv.templates.router._fetch_orb_data", new_callable=AsyncMock)
    def test_compile_returns_pdf(self, mock_orb, mock_compile, mock_download, mock_get, client):
        mock_get.return_value = FAKE_TEMPLATE
        mock_orb.return_value = ({"name": "Marco"}, [])
        mock_compile.return_value = b"%PDF-1.4 fake"

        response = client.post(
            "/cv/compile",
            json={"template_id": "awesome-cv"},
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content == b"%PDF-1.4 fake"

    @patch("app.cv.templates.router.templates_db.get_template", new_callable=AsyncMock)
    def test_compile_template_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.post(
            "/cv/compile",
            json={"template_id": "nonexistent"},
        )
        assert response.status_code == 404

    @patch("app.cv.templates.router.templates_db.get_template", new_callable=AsyncMock)
    @patch("app.cv.templates.router.service.download_bundle_to_dir", new_callable=AsyncMock)
    @patch("app.cv.templates.router.service.compile_tex", new_callable=AsyncMock)
    @patch("app.cv.templates.router._fetch_orb_data", new_callable=AsyncMock)
    def test_compile_with_custom_tex(self, mock_orb, mock_compile, mock_download, mock_get, client):
        mock_get.return_value = FAKE_TEMPLATE
        mock_orb.return_value = ({"name": "Marco"}, [])
        mock_compile.return_value = b"%PDF-1.4 custom"

        response = client.post(
            "/cv/compile",
            json={
                "template_id": "awesome-cv",
                "tex_content": r"\documentclass{article}\begin{document}Custom\end{document}",
            },
        )

        assert response.status_code == 200
        assert response.content == b"%PDF-1.4 custom"

    @patch("app.cv.templates.router.templates_db.get_template", new_callable=AsyncMock)
    @patch("app.cv.templates.router._fetch_orb_data", new_callable=AsyncMock)
    def test_compile_rejects_dangerous_tex(self, mock_orb, mock_get, client):
        mock_get.return_value = FAKE_TEMPLATE
        mock_orb.return_value = ({"name": "Marco"}, [])

        response = client.post(
            "/cv/compile",
            json={
                "template_id": "awesome-cv",
                "tex_content": r"\write18{rm -rf /}",
            },
        )

        assert response.status_code == 400
        assert "security" in response.json()["detail"].lower() or "write18" in response.json()["detail"].lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_templates_router.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 3: Implement the router**

```python
# backend/app/cv/templates/router.py
"""FastAPI endpoints for LaTeX CV template management and compilation."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import Response
from neo4j import AsyncDriver

from app.cv.templates import db as templates_db
from app.cv.templates import service
from app.cv.templates.models import CompileRequest, TemplateDetail, TemplateListItem
from app.cv.templates.security import validate_tex_content
from app.config import settings
from app.dependencies import get_current_user, get_db
from app.export.router import _gather_orb
from app.graph.queries import GET_FULL_ORB_PUBLIC
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["cv-templates"])


async def _fetch_orb_data(user_id: str, db: AsyncDriver) -> tuple[dict, list[dict]]:
    """Fetch and decrypt the user's Orb data for template rendering."""
    async with db.session() as session:
        result = await session.run(GET_FULL_ORB_PUBLIC, user_id=user_id)
        record = await result.single()
    if record is None:
        raise HTTPException(status_code=404, detail="No orb found for this user")
    return _gather_orb(record)


def _template_to_list_item(tpl: dict) -> dict:
    """Convert a DB row to a TemplateListItem-compatible dict."""
    thumbnail_url = None
    if tpl.get("thumbnail_path") and settings.cv_storage_bucket:
        thumbnail_url = (
            f"https://storage.googleapis.com/{settings.cv_storage_bucket}/{tpl['thumbnail_path']}"
        )
    return {
        "id": tpl["id"],
        "name": tpl["name"],
        "description": tpl.get("description"),
        "engine": tpl["engine"],
        "thumbnail_url": thumbnail_url,
        "is_preloaded": tpl["is_preloaded"],
    }


def _template_to_detail(tpl: dict) -> dict:
    """Convert a DB row to a TemplateDetail-compatible dict."""
    item = _template_to_list_item(tpl)
    item["license"] = tpl.get("license")
    item["tex_content"] = tpl["tex_content"]
    return item


@router.get("/templates")
async def list_templates(
    user: dict = Depends(get_current_user),
) -> list[TemplateListItem]:
    templates = await templates_db.list_templates_for_user(user["user_id"])
    return [_template_to_list_item(t) for t in templates]


@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    user: dict = Depends(get_current_user),
) -> TemplateDetail:
    tpl = await templates_db.get_template(template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    # Users can see pre-loaded templates or their own
    if not tpl["is_preloaded"] and tpl.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_detail(tpl)


@router.post("/templates/upload")
@limiter.limit("5/minute")
async def upload_template(
    request: Request,
    tex_file: UploadFile = File(...),
    name: str = Form(...),
    engine: str = Form("xelatex"),
    description: str = Form(None),
    cls_file: UploadFile | None = File(None),
    user: dict = Depends(get_current_user),
) -> TemplateDetail:
    import uuid

    tex_bytes = await tex_file.read()
    tex_content = tex_bytes.decode("utf-8")

    # Validate security
    errors = validate_tex_content(tex_content)
    if errors:
        raise HTTPException(status_code=400, detail=f"Security validation failed: {'; '.join(errors)}")

    template_id = str(uuid.uuid4())
    user_id = user["user_id"]
    gcs_prefix = f"templates/user/{user_id}/{template_id}/"

    # Upload bundle files to GCS
    if settings.cv_storage_bucket:
        from google.cloud import storage as gcs

        client = gcs.Client()
        bucket = client.bucket(settings.cv_storage_bucket)

        if cls_file:
            cls_bytes = await cls_file.read()
            blob = bucket.blob(f"{gcs_prefix}{cls_file.filename}")
            blob.upload_from_string(cls_bytes)

    tpl = await templates_db.create_template(
        template_id=template_id,
        user_id=user_id,
        name=name,
        description=description,
        engine=engine,
        gcs_bundle_path=gcs_prefix,
        tex_content=tex_content,
    )
    return _template_to_detail(tpl)


@router.post("/compile")
@limiter.limit("5/minute")
async def compile_template(
    request: Request,
    body: CompileRequest,
    user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
) -> Response:
    # Fetch template metadata
    tpl = await templates_db.get_template(body.template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")

    # Determine which tex source to use
    tex_source = body.tex_content if body.tex_content else tpl["tex_content"]

    # Validate security if user provided custom tex
    if body.tex_content:
        errors = validate_tex_content(tex_source)
        if errors:
            raise HTTPException(
                status_code=400,
                detail=f"Security validation failed: {'; '.join(errors)}",
            )

    # Fetch Orb data
    person, nodes = await _fetch_orb_data(user["user_id"], db)

    # Render Jinja2
    rendered_tex = service.render_tex_with_jinja(tex_source, person, nodes)

    # Compile in temp directory
    with tempfile.TemporaryDirectory() as tmpdir:
        work_dir = Path(tmpdir)

        # Download template bundle from GCS
        if settings.cv_storage_bucket and tpl["gcs_bundle_path"]:
            await service.download_bundle_to_dir(
                settings.cv_storage_bucket,
                tpl["gcs_bundle_path"],
                work_dir,
            )

        # Write rendered .tex
        tex_filename = "output.tex"
        (work_dir / tex_filename).write_text(rendered_tex, encoding="utf-8")

        # Compile
        try:
            pdf_bytes = await service.compile_tex(
                work_dir, tex_filename, engine=tpl["engine"]
            )
        except RuntimeError as e:
            raise HTTPException(status_code=422, detail=str(e))

    person_name = person.get("name", "cv").replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{person_name}_CV.pdf"'
        },
    )
```

- [ ] **Step 4: Register the router and ensure_table in main.py**

In `backend/app/main.py`, add the import at the top with other router imports:

```python
from app.cv.templates.router import router as cv_templates_router
```

In the `lifespan` function, after `await ensure_table()` (line 129), add:

```python
        from app.cv.templates.db import ensure_table as ensure_templates_table
        await ensure_templates_table()
```

In the router registration section, add two lines (after the `cv_jobs_router` registrations):

```python
app.include_router(cv_templates_router, prefix=_API_PREFIX)
```

And without prefix:

```python
app.include_router(cv_templates_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_templates_router.py -v`
Expected: All 5 tests PASS

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=50`
Expected: All existing tests PASS, coverage >= 50%

- [ ] **Step 7: Lint check**

Run: `cd backend && uv run ruff check . && uv run ruff format --check .`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add backend/app/cv/templates/router.py backend/app/main.py backend/tests/unit/test_templates_router.py
git commit -m "feat(cv): add template API endpoints and compilation router (#346)"
```

---

## Task 6: Frontend API Client

**Files:**
- Create: `frontend/src/api/templates.ts`

- [ ] **Step 1: Install new frontend dependencies**

Run: `cd frontend && npm install react-pdf pdfjs-dist codemirror @codemirror/lang-javascript @codemirror/view @codemirror/state @codemirror/language`

Note: There is no official `@codemirror/lang-latex` package. We'll use the StreamLanguage adapter with a TeX mode. Install the legacy mode package:

Run: `cd frontend && npm install @codemirror/legacy-modes`

- [ ] **Step 2: Create the API client module**

```typescript
// frontend/src/api/templates.ts
import client from './client';

export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  engine: string;
  thumbnail_url: string | null;
  is_preloaded: boolean;
}

export interface TemplateDetail extends TemplateListItem {
  license: string | null;
  tex_content: string;
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  const { data } = await client.get<TemplateListItem[]>('/cv/templates');
  return data;
}

export async function getTemplate(templateId: string): Promise<TemplateDetail> {
  const { data } = await client.get<TemplateDetail>(`/cv/templates/${templateId}`);
  return data;
}

export async function compileTemplate(
  templateId: string,
  texContent?: string,
): Promise<Blob> {
  const { data } = await client.post(
    '/cv/compile',
    { template_id: templateId, tex_content: texContent || undefined },
    { responseType: 'blob', timeout: 60_000 },
  );
  return data;
}

export async function uploadTemplate(
  texFile: File,
  name: string,
  engine: string,
  description?: string,
  clsFile?: File,
): Promise<TemplateDetail> {
  const form = new FormData();
  form.append('tex_file', texFile);
  form.append('name', name);
  form.append('engine', engine);
  if (description) form.append('description', description);
  if (clsFile) form.append('cls_file', clsFile);
  const { data } = await client.post<TemplateDetail>('/cv/templates/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30_000,
  });
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/templates.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(cv): add frontend API client for templates (#346)"
```

---

## Task 7: PDF Preview Component

**Files:**
- Create: `frontend/src/components/cv/PdfPreview.tsx`

- [ ] **Step 1: Create the PDF preview component**

```tsx
// frontend/src/components/cv/PdfPreview.tsx
import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfPreviewProps {
  pdfBlob: Blob | null;
  isLoading: boolean;
}

export default function PdfPreview({ pdfBlob, isLoading }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);

  const pdfUrl = pdfBlob ? URL.createObjectURL(pdfBlob) : null;

  return (
    <div className="flex flex-col h-full bg-neutral-700">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800 border-b border-neutral-600 text-xs text-neutral-300">
        <span className="uppercase tracking-wider text-neutral-400">PDF Preview</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600"
          >
            -
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))}
            className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600"
          >
            +
          </button>
          {numPages > 1 && (
            <>
              <span className="mx-1 text-neutral-500">|</span>
              <span>
                Page {currentPage} / {numPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600 disabled:opacity-40"
              >
                &larr;
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
                className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600 disabled:opacity-40"
              >
                &rarr;
              </button>
            </>
          )}
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex justify-center p-5">
        {isLoading && (
          <div className="flex items-center justify-center text-neutral-400">
            Compiling...
          </div>
        )}
        {!isLoading && !pdfUrl && (
          <div className="flex items-center justify-center text-neutral-400">
            Click "Refresh Preview" to compile
          </div>
        )}
        {!isLoading && pdfUrl && (
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            className="shadow-xl"
          >
            <Page pageNumber={currentPage} scale={zoom} />
          </Document>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cv/PdfPreview.tsx
git commit -m "feat(cv): add PDF preview component with react-pdf (#346)"
```

---

## Task 8: Template Picker Component

**Files:**
- Create: `frontend/src/components/cv/TemplatePicker.tsx`

- [ ] **Step 1: Create the template picker**

```tsx
// frontend/src/components/cv/TemplatePicker.tsx
import { useEffect, useState } from 'react';
import { listTemplates, type TemplateListItem } from '../../api/templates';

interface TemplatePickerProps {
  onSelect: (templateId: string) => void;
  onUpload: () => void;
}

export default function TemplatePicker({ onSelect, onUpload }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-neutral-400">
        Loading templates...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-100">Choose a Template</h2>
        <button
          onClick={onUpload}
          className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 transition-colors"
        >
          + Upload Custom Template
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onSelect(tpl.id)}
            className="bg-neutral-800 rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow text-left cursor-pointer border border-neutral-700 hover:border-purple-500"
          >
            <div className="h-48 bg-neutral-700 flex items-center justify-center">
              {tpl.thumbnail_url ? (
                <img
                  src={tpl.thumbnail_url}
                  alt={tpl.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-neutral-500 text-sm">No preview</span>
              )}
            </div>
            <div className="p-3">
              <div className="font-semibold text-neutral-100">{tpl.name}</div>
              <div className="text-xs text-neutral-400 mt-1">
                {tpl.description || tpl.engine}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cv/TemplatePicker.tsx
git commit -m "feat(cv): add template picker grid component (#346)"
```

---

## Task 9: Template Editor Component (Split-Pane)

**Files:**
- Create: `frontend/src/components/cv/TemplateEditor.tsx`

- [ ] **Step 1: Create the editor component**

```tsx
// frontend/src/components/cv/TemplateEditor.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { oneDark } from '@codemirror/theme-one-dark';
import { compileTemplate, type TemplateDetail } from '../../api/templates';
import PdfPreview from './PdfPreview';

interface TemplateEditorProps {
  template: TemplateDetail;
  onBack: () => void;
}

export default function TemplateEditor({ template, onBack }: TemplateEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: template.tex_content,
      extensions: [
        basicSetup,
        StreamLanguage.define(stex),
        oneDark,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [template.id]); // Re-create editor when template changes

  const getTexContent = useCallback(() => {
    return viewRef.current?.state.doc.toString() || template.tex_content;
  }, [template.tex_content]);

  const handleRefresh = useCallback(async () => {
    setIsCompiling(true);
    setError(null);
    try {
      const blob = await compileTemplate(template.id, getTexContent());
      setPdfBlob(blob);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Compilation failed';
      setError(message);
    } finally {
      setIsCompiling(false);
    }
  }, [template.id, getTexContent]);

  const handleExport = useCallback(async () => {
    setIsCompiling(true);
    setError(null);
    try {
      const blob = await compileTemplate(template.id, getTexContent());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cv.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
    } finally {
      setIsCompiling(false);
    }
  }, [template.id, getTexContent]);

  return (
    <div className="flex flex-col h-screen bg-neutral-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1 text-xs border border-neutral-500 text-neutral-300 rounded hover:bg-neutral-700"
          >
            &larr; Back to Templates
          </button>
          <span className="text-sm text-neutral-400">Template:</span>
          <span className="text-sm font-semibold text-neutral-100">{template.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-400 max-w-md truncate">{error}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isCompiling}
            className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isCompiling ? 'Compiling...' : '↻ Refresh Preview'}
          </button>
          <button
            onClick={handleExport}
            disabled={isCompiling}
            className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
          >
            ⤓ Export PDF
          </button>
        </div>
      </div>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Code Editor */}
        <div className="flex-1 flex flex-col border-r-2 border-neutral-700 min-w-0">
          <div className="px-3 py-1.5 bg-neutral-800 border-b border-neutral-700 flex justify-between text-xs text-neutral-400">
            <span className="uppercase tracking-wider">LaTeX Source</span>
            <span>template.tex</span>
          </div>
          <div ref={editorRef} className="flex-1 overflow-auto" />
        </div>

        {/* Right: PDF Preview */}
        <div className="flex-1 min-w-0">
          <PdfPreview pdfBlob={pdfBlob} isLoading={isCompiling} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cv/TemplateEditor.tsx
git commit -m "feat(cv): add split-pane LaTeX editor with CodeMirror (#346)"
```

---

## Task 10: Template Upload Dialog

**Files:**
- Create: `frontend/src/components/cv/TemplateUploadDialog.tsx`

- [ ] **Step 1: Create the upload dialog**

```tsx
// frontend/src/components/cv/TemplateUploadDialog.tsx
import { useState, type FormEvent } from 'react';
import { uploadTemplate } from '../../api/templates';

interface TemplateUploadDialogProps {
  onClose: () => void;
  onUploaded: (templateId: string) => void;
}

export default function TemplateUploadDialog({ onClose, onUploaded }: TemplateUploadDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [engine, setEngine] = useState('xelatex');
  const [texFile, setTexFile] = useState<File | null>(null);
  const [clsFile, setClsFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!texFile || !name) return;

    setSubmitting(true);
    setError(null);
    try {
      const tpl = await uploadTemplate(texFile, name, engine, description, clsFile || undefined);
      onUploaded(tpl.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-800 rounded-lg p-6 w-full max-w-md shadow-2xl border border-neutral-700"
      >
        <h3 className="text-lg font-semibold text-neutral-100 mb-4">Upload Custom Template</h3>

        <label className="block text-sm text-neutral-300 mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 mb-3 bg-neutral-700 border border-neutral-600 rounded text-neutral-100 text-sm"
        />

        <label className="block text-sm text-neutral-300 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 mb-3 bg-neutral-700 border border-neutral-600 rounded text-neutral-100 text-sm"
        />

        <label className="block text-sm text-neutral-300 mb-1">LaTeX Engine</label>
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
          className="w-full px-3 py-2 mb-3 bg-neutral-700 border border-neutral-600 rounded text-neutral-100 text-sm"
        >
          <option value="xelatex">XeLaTeX</option>
          <option value="pdflatex">pdfLaTeX</option>
          <option value="lualatex">LuaLaTeX</option>
        </select>

        <label className="block text-sm text-neutral-300 mb-1">.tex File *</label>
        <input
          type="file"
          accept=".tex"
          onChange={(e) => setTexFile(e.target.files?.[0] || null)}
          required
          className="w-full mb-3 text-sm text-neutral-300"
        />

        <label className="block text-sm text-neutral-300 mb-1">.cls File (optional)</label>
        <input
          type="file"
          accept=".cls,.sty"
          onChange={(e) => setClsFile(e.target.files?.[0] || null)}
          className="w-full mb-4 text-sm text-neutral-300"
        />

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-300 border border-neutral-600 rounded hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !texFile || !name}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cv/TemplateUploadDialog.tsx
git commit -m "feat(cv): add template upload dialog (#346)"
```

---

## Task 11: Rewrite CvExportPage

**Files:**
- Modify: `frontend/src/pages/CvExportPage.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite CvExportPage as template picker + editor flow**

```tsx
// frontend/src/pages/CvExportPage.tsx
import { useState, useCallback } from 'react';
import { getTemplate, type TemplateDetail } from '../api/templates';
import TemplatePicker from '../components/cv/TemplatePicker';
import TemplateEditor from '../components/cv/TemplateEditor';
import TemplateUploadDialog from '../components/cv/TemplateUploadDialog';

export default function CvExportPage() {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const handleSelect = useCallback(async (templateId: string) => {
    const detail = await getTemplate(templateId);
    setTemplate(detail);
  }, []);

  const handleBack = useCallback(() => {
    setTemplate(null);
  }, []);

  const handleUploaded = useCallback(async (templateId: string) => {
    setShowUpload(false);
    const detail = await getTemplate(templateId);
    setTemplate(detail);
  }, []);

  if (template) {
    return <TemplateEditor template={template} onBack={handleBack} />;
  }

  return (
    <div className="min-h-screen bg-neutral-900">
      <TemplatePicker
        onSelect={handleSelect}
        onUpload={() => setShowUpload(true)}
      />
      {showUpload && (
        <TemplateUploadDialog
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Verify ESLint passes**

Run: `cd frontend && npm run lint`
Expected: No lint errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CvExportPage.tsx
git commit -m "feat(cv): rewrite CvExportPage with template picker + LaTeX editor (#346)"
```

---

## Task 12: Clean Up Old CV Export Utils

**Files:**
- Delete or evaluate: `frontend/src/pages/cv-export-utils.ts`

- [ ] **Step 1: Check if cv-export-utils is used elsewhere**

Run: `cd frontend && grep -r "cv-export-utils" src/ --include="*.ts" --include="*.tsx"`

If only imported by the old `CvExportPage.tsx` (which we've now rewritten), the file is dead code.

- [ ] **Step 2: Remove the unused file**

Delete `frontend/src/pages/cv-export-utils.ts` if it has no other consumers.

- [ ] **Step 3: Verify build still works**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git rm frontend/src/pages/cv-export-utils.ts
git commit -m "chore(cv): remove unused cv-export-utils after LaTeX migration (#346)"
```

---

## Task 13: Backend Lint + Full Test Pass

**Files:** None new — validation only.

- [ ] **Step 1: Run backend linter**

Run: `cd backend && uv run ruff check . && uv run ruff format --check .`
Expected: No errors

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && uv run pytest tests/unit/ -v --cov=app --cov-fail-under=50`
Expected: All tests pass, coverage >= 50%

- [ ] **Step 3: Fix any issues found and commit**

If lint or test issues found, fix them and commit:
```bash
git add -u
git commit -m "fix(cv): address lint and test issues from LaTeX export (#346)"
```

---

## Task 14: Frontend Build + Lint Final Check

**Files:** None new — validation only.

- [ ] **Step 1: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Fix any issues found and commit**

If issues found, fix and commit:
```bash
git add -u
git commit -m "fix(cv): address frontend lint/type issues from LaTeX export (#346)"
```

---

## Task 15: Manual Smoke Test

- [ ] **Step 1: Start backend**

Run: `cd backend && uv run uvicorn app.main:app --reload`

Verify: no startup errors, `cv_templates` table created in logs

- [ ] **Step 2: Start frontend**

Run: `cd frontend && npm run dev`

- [ ] **Step 3: Navigate to /cv-export in browser**

Verify:
- Template picker loads (will show empty grid if no pre-loaded templates seeded yet)
- No console errors
- "Upload Custom Template" button visible

- [ ] **Step 4: Test upload flow** (if GCS/PostgreSQL configured locally)

Upload a simple `.tex` file and verify it appears in the picker.

- [ ] **Step 5: Test compile flow** (requires Tectonic installed locally)

Select a template, click "Refresh Preview", verify PDF renders.

Note: Full end-to-end testing requires Tectonic binary installed (`brew install tectonic` on macOS) and PostgreSQL running locally. If either is missing, the smoke test validates the UI flow without actual compilation.

---

## Task 16: Seed Pre-Loaded Templates

This task requires creative work — downloading the 4 template repositories, extracting `.cls` + font files, creating Jinja2 `.tex` templates that map Orb data to each template's custom commands, generating thumbnail images, and uploading bundles to GCS.

**Files:**
- Create: `backend/scripts/seed_templates.py` — script to seed pre-loaded templates into PostgreSQL + upload bundles to GCS
- Create: `backend/app/cv/templates/preloaded/` — directory containing the 4 Jinja2 `.tex` template files

- [ ] **Step 1: Download and prepare template bundles**

For each of the 4 templates (Awesome CV, SWE Resume, techResume, YAAC):
1. Clone/download the source repository
2. Extract the required files (`.cls`, fonts, supporting `.tex` files)
3. For Awesome CV: download Source Sans 3 + Roboto font files (not in original repo)
4. Write a Jinja2 `.tex` file that uses the template's commands (`\cventry`, `\cvsection`, etc.) with `<< >>` / `<% %>` delimiters to inject Orb data
5. Generate a thumbnail PNG (compile with sample data, convert first page to image)

- [ ] **Step 2: Create the seed script**

```python
# backend/scripts/seed_templates.py
"""Seed pre-loaded LaTeX templates into PostgreSQL and upload bundles to GCS.

Usage: cd backend && uv run python scripts/seed_templates.py
"""
import asyncio
import uuid
from pathlib import Path

from app.cv.templates.db import create_template, ensure_table, get_template
from app.db.postgres import get_pool, close_pool


TEMPLATES_DIR = Path(__file__).parent.parent / "app" / "cv" / "templates" / "preloaded"

PRELOADED = [
    {
        "id": "awesome-cv",
        "name": "Awesome CV",
        "description": "Colorful sections with accent colors, XeLaTeX",
        "engine": "xelatex",
        "license": "LPPL-1.3c",
        "gcs_bundle_path": "templates/awesome-cv/",
        "thumbnail_path": "templates/awesome-cv/thumbnail.png",
        "tex_file": "awesome-cv.tex.j2",
    },
    {
        "id": "swe-resume",
        "name": "SWE Resume",
        "description": "Clean ATS-friendly resume, pdfLaTeX",
        "engine": "pdflatex",
        "license": "MIT",
        "gcs_bundle_path": "templates/swe-resume/",
        "thumbnail_path": "templates/swe-resume/thumbnail.png",
        "tex_file": "swe-resume.tex.j2",
    },
    {
        "id": "tech-resume",
        "name": "techResume",
        "description": "Single-page ATS-optimized resume, pdfLaTeX",
        "engine": "pdflatex",
        "license": "MIT",
        "gcs_bundle_path": "templates/tech-resume/",
        "thumbnail_path": "templates/tech-resume/thumbnail.png",
        "tex_file": "tech-resume.tex.j2",
    },
    {
        "id": "yaac",
        "name": "YAAC",
        "description": "Modern two-column header with Source Sans Pro, LuaLaTeX",
        "engine": "lualatex",
        "license": "LPPL-1.3c",
        "gcs_bundle_path": "templates/yaac/",
        "thumbnail_path": "templates/yaac/thumbnail.png",
        "tex_file": "yaac.tex.j2",
    },
]


async def seed():
    await get_pool()
    await ensure_table()

    for tpl in PRELOADED:
        existing = await get_template(tpl["id"])
        if existing:
            print(f"  Skipping {tpl['id']} (already exists)")
            continue

        tex_path = TEMPLATES_DIR / tpl["tex_file"]
        if not tex_path.exists():
            print(f"  WARNING: {tex_path} not found, skipping {tpl['id']}")
            continue

        tex_content = tex_path.read_text(encoding="utf-8")

        await create_template(
            template_id=tpl["id"],
            name=tpl["name"],
            description=tpl["description"],
            engine=tpl["engine"],
            license=tpl["license"],
            is_preloaded=True,
            gcs_bundle_path=tpl["gcs_bundle_path"],
            thumbnail_path=tpl["thumbnail_path"],
            tex_content=tex_content,
        )
        print(f"  Seeded {tpl['id']}")

    await close_pool()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(seed())
```

- [ ] **Step 3: Create the 4 Jinja2 `.tex` template files**

Create each file under `backend/app/cv/templates/preloaded/`:
- `awesome-cv.tex.j2` — uses `\cventry`, `\cvsection` from `awesome-cv.cls`
- `swe-resume.tex.j2` — uses `article` class + `custom-commands.tex` macros
- `tech-resume.tex.j2` — uses `cv.cls` (freycv) commands
- `yaac.tex.j2` — uses `yaac-another-awesome-cv.cls` environments

Each file maps Orb node types to the template's specific commands using `<< >>` / `<% %>` Jinja2 delimiters. See spec for the full variable contract.

- [ ] **Step 4: Upload template bundles to GCS**

For each template, upload the `.cls`, font files, and thumbnail to the appropriate GCS path under `orbis-cv-files/templates/`.

- [ ] **Step 5: Run seed script and verify**

Run: `cd backend && uv run python scripts/seed_templates.py`
Expected: All 4 templates seeded into PostgreSQL

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/seed_templates.py backend/app/cv/templates/preloaded/
git commit -m "feat(cv): add pre-loaded template seed script and Jinja2 templates (#346)"
```
