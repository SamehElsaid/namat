# Server Live Audit — NAMAT

**Date:** 2026-10-02 (UTC)  
**Host:** `152.239.112.213` (`srv1700310.hstgr.cloud`)  
**Access:** `ssh root@152.239.112.213` (Ed25519 key; agent secret name `STAGING_SSH_PRIVATE_KEY`)  
**Operator:** Cursor Cloud Agent  
**Mutations during audit:** none (read-only + rollback snapshot under `/root/namat-rollback-snapshots/`)

---

## 1. Host summary

| Resource | Value |
|----------|-------|
| OS | Ubuntu 24.04.4 LTS (Noble), kernel `6.8.0-117-generic` |
| CPU | 4 vCPU |
| RAM | 15 GiB (≈4.6 GiB used / ≈11 GiB available at audit) |
| Disk | 193G root (`/dev/sda1`), ≈96G free (51% used) |
| Swap | None |
| Public IPv4 | `152.239.112.213/24` |
| Public IPv6 | `2a02:4780:79:fe::1/48` |
| Provider hint | Hostinger (`hstgr.cloud`) |

---

## 2. Tooling

| Tool | Version / status |
|------|------------------|
| Docker | 29.5.2 |
| Docker Compose | v5.1.4 |
| Node | v22.23.1 |
| npm | 10.9.8 |
| pnpm | **missing** (install for NAMAT deploy scripts if needed) |
| Nginx | 1.24.0 (Ubuntu) |
| Caddy / Apache | absent |
| PostgreSQL (host) | 18.4 (`postgresql@18-main`, listening `127.0.0.1:5432`) |
| Redis (host) | absent (Redis runs inside Docker for some apps) |
| Certbot / Let’s Encrypt | present (`/etc/letsencrypt/live/…`) |
| UFW | active — allow 22, 80, 443 only |

---

## 3. Existing production workloads (DO NOT DISTURB)

Shared-host multi-tenant VPS. All app upstreams bind **localhost** and front via Nginx + Let’s Encrypt.

| Product | Evidence | Local upstreams |
|---------|----------|-----------------|
| **Basira** | `/opt/basira`, `basira.shara.sa` | `127.0.0.1:3100` web, `:4000` api; private Postgres/Redis containers |
| **ARD** | `/opt/ard`, `ard.shara.sa` | `127.0.0.1:3200` |
| **Sanad** | `/opt/sanad`, nginx `sanad` | `127.0.0.1:3000` frontend, `:8000` backend; Postgres `:55432`, Redis `:56379` |
| **Takamul prod** | `/opt/takamul`, systemd `takamul.service`, `takamlerp.com` | Node on `:5000` |
| **Takamul staging** | `/opt/takamul-staging`, systemd `takamul-staging.service`, `staging.takamlerp.com` | Node on `:5001` |
| **Quran** | `/var/www/quran.shara.sa`, `quran.shara.sa` | static/deploy user `quran-deploy` |
| **Erth** | nginx `erth.shara.sa` | (vhost present; inventory via nginx dump) |

Docker containers observed healthy (2–3 months uptime): `basira-*`, `ard-*`, `sanad-*`.

Cron backups exist for Basira (`/etc/cron.d/basira-backup`) and ARD (`/opt/ard/scripts/backup.sh` at 03:15).

**Security scanner:** `monarx-agent` running.

---

## 4. Listening ports (public vs local)

| Port | Bind | Role |
|------|------|------|
| 22 | `0.0.0.0` | SSH |
| 80 / 443 | `0.0.0.0` | Nginx |
| 3000 | `127.0.0.1` | sanad-frontend |
| 3100 | `127.0.0.1` | basira-web |
| 3200 | `127.0.0.1` | ard-app |
| 4000 | `127.0.0.1` | basira-api |
| 5000 | `0.0.0.0` | takamul prod (proxied) |
| 5001 | `0.0.0.0` | takamul staging (proxied) |
| 5432 | `127.0.0.1` | host PostgreSQL 18 |
| 55432 / 56379 | `127.0.0.1` | sanad postgres/redis |
| 8000 | `127.0.0.1` | sanad-backend |

