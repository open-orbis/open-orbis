"""Google Cloud Storage backend for CV document files.

Used in production when CV_STORAGE_BUCKET is configured. Files are stored
as plain PDF (no application-level encryption — GCS provides SSE at rest).
Authentication uses Application Default Credentials (Workload Identity in
Cloud Run, gcloud auth for local dev).
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        from google.cloud import storage

        _client = storage.Client()
    return _client


def _key(user_id: str, document_id: str) -> str:
    return f"{user_id}/{document_id}.pdf"


async def upload_file(
    bucket_name: str, user_id: str, document_id: str, pdf_bytes: bytes
) -> str:
    """Upload PDF to GCS. Returns the GCS object key."""

    def _upload():
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(_key(user_id, document_id))
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        return blob.name

    key = await asyncio.to_thread(_upload)
    logger.info("Uploaded %s to gs://%s", key, bucket_name)
    return key


async def download_file(
    bucket_name: str, user_id: str, document_id: str
) -> bytes | None:
    """Download PDF from GCS. Returns None if not found."""

    def _download():
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(_key(user_id, document_id))
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    return await asyncio.to_thread(_download)


async def delete_file(bucket_name: str, user_id: str, document_id: str) -> bool:
    """Delete a file from GCS. Returns True if it existed."""

    def _delete():
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(_key(user_id, document_id))
        if not blob.exists():
            return False
        blob.delete()
        return True

    return await asyncio.to_thread(_delete)


async def delete_prefix(bucket_name: str, prefix: str) -> int:
    """Delete all objects with a given prefix. Returns count deleted."""

    def _delete_all():
        client = _get_client()
        bucket = client.bucket(bucket_name)
        blobs = list(bucket.list_blobs(prefix=prefix))
        for blob in blobs:
            blob.delete()
        return len(blobs)

    count = await asyncio.to_thread(_delete_all)
    if count:
        logger.info(
            "Deleted %d objects with prefix %s from gs://%s", count, prefix, bucket_name
        )
    return count
