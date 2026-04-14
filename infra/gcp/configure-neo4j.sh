#!/usr/bin/env bash
# Configure Neo4j on GCE VM: install Docker, start Neo4j, apply schema
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/variables.env"

NEO4J_PASS=$(gcloud secrets versions access latest --secret=neo4j-password --project="$PROJECT_ID")

echo "--- Installing Docker and starting Neo4j on $NEO4J_VM ---"
gcloud compute ssh "$NEO4J_VM" --zone="$ZONE" --tunnel-through-iap --command="
set -e
if ! command -v docker &>/dev/null; then
  echo 'Installing Docker...'
  curl -fsSL https://get.docker.com | sudo sh
fi
if ! sudo docker ps -q -f name=neo4j | grep -q .; then
  echo 'Starting Neo4j container...'
  sudo docker run -d \
    --name neo4j \
    --restart=always \
    -p 7687:7687 \
    -v neo4j_data:/data \
    -e NEO4J_AUTH=neo4j/${NEO4J_PASS} \
    neo4j:5-community
  echo 'Waiting for Neo4j to be ready...'
  sleep 10
fi
echo 'Neo4j status:'
sudo docker exec neo4j neo4j status
"

echo "--- Applying schema (init.cypher) ---"
gcloud compute scp "$SCRIPT_DIR/../../neo4j/init.cypher" \
  "$NEO4J_VM:/tmp/init.cypher" \
  --zone="$ZONE" --tunnel-through-iap

gcloud compute ssh "$NEO4J_VM" --zone="$ZONE" --tunnel-through-iap --command="
sudo docker cp /tmp/init.cypher neo4j:/tmp/init.cypher
sudo docker exec neo4j cypher-shell -u neo4j -p '${NEO4J_PASS}' --file /tmp/init.cypher
echo 'Schema applied successfully'
"

echo "--- Neo4j configured ---"
