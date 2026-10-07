# Deployment

Deploy only by updating `/opt/namat` from the reviewed commit, running additive migrations, and preserving volumes and backups. This remediation is not PRODUCTION VERIFIED until `DEPLOYED_GIT_SHA` matches that commit.


Production host: `152.239.112.213` (`srv1700310.hstgr.cloud`)  
Domain: `namat.shara.sa` / `admin.namat.shara.sa`  
Convention: Docker Compose under `/opt/namat`, localhost upstreams, Nginx + Certbot.

See also: `docs/audit/SERVER_LIVE_AUDIT.md`, `infra/deploy/ROLLBACK.md`, `docs/FINAL_HANDOFF.md`.

## Ports

| Service | Bind |
|---------|------|
| web | `127.0.0.1:3300` |
| admin | `127.0.0.1:3301` |
| api | `127.0.0.1:3302` |
| postgres | internal Docker network only |

## DNS records (owner / zone `shara.sa`)

| Type | Name | Value | Notes |
|------|------|-------|-------|
| A | `namat` | `152.239.112.213` | **Required** — verified 2026-10-02 via 8.8.8.8 / 1.1.1.1 |
| A | `admin.namat` | `152.239.112.213` | **Required** — verified same |
| AAAA | — | — | **Do not add** until IPv6 listener/policy is intentional. Activation used A-only. |

Authoritative NS (`pns01.t2.sa` / `pns02.t2.sa`) showed intermittent timeouts/SERVFAIL to some resolvers during Certbot; public recursive resolvers still served correct A. Prefer fixing NS reliability before relying on future renewals under load.

## Server sync + deploy

```bash
# From a machine with deploy key
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude uploads \
  --exclude secrets --exclude backups \
  ./ root@152.239.112.213:/opt/namat/

ssh root@152.239.112.213 '
  git -C /opt/namat rev-parse HEAD 2>/dev/null || true
  printf "%s\n" "$(cat /opt/namat/DEPLOYED_GIT_SHA 2>/dev/null)" 
  # Prefer writing full SHA of the synced tree:
  # echo <full-sha> > /opt/namat/DEPLOYED_GIT_SHA
  chmod +x /opt/namat/infra/deploy/deploy.sh /opt/namat/infra/deploy/backup.sh
  /opt/namat/infra/deploy/deploy.sh
'
```

Never restart Basira/ARD/Sanad/Takamul/Quran as part of NAMAT deploys.

## Nginx + TLS

HTTP bootstrap configs live in `infra/nginx/*.http.conf`. After DNS A is correct:

```bash
# Sites already enabled on host; Certbot manages SSL + redirects:
certbot --nginx -d namat.shara.sa
certbot --nginx -d admin.namat.shara.sa
certbot renew --dry-run
```

**Evidence 2026-10-02:** certificates issued under `/etc/letsencrypt/live/namat.shara.sa/` and `admin.namat.shara.sa/`; HTTP 301→HTTPS; `certbot renew --dry-run` succeeded (admin after retry).

## Health checks

```bash
curl -fsS http://127.0.0.1:3302/health
curl -fsS http://127.0.0.1:3302/ready
curl -fsS https://namat.shara.sa/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://namat.shara.sa/
curl -fsS -o /dev/null -w '%{http_code}\n' https://admin.namat.shara.sa/login
```

## Schema / TYPEORM_SYNC

1. First boot may use `TYPEORM_SYNC=true` to establish tables.
2. `InitialSchema` migration is idempotent (`CREATE IF NOT EXISTS`).
3. With `TYPEORM_SYNC=false`, API sets `migrationsRun: true` and applies pending migrations on boot.
4. Production secrets must keep **`TYPEORM_SYNC=false`**. Compose now defaults to false and applies additive migrations on boot.

`1710000008000-MoyasarOwnerControl` adds nullable purchase and entitlement columns, audit columns with defaults, and the payment and support tables. Historical NearPay rows are not rewritten. An older application image can run against that schema because the new columns are nullable or defaulted and the old image does not select them.

Migration `down` drops `payment_settings`, `payment_credentials`, and `support_notes`, and the later evidence migration drops IPA verification columns. That deletes data. It is not the routine rollback. Roll back by deploying the previous image and leaving the migrated schema in place. Older images do not enforce the publication gate; deploy the new image before relying on it.

Customer IPA publication on the Linux production host stays blocked unless macOS `codesign` verification succeeds on that host or a macOS/CI attestation is signed for the IPA SHA-256. There is no owner checkbox that marks a release verified. See `services/api/scripts/attest-customer-ipa.sh`.

## Backups

```bash
/opt/namat/infra/deploy/backup.sh
# cron: /etc/cron.d/namat-backup
```

## Seed

Prefer `pnpm --filter @namat/api seed` in a one-off container/exec when needed. Do not enable synchronize in steady-state prod.
