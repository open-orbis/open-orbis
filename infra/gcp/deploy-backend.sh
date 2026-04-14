#!/usr/bin/env bash
# Build and deploy Orbis backend to Cloud Run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/variables.env"
ROOT_DIR="$SCRIPT_DIR/../.."

TAG="${1:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/api:$TAG"

echo "=== Deploying backend — image: $IMAGE ==="

# Build
echo "--- Building Docker image ---"
gcloud builds submit "$ROOT_DIR/backend/" \
  --tag "$IMAGE" --project="$PROJECT_ID"

# Deploy
echo "--- Deploying to Cloud Run ---"
gcloud run deploy "$BACKEND_SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --service-account="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --vpc-connector="$VPC_CONNECTOR" \
  --vpc-egress=private-ranges-only \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:$SQL_INSTANCE" \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300s \
  --allow-unauthenticated \
  --set-secrets="JWT_SECRET=jwt-secret:latest,ENCRYPTION_KEY=encryption-key:latest,NEO4J_PASSWORD=neo4j-password:latest,DATABASE_URL=database-url:latest,RESEND_API_KEY=resend-api-key:latest,GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,LINKEDIN_CLIENT_ID=linkedin-client-id:latest,LINKEDIN_CLIENT_SECRET=linkedin-client-secret:latest" \
  --set-env-vars="ENV=production,NEO4J_URI=bolt://$NEO4J_INTERNAL_IP:7687,NEO4J_USER=neo4j,LLM_PROVIDER=vertex,LLM_FALLBACK_CHAIN=$FALLBACK_CHAIN,CLAUDE_MODEL=claude-opus-4-6,GEMINI_MODEL=gemini-2.5-pro,GCP_PROJECT_ID=$PROJECT_ID,VERTEX_REGION=$REGION,CV_STORAGE_BUCKET=$GCS_BUCKET,FRONTEND_URL=https://open-orbis.web.app,COOKIE_DOMAIN=.open-orbis.web.app"

echo ""
echo "=== Backend deployed ==="
gcloud run services describe "$BACKEND_SERVICE" --region="$REGION" --format="value(status.url)"
