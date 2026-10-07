#!/bin/bash
# Compose smoke: validate the file and boot Postgres only.
# Does not publish an iOS build and does not use production secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="$ROOT/infra/docker/docker-compose.yml"
ENV_FILE="$(mktemp)"
OVERRIDE="$(mktemp)"
cleanup() {
  docker compose -f "$COMPOSE" -f "$OVERRIDE" --env-file "$ENV_FILE" -p namat-ci-smoke down -v >/dev/null 2>&1 || true
  rm -f "$ENV_FILE" "$OVERRIDE"
}
trap cleanup EXIT

cat >"$ENV_FILE" <<'EOF'
POSTGRES_USER=namat
POSTGRES_PASSWORD=namat-ci-smoke
POSTGRES_DB=namat
JWT_SECRET=ci-smoke-jwt-secret-not-for-production-use
ADMIN_API_TOKEN=ci-smoke-admin
TYPEORM_SYNC=false
EOF

cat >"$OVERRIDE" <<'EOF'
networks:
  namat_internal:
    name: namat_ci_smoke_net
EOF

docker compose -f "$COMPOSE" -f "$OVERRIDE" --env-file "$ENV_FILE" -p namat-ci-smoke config >/dev/null
docker compose -f "$COMPOSE" -f "$OVERRIDE" --env-file "$ENV_FILE" -p namat-ci-smoke up -d postgres
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if docker compose -f "$COMPOSE" -f "$OVERRIDE" --env-file "$ENV_FILE" -p namat-ci-smoke exec -T postgres pg_isready -U namat -d namat; then
    echo "compose smoke: postgres ready"
    exit 0
  fi
  sleep 2
done
echo "compose smoke: postgres did not become ready" >&2
exit 1
