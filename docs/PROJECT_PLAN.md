# NAMAT — Project Plan

## Goal
Build NAMAT as a complete commercial platform for customizing the artwork of supported Apple Wallet payment cards on iPhone.

Customer journey:
1. Visit namat.shara.sa
2. Check compatibility
3. Buy once
4. Download and install the iPhone app
5. Activate lifetime access
6. Complete device setup/pairing
7. Select a Wallet card locally
8. Select a skin
9. Preview and apply
10. Change skins without limits while the device/iOS remains supported
11. Receive new skins dynamically without downloading a new IPA

## Core product surfaces
- iOS app
- Public website
- Customer account/download area
- Admin dashboard
- Backend API
- Skin storage/CDN
- Payment integration
- Email OTP authentication
- Remote config and compatibility controls
- AI Skin Studio

## Commercial model
- One-time purchase
- Lifetime entitlement
- Initial device limit: 2 active installations
- No recurring subscription in v1
- New standard designs delivered remotely
- Future optional premium content can be added without changing the entitlement architecture

## Security and privacy
Never send or store:
- PAN/card number
- CVV
- PIN
- bank credentials
- Apple Pay payment tokens
- unnecessary Wallet identifiers

Wallet discovery and artwork modification stay on-device.

## Architecture
```text
apps/
  ios/        Swift + SwiftUI
  web/        Next.js storefront + customer account
  admin/      Next.js admin dashboard
services/
  api/        NestJS API
packages/
  shared/
  ui/
  config/
infra/
  docker/
  nginx/
  deploy/
docs/
```

Data:
- PostgreSQL
- S3-compatible object storage/CDN
- Redis optional

## iOS engine
Use AirCard-iOS only as an audited technical reference/source where licensing permits. Do not copy blindly.

Required engineering outcomes:
- compatibility detection
- pairing/setup
- local Wallet card discovery
- artwork processing
- apply
- restore original
- cache refresh
- clear error mapping
- no sensitive logging

The AirCard-derived engine must be isolated behind an internal adapter/protocol so it can be replaced without rewriting the product UI.

## AI
AI is a product feature, not part of the sensitive Wallet path.

Planned AI Skin Studio:
- text prompt -> proposed card artwork
- style presets
- safe crop/layout adaptation to supported artwork dimensions
- client preview
- optional user-generated skin saved to the user's account
- moderation and IP/trademark controls

AI services must never receive Wallet card data.

## Backend domains
- auth
- users
- purchases
- entitlements
- devices
- skins
- skin versions/assets
- categories
- app versions
- iOS compatibility
- remote config
- analytics
- admin
- audit logs
- AI generations

## Operations
Production domain:
- namat.shara.sa

Recommended subdomains when needed:
- api.namat.shara.sa
- admin.namat.shara.sa
- cdn.namat.shara.sa

Do not change production DNS or server configuration until the current server state is audited and a rollback plan exists.

## Delivery phases
### Phase 0 — Audit & foundation
- inspect repo/server
- audit AirCard-iOS upstream
- confirm licenses/dependencies
- prove Apply + Restore on a supported real device
- document all findings
- scaffold monorepo

### Phase 1 — iOS engine abstraction
- isolate engine
- remove unrelated AirCard features
- create WalletSkinEngine interface
- define error codes
- security cleanup

### Phase 2 — iOS prototype
- Setup
- Cards
- Designs
- Preview
- Apply
- Restore

### Phase 3 — Backend
- auth
- lifetime entitlement
- devices
- skins
- compatibility
- remote config
- app versioning

### Phase 4 — Dynamic skin delivery
- admin upload
- CDN
- manifest/version/hash
- cache
- rollback

### Phase 5 — Admin dashboard
- skins
- users
- licenses
- compatibility
- versions
- remote config
- analytics

### Phase 6 — Website & payments
- landing
- compatibility page
- install guide
- checkout
- webhook
- account/download

### Phase 7 — AI Skin Studio
- prompt
- generation service
- preview
- save/apply flow
- moderation

### Phase 8 — security/QA
- network inspection
- auth/API tests
- webhook verification
- device-limit tests
- privacy/log review
- supported iOS matrix

### Phase 9 — beta
- small controlled cohort
- installation/setup/apply/restore metrics
- support documentation

### Phase 10 — launch
- production deployment
- monitoring/backups
- operational playbook
