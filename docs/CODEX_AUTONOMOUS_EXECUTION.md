# NAMAT — Autonomous End-to-End Execution Brief

## Mission
Build and deploy NAMAT end-to-end with minimal owner intervention.

Production target:
- Domain: https://namat.shara.sa
- Server: 152.239.112.213
- SSH: `ssh root@152.239.112.213`

You have full access to the NAMAT GitHub repository and the project server. Execute all phases in sequence. Do not pause after each phase to ask for approval. Make the safest reasonable engineering decision, document it, test it, and continue.

Only stop for an irreducible external dependency that cannot be solved with repository/server access, such as:
- a physical iPhone required for final Wallet Apply/Restore proof
- Apple signing credentials not available
- payment merchant credentials not available
- DNS-provider credentials not available
- third-party AI/API credentials not available

If one item is blocked:
1. Do not stop the rest of the project.
2. Continue all independent work.
3. Isolate the blocker.
4. Leave the system fully ready for that credential/action.
5. At the end, report the smallest exact external action still required.

Never claim a test passed if it was not actually run.

## Source control
1. Inspect current PRs/branches.
2. Review the existing Phase 0 PR.
3. If it is consistent and safe, merge it into `main`.
4. Use small branches/PRs per major phase when useful.
5. Run checks before merge.
6. Merge completed work into `main` yourself when safe.
7. Keep `main` deployable.
8. Use descriptive commits.
9. Never commit secrets, passwords, keys, provisioning profiles, tokens, or production env values.

## Server-first audit
Connect using:

```bash
ssh root@152.239.112.213
```

Before live changes inspect and document:
- OS/version
- CPU/RAM/disk
- Docker/Compose
- Node/pnpm
- reverse proxy
- running services
- listening ports
- firewall
- PostgreSQL/Redis
- existing sites/domains
- TLS
- backups
- deployment conventions

Create/update:
- `docs/audit/SERVER_LIVE_AUDIT.md`
- `infra/deploy/ROLLBACK.md`

Snapshot relevant configs before edits. Never destroy or overwrite unrelated services.

## Target architecture
```text
apps/
  ios/
  web/
  admin/
services/
  api/
packages/
  shared/
  ui/
  config/
infra/
docs/
prototypes/
```

Preferred stack:
- iOS: Swift + SwiftUI
- Web/Admin: Next.js + TypeScript
- API: NestJS + TypeScript
- DB: PostgreSQL
- package manager: pnpm
- storage: S3-compatible object storage when appropriate
- Redis only when clearly useful
- deployment: Docker Compose or the safest existing server convention

Preferred routing:
- `namat.shara.sa` — public site/customer area
- `api.namat.shara.sa` — API
- `admin.namat.shara.sa` — admin

A simpler same-origin architecture is acceptable if safer; document the choice.

## Non-negotiable privacy boundary
Wallet operations stay on-device.

Never send/store in NAMAT backend:
- PAN/card number
- CVV
- PIN
- bank credentials
- Apple Pay payment tokens
- Wallet card/pass identifiers
- pass hashes
- pairing material

No sensitive Wallet data in logs, analytics, crash reporting, AI requests, or admin.

Backend may store only normal account/product data:
- account
- purchase
- lifetime entitlement
- NAMAT installation ID
- app/iOS version
- skin IDs
- non-sensitive operational events

AI must be isolated from Wallet data.

# Autonomous phase sequence

## Phase 0 — Foundation
Use the existing Phase 0 work as baseline. Do not redo completed work unnecessarily.

## Phase 1 — Real Wallet Engine
Implement the actual AirCard-backed adapter behind `WalletSkinEngine`.

Required:
- compatibility check
- pairing detection
- LocalDevVPN detection
- local card discovery
- artwork read/process
- backup-before-first-apply
- apply
- cache refresh
- restore original
- verification
- sanitized logging
- stable error model

Restore requirements:
- backup original before first Apply
- later skins never overwrite the original backup
- Restore returns the true original
- backup is local and verified
- use atomic writes where possible
- no telemetry/cloud upload of backup

Keep all AirCard/Airlift implementation behind an adapter. Do not copy unrelated AirCard features.

If no physical iPhone is available, finish all code/tests possible and mark only device proof as blocked.

## Phase 2 — iOS Product App
Build:
- onboarding
- email OTP login
- compatibility
- pairing/setup
- cards
- skin library
- skin details
- preview
- apply
- restore
- cache/downloads
- account/license
- settings
- update-required flow
- diagnostics/support

Wallet identifiers remain local-only.

## Phase 3 — Backend
Implement:
- auth
- users
- sessions
- purchases
- entitlements
- devices
- skins
- skin versions
- categories
- assets
- compatibility
- app versions
- remote config
- analytics
- admin
- audit logs
- AI generations

Use migrations, validation, appropriate rate limiting, sanitized structured logging, and health endpoints.

