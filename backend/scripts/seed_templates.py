"""Seed pre-loaded LaTeX templates into PostgreSQL.

Usage: cd backend && uv run python scripts/seed_templates.py
"""

import asyncio
from pathlib import Path

from app.cv.templates.db import create_template, ensure_table, get_template
from app.db.postgres import close_pool, get_pool

TEMPLATES_DIR = (
    Path(__file__).parent.parent / "app" / "cv" / "templates" / "preloaded"
)

PRELOADED = [
    {
        "id": "awesome-cv",
        "name": "Awesome CV",
        "description": "Colorful sections with accent colors, XeLaTeX",
        "engine": "xelatex",
        "license": "LPPL-1.3c",
        "gcs_bundle_path": "templates/awesome-cv/",
        "thumbnail_path": None,
        "tex_file": "awesome-cv.tex.j2",
    },
    {
        "id": "swe-resume",
        "name": "SWE Resume",
        "description": "Clean ATS-friendly resume, pdfLaTeX",
        "engine": "pdflatex",
        "license": "MIT",
        "gcs_bundle_path": "templates/swe-resume/",
        "thumbnail_path": None,
        "tex_file": "swe-resume.tex.j2",
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
