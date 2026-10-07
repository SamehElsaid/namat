# NAMAT API (`@namat/api`)

NestJS 10 + TypeORM + PostgreSQL backend for NAMAT.

## Privacy

The API **never** accepts or stores PAN, CVV, PIN, Apple Pay tokens, Wallet card identifiers, pass hashes, or `walletLocalKey`. A global `PrivacyGuard` rejects those field names. NearPay webhooks may include masked PAN — it is stripped and never persisted.

## Stack

- NestJS + class-validator DTOs
- TypeORM migrations (Postgres); SQLite for tests
- JWT sessions after email OTP (rate-limited)
- NearPay payment provider (`api-key` header, sandbox `https://sandbox-api.nearpay.io`)
- Local skin/AI asset storage under `uploads/`

## Scripts

```bash
pnpm --filter @namat/api install   # from monorepo root: pnpm install
pnpm --filter @namat/api build
pnpm --filter @namat/api start:dev
pnpm --filter @namat/api test
pnpm --filter @namat/api migration:run
pnpm --filter @namat/api seed
```

## Env

Copy `.env.example` → `.env` (names only in git). Missing `NEARPAY_API_KEY` enables **sandbox mock mode** that still exercises purchase → entitlement for local/tests.

Admin: `ADMIN_API_TOKEN` Bearer / `x-admin-token`, or user with `role=admin` (bootstrap via `ADMIN_BOOTSTRAP_EMAIL`).

## Key routes (`/api/v1`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/otp/request` | `{email}` |
| POST | `/auth/otp/verify` | `{email,code}` → JWT |
| GET | `/me` | Profile + entitlement |
| POST | `/checkout/session` | Pending purchase + NearPay ref |
| POST | `/payments/nearpay/webhook` | Approved/Rejected/Reversed |
| GET | `/entitlements/me` | Lifetime access |
| POST | `/devices/register` | Max 2 active installs |
| DELETE | `/devices/:id` | Deactivate |
| GET | `/skins/manifest` | Published skins + hashes |
| GET | `/skins/:id` | Skin detail |
| GET | `/compatibility` | iOS / app matrix |
| GET | `/remote-config` | `killSwitchApply`, versions |
| POST | `/ai/generations` | Prompt metadata only |
| * | `/admin/*` | Skins, users, entitlements, config, analytics, audit |

Health (no prefix): `GET /health`, `GET /ready`.

## CORS

Defaults: `namat.shara.sa`, `admin.namat.shara.sa` (+ local overrides via `CORS_ORIGINS`).
