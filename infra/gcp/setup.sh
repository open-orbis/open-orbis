#!/usr/bin/env bash
# Orbis GCP Infrastructure Setup
# Idempotent — safe to re-run. Skips resources that already exist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/variables.env"

echo "=== Orbis GCP Setup — Project: $PROJECT_ID, Region: $REGION ==="

# 1. Set project
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"
gcloud config set compute/zone "$ZONE"

# 2. Enable APIs
echo "--- Enabling APIs ---"
gcloud services enable \
  run.googleapis.com \
  compute.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  cloudscheduler.googleapis.com \
  aiplatform.googleapis.com \
  firebase.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  servicenetworking.googleapis.com

# 3. Service Account + IAM
echo "--- Service Account ---"
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" &>/dev/null; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT" \
    --display-name="Orbis API Service Account"
fi

for role in roles/aiplatform.user roles/storage.objectAdmin roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role" --quiet >/dev/null
done
echo "Service account configured with 4 roles"

# 4. VPC Subnet (/28 for connector)
echo "--- VPC Subnet ---"
if ! gcloud compute networks subnets describe "$CONNECTOR_SUBNET" --region="$REGION" &>/dev/null; then
  gcloud compute networks subnets create "$CONNECTOR_SUBNET" \
    --network=default --region="$REGION" --range=10.8.0.0/28
fi

# 5. VPC Access Connector
echo "--- VPC Connector ---"
if ! gcloud compute networks vpc-access connectors describe "$VPC_CONNECTOR" --region="$REGION" &>/dev/null 2>&1; then
  gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
    --region="$REGION" --subnet="$CONNECTOR_SUBNET" \
    --min-instances=2 --max-instances=3 --machine-type=e2-micro
fi

# 6. Cloud NAT (for VM without public IP)
echo "--- Cloud NAT ---"
if ! gcloud compute routers describe orbis-router --region="$REGION" &>/dev/null; then
  gcloud compute routers create orbis-router --network=default --region="$REGION"
  gcloud compute routers nats create orbis-nat \
    --router=orbis-router --region="$REGION" \
    --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges
fi

# 7. Neo4j VM
echo "--- Neo4j VM ---"
if ! gcloud compute instances describe "$NEO4J_VM" --zone="$ZONE" &>/dev/null; then
  gcloud compute instances create "$NEO4J_VM" \
    --zone="$ZONE" --machine-type="$NEO4J_MACHINE_TYPE" \
    --boot-disk-size=50GB --boot-disk-type=pd-ssd \
    --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
    --no-address --tags=neo4j --network=default --subnet=default
  echo "VM created. Run configure-neo4j.sh after VM is ready."
fi

# 8. Firewall
echo "--- Firewall ---"
if ! gcloud compute firewall-rules describe allow-bolt-from-connector &>/dev/null; then
  gcloud compute firewall-rules create allow-bolt-from-connector \
    --network=default --allow=tcp:7687 \
    --source-ranges=10.8.0.0/28 --target-tags=neo4j
fi

# 9. Service Networking (for Cloud SQL private IP)
echo "--- Service Networking ---"
if ! gcloud compute addresses describe google-managed-services-default --global &>/dev/null 2>&1; then
  gcloud compute addresses create google-managed-services-default \
    --global --purpose=VPC_PEERING --prefix-length=16 --network=default
  gcloud services vpc-peerings connect \
    --service=servicenetworking.googleapis.com \
    --ranges=google-managed-services-default --network=default
fi

# 10. Cloud SQL
echo "--- Cloud SQL ---"
if ! gcloud sql instances describe "$SQL_INSTANCE" &>/dev/null 2>&1; then
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_15 --tier="$SQL_TIER" \
    --region="$REGION" --storage-size=10GB --storage-auto-increase \
    --backup-start-time=04:00 --availability-type=zonal \
    --no-assign-ip --network=default
  DB_PASS=$(openssl rand -base64 24)
  gcloud sql users create orbis --instance="$SQL_INSTANCE" --password="$DB_PASS"
  gcloud sql databases create orbis --instance="$SQL_INSTANCE"
  DATABASE_URL="postgresql://orbis:${DB_PASS}@/orbis?host=/cloudsql/${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
  echo -n "$DATABASE_URL" | gcloud secrets create database-url --data-file=- 2>/dev/null || true
fi

# 11. GCS Bucket
echo "--- GCS Bucket ---"
if ! gcloud storage buckets describe "gs://$GCS_BUCKET" &>/dev/null 2>&1; then
  gcloud storage buckets create "gs://$GCS_BUCKET" \
    --location="$REGION" --uniform-bucket-level-access --public-access-prevention
fi

# 12. Artifact Registry
echo "--- Artifact Registry ---"
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" &>/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker --location="$REGION"
fi

# 13. Secret Manager (generate if not exist)
echo "--- Secrets ---"
for secret in jwt-secret encryption-key neo4j-password; do
  if ! gcloud secrets describe "$secret" &>/dev/null 2>&1; then
    if [ "$secret" = "encryption-key" ]; then
      python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode(), end='')" | \
        gcloud secrets create "$secret" --data-file=-
    else
      openssl rand -base64 32 | tr -d '\n' | gcloud secrets create "$secret" --data-file=-
    fi
  fi
done
for secret in resend-api-key google-client-id google-client-secret linkedin-client-id linkedin-client-secret; do
  if ! gcloud secrets describe "$secret" &>/dev/null 2>&1; then
    echo -n "placeholder" | gcloud secrets create "$secret" --data-file=-
  fi
done

echo ""
echo "=== Setup complete ==="
echo ""
echo "Remaining manual steps:"
echo "  1. Configure Neo4j: bash $SCRIPT_DIR/configure-neo4j.sh"
echo "  2. Enable Claude Opus on Vertex AI Model Garden (accept Anthropic ToS)"
echo "  3. Request Claude quota increase for europe-west1"
echo "  4. Firebase: firebase login && firebase use $PROJECT_ID"
