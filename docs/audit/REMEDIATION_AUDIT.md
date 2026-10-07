# NAMAT remediation audit

Baseline recorded before this pass:

- Repository `main` HEAD: `b77af3607730b3d7b95acadca6b996e089c3e49b`
- No commits existed after that SHA when this pass started.
- `pnpm install --frozen-lockfile`, API tests (5 suites / 12 tests), typecheck, API build, web build, and admin build passed on that baseline.
- Swift was not installed at baseline (`NO_SWIFT`).

## Confirmed

| Issue | Evidence |
| --- | --- |
| Production app booted `LocalStubEngine` | `NamatAppMain.swift` before this pass |
| iOS API base `https://api.namat.shara.sa` and path encoding via `appendingPathComponent` | `AppEnvironment.swift`, `NamatAPIClient.swift` |
| OTP, device, entitlement, skins, remote config, and AI field names differed from the API | iOS models vs `services/api` controllers |
| Apply did not enforce kill switches | `ViewModels.swift` only checked a non-existent `forceUpdate` |
| Admin had no multipart artwork upload | `admin.controller.ts` created drafts without file bytes |
| Mock checkout auto-approved whenever NearPay was unconfigured, including production | `checkout.controller.ts` |
| Privacy guard rejected webhook bodies that contained provider card fields | `privacy.guard.ts` |
| Approval trusted `approved` without amount, currency, merchant, and reference checks | `purchases.service.ts` |
| No owner role, no server logout, browser bearer tokens in localStorage | auth and web/admin session modules |
| `AI_API_KEY` did not select a provider | `ai-generations.service.ts` |
| @2x and @3x were the same bytes | `AirCardWalletEngine.swift` |

## False positives

- The API device route already expected `installationId`, `appVersion`, and `iosVersion`. The mismatch was the iOS client.
- `users.role` is `varchar(32)`. Owner does not need an enum migration.
- Shared TypeScript types already matched the API more closely than the iOS models did.

## Newly found during this pass

- NearPay's published webhook reference does not document a signature. POS API `GET /v1/clients-sdk/pos/transactions/{id}` is the documented authoritative read, and that payload can contain PAN, so it must be stripped before persistence.
- NearPay customer payment is a terminal/SDK flow, not a hosted browser checkout.
- `appendingPathComponent` would have encoded `skins/manifest` as one path segment.

## Status vocabulary

IMPLEMENTED means the code path exists. TESTED means an automated test executed in this environment. PRODUCTION VERIFIED means the public host is serving this commit. EXTERNAL BLOCKER means a credential or provider account is missing. PHYSICAL DEVICE REQUIRED means a Mac and iPhone must run the check.

This document does not claim production verification of the remediation commit. That is recorded only after a deploy.
