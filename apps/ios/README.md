# NAMAT iOS App

SwiftUI customer app for NAMAT (نَمَط). Wallet apply/restore runs **only on-device** via `WalletSkinEngine`.

## Privacy

- **Never** send PAN / CVV / PIN / Apple Pay tokens / Wallet identifiers / `localKey` to API, logs, analytics, or AI.
- API client sends only: account/OTP, entitlement, **device installation ID**, skin IDs, AI prompts.
- Original artwork backups stay in `OriginalArtworkVault` on the iPhone.

## Layout

```text
apps/ios/
  Package.swift              # SPM (NamatCore, NamatUI, NamatApp)
  project.yml                # XcodeGen → Xcode project (macOS)
  README.md
  THIRD_PARTY_NOTICES
  Sources/
    NamatApp/                # @main entry
    NamatCore/               # API client, session, models, DI
    NamatUI/                 # SwiftUI screens + MVVM
  Tests/
    NamatCoreTests/
```

Engine package (shared): `../../prototypes/wallet-engine`

### Screens

| Screen | Role |
|--------|------|
| Onboarding | Brand + privacy primer |
| Login (OTP) | Email OTP auth |
| Compatibility | Engine compatibility + pairing/VPN flags |
| Pairing / Setup | Pairing record + LocalDevVPN |
| Cards | Local discover (no key upload) |
| Skin Library / Detail / Preview | CDN catalog |
| Apply / Restore | On-device engine; vault backup |
| Account / License | Entitlement + installation ID |
| Settings | Links to diagnostics / setup |
| Update Required | Force-update gate |
| Diagnostics / Support | Redacted support bundle |
| AI Skin Studio | Prompt UI only |

## macOS build steps

Requires **macOS 14+**, **Xcode 16+**, and (for device Apply) a supported iPhone.

```bash
# 1) Engine unit tests
cd prototypes/wallet-engine
swift test

# 2) Generate Xcode project
cd ../../apps/ios
brew install xcodegen   # if needed
xcodegen generate
open Namat.xcodeproj

# 3) Or build via SwiftPM (simulator / Mac Catalyst limited — AirliftFFI is device-oriented)
swift build
swift test
```

### Sideload / device

1. Sign with your Apple team in Xcode.
2. Release links `AirCardWalletEngine` through the CI-built `AirliftFFI.xcframework`. It does not fall back to `LocalStubEngine`.
3. Import pairing + enable LocalDevVPN.
4. Discover → Apply Skin B → Apply Skin C → Restore the true original.

## BLOCKED — device proof

**Protected Wallet artwork read, Apply Skin B, Apply Skin C, and Restore of the true original are BLOCKED** until a paired physical iPhone runs them.  
CI can rebuild the xcframework and compile Release. That is not device proof.

## Engine injection

```swift
let engine = try await WalletEngineFactory.makeForCurrentBuild()
let env = AppEnvironment(engine: engine, api: api, session: session)
```

## Related docs

- `../../prototypes/wallet-engine/README.md`
- `../../prototypes/wallet-engine/THIRD_PARTY_NOTICES`
- `../../docs/SECURITY.md`
- `../../docs/audit/AIRCARD_AUDIT.md`
