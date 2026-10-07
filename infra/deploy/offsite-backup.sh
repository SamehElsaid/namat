#!/usr/bin/env bash
# Provider-independent offsite backup hook.
# Runs the local NAMAT backup, then executes OFFSITE_BACKUP_COMMAND if set.
# A concrete cloud account is not bundled. Without the command this is not an offsite copy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/backup.sh"

if [[ -z "${OFFSITE_BACKUP_COMMAND:-}" ]]; then
  echo "[namat-offsite] NOT CONFIGURED: set OFFSITE_BACKUP_COMMAND to copy $NAMAT_BACKUP_DIR (default /opt/namat/backups)."
  echo "[namat-offsite] The hook exists. No offsite provider is implemented inside this script."
  exit 2
fi

echo "[namat-offsite] running operator command"
# The command is operator-supplied and must not print secret file contents.
bash -lc "$OFFSITE_BACKUP_COMMAND"
echo "[namat-offsite] command finished"
