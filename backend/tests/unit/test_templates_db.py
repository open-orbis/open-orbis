"""Unit tests for app.cv.templates.db — asyncpg CV template metadata store."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import app.cv.templates.db as templates_db

_TEMPLATE = {
    "id": "tmpl-1",
    "user_id": "user-1",
    "name": "Classic CV",
    "description": "A clean classic layout",
    "engine": "xelatex",
    "license": "MIT",
    "is_preloaded": False,
    "gcs_bundle_path": "gs://bucket/tmpl-1.tar.gz",
    "thumbnail_path": "gs://bucket/tmpl-1-thumb.png",
    "tex_content": r"\documentclass{article}\begin{document}Hello\end{document}",
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

_PRELOADED_TEMPLATE = {
    **_TEMPLATE,
    "id": "tmpl-preloaded",
    "user_id": None,
    "name": "Preloaded CV",
    "is_preloaded": True,
}


def _mock_pool():
    """Return an AsyncMock that behaves like an asyncpg Pool."""
    pool = AsyncMock()
    pool.execute = AsyncMock(return_value="INSERT 0 1")
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.fetchval = AsyncMock(return_value=0)
    return pool


# ── ensure_table ──


async def test_ensure_table_executes_create():
    pool = _mock_pool()
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.ensure_table()
    pool.execute.assert_awaited_once()
    sql = pool.execute.call_args[0][0]
    assert "CREATE TABLE IF NOT EXISTS cv_templates" in sql
    assert "is_preloaded" in sql
    assert "gcs_bundle_path" in sql


# ── create_template ──


async def test_create_template_returns_dict():
    pool = _mock_pool()
    pool.fetchrow.return_value = _TEMPLATE
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        result = await templates_db.create_template(
            template_id="tmpl-1",
            name="Classic CV",
            engine="xelatex",
            gcs_bundle_path="gs://bucket/tmpl-1.tar.gz",
            tex_content=r"\documentclass{article}\begin{document}Hello\end{document}",
            user_id="user-1",
            description="A clean classic layout",
            license="MIT",
            thumbnail_path="gs://bucket/tmpl-1-thumb.png",
        )
    assert result["id"] == "tmpl-1"
    assert result["name"] == "Classic CV"
    assert result["engine"] == "xelatex"
    pool.fetchrow.assert_awaited_once()


async def test_create_template_sql_contains_insert_returning():
    pool = _mock_pool()
    pool.fetchrow.return_value = _TEMPLATE
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.create_template(
            template_id="tmpl-1",
            name="Classic CV",
            engine="xelatex",
            gcs_bundle_path="gs://bucket/tmpl-1.tar.gz",
            tex_content=r"\documentclass{article}",
        )
    sql = pool.fetchrow.call_args[0][0]
    assert "INSERT INTO cv_templates" in sql
    assert "RETURNING *" in sql


async def test_create_template_optional_fields_default_none():
    pool = _mock_pool()
    pool.fetchrow.return_value = {**_TEMPLATE, "user_id": None, "description": None}
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.create_template(
            template_id="tmpl-2",
            name="Minimal",
            engine="xelatex",
            gcs_bundle_path="gs://bucket/tmpl-2.tar.gz",
            tex_content=r"\documentclass{article}",
        )
    args = pool.fetchrow.call_args[0]
    # user_id is None by default
    assert None in args


async def test_create_preloaded_template():
    pool = _mock_pool()
    pool.fetchrow.return_value = _PRELOADED_TEMPLATE
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        result = await templates_db.create_template(
            template_id="tmpl-preloaded",
            name="Preloaded CV",
            engine="xelatex",
            gcs_bundle_path="gs://bucket/preloaded.tar.gz",
            tex_content=r"\documentclass{article}",
            is_preloaded=True,
        )
    assert result["is_preloaded"] is True
    assert result["user_id"] is None
    args = pool.fetchrow.call_args[0]
    assert True in args


# ── get_template ──


async def test_get_template_found():
    pool = _mock_pool()
    pool.fetchrow.return_value = _TEMPLATE
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        result = await templates_db.get_template("tmpl-1")
    assert result is not None
    assert result["id"] == "tmpl-1"
    sql = pool.fetchrow.call_args[0][0]
    assert "cv_templates" in sql
    assert "id = $1" in sql


async def test_get_template_not_found():
    pool = _mock_pool()
    pool.fetchrow.return_value = None
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        result = await templates_db.get_template("no-such-template")
    assert result is None


# ── list_templates_for_user ──


async def test_list_templates_for_user_returns_preloaded_and_own():
    pool = _mock_pool()
    pool.fetch.return_value = [_PRELOADED_TEMPLATE, _TEMPLATE]
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        results = await templates_db.list_templates_for_user("user-1")
    assert len(results) == 2
    assert results[0]["is_preloaded"] is True
    assert results[1]["user_id"] == "user-1"


async def test_list_templates_for_user_sql_includes_preloaded_condition():
    pool = _mock_pool()
    pool.fetch.return_value = []
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.list_templates_for_user("user-1")
    sql = pool.fetch.call_args[0][0]
    assert "is_preloaded" in sql
    assert "user_id" in sql


async def test_list_templates_for_user_passes_user_id():
    pool = _mock_pool()
    pool.fetch.return_value = []
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.list_templates_for_user("user-42")
    args = pool.fetch.call_args[0]
    assert "user-42" in args


async def test_list_templates_for_user_empty():
    pool = _mock_pool()
    pool.fetch.return_value = []
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        results = await templates_db.list_templates_for_user("user-1")
    assert results == []


async def test_list_templates_for_user_returns_list_of_dicts():
    pool = _mock_pool()
    pool.fetch.return_value = [_TEMPLATE]
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        results = await templates_db.list_templates_for_user("user-1")
    assert isinstance(results, list)
    assert isinstance(results[0], dict)


# ── delete_template ──


async def test_delete_template_executes_delete():
    pool = _mock_pool()
    pool.execute.return_value = "DELETE 1"
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.delete_template("tmpl-1", "user-1")
    pool.execute.assert_awaited_once()


async def test_delete_template_sql_guards_ownership_and_preloaded():
    pool = _mock_pool()
    pool.execute.return_value = "DELETE 1"
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.delete_template("tmpl-1", "user-1")
    sql = pool.execute.call_args[0][0]
    assert "DELETE FROM cv_templates" in sql
    assert "user_id" in sql
    assert "is_preloaded" in sql


async def test_delete_template_passes_correct_args():
    pool = _mock_pool()
    pool.execute.return_value = "DELETE 1"
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        await templates_db.delete_template("tmpl-1", "user-1")
    args = pool.execute.call_args[0]
    assert "tmpl-1" in args
    assert "user-1" in args


async def test_delete_template_no_rows_affected_is_silent():
    """delete_template does not raise when no rows match (returns None)."""
    pool = _mock_pool()
    pool.execute.return_value = "DELETE 0"
    with patch("app.cv.templates.db.get_pool", AsyncMock(return_value=pool)):
        result = await templates_db.delete_template("tmpl-99", "user-1")
    assert result is None
