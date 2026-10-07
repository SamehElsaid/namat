# NAMAT — Initial Audit (Phase 0)

**Date:** 2026-10-02  
**Auditor environment:** Cursor Cloud Agent VM (not production)  
**Repo:** `sharahsa0-creator/namat` @ branch `cursor/phase-0-foundation-8ef0`  
**Production domain target:** `https://namat.shara.sa`

> This audit inspects what was reachable from the Cloud Agent environment.  
> **No production DNS, Nginx, or service configuration was changed.**

---

## 1. Repository state

| Item | Finding |
|------|---------|
| Remote | `https://github.com/sharahsa0-creator/namat` |
| Default branch | `main` |
| Pre-audit contents | README, `.gitignore`, `docs/PROJECT_PLAN.md`, `docs/CODEX_FIRST_TASK.md` only |
| Monorepo apps/packages | Absent before Phase 0 scaffold (created in this phase) |
| Secrets in Git | None observed in tracked files |
| `.gitignore` | Covers `.env*`, signing artifacts (`*.p12`, `*.mobileprovision`, `*.pem`, `*.key`), Xcode/SwiftPM build products |

**Risk:** Repository is greenfield documentation only — no deployable app/API yet.

---

## 2. Cloud Agent host (this environment)

This is the **development agent VM**, not the NAMAT production server.

| Resource | Value |
|----------|-------|
| OS | Ubuntu 24.04.4 LTS (Noble), kernel `6.12.94+` (`x86_64`) |
| CPU | 4 vCPU |
| RAM | 16 GiB (≈10 GiB used / ≈5 GiB available at audit time) |
| Disk | 254G root (`/dev/vdc`), ≈247G free |
| Swap | None |

### Installed toolchains

| Tool | Version / status |
|------|------------------|
| Node | v22.14.0 / v22.22.2 (nvm) |
| npm | 10.9.7 |
| pnpm | 10.33.3 |
| Bun | **missing** |
| Docker / Compose | **missing** |
| PostgreSQL client (`psql`) | **missing** |
| Nginx | **missing** |
| Redis | **missing** |
| Swift / Xcode | **missing** (cannot build iOS IPA here) |
| Python | 3.12.3 |
| Git | 2.43.0 |
| GitHub CLI (`gh`) | 2.99.0 (token available via agent injection) |

### Listening ports (agent host)

Relevant listeners observed: agent exec-daemon / VNC / internal tooling only.  
**No NAMAT Nginx, API, or Postgres process is running on this VM.**

### Injected secret *names* (values not recorded)

- `GH_TOKEN`
- `SMTP_PASSWORD`
- `STAGING_SSH_PRIVATE_KEY`

**Security note:** Secret values must never be committed. The staging SSH private key was validated as an Ed25519 key (comment hint: `takamul-staging-package-f-temp`) after restoring PEM newlines. **No staging/production hostname was discoverable** from DNS guesses or the key comment alone.

---

## 3. Domain / DNS / HTTP

| Host | Result |
|------|--------|
| `namat.shara.sa` | **Does not resolve** (`NXDOMAIN` / name not known) |
| `api.namat.shara.sa` | Does not resolve |
| `www.namat.shara.sa` | Does not resolve |
| `shara.sa` | Resolves to `34.111.179.208` |
| `takamul.sa` | Resolves (Cloudflare anycast IPs) |

HTTPS/HTTP probes to `https://namat.shara.sa` and `http://namat.shara.sa` failed with **Could not resolve host**.

SSH to `34.111.179.208:22` **timed out** (likely CDN/LB edge, not a direct SSH endpoint).

### Conclusion on production server access

| Check | Status |
|-------|--------|
| Production DNS for `namat.shara.sa` | Missing |
| Production Nginx / existing services inspection | **Blocked** — host unreachable / unknown |
| Staging SSH key usable | Key parses; **host unknown** |
| Rollback plan for live changes | N/A yet — **no live config was modified** |

**Do not change DNS or proxy configuration until a reachable production/staging host is identified, audited, and a rollback plan is written against that host’s actual state.**

---

## 4. Security / deployment risks

1. **Domain not provisioned** — storefront cannot go live until DNS + TLS + origin are set up deliberately.
2. **Production server opaque** — agent has a staging SSH key but no hostname/IP mapping; live inventory incomplete.
3. **No Docker/Postgres/Nginx on agent VM** — local full-stack smoke tests need either container install in a dedicated env or a known staging box.
4. **iOS builds impossible on this Linux agent** — Wallet Apply/Restore cannot be device-verified here.
5. **Secret hygiene** — agent injects SMTP + SSH secrets; keep them out of Git and out of docs.
6. **Greenfield deploy risk** — first deploy must not clobber unrelated services on shared hosts (unknown until server audit succeeds).

---

## 5. Recommended deployment approach (pending live-server audit)

Until the production/staging host is inspected:

1. Keep `namat.shara.sa` dark (no DNS) until infra inventory + rollback notes exist.
2. Prefer isolated compose stack on a dedicated VPS/VM:
   - `api` (NestJS) + PostgreSQL + object storage
   - `web` / `admin` (Next.js) behind Nginx/Caddy
   - TLS via Let’s Encrypt
3. Suggested future hostnames (only after audit):
   - `namat.shara.sa` — storefront
   - `api.namat.shara.sa` — API
   - `admin.namat.shara.sa` — admin (auth-gated; never public without auth)
   - `cdn.namat.shara.sa` — skin assets
4. iOS IPA distribution remains sideload/enterprise path (out of App Store), separate from web deploy.
5. Wallet path stays on-device; API never receives PAN/CVV/PIN/Apple Pay tokens/Wallet card identifiers.

### Provisional rollback stance (pre-change)

Because **no production services were modified in Phase 0**:

- Rollback for this phase = revert Git commits on the feature branch / do not merge.
- Before any future DNS/Nginx change: snapshot current zone records, Nginx site configs, TLS cert paths, and running compose/systemd units; document exact restore commands in `infra/deploy/ROLLBACK.md`.

---

## 6. Blockers

| ID | Blocker | Impact |
|----|---------|--------|
| B1 | `namat.shara.sa` DNS missing | Cannot validate production edge |
| B2 | Staging/production SSH host unknown | Cannot inventory live Nginx/Docker/DB |
| B3 | No macOS/Xcode/iPhone in this environment | Cannot verify Apply + Restore on device |
| B4 | Docker/Postgres not installed on agent | Limited local API integration testing |
| B5 | Upstream AirCard has no first-class Restore | Engine feasibility incomplete until restore is designed + device-tested |

---

## 7. What was *not* done (by design)

- No DNS changes
- No Nginx/Caddy changes
- No restarts or deletions of existing services
- No secret values written into the repository
- No claim of production server “clean bill of health” without host access
