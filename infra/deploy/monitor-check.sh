#!/usr/bin/env bash
# Local health probe for NAMAT. This is the monitoring check; it is not a hosted monitor.
# Point cron or an external uptime checker at this script. Exit 0 means API health and ready passed.
set -euo pipefail

API_URL="${NAMAT_MONITOR_URL:-http://127.0.0.1:3302}"
STATUS_FILE="${NAMAT_MONITOR_STATUS_FILE:-/var/log/namat-monitor.status}"

health="$(curl -fsS "$API_URL/health")"
ready="$(curl -fsS "$API_URL/ready")"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "stamp=$stamp"
  echo "health=$health"
  echo "ready=$ready"
} > "$STATUS_FILE"
echo "[namat-monitor] ok $stamp"
