"""API router for LaTeX CV templates — list, detail, upload, and compile."""

from __future__ import annotations

import logging
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from neo4j import AsyncDriver

from app.config import settings
from app.cv.templates import db as templates_db
from app.cv.templates import service
from app.cv.templates.models import CompileRequest, TemplateDetail, TemplateListItem
from app.cv.templates.security import validate_tex_content
from app.dependencies import get_current_user, get_db
from app.export.router import _gather_orb
from app.graph.queries import GET_FULL_ORB
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["cv-templates"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _thumbnail_url(thumbnail_path: str | None) -> str | None:
    """Generate a public GCS URL for the thumbnail, or None."""
    if not thumbnail_path or not settings.templates_bucket:
        return None
    return (
        f"https://storage.googleapis.com/{settings.templates_bucket}/{thumbnail_path}"
    )


def _template_to_list_item(row: dict) -> TemplateListItem:
    return TemplateListItem(
        id=row["id"],
        name=row["name"],
        description=row.get("description"),
        engine=row["engine"],
        thumbnail_url=_thumbnail_url(row.get("thumbnail_path")),
        is_preloaded=row["is_preloaded"],
    )


def _template_to_detail(row: dict) -> TemplateDetail:
    return TemplateDetail(
        id=row["id"],
        name=row["name"],
        description=row.get("description"),
        engine=row["engine"],
        license=row.get("license"),
        thumbnail_url=_thumbnail_url(row.get("thumbnail_path")),
        is_preloaded=row["is_preloaded"],
        tex_content=row["tex_content"],
    )


async def _fetch_orb_data(user_id: str, db: AsyncDriver) -> tuple[dict, list[dict]]:
    async with db.session() as session:
        result = await session.run(GET_FULL_ORB, user_id=user_id)
        record = await result.single()
    if record is None:
        raise HTTPException(status_code=404, detail="No orb found for this user")
    return _gather_orb(record)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/templates", response_model=list[TemplateListItem])
async def list_templates(
    current_user: dict = Depends(get_current_user),
):
    """List all templates available to the authenticated user."""
    rows = await templates_db.list_templates_for_user(current_user["user_id"])
    return [_template_to_list_item(r) for r in rows]


@router.get("/templates/{template_id}", response_model=TemplateDetail)
async def get_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single template including its tex_content."""
    row = await templates_db.get_template(template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    # Access check: preloaded templates are accessible to everyone;
    # custom templates are only accessible to their owner.
    if not row["is_preloaded"] and row.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_detail(row)


@router.post("/templates/upload", response_model=TemplateListItem, status_code=201)
@limiter.limit("5/minute")
async def upload_template(
    request: Request,
    tex_file: UploadFile,
    name: str = Form(...),
    engine: str = Form("xelatex"),
    description: str | None = Form(None),
    cls_file: UploadFile | None = None,
    current_user: dict = Depends(get_current_user),
):
    """Upload a custom LaTeX CV template."""
    raw = await tex_file.read()
    try:
        tex_content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail="tex_file must be valid UTF-8"
        ) from exc

    errors = validate_tex_content(tex_content)
    if errors:
        raise HTTPException(
            status_code=422, detail={"message": "Unsafe tex content", "errors": errors}
        )

    template_id = str(uuid.uuid4())
    # For user-uploaded templates we store a placeholder GCS path; no actual
    # upload is performed here — that can be wired up later.
    gcs_bundle_path = f"user-templates/{current_user['user_id']}/{template_id}/"

    row = await templates_db.create_template(
        template_id=template_id,
        name=name,
        engine=engine,
        gcs_bundle_path=gcs_bundle_path,
        tex_content=tex_content,
        user_id=current_user["user_id"],
        description=description,
        is_preloaded=False,
    )
    return _template_to_list_item(row)


@router.post("/compile")
@limiter.limit("5/minute")
async def compile_template(
    request: Request,
    body: CompileRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncDriver = Depends(get_db),
):
    """Compile a LaTeX CV template with the user's Orb data.

    Returns the resulting PDF as ``application/pdf``.
    """
    # 1. Fetch template from DB
    row = await templates_db.get_template(body.template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if not row["is_preloaded"] and row.get("user_id") != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Template not found")

    # 2. Resolve tex_content (user-provided overrides DB value)
    if body.tex_content is not None:
        errors = validate_tex_content(body.tex_content)
        if errors:
            raise HTTPException(
                status_code=422,
                detail={"message": "Unsafe tex content", "errors": errors},
            )
        tex_content = body.tex_content
    else:
        tex_content = row["tex_content"]

    # 3. Fetch Orb data
    person, nodes = await _fetch_orb_data(current_user["user_id"], db)

    # 4. Render Jinja2
    try:
        rendered = service.render_tex_with_jinja(tex_content, person, nodes)
        # Temporary debug: log first 40 lines
        for i, line in enumerate(rendered.split('\n')[:40], 1):
            if line.strip():
                logger.info("TEX %d: %s", i, line)
    except Exception as exc:
        logger.error("Jinja2 rendering failed: %s", exc)
        raise HTTPException(
            status_code=500, detail="Failed to render template"
        ) from exc

    # 5. Download GCS bundle + compile
    try:
        with tempfile.TemporaryDirectory() as tmp:
            work_dir = Path(tmp)

            if settings.templates_bucket:
                await __import__("asyncio").to_thread(
                    service.download_bundle_to_dir,
                    settings.templates_bucket,
                    row["gcs_bundle_path"],
                    work_dir,
                )

            tex_filename = "cv.tex"
            (work_dir / tex_filename).write_text(rendered, encoding="utf-8")

            pdf_bytes = await service.compile_tex(
                work_dir, tex_filename, engine=row["engine"]
            )
    except RuntimeError as exc:
        logger.error("LaTeX compilation failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"Compilation failed: {exc}"
        ) from exc
    except Exception as exc:
        logger.error("Unexpected compilation error: %s", exc)
        raise HTTPException(
            status_code=500, detail="Unexpected error during compilation"
        ) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="cv.pdf"'},
    )
