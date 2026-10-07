# NAMAT — تطبيق macOS للعميل

تطبيق ماك للعميل: تغيير شكل بطاقات Apple Wallet بثيمات من مكتبة NAMAT أو برفع صورة من جهازه، بالإضافة إلى ثيمات شاشة القفل (`.passthm`).

**NamatMac** is the customer-facing macOS app. It wraps the proven AirCard
engine (vendored, MIT) and connects it to the NAMAT platform:

- Login: email OTP / Google (via NAMAT API)
- Entitlement gate: flashing is allowed only for entitled accounts
- Theme library: skins from the NAMAT server (`GET /skins/manifest`)
- Upload: customer picks any image → interactive pan/zoom → 1536×969 PNG
- Passcode themes: `.passthm` apply + restore
- Safety: remote-config kill switch + iOS compatibility matrix checked
  before every flash; original artwork is backed up and restorable
- Bilingual UI: العربية / English

## Layout

```text
apps/macos/
├── NamatMac/            # SwiftUI app sources
│   ├── NamatMacApp.swift
│   ├── API/             # NAMAT API client + models
│   ├── Store/           # session/token storage
│   ├── Engine/          # bridge to AirCard python backend
│   ├── Views/           # SwiftUI screens (ar/en)
│   └── i18n/            # Localizable.strings (ar, en)
├── Vendor/AirCard/      # MIT-licensed AirCard engine (do not edit)
├── build.sh             # universal .app + DMG assembly
└── THIRD_PARTY_NOTICES
```

## How the pieces work together

1. `NamatMac` SwiftUI UI (this folder) — login, library, studio, settings.
2. `Engine/EngineBridge.swift` shells out to the vendored AirCard Python
   backend (`aircard.py`, `apply_card_skin.py`, `aircard_backend.py`)
   through `/usr/bin/python3`, exactly like upstream AirCard does.
3. Obj-C helpers (`Vendor/AirCard/Sources/*.m`) are compiled by
   `Vendor/AirCard/Makefile` against macOS private frameworks
   (MobileDevice / AirTrafficHost) — they run on the customer's Mac.

## Build (requires macOS with Command Line Tools / Xcode)

```bash
cd apps/macos
./build.sh          # outputs build/NamatMac.app + build/NamatMac.dmg
```

The DMG is **unsigned** (same distribution model as AirCard). First launch:
Right-Click → Open → Open. If macOS still blocks it:

```bash
sudo xattr -cr /Applications/NamatMac.app
```

> Signing/notarization with an Apple Developer account ($99/yr) can be
> added later without code changes.

## Server configuration

The app talks to the existing NAMAT API. Set the base URL at build time or
in the app settings screen (default `https://namat.shara.sa/api/v1`).

Required server-side features (already implemented in `services/api`):
- `auth/otp/*`, `auth/google`
- `entitlements/me`
- `skins/manifest`, `skins/{id}` (1536×969 PNG artwork)
- `remote-config`, `compatibility`

## Device flow (same as AirCard, proven)

1. Connect iPhone via USB, unlock + trust.
2. Press **Scan Cards**, then on iPhone: double-click side button →
   authenticate → tap the card in Wallet.
3. Pick a theme from the NAMAT library or upload your own image.
4. **Apply** → force-close the Wallet app on iPhone (or reboot).
5. **Restore** returns the original artwork (auto-backed up before first apply).

### iOS compatibility

Supported: iOS 18.0 – 27.0.1 and 27.2 beta 1–2. **iOS 27.2 beta 3+ is
patched** — the app reads the NAMAT compatibility matrix and blocks
flashing on unsupported versions with a clear message.

## License

AirCard engine: MIT (Johnny Franks) — see `Vendor/AirCard/LICENSE` and
`THIRD_PARTY_NOTICES`. NAMAT app shell: proprietary.
