# NAMAT Architecture

**Product:** NAMAT (نَمَط) — commercial iPhone Wallet artwork customization  
**Production domain:** `https://namat.shara.sa`  
**Phase:** 0 foundation (scaffold + audits)

---

## 1. Monorepo layout

```text
apps/
  ios/          Swift + SwiftUI customer app (sideloaded)
  web/          Next.js storefront + customer account
  admin/        Next.js admin dashboard (auth-gated)
services/
  api/          NestJS API (PostgreSQL)
packages/
  shared/       Shared TS constants/types
  ui/           Shared web UI primitives
  config/       Shared tooling config
infra/
  docker/
  nginx/
  deploy/       Including ROLLBACK.md (mandatory before live proxy/DNS edits)
prototypes/
  wallet-engine/  Isolated WalletSkinEngine harness
docs/
```

JS workspace: **pnpm** (`pnpm-workspace.yaml`).

---

## 2. Trust boundaries

```text
┌─────────────────────────────────────────────┐
│ iPhone (trusted for Wallet secrets)         │
│  - pairing record (local)                   │
│  - LocalDevVPN / loopback tunnel            │
│  - WalletSkinEngine (discover/apply/restore)│
│  - local card keys + artwork backups        │
│  - skin cache from CDN (images only)        │
└───────────────┬─────────────────────────────┘
                │ HTTPS: auth, entitlement, skins manifest,
                │ device registration, remote config, AI prompts
                │ NEVER: PAN/CVV/PIN/Apple Pay tokens/Wallet IDs
                ▼
┌─────────────────────────────────────────────┐
│ NAMAT Backend                               │
│  api / postgres / object storage / (redis)  │
│  admin (separate auth surface)              │
└─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ AI Skin Studio (separate service path)      │
│  prompt + style → generated artwork         │
│  NEVER receives Wallet card data            │
└─────────────────────────────────────────────┘
```

---

## 3. iOS engine boundary

Product UI talks only to:

```swift
protocol WalletSkinEngine {
    func checkCompatibility() async -> CompatibilityResult
    func discoverCards() async throws -> [LocalCard]
    func applySkin(card: LocalCard, artwork: SkinArtwork) async throws
    func restoreOriginal(card: LocalCard) async throws
}
```

Prototype: `prototypes/wallet-engine/`.

AirCard-iOS is an **audited reference** (MIT). Any derived exploit/FFI code stays inside an adapter module, replaceable without rewriting Screens: Setup → Cards → Designs → Preview → Apply → Restore.

### Restore requirement

Upstream AirCard lacks Wallet restore. NAMAT adapter must **backup original artwork on-device before first apply**, then restore from that backup. See `docs/audit/AIRCARD_AUDIT.md`.

---

## 4. Backend domains

| Domain | Purpose |
|--------|---------|
| auth | Email OTP |
| users / purchases / entitlements | One-time lifetime access |
| devices | Active install limit (v1: 2) |
| skins / categories / versions | Dynamic library + manifests + hashes |
| compatibility / app versions / remote config | Kill-switch & iOS matrix |
| analytics / audit logs | Non-sensitive events only |
| admin | Operator tooling |
| AI generations | Prompt metadata + artwork assets only |

Data stores: PostgreSQL, S3-compatible object storage/CDN, Redis optional.

---

## 5. AI Skin Studio (first-class, isolated)

Flow: **describe / style preset → generate skin → preview → save** (optional apply via local engine).

| Allowed inputs to AI | Forbidden |
|----------------------|-----------|
| Text prompt, style id, target dimensions (1536×969) | Card numbers, CVV, PIN, Wallet local keys/hashes, Apple Pay tokens, pairing files |
| User-owned uploaded reference art (non-Wallet) | Screenshots that embed Wallet card PAN |

Moderation + IP/trademark controls are part of the AI path, not the Wallet engine.

---

## 6. Web & admin

- **web:** marketing, compatibility, checkout, account, IPA download instructions.
- **admin:** skins, users/licenses, compatibility, versions, remote config, analytics — **authentication required**; do not expose without auth.

---

## 7. Deployment topology (target)

| Host | Role |
|------|------|
| `namat.shara.sa` | Storefront |
| `api.namat.shara.sa` | API |
| `admin.namat.shara.sa` | Admin |
| `cdn.namat.shara.sa` | Skin assets |

**As of Phase 0:** `namat.shara.sa` does not resolve; production host inventory is incomplete. No live Nginx/DNS changes until audit + rollback are complete for the real server (`docs/audit/INITIAL_AUDIT.md`, `infra/deploy/ROLLBACK.md`).

---

## 8. Phase sequencing

Phase 0 audits/scaffold → Phase 1 engine abstraction → Phase 2 iOS prototype → Phase 3 API → Phase 4 dynamic skins → Phase 5 admin → Phase 6 web/payments → Phase 7 AI Studio → Phase 8 security/QA → Phase 9 beta → Phase 10 launch.
