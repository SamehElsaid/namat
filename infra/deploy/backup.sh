#!/usr/bin/env bash
# NAMAT backup — Postgres dump + uploads tarball. Does not delete existing backups.
# Cron example: 15 2 * * * root /opt/namat/infra/deploy/backup.sh >> /var/log/namat-backup.log 2>&1
set -euo pipefail

OPT_ROOT="${NAMAT_OPT_ROOT:-/opt/namat}"
COMPOSE_FILE="$OPT_ROOT/infra/docker/docker-compose.yml"
ENV_FILE="$OPT_ROOT/secrets/namat.env"
BACKUP_DIR="${NAMAT_BACKUP_DIR:-$OPT_ROOT/backups}"
RETENTION_DAYS="${NAMAT_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%F)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# shellcheck disable=SC1090
set -a
# Export only needed names without sourcing secrets into world-readable logs
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | head -1 | cut -d= -f2-)
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | head -1 | cut -d= -f2-)
set +a
POSTGRES_USER="${POSTGRES_USER:-namat}"
POSTGRES_DB="${POSTGRES_DB:-namat}"

DUMP="$BACKUP_DIR/namat-pg-${DAY}-${STAMP}.sql.gz"
UPLOADS="$BACKUP_DIR/namat-uploads-${DAY}-${STAMP}.tgz"
META="$BACKUP_DIR/namat-backup-${DAY}-${STAMP}.txt"

echo "[namat-backup] starting $STAMP"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
  | gzip -c > "$DUMP"

# Volume name follows compose project "namat" + volume key "namat_uploads"
UPLOAD_VOL=$(docker volume ls -q | grep -E '^namat(_|-)namat_uploads$' | head -1 || true)
if [[ -z "$UPLOAD_VOL" ]]; then
  UPLOAD_VOL=$(docker volume ls -q | grep uploads | grep namat | head -1 || true)
fi
if [[ -n "$UPLOAD_VOL" ]]; then
  docker run --rm -v "$UPLOAD_VOL:/data:ro" -v "$BACKUP_DIR:/out" alpine:3.20 \
    tar czf "/out/$(basename "$UPLOADS")" -C /data .
else
  echo "[namat-backup] WARN: uploads volume not found — writing empty marker"
  tar czf "$UPLOADS" -T /dev/null
fi

{
  echo "stamp=$STAMP"
  echo "day=$DAY"
  echo "dump=$(basename "$DUMP")"
  echo "uploads=$(basename "$UPLOADS")"
  echo "dump_bytes=$(wc -c < "$DUMP")"
  echo "uploads_bytes=$(wc -c < "$UPLOADS")"
  echo "git_sha=$(cat "$OPT_ROOT/DEPLOYED_GIT_SHA" 2>/dev/null || echo unknown)"
  echo "hostname=$(hostname)"
} > "$META"

chmod 600 "$DUMP" "$UPLOADS" "$META" 2>/dev/null || true

# Retention: remove NAMAT backup artifacts older than RETENTION_DAYS only
find "$BACKUP_DIR" -maxdepth 1 -type f \( \
  -name 'namat-pg-*.sql.gz' -o \
  -name 'namat-uploads-*.tgz' -o \
  -name 'namat-backup-*.txt' \
\) -mtime +"$RETENTION_DAYS" -print -delete || true

ln -sfn "$(basename "$DUMP")" "$BACKUP_DIR/latest.sql.gz"
ln -sfn "$(basename "$UPLOADS")" "$BACKUP_DIR/latest-uploads.tgz"
ln -sfn "$(basename "$META")" "$BACKUP_DIR/latest.txt"

echo "[namat-backup] ok dump=$DUMP uploads=$UPLOADS retention=${RETENTION_DAYS}d"
