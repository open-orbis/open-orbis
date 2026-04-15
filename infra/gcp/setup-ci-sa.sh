#!/usr/bin/env bash
# Create a GCP service account for GitHub Actions CI/CD deploy
# Run this once, then add the generated JSON key as GitHub Secret GCP_SA_KEY
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/variables.env"

SA_NAME="github-deploy"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "=== Creating service account: $SA_EMAIL ==="
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions Deploy" \
  --project="$PROJECT_ID" 2>/dev/null || echo "Service account already exists"

echo "--- Granting roles ---"
ROLES=(
  "roles/run.admin"
  "roles/cloudbuild.builds.editor"
  "roles/storage.admin"
  "roles/iam.serviceAccountUser"
  "roles/secretmanager.secretAccessor"
  "roles/firebasehosting.admin"
)

for role in "${ROLES[@]}"; do
  echo "  $role"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --quiet
done

echo ""
echo "--- Generating JSON key ---"
KEY_FILE="$SCRIPT_DIR/.github-deploy-sa-key.json"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  1. Copy the key to your clipboard:"
echo "     cat $KEY_FILE | pbcopy"
echo ""
echo "  2. Go to: https://github.com/<your-org>/orb_project/settings/secrets/actions"
echo "     Create secret: GCP_SA_KEY"
echo "     Paste the JSON key as value"
echo ""
echo "  3. DELETE the local key file (don't commit it!):"
echo "     rm $KEY_FILE"
