"""PostgreSQL CRUD module for cv_templates — LaTeX CV template metadata store."""

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
CREATE INDEX IF NOT EXISTS cv_templates_user_id_idx   ON cv_templates (user_id);
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
    """Return all preloaded templates plus custom templates owned by the user."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT * FROM cv_templates
        WHERE is_preloaded = TRUE OR user_id = $1
        ORDER BY is_preloaded DESC, created_at ASC
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def delete_template(template_id: str, user_id: str) -> None:
    """Delete a user-owned, non-preloaded template.

    Only removes the row when both the id matches and the template belongs
    to the given user and is not a preloaded system template.
    """
    pool = await get_pool()
    await pool.execute(
        """
        DELETE FROM cv_templates
        WHERE id = $1
          AND user_id = $2
          AND is_preloaded = FALSE
        """,
        template_id,
        user_id,
    )
