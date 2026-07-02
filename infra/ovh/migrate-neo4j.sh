#!/usr/bin/env bash
# Migrate the Neo4j graph from the GCE VM (docker container 'neo4j') to the OVH
# stack. Run from a machine with gcloud authenticated to project open-orbis and
# SSH access to the VPS (i.e. your Mac).
#
#   bash infra/ovh/migrate-neo4j.sh
#
# The offline dump reads the store files directly (no password needed). It
# briefly stops the source Neo4j container (a few seconds) for a consistent
# dump, then restarts it. Same neo4j:5-community image on both ends, so the
# store format matches.
set -euo pipefail

PROJECT=open-orbis
SOURCE_VM=orbis-neo4j
ZONE=europe-west1-b
VPS=orbis@51.75.121.189
OVH_VOLUME=ovh_neo4j_data
COMPOSE=/opt/orbis/orb_project/infra/ovh/docker-compose.prod.yml
ENVFILE=/opt/orbis/.env
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "--- 1/5 Offline dump on the source VM ($SOURCE_VM) ---"
gcloud compute ssh "$SOURCE_VM" --zone="$ZONE" --tunnel-through-iap --project="$PROJECT" --command='
  sudo rm -rf /tmp/neo4jdump && sudo mkdir -p /tmp/neo4jdump && sudo chmod 777 /tmp/neo4jdump
  sudo docker stop neo4j
  sudo docker run --rm --user root -v neo4j_data:/data -v /tmp/neo4jdump:/dump neo4j:5-community \
    neo4j-admin database dump neo4j --to-path=/dump
  DUMP_RC=$?
  sudo docker start neo4j          # always restart prod, even if the dump failed
  sudo chmod -R a+r /tmp/neo4jdump
  if [ $DUMP_RC -ne 0 ]; then echo "DUMP FAILED rc=$DUMP_RC"; exit $DUMP_RC; fi
  ls -l /tmp/neo4jdump
'

echo "--- 2/5 Copy dump: VM -> local ---"
gcloud compute scp --tunnel-through-iap --zone="$ZONE" --project="$PROJECT" \
  "$SOURCE_VM:/tmp/neo4jdump/neo4j.dump" "$WORK/neo4j.dump"
echo "local dump: $(du -h "$WORK/neo4j.dump" | cut -f1)"

echo "--- 3/5 Copy dump: local -> VPS ---"
scp -o BatchMode=yes "$WORK/neo4j.dump" "$VPS:/tmp/neo4j.dump"

echo "--- 4/5 Load into OVH Neo4j (offline, overwrite) ---"
ssh -o BatchMode=yes "$VPS" "
  set -e
  cd /opt/orbis/orb_project
  docker compose --env-file $ENVFILE -f $COMPOSE stop neo4j
  docker run --rm -v $OVH_VOLUME:/data -v /tmp:/dump neo4j:5-community \
    neo4j-admin database load neo4j --from-path=/dump --overwrite-destination=true
  docker compose --env-file $ENVFILE -f $COMPOSE start neo4j
  rm -f /tmp/neo4j.dump
"

echo "--- 5/5 Verify node count on OVH ---"
sleep 25
ssh -o BatchMode=yes "$VPS" '
  cd /opt/orbis/orb_project
  PW=$(grep "^NEO4J_PASSWORD=" /opt/orbis/.env | cut -d= -f2-)
  docker compose --env-file /opt/orbis/.env -f infra/ovh/docker-compose.prod.yml exec -T neo4j \
    cypher-shell -u neo4j -p "$PW" "MATCH (n) RETURN count(n) AS nodes;"
'
echo "Neo4j migration complete."
