# Codex First Task — NAMAT

You have full access to the NAMAT GitHub repository and the project server.

Production domain target:
- namat.shara.sa

## Your first mission
Do **not** start by building the landing page.

First, establish the technical foundation and prove the Wallet customization engine can be safely incorporated into NAMAT.

## Step 1 — Audit before changing anything
Inspect:
- this repository
- current server state
- available runtimes/tooling
- existing reverse proxy/web server
- Docker availability
- database availability
- deployment conventions
- existing services using the same server

Do not delete, overwrite, restart, or reconfigure existing production services during this audit.

Create:
`docs/audit/INITIAL_AUDIT.md`

Document:
- repo state
- server OS
- CPU/RAM/disk summary
- installed Node/PNPM/Bun/Docker/PostgreSQL/Nginx versions if present
- listening ports
- currently running services relevant to deployment
- whether namat.shara.sa currently resolves and where
- security/deployment risks
- recommended deployment approach
- blockers

Do not commit secrets, IP credentials, tokens, private keys, or environment values.

## Step 2 — Audit AirCard-iOS
Use the upstream AirCard-iOS repository as a technical reference and inspect:
- license
- dependencies and their licenses
- build requirements
- minimum/supported iOS versions
- pairing flow
- LocalDevVPN requirements
- Wallet/passbook access path
- artwork apply logic
- cache refresh
- restore/original-artwork behavior
- network calls
- telemetry/logging
- whether any Wallet identifiers leave the device
- features unrelated to NAMAT

Create:
`docs/audit/AIRCARD_AUDIT.md`

Classify findings as:
- reusable
- reusable with changes
- must be rewritten
- unnecessary
- security concern
- licensing concern
- unknown / requires device test

## Step 3 — Feasibility prototype
Create:
`prototypes/wallet-engine/`

Goal:
- minimal test harness
- discover supported Wallet cards locally
- select local test artwork
- apply it
- refresh Wallet
- restore original artwork
- explicit error codes

Do not add NAMAT backend/networking to the Wallet path yet.

The prototype must not transmit card data or Wallet identifiers.

## Step 4 — Architecture scaffold
After the audit is complete, scaffold:

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
- JS workspace: pnpm

Create root workspace configuration and minimal build/lint foundations only after documenting the audit.

## Step 5 — Engine boundary
Design an internal iOS abstraction equivalent to:

```swift
protocol WalletSkinEngine {
    func checkCompatibility() async -> CompatibilityResult
    func discoverCards() async throws -> [LocalCard]
    func applySkin(card: LocalCard, artwork: SkinArtwork) async throws
    func restoreOriginal(card: LocalCard) async throws
}
```

All AirCard-derived details must stay behind this boundary.

## Non-negotiable security rules
- Never send PAN, CVV, PIN, bank credentials, Apple Pay tokens, or Wallet card identifiers to NAMAT servers.
- No sensitive Wallet data in logs or analytics.
- Never commit secrets.
- Never expose the admin dashboard publicly without authentication.
- Do not touch DNS or production proxy configuration until the current server is documented and a rollback plan exists.
- Do not make destructive changes to existing server services.
- Any AirCard-derived code must preserve required license notices.
- Audit third-party binary/dependency licensing separately.

## AI scope
NAMAT will include AI, but AI must be isolated from Wallet data.

For now, document the future AI module:
- prompt -> generated skin artwork
- style presets
- card-safe layout/crop
- moderation
- save to user's skin library

Do not implement AI generation until Wallet engine feasibility is proven.

## Deliverables for this first task
Commit:
1. `docs/audit/INITIAL_AUDIT.md`
2. `docs/audit/AIRCARD_AUDIT.md`
3. prototype source under `prototypes/wallet-engine/`
4. monorepo scaffold
5. `docs/ARCHITECTURE.md`
6. `docs/SECURITY.md`
7. `docs/PHASE_0_RESULT.md`

`PHASE_0_RESULT.md` must end with one of:
- PASS — safe to proceed
- PASS WITH CONDITIONS — list conditions
- FAIL — list blockers

Do not claim PASS unless Apply + Restore are verified on a supported real iPhone.

## Working style
- Work directly in the NAMAT repository.
- Make small, descriptive commits.
- Keep a running changelog in the phase result.
- When uncertain, inspect and document instead of guessing.
- Do not stop after producing a plan; perform the audit and prototype work that is possible with the available environment.