## Phase 4 — Dynamic Skin Delivery
Implement:
- skin manifest
- versioning
- SHA-256 integrity
- thumbnails/previews
- required engine assets
- local caching
- rollback
- publish/unpublish
- featured/sort/category
- minimum app version

Publishing a skin in admin must make it appear through the app path without a new IPA.

## Phase 5 — Admin Dashboard
Implement:
- secure admin login
- dashboard
- designs
- categories
- upload/publish/unpublish
- skin versions
- users
- entitlements/licenses
- devices
- iOS compatibility
- app versions
- remote config
- Apply kill switch
- analytics
- audit logs
- maintenance/support controls

Never expose admin without authentication.

## Phase 6 — Website + Customer Area
Build a polished production site at `namat.shara.sa`.

Required:
- home
- how it works
- compatibility
- installation guide
- FAQ
- one-time pricing
- checkout
- purchase success
- login
- customer account
- device management
- IPA/download page
- privacy
- terms
- support

Commercial model:
- one-time purchase
- lifetime entitlement
- no subscription in v1
- 2 active installations initially
- customer can remove an old device and activate another

Before purchase clearly disclose:
- manual/sideload installation
- supported device/iOS requirements
- NAMAT changes artwork appearance, not banking data
- compatibility can change after iOS updates

Do not claim “works forever”.

## Phase 7 — Payments
Integrate the best production-ready payment provider available from existing credentials/environment.

Requirements:
- server-verified webhook
- idempotency
- purchase state
- lifetime entitlement creation
- refund state
- secure success/failure handling

If merchant credentials are absent:
- implement provider abstraction
- use sandbox/test mode if possible
- document exact production env vars
- do not fake live-payment readiness

## Phase 8 — AI Skin Studio
Implement AI as a separate path:
- prompt -> skin generation
- style presets
- optional user reference image
- safe crop/layout for card dimensions
- preview
- save to user library
- moderation
- IP/trademark guardrails
- generation history/status

AI input must never contain Wallet data.

If no AI provider credentials are available:
- implement provider abstraction + queue/state + UI
- use a mock/local adapter only for development
- leave one documented provider switch for production

## Phase 9 — Reliability / Security / QA
Run and document:
- unit tests
- integration tests
- API auth tests
- entitlement/device-limit tests
- webhook tests
- admin authorization tests
- upload validation
- asset integrity tests
- compatibility/kill-switch tests
- privacy/log review
- dependency audit
- secret scan
- build checks
- server smoke tests
- backup/restore checks
- production health checks

Wallet engine validation when possible:
- Apply Skin A
- Apply Skin B
- Restore true original
- restart/reopen persistence
- network capture confirming Wallet identifiers do not leave device

## Phase 10 — Deployment
Deploy the complete production system.

Required:
- production environment
- DB migrations
- reverse proxy
- TLS
- restart policy
- health checks
- logs
- database backups
- asset backup policy
- rollback procedure
- least-privilege permissions

If DNS credentials are available, configure the required records. If not, finish the origin/proxy and report the exact DNS records required at the end.

## Phase 11 — Production Verification
Verify:
- website loads
- TLS valid
- login works
- checkout works or is clearly sandbox-blocked
- admin is secured
- API health
- DB persistence
- dynamic skin publish appears through the product path
- customer entitlement flow
- device management
- compatibility config
- kill switch
- AI flow where provider is active
- backups exist
- restart survives
- no secrets in repo

# Product design quality
The site must look like a real consumer product, not an internal scaffold.

Direction:
- premium
- minimal
- highly visual
- mobile-first
- strong before/after card previews
- Arabic/English-ready architecture
- fast
- clear compatibility messaging
- no generic SaaS copy

Do not block engineering waiting for final branding assets; use a clean NAMAT identity with replaceable tokens/components.

# Required documentation
Maintain:
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/OPERATIONS.md`
- `docs/ENVIRONMENT.md` (variable names only; no values)
- `docs/TESTING.md`
- `docs/COMPATIBILITY.md`
- `docs/AI.md`
- `infra/deploy/ROLLBACK.md`

At the end create:
- `docs/FINAL_HANDOFF.md`

It must include:
- production URLs
- deployed commit
- architecture summary
- services/ports
- deployment procedure
- rollback procedure
- backup locations/policy
- admin usage
- publishing skins
- compatibility management
- Apply kill switch
- entitlement issue/revoke flow
- known limitations
- exact remaining external blockers, if any

# Definition of Done
Do not declare completion because code exists.

NAMAT is complete only when every item possible with current access is actually working and verified.

Expected final state:
- repository organized
- `main` deployable
- production website running
- API running
- PostgreSQL migrated
- admin secured and working
- customer account working
- lifetime entitlement flow working
- dynamic skin library working
- compatibility + kill switch working
- AI Skin Studio working where provider credentials exist
- production monitoring/logging/backups configured
- live deployment documented
- Wallet engine implemented, with physical-device proof explicitly marked pending only if a real iPhone/signing environment is unavailable

Continue from one phase to the next automatically. Do not ask “shall I continue?” after each phase.
