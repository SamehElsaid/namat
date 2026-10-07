# Testing

Automated status for this remediation: API Jest 10 suites / 26 tests passed; `pnpm typecheck` passed; API, web, and admin production builds passed; WalletSkinEngine and NamatCore `swift test` passed on Linux Swift 6.0.3. Physical iPhone tests are NOT PASSED. See `docs/testing/DEVICE_TEST_PLAN.md`.


## Automated (CI / agent)

| Suite | Command | Notes |
|-------|---------|-------|
| API unit/integration | `pnpm --filter @namat/api test` | Device limit, webhook idempotency, privacy guard, kill switch, entitlement |
| API build | `pnpm --filter @namat/api build` | |
| Web build | `pnpm --filter @namat/web build` | |
| Admin build | `pnpm --filter @namat/admin build` | |
| WalletSkinEngine | `cd prototypes/wallet-engine && swift test` | Requires Swift; Linux OK for stub tests |
| NamatCore | `cd apps/ios && swift test` | Requires Swift |

Never mark a suite PASS unless it was executed in the current environment.

## Production activation checks (executed 2026-10-02)

| Check | Result |
|-------|--------|
| DNS A multi-resolver (Google/Cloudflare) | PASS → `152.239.112.213`; no AAAA |
| Origin health web/admin/api/postgres | PASS |
| Public HTTPS homepage + admin login | PASS |
| `/health` `/ready` via HTTPS | PASS |
| HTTP→HTTPS 301 | PASS |
| TLS verify | PASS |
| CORS | PASS (namat allowed; evil origin no ACAO reflect) |
| `/_next` assets | PASS |
| Compose restart persistence | PASS |
| `certbot renew --dry-run` | PASS (admin after NS retry) |
| Backup script real run | PASS (see `/opt/namat/backups`) |
| NearPay live money | **NOT claimed** (mock mode) |
| Wallet Apply/Restore on iPhone | **NOT RUN / NOT PASSED** |

## Manual / device

See **`docs/testing/DEVICE_TEST_PLAN.md`** for the exact iPhone procedure.  
**Device validation status: NOT PASSED.**

| Test | Status requirement |
|------|--------------------|
| Apply Skin A on real iPhone | Required for Wallet PASS |
| Apply Skin B (backup preserved) | Required |
| Restore true original | Required |
| Network capture: no Wallet IDs to NAMAT hosts | Required |
| OTP login | Needs SMTP + device/browser |
| Checkout mock approve → entitlement | Staging/prod mock OK; ≠ live NearPay |
| Device limit (3rd install rejected) | Staging/prod API |
| Admin publish skin → manifest update | Staging/prod |
| Kill switch disables Apply | Staging/prod + device |
| Admin auth required | Staging/prod |

## Privacy regression

Reject API bodies containing any of `FORBIDDEN_PAYLOAD_FIELDS` from `@namat/shared` (PAN, CVV, `walletLocalKey`, pass hashes, Apple Pay tokens, etc.).

## NearPay

Without `NEARPAY_API_KEY`, API runs **mock sandbox**. Live webhook tests need NearPay-provisioned sandbox merchant + dashboard API key. Do not claim live payment readiness in mock mode.

## SMTP

Without `SMTP_*`, production must not leak OTP codes in logs or API responses. The request fails with `EmailDeliveryUnavailable` and the unused challenge is deleted.
