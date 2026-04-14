#!/usr/bin/env bash
# Build and deploy Orbis frontend to Firebase Hosting
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/variables.env"
ROOT_DIR="$SCRIPT_DIR/../.."

echo "=== Deploying frontend to Firebase Hosting ==="

# Build
echo "--- Building frontend ---"
cd "$ROOT_DIR/frontend"
npm ci
npm run build

# Deploy
echo "--- Deploying to Firebase ---"
cd "$ROOT_DIR"
firebase deploy --only hosting --project="$PROJECT_ID"

echo ""
echo "=== Frontend deployed ==="
