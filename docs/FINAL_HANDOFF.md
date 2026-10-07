# NAMAT — Final Handoff

**Remediation status (2026-10-03):** code changes are IMPLEMENTED on the remediation branch and TESTED where an automated suite exists. They are not PRODUCTION VERIFIED until `/opt/namat/DEPLOYED_GIT_SHA` matches the deployed commit. Physical Wallet proof remains NOT PASSED. See `docs/audit/REMEDIATION_AUDIT.md`.

**Date:** 2026-10-02 (production activation)  
**Branch / commit:** `main` @ see Deploy status  
**Repo:** https://github.com/sharahsa0-creator/namat

---

## Production URLs

| Surface | URL | Status |
|---------|-----|--------|
| Storefront | https://namat.shara.sa | **LIVE HTTPS 200** |
| Admin | https://admin.namat.shara.sa/login | **LIVE HTTPS 200** |
| API (same-origin) | https://namat.shara.sa/api/v1 | **LIVE** |
| Health | https://namat.shara.sa/health | **LIVE** |
| Ready | https://namat.shara.sa/ready | **LIVE** (`database: true`) |

**DNS:** A records for `namat.shara.sa` and `admin.namat.shara.sa` → `152.239.112.213` verified via Google (`8.8.8.8`/`8.8.4.4`) and Cloudflare (`1.1.1.1`/`1.0.0.1`). **No AAAA** (intentional). Authoritative NS `pns01.t2.sa` / `pns02.t2.sa` were intermittently unreachable from some paths (Let's Encrypt briefly saw SERVFAIL on admin CAA); certs issued and renew dry-run succeeded after retry.

---

## Deployed commit

Source of truth on server: `/opt/namat/DEPLOYED_GIT_SHA` (full SHA). Recorded again in Deploy status after each activation push.

---

## Architecture summary

- **macOS (customer app, NEW):** `apps/macos/NamatMac` — SwiftUI (ar/en) wrapping the proven AirCard engine (`apps/macos/Vendor/AirCard`, MIT). Login via NAMAT API, entitlement gate, server skin library, customer image upload (1536×969 framing), Apply/Restore with pristine-look backup, `.passthm` lock-screen themes, remote-config kill switch + compatibility gate. Distributed as unsigned DMG built by `apps/macos/build.sh` on macOS.
- **iOS (legacy, superseded by the macOS app):** SwiftUI app + `WalletSkinEngine` with on-device `OriginalArtworkVault`, transactional Apply, Restore (device proof **pending** — see `docs/testing/DEVICE_TEST_PLAN.md`). The on-device approach was never device-proven; the macOS app replaces it with the host-side engine that AirCard validates on real devices.
- **API:** NestJS + PostgreSQL — auth OTP (+ SMTP when configured), entitlements, devices (max 2), skins manifest, remote config/kill switch, **Moyasar Hosted Invoice** payments (NearPay legacy-only for historical terminal purchases), AI generations (mock provider until `AI_API_KEY`).
- **Web / Admin:** Next.js on `3300` / `3301`.
- **Infra:** Docker Compose `/opt/namat`; Nginx + Let's Encrypt; localhost upstreams only.

Privacy: Wallet identifiers never leave the iPhone; API `PrivacyGuard` rejects forbidden fields; NearPay PAN fields stripped.

---

## Services / ports

| Service | Port |
|---------|------|
| namat-web | `127.0.0.1:3300` |
| namat-admin | `127.0.0.1:3301` |
| namat-api | `127.0.0.1:3302` |
| namat-postgres | Docker internal |

Sibling products (Basira, ARD, Sanad, Takamul, Quran, Erth) left untouched during activation.

---

## Deployment / rollback / backups

- Deploy: `docs/DEPLOYMENT.md`, `infra/deploy/deploy.sh`
- Rollback: `infra/deploy/ROLLBACK.md`
- Backups: `infra/deploy/backup.sh` → `/opt/namat/backups/` (Postgres + uploads, retention 14d)
- Device plan: `docs/testing/DEVICE_TEST_PLAN.md` (**device validation NOT PASSED**)
- Live audit: `docs/audit/SERVER_LIVE_AUDIT.md`

---

## Admin usage

1. Prefer `ADMIN_API_TOKEN` until SMTP is configured for OTP.
2. Open `https://admin.namat.shara.sa` → login.
3. Designs / users / devices / compatibility / remote config / AI moderation / audit.

---

## Known limitations

1. **macOS app not yet built/verified on a Mac.** The vendored AirCard engine is proven on real devices (iOS 18.0–27.0.1, 27.2 beta 1–2; 27.2 beta 3+ patched), but NamatMac itself needs one macOS build + one real-device Apply→Restore run. Build: `cd apps/macos && ./build.sh` (any Mac with Command Line Tools; or a rented cloud Mac ~$1/h).
2. Wallet Apply/Restore (legacy on-device iOS path) **not device-proven** — superseded by the macOS app; kept for reference only.
3. New online checkout uses **Moyasar Hosted Invoice**. Historical NearPay rows stay on NearPay until the owner configures Moyasar keys and enables checkout.
4. AI uses **mock provider** until `AI_API_KEY` (optional for launch).
5. OTP email requires `SMTP_*`; without SMTP, production **does not log OTP codes**.

---

## Exact remaining owner actions

1. **Build NamatMac once** — on any macOS machine: `cd apps/macos && ./build.sh`; distribute `build/NamatMac.dmg` to customers (first launch: Right-Click → Open). Then run Apply → Restore on one real iPhone and archive the evidence. (Optional: Apple Developer ID for notarization — `CODESIGN_IDENTITY="Developer ID Application: …" ./build.sh`.)
2. **Moyasar** — set `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, and `PAYMENT_CONFIG_KEY`; configure webhook `https://namat.shara.sa/api/v1/payments/moyasar/webhook` with the same shared secret; enable checkout from the owner dashboard in test mode first. `MOYASAR_PUBLISHABLE_KEY` is optional for Hosted Invoice.
3. **SMTP** — set `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` in `/opt/namat/secrets/namat.env`, then `docker compose ... up -d api`. (Until then, customers sign in on the website; the Mac app needs SMTP for OTP login, or add Google login.)
4. **AI (optional)** — set `AI_API_KEY` when ready.
5. **Compatibility watch** — when Apple ships a new iOS, update the compatibility matrix / kill switch in the admin dashboard before customers update.

---

## Deploy status

| Check | Status |
|-------|--------|
| Compose on `152.239.112.213` | **UP** (api/web/admin/postgres healthy) |
| Local `127.0.0.1:3302/health` + `/ready` | **OK** |
| Web `3300` / Admin `3301/login` | **OK** |
| Public HTTPS storefront + admin | **OK** |
| HTTP→HTTPS redirects | **OK** (301) |
| TLS chain (LE) | **OK** (verify return 0) |
| `certbot renew --dry-run` | **OK** (namat + admin; admin needed retry after NS blip) |
| CORS allow namat origin / withhold evil | **OK** |
| Static `/_next` assets | **OK** |
| Restart persistence (compose restart) | **OK**; siblings healthy |
| `TYPEORM_SYNC` | **false** after migration boot (see OPERATIONS) |
| Backups | Script installed; test backup executed under `/opt/namat/backups/` |
| NearPay mode | **Mock** (`NEARPAY_API_KEY` empty) — not live payments |
| SMTP | Vars ready; host empty — no OTP leak in prod logs |
| AI | Mock provider; interface forbids Wallet data |
| Sibling stacks | Unchanged / healthy |
| Device Wallet validation | **NOT PASSED** |
| Deployed commit | `7ebcfc030b35a6b212077ca6b90a4b291cefbda8` (`main`) |

---

## Doc index

- `README.md`
- `docs/ARCHITECTURE.md` / `SECURITY.md` / `PROJECT_PLAN.md`
- `docs/ENVIRONMENT.md` / `DEPLOYMENT.md` / `OPERATIONS.md` / `TESTING.md`
- `docs/testing/DEVICE_TEST_PLAN.md`
- `docs/COMPATIBILITY.md` / `AI.md` / `PAYMENTS.md`
- `infra/deploy/ROLLBACK.md` / `backup.sh`
- `docs/audit/*`
