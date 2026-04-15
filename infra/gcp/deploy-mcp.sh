#!/usr/bin/env bash
# Build and deploy Orbis MCP server to Cloud Run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/variables.env"
ROOT_DIR="$SCRIPT_DIR/../.."

TAG="${1:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
MCP_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/mcp:$TAG"

echo "=== Deploying MCP server — image: $MCP_IMAGE ==="

# Build using Dockerfile.mcp
echo "--- Building Docker image ---"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build -f "$ROOT_DIR/backend/Dockerfile.mcp" -t "$MCP_IMAGE" "$ROOT_DIR/backend/"
docker push "$MCP_IMAGE"

# Deploy
echo "--- Deploying to Cloud Run ---"
gcloud run deploy "$MCP_SERVICE" \
  --image="$MCP_IMAGE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --service-account="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --vpc-connector="$VPC_CONNECTOR" \
  --vpc-egress=private-ranges-only \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:$SQL_INSTANCE" \
  --memory=256Mi \
  --cpu=1 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=300s \
  --no-allow-unauthenticated \
  --set-secrets="JWT_SECRET=jwt-secret:latest,ENCRYPTION_KEY=encryption-key:latest,NEO4J_PASSWORD=neo4j-password:latest,DATABASE_URL=database-url:latest" \
  --set-env-vars="ENV=production,NEO4J_URI=bolt://$NEO4J_INTERNAL_IP:7687,NEO4J_USER=neo4j,GCP_PROJECT_ID=$PROJECT_ID"

echo ""
echo "=== MCP server deployed ==="
gcloud run services describe "$MCP_SERVICE" --region="$REGION" --format="value(status.url)"
