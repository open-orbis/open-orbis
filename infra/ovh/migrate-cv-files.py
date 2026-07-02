"""Migrate CV PDF files from GCS (plaintext) to the local Fernet-encrypted store.

Runs INSIDE the backend container (it has the app, ENCRYPTION_KEY, the Vertex
service-account key with GCS access, and the cv_files volume mounted). Iterates
the already-migrated `cv_documents` rows so every file lines up with its DB row.

Run from /opt/orbis/orb_project on the VPS, AFTER the Postgres migration:

    docker exec -e SOURCE_CV_BUCKET=orbis-cv-files -w /app -i ovh-backend-1 \
        python - < infra/ovh/migrate-cv-files.py

GCS layout is `{user_id}/{document_id}.pdf`; local is
`{user_id}_{document_id}.pdf.enc` (Fernet), per app.cv_storage.storage.
"""

from __future__ import annotations

import asyncio
import os

import asyncpg

from app.config import settings
from app.cv_storage.gcs import download_file
from app.cv_storage.storage import _CV_DIR, _doc_path
from app.graph.encryption import encrypt_bytes

BUCKET = os.environ.get("SOURCE_CV_BUCKET", "orbis-cv-files")


async def main() -> None:
    _CV_DIR.mkdir(parents=True, exist_ok=True)

    conn = await asyncpg.connect(settings.database_url)
    try:
        rows = await conn.fetch("SELECT user_id, document_id FROM cv_documents")
    finally:
        await conn.close()

    migrated = 0
    missing = 0
    for r in rows:
        user_id = r["user_id"]
        document_id = r["document_id"]
        data = await download_file(BUCKET, user_id, document_id)
        if data is None:
            print(f"MISSING gs://{BUCKET}/{user_id}/{document_id}.pdf")
            missing += 1
            continue
        _doc_path(user_id, document_id).write_bytes(encrypt_bytes(data))
        migrated += 1

    print(f"Migrated {migrated} files, {missing} missing, {len(rows)} total rows.")
    if missing:
        raise SystemExit(f"{missing} files referenced in cv_documents were absent in GCS")


if __name__ == "__main__":
    asyncio.run(main())
