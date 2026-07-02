#!/usr/bin/env bash
# Migrate the PostgreSQL data from Cloud SQL (orbis-db) to the OVH Postgres
# container. Run from your Mac (gcloud authenticated to open-orbis + SSH to VPS).
#
#   bash infra/ovh/migrate-postgres.sh
#
# Uses `gcloud sql export sql` (no DB password needed — the Cloud SQL service
# agent writes a plain SQL dump to GCS), downloads it, wipes the target schema,
# and loads it into ovh-postgres-1. Both sides are PostgreSQL 15 and the DB user
# is `orbis` on both, so ownership lines apply cleanly.
set -euo pipefail

PROJECT=open-orbis
INSTANCE=orbis-db
BUCKET=gs://orbis-cv-files
OBJ="$BUCKET/pgdump/orbis.sql"
VPS=orbis@51.75.121.189
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "--- 1/6 Grant the Cloud SQL service agent write on the bucket (idempotent) ---"
SQL_SA=$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT" \
  --format='value(serviceAccountEmailAddress)')
gcloud storage buckets add-iam-policy-binding "$BUCKET" \
  --member="serviceAccount:$SQL_SA" --role=roles/storage.objectAdmin >/dev/null
echo "granted to $SQL_SA"

echo "--- 2/6 Export the orbis database -> GCS ---"
gcloud sql export sql "$INSTANCE" "$OBJ" --database=orbis --project="$PROJECT"

echo "--- 3/6 Download the dump -> local ---"
gcloud storage cp "$OBJ" "$WORK/orbis.sql"
echo "dump size: $(du -h "$WORK/orbis.sql" | cut -f1)"

echo "--- 4/6 Copy the dump -> VPS ---"
scp -o BatchMode=yes "$WORK/orbis.sql" "$VPS:/tmp/orbis.sql"

echo "--- 5/6 Wipe target schema and load ---"
ssh -o BatchMode=yes "$VPS" "
  set -e
  docker exec -i ovh-postgres-1 psql -U orbis -d orbis \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  docker exec -i ovh-postgres-1 psql -U orbis -d orbis < /tmp/orbis.sql >/tmp/pgload.log 2>&1 || true
  echo 'load errors (should be empty / only benign):'
  grep -iE 'error|fatal' /tmp/pgload.log | head -20 || true
  rm -f /tmp/orbis.sql
"

echo "--- 6/6 Verify row counts on OVH ---"
ssh -o BatchMode=yes "$VPS" 'docker exec -i ovh-postgres-1 psql -U orbis -d orbis' <<'SQL'
SELECT 'drafts' AS table, count(*) FROM drafts
UNION ALL SELECT 'ideas', count(*) FROM ideas
UNION ALL SELECT 'orb_snapshots', count(*) FROM orb_snapshots
UNION ALL SELECT 'cv_documents', count(*) FROM cv_documents
UNION ALL SELECT 'cv_jobs', count(*) FROM cv_jobs;
SQL
echo "Postgres migration complete."
