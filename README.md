# NAMAT — نَمَط

NAMAT is a commercial iPhone Wallet artwork customization platform.

## Product model
- One-time purchase (NearPay)
- Unlimited skin changes on supported devices/iOS versions
- Dynamic skin library managed from the admin dashboard
- iPhone app distributed outside the App Store
- Wallet operations remain on-device
- Backend never stores card numbers, CVV, payment tokens, or Wallet identifiers
- AI Skin Studio (provider interface; mock until AI credentials exist)

## Production
- Domain: https://namat.shara.sa
- Admin: https://admin.namat.shara.sa
- Server: `152.239.112.213`

## Monorepo
```text
apps/ios apps/web apps/admin
services/api
packages/shared packages/ui packages/config
prototypes/wallet-engine
infra/docker infra/nginx infra/deploy
docs/
```

JavaScript workspace: **pnpm**.

## Quick start (local)
```bash
pnpm install
cp services/api/.env.example services/api/.env   # fill names locally
pnpm --filter @namat/api test
pnpm --filter @namat/api build
pnpm --filter @namat/web dev
pnpm --filter @namat/admin dev
```

iOS / Wallet engine (macOS or Linux with Swift):
```bash
cd prototypes/wallet-engine && swift test
cd apps/ios && swift test
```

## Docs
| Doc | Path |
|-----|------|
| Architecture | `docs/ARCHITECTURE.md` |
| Security | `docs/SECURITY.md` |
| Environment (names only) | `docs/ENVIRONMENT.md` |
| Deployment | `docs/DEPLOYMENT.md` |
| Operations | `docs/OPERATIONS.md` |
| Testing | `docs/TESTING.md` |
| Compatibility | `docs/COMPATIBILITY.md` |
| AI | `docs/AI.md` |
| Payments (Moyasar; NearPay legacy) | `docs/PAYMENTS.md` |
| Rollback | `infra/deploy/ROLLBACK.md` |
| Final handoff | `docs/FINAL_HANDOFF.md` |
| Live server audit | `docs/audit/SERVER_LIVE_AUDIT.md` |
| Autonomous brief | `docs/CODEX_AUTONOMOUS_EXECUTION.md` |

## Security principle
Wallet-specific operations must stay on the device. The backend must not receive or persist payment-card data or Wallet card identifiers.
