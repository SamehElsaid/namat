# Operations

Local backup is `infra/deploy/backup.sh`. Offsite copy is the executable hook `infra/deploy/offsite-backup.sh`: it runs the local backup, then `OFFSITE_BACKUP_COMMAND` when that variable is set. No cloud provider is bundled. If the command is empty the hook exits 2 and reports NOT CONFIGURED. Monitoring is `infra/deploy/monitor-check.sh`, which curls `/health` and `/ready` and writes a status file. A hosted uptime account is not bundled. Do not run `docker compose down -v`. Production verification of this remediation is separate from local test status.


## Services

| Unit | How managed |
|------|-------------|
| namat-api / web / admin / postgres | `docker compose` project `namat` under `/opt/namat` |
| Nginx vhosts | `/etc/nginx/sites-enabled/namat.shara.sa`, `admin.namat.shara.sa` |
| TLS | Certbot (`namat.shara.sa`, `admin.namat.shara.sa`); system renew timer |

## Common commands

```bash
cd /opt/namat
docker compose -f infra/docker/docker-compose.yml --env-file secrets/namat.env ps
docker compose -f infra/docker/docker-compose.yml --env-file secrets/namat.env logs -f --tail=200 api
docker compose -f infra/docker/docker-compose.yml --env-file secrets/namat.env restart api
```

## TYPEORM_SYNC → migrations (production)

**Evidence path used in activation:**

1. Schema already present (17 tables) from bootstrap sync.
2. Set `TYPEORM_SYNC=false` in `/opt/namat/secrets/namat.env`.
3. Redeploy/restart API so TypeORM runs `migrationsRun` with `1710000000000-InitialSchema` (`IF NOT EXISTS` → safe no-op / recorded).
4. Confirm `/ready` still `database: true` and app healthy.
5. Keep synchronize **off** thereafter.

```bash
grep TYPEORM_SYNC /opt/namat/secrets/namat.env
docker compose -f /opt/namat/infra/docker/docker-compose.yml --env-file /opt/namat/secrets/namat.env \
  exec -T postgres psql -U namat -d namat -c '\dt'
```

## Backups

Script: `infra/deploy/backup.sh`  
Output: `/opt/namat/backups/namat-pg-*.sql.gz`, `namat-uploads-*.tgz`, metadata `namat-backup-*.txt`  
Retention: **14 days** (env `NAMAT_BACKUP_RETENTION_DAYS`). Existing non-matching files are never deleted. Symlinks: `latest.sql.gz`, `latest-uploads.tgz`.

```bash
chmod +x /opt/namat/infra/deploy/backup.sh
/opt/namat/infra/deploy/backup.sh
ls -la /opt/namat/backups/
```

Cron (installed on host when activated):

```cron
15 2 * * * root /opt/namat/infra/deploy/backup.sh >> /var/log/namat-backup.log 2>&1
```

### Restore (Postgres)

```bash
# Stop API writers first
docker compose -f /opt/namat/infra/docker/docker-compose.yml --env-file /opt/namat/secrets/namat.env stop api
# Recreate empty DB only if intentional — prefer restore into existing DB carefully
gunzip -c /opt/namat/backups/latest.sql.gz | \
  docker compose -f /opt/namat/infra/docker/docker-compose.yml --env-file /opt/namat/secrets/namat.env \
  exec -T postgres psql -U namat -d namat
docker compose -f /opt/namat/infra/docker/docker-compose.yml --env-file /opt/namat/secrets/namat.env start api
```

### Restore (uploads)

```bash
VOL=$(docker volume ls -q | grep namat | grep uploads | head -1)
docker run --rm -v "$VOL:/data" -v /opt/namat/backups:/backup alpine:3.20 \
  sh -c 'rm -rf /data/*; tar xzf /backup/latest-uploads.tgz -C /data'
```

## SMTP / OTP

| Vars | `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` |
|------|----------------------------------------------------------------|
| Configured | OTP emailed; production logs **do not** include the code |
| Absent | Production deletes the unused challenge, logs missing `SMTP_*` names only, and returns `EmailDeliveryUnavailable` without a code |

Admin automation can use `ADMIN_API_TOKEN` until SMTP is live.

## Payments

New online customer checkout is **Moyasar Hosted Invoice** only (server-verified; see `docs/PAYMENTS.md`). Checkout stays unavailable until the owner configures Moyasar keys, webhook secret, and an `https://` origin, then enables it from the owner dashboard.

## NearPay (legacy only)

Historical terminal purchases stay on NearPay for refund/reversal. It is **not** used for new customer checkout. Empty `NEARPAY_API_KEY` keeps the legacy provider in mock mode (not real money). Do not convert pending NearPay rows to Moyasar.

## Remote config / kill switch

```bash
curl -X POST https://namat.shara.sa/api/v1/admin/remote-config \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"killSwitchApply":true}'
```

## Publishing skins

Admin Designs → publish → `GET /api/v1/skins/manifest` (no IPA rebuild).

## Logs

Compose json-file rotation. Never log Wallet local keys, PAN, pairing material, or production OTP codes.

## Incidents

1. Flip Apply kill switch.
2. Check `/health` `/ready`.
3. Inspect compose logs.
4. Rollback per `infra/deploy/ROLLBACK.md`.
5. Confirm siblings (`basira`, `ard`, `sanad`) unaffected.