### Ports reserved for NAMAT (confirmed free at audit)

| Port | Planned use |
|------|-------------|
| `127.0.0.1:3300` | namat-web |
| `127.0.0.1:3301` | namat-admin |
| `127.0.0.1:3302` | namat-api |

Postgres/Redis for NAMAT will live on the Docker internal network only (no host port publish), matching Basira hardening.

---

## 5. TLS inventory (existing)

Certificates under `/etc/letsencrypt/live/`:

- `ard.shara.sa`
- `basira.shara.sa`
- `erth.shara.sa`
- `quran.shara.sa`
- `sanad.shara.sa`
- `takamlerp.com`
- `staging.takamlerp.com`

**No** `namat.shara.sa` certificate yet (domain does not resolve).

---

## 6. DNS

| Name | Status |
|------|--------|
| `namat.shara.sa` | **NXDOMAIN** (does not resolve) |
| `api.namat.shara.sa` | does not resolve |
| `admin.namat.shara.sa` | does not resolve |
| `shara.sa` | resolves (unrelated apex) |

DNS provider credentials are **not** available in this agent environment. Required records are listed in `docs/FINAL_HANDOFF.md` / `docs/DEPLOYMENT.md`.

---

## 7. Deployment convention (observed)

Sibling products use:

1. Project under `/opt/<name>/`
2. `docker compose` with **project-local network**, secrets via `/opt/<name>/secrets/*.env` (`chmod 600`)
3. App ports bound to `127.0.0.1` only
4. Nginx site in `/etc/nginx/sites-available` → `sites-enabled`
5. Certbot for TLS after DNS points here
6. Health endpoints proxied (`/health`, `/ready` pattern on Basira)

**NAMAT will follow the same pattern** to avoid colliding with existing stacks.

---

## 8. Risks

1. **Shared host** — resource contention (RAM/disk); NAMAT compose must set `mem_limit` and log rotation.
2. **No swap** — OOM risk if all stacks spike; keep NAMAT lean.
3. **Disk 51%** — monitor before large image builds; prune unused Docker layers carefully (do not prune images owned by other projects without checking).
4. **DNS missing** — origin can be prepared, but public HTTPS for namat cannot complete until A/AAAA records exist.
5. **Host Postgres 18** — prefer isolated Docker Postgres for NAMAT (do not create DBs on shared host cluster without explicit owner approval).
6. **Takamul binds `0.0.0.0:5000/5001`** — historical; NAMAT must not copy that pattern.

---

## 9. Rollback snapshot taken

```text
/root/namat-rollback-snapshots/20261002T192743Z/
  nginx/sites-enabled/
  nginx/sites-available/
  nginx/nginx.conf
  nginx-full-dump.conf
  docker-ps.txt
  systemd-running.txt
  listeners.txt
  letsencrypt-list/live.txt
```

See `infra/deploy/ROLLBACK.md` for restore procedures.

---

## 10. Recommended NAMAT deploy shape

```text
/opt/namat/
  docker-compose.yml
  secrets/namat.env          # chmod 600, not in git
  data/uploads/              # skin assets if local object store
nginx: namat.shara.sa (+ optional admin.namat.shara.sa)
upstreams: 127.0.0.1:3300 / 3301 / 3302
```

Same-origin preferred initially:

- `https://namat.shara.sa/` → web
- `https://namat.shara.sa/api/` → api
- `https://admin.namat.shara.sa/` → admin (auth-gated)

---

## 11. Audit conclusion

| Check | Result |
|-------|--------|
| SSH access | OK |
| Inventory complete | OK |
| Unrelated services identified | OK |
| Free ports reserved | OK |
| Config snapshot for rollback | OK |
| DNS for namat | **Blocked** — owner must create records |
| Live NAMAT deploy | Not started at audit time |

**Safe to proceed** with isolated `/opt/namat` Docker Compose + new Nginx vhost **after** DNS (or temporarily via IP/`Host` header testing). Never restart/reconfigure Basira/ARD/Sanad/Takamul/Quran/Erth as part of NAMAT work.
