# NAMAT Rollback

Production host: `152.239.112.213` (`srv1700310.hstgr.cloud`)  
Principle: restore NAMAT-related changes only. **Never** recreate or restart sibling stacks unless recovering from an accidental shared-config edit.

---

## 1. Pre-change snapshots

Before any Nginx/DNS/compose mutation, create a timestamped snapshot:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SNAP=/root/namat-rollback-snapshots/$STAMP
mkdir -p "$SNAP/nginx" "$SNAP/letsencrypt-list"
cp -a /etc/nginx/sites-enabled "$SNAP/nginx/"
cp -a /etc/nginx/sites-available "$SNAP/nginx/" 2>/dev/null || true
cp -a /etc/nginx/nginx.conf "$SNAP/nginx/"
nginx -T > "$SNAP/nginx-full-dump.conf" 2>/dev/null || true
ls /etc/letsencrypt/live > "$SNAP/letsencrypt-list/live.txt"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}' > "$SNAP/docker-ps.txt"
systemctl list-units --type=service --state=running --no-pager > "$SNAP/systemd-running.txt"
ss -tulpn > "$SNAP/listeners.txt"
echo "$SNAP"
```

### Known baseline snapshot (2026-10-02 audit)

```text
/root/namat-rollback-snapshots/20261002T192743Z/
```

---

## 2. Rollback NAMAT Docker stack

```bash
cd /opt/namat
docker compose --env-file secrets/namat.env ps
# Stop only the namat project
docker compose --env-file secrets/namat.env down
# Optional: restore previous image tags if recorded in deploy log
# docker compose --env-file secrets/namat.env up -d
```

Data volumes (Postgres / uploads) are **not** deleted by `down` unless `-v` is used. **Never** run `docker compose down -v` in production without an explicit backup restore plan.

### Database restore (NAMAT volumes only)

```bash
# Example restore from pg_dump taken by namat backup script
docker compose --env-file secrets/namat.env exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /opt/namat/backups/latest.sql
```

---

## 3. Rollback Nginx vhost

If a NAMAT site was added/changed:

```bash
# Disable namat sites
rm -f /etc/nginx/sites-enabled/namat.shara.sa
rm -f /etc/nginx/sites-enabled/admin.namat.shara.sa
# Restore from snapshot if shared nginx.conf was edited (should not be)
# cp /root/namat-rollback-snapshots/<STAMP>/nginx/nginx.conf /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
```

Verify sibling vhosts still respond:

```bash
curl -sI https://basira.shara.sa/ | head -5
curl -sI https://ard.shara.sa/ | head -5
curl -sI https://sanad.shara.sa/ | head -5
```

---

## 4. Rollback TLS

Certbot certs for namat can be left in place (harmless) or revoked only if mis-issued:

```bash
# Prefer leaving certificates; removing is optional and irreversible without re-issue
# certbot delete --cert-name namat.shara.sa
# certbot delete --cert-name admin.namat.shara.sa
```

Do **not** delete certificates belonging to other products.

### Activation snapshots (2026-10-02)

Pre-TLS nginx copy example:

```text
/root/namat-rollback-snapshots/20261002T224557Z-pre-tls/
```

Issued live certs:

- `/etc/letsencrypt/live/namat.shara.sa/`
- `/etc/letsencrypt/live/admin.namat.shara.sa/`

Renew dry-run succeeded after intermittent authoritative NS SERVFAIL on admin CAA.

---

## 5. Rollback DNS

DNS is owned outside this server. If A/AAAA records for `namat.shara.sa` / `admin.namat.shara.sa` were added incorrectly:

1. Remove or revert those records at the DNS provider.
2. Leave server origin intact until DNS is corrected.

Exact required records are documented in `docs/DEPLOYMENT.md` and `docs/FINAL_HANDOFF.md`.

---

## 6. Emergency “NAMAT off, host healthy”

```bash
cd /opt/namat && docker compose --env-file secrets/namat.env down || true
rm -f /etc/nginx/sites-enabled/namat.shara.sa /etc/nginx/sites-enabled/admin.namat.shara.sa
nginx -t && systemctl reload nginx
docker ps   # confirm basira/ard/sanad/takamul still Up
```

---

## 7. What must never be rolled back via NAMAT procedures

- `/opt/basira`, `/opt/ard`, `/opt/sanad`, `/opt/takamul*`, `/var/www/quran.shara.sa`
- Their Docker networks, volumes, or systemd units
- Shared UFW rules beyond NAMAT-specific additions (NAMAT should not need new public ports)

---

## 8. Owners

| Area | Action owner |
|------|----------------|
| Server compose / nginx | Operator with root SSH |
| DNS (`shara.sa` zone) | Domain owner (credentials not on agent) |
| NearPay / AI production keys | Product owner |
| Apple signing / iPhone device tests | Product owner + macOS build host |
