# CV Metadata Tracking & 3-Document Retention

**Issue:** #192  
**Date:** 2026-04-09  
**Status:** Approved

## Summary

Track metadata per uploaded CV/document and cap retained documents at 3 per user. Metadata-only tracking — the Neo4j graph remains a merged accumulation of all imports; removing a document deletes its metadata and encrypted file, not the graph nodes.

## Decisions

- **Approach:** Extend existing SQLite storage (not Neo4j nodes)
- **Scope:** Both initial CV upload and "Import data" flows count toward the 3-document cap
- **Eviction:** Always remove the oldest document automatically (no user choice)
- **Backfill:** Migrate existing SQLite records with NULL for entities/edges counts; frontend shows "N/A"
- **Provenance:** Not tracked — nodes are not tagged with their source document

## Data Model

### SQLite Schema

Replace the current `cv_uploads` table with `cv_documents`:

```sql
CREATE TABLE cv_documents (
    document_id       TEXT NOT NULL,     -- UUID, generated at upload time
    user_id           TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes   INTEGER NOT NULL,
    uploaded_at       TEXT NOT NULL,     -- ISO timestamp
    page_count        INTEGER NOT NULL,
    entities_count    INTEGER,           -- NULL for legacy backfilled records
    edges_count       INTEGER,           -- NULL for legacy backfilled records
    PRIMARY KEY (user_id, document_id)
);
```

### File Storage

Change encrypted file naming from `{user_id}.pdf.enc` to `{user_id}_{document_id}.pdf.enc` to support multiple files per user.

## Backend API Changes

### New Endpoints

- **`GET /cv/documents`** — List document metadata for current user (up to 3), ordered by `uploaded_at` descending.
  ```json
  [
    {
      "document_id": "uuid",
      "original_filename": "resume.pdf",
      "uploaded_at": "2026-04-09T...",
      "file_size_bytes": 204800,
      "page_count": 3,
      "entities_count": 42,
      "edges_count": 15
    }
  ]
  ```

- **`DELETE /cv/documents/{document_id}`** — Delete a specific document's metadata and encrypted file.

### Modified Endpoints

- **`POST /cv/upload`** and **`POST /cv/import`** — Response now includes a `document_id` (UUID generated at upload time). File storage is deferred to confirm time (no encrypted file written yet). No change to extraction logic.

- **`POST /cv/confirm`** and **`POST /cv/import-confirm`** — Accept additional fields: `document_id` and `file` (multipart, the original uploaded file). On confirm:
  1. Check document count for user
  2. If count >= 3, delete the oldest document (metadata + encrypted file)
  3. Store the encrypted file under `{user_id}_{document_id}.pdf.enc`
  4. Insert the new document record with `entities_count = len(nodes)`, `edges_count = len(relationships)`
  5. Proceed with existing graph persist logic
  
  **Note:** Moving file storage from upload to confirm prevents orphan files when a user uploads but never confirms. The frontend holds the file reference until confirm.

- **`GET /cv/download`** — Becomes **`GET /cv/documents/{document_id}/download`** to support downloading any stored document.

### Removed Endpoints

- **`POST /cv/store-file`** — No longer needed; document storage is handled automatically during confirm.

## Frontend Changes

### Pre-Upload Check

1. Before initiating upload (both flows), call `GET /cv/documents`
2. If count >= 3, show a confirmation modal:
   - "You already have 3 documents stored. Uploading a new one will remove the oldest document (`{oldest_filename}`, uploaded on `{oldest_date}`). Continue?"
3. If user confirms, proceed. If not, cancel.

### Document List

- Add a "Documents" section in `OrbViewPage.tsx` (near the existing "Import data" area)
- Compact list of up to 3 documents: filename, upload date, entities count, edges count
- Each row has a download button
- Legacy records show "N/A" for entities/edges counts

### API Layer (`frontend/src/api/cv.ts`)

- Add `getDocuments()` → `GET /cv/documents`
- Update `confirmCV()` and `confirmImport()` to pass `document_id` and the original file
- Update `downloadCV()` to accept a `document_id` parameter
- Remove `storeFile()` — replaced by automatic storage during confirm

### Confirm Flow

- Upload/import responses include `document_id`
- Frontend passes `document_id` through to the confirm call
- Confirm endpoint handles eviction + storage internally

## Migration

### SQLite Migration

On `_get_conn()`:
1. Check if old `cv_uploads` table exists (via `sqlite_master`)
2. If yes: create `cv_documents`, copy rows with a generated UUID as `document_id` and `NULL` for entities/edges counts, then drop `cv_uploads`
3. If neither table exists: create `cv_documents` fresh

### File Storage Migration

- Existing files stored as `{user_id}.pdf.enc`
- During migration, rename to `{user_id}_{document_id}.pdf.enc` using the generated `document_id`
- If no matching file exists on disk, metadata still migrates; download returns 404

## Edge Cases

- **Upload without confirm:** `document_id` generated at upload time but metadata row and file only written at confirm. No orphan rows or files.
- **Concurrent uploads:** Cap checked at confirm time. Two concurrent uploads could both pass the pre-check, but at confirm the oldest gets evicted. Acceptable behavior.
- **Legacy NULL counts:** Frontend displays "N/A" instead of a number.
- **Account deletion:** GDPR deletion flow extended to wipe all document rows and files for the user.

## Testing

- Unit tests for `cv_documents` DB layer: insert, list, count, evict oldest, migration from old schema
- Unit tests for confirm endpoints with document tracking (both upload and import flows)
- Edge case tests: exactly 3 documents, 0 documents, concurrent confirm, legacy migration
