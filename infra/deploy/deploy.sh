#!/usr/bin/env bash
# Deploy NAMAT to the shared production host without touching sibling stacks.
# Usage (on server): /opt/namat/infra/deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OPT_ROOT="${NAMAT_OPT_ROOT:-/opt/namat}"
COMPOSE_FILE="$OPT_ROOT/infra/docker/docker-compose.yml"
ENV_FILE="$OPT_ROOT/secrets/namat.env"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAP="/root/namat-rollback-snapshots/$STAMP"

echo "[namat] deploy root=$OPT_ROOT stamp=$STAMP"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from infra/deploy/namat.env.example and fill values." >&2
  exit 1
fi

mkdir -p "$SNAP/nginx"
cp -a /etc/nginx/sites-enabled "$SNAP/nginx/" 2>/dev/null || true
docker ps --format '{{.Names}}\t{{.Status}}' > "$SNAP/docker-ps-before.txt" || true
echo "[namat] snapshot $SNAP"

cd "$OPT_ROOT"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "[namat] waiting for health..."
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3302/health >/dev/null \
    && curl -fsS http://127.0.0.1:3300/ >/dev/null \
    && curl -fsS -o /dev/null -w '' http://127.0.0.1:3301/login; then
    echo "[namat] healthy"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    exit 0
  fi
  sleep 3
done

echo "[namat] health check timed out" >&2
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=80 api web admin || true
exit 1
