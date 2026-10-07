# AirCard-iOS Audit (Phase 0)

**Upstream:** [Mak5er/AirCard-iOS](https://github.com/Mak5er/AirCard-iOS)  
**Audited revision:** `6342a3455e17ca357da19537d1e44317a3f69f32` (tag/release bump **1.3.1**, 2026-10-01)  
**License file:** MIT (`Copyright (c) 2026 Johnny Franks`)  
**Audit method:** Source inspection of cloned public repository (no device test in this environment)

Classification legend used below:

| Tag | Meaning |
|-----|---------|
| **reusable** | Can be adapted into NAMAT with attribution |
| **reusable with changes** | Useful but must be trimmed / hardened / rebranded |
| **must be rewritten** | Unsuitable as-is for NAMAT product requirements |
| **unnecessary** | Out of NAMAT v1 Wallet scope |
| **security concern** | Privacy, logging, or data-boundary issue |
| **licensing concern** | Needs counsel / NOTICE preservation / binary provenance |
| **unknown / requires device test** | Cannot close without real iPhone verification |

---

## 1. Product summary (upstream)

AirCard-iOS is an on-device (sideloaded) SwiftUI app that customizes:

1. **Apple Wallet payment / transit card artwork** (NAMAT-relevant)
2. **Lock screen passcode dialer themes** (`.passthm`) — out of NAMAT scope
3. **PosterBoard wallpapers** (`.tendies`) + NeoSpring respring — out of NAMAT scope

It reaches privileged filesystem locations via **AirliftFFI** (Rust static library) using an **AirTraffic / AFC sandbox-escape style path** over a **local loopback tunnel**, after a **device pairing record** is available.

README claims **iOS 27+** for on-device Settings pairing; `project.yml` sets deployment target **iOS 18.0**. Treat compatibility as **unknown / requires device test** across real OS versions.

---

## 2. License & dependencies

### 2.1 Top-level license

| Component | License | Classification |
|-----------|---------|----------------|
| AirCard-iOS app + rust-core sources | MIT | **reusable with changes** (preserve copyright + LICENSE notices) |
| Binary `AirliftFFI.xcframework` | Not committed. GitHub Actions `macos-14` rebuilds it from vendored MIT `Vendor/airlift-rust` and uploads the artifact. Vendored Rust is the source of truth. | **rebuild-from-source** — keep NOTICE |

The previous committed `ios-arm64/libairlift_ffi.a` (SHA-256 `ff13a64580a6ddb40901b8e242cb41a29d688fbb2330e9d47d05094617003373`) predates `al_exploit_read_file` and is not the binary CI builds.

### 2.2 Key dependencies

| Dependency | Role | License (declared) | Classification |
|------------|------|--------------------|----------------|
| `idevice` (vendored jkcoxson/idevice @ `7bd551c…`) | Lockdown / AFC / RPPairing / RSD | MIT | **reusable with changes** |
| `idevice-ffi` (vendored) | C FFI surface | (follows idevice) | **reusable with changes** |
| `aws-lc` (via idevice features) | TLS crypto | Apache-2.0 / ISC-style (aws-lc) | **licensing concern** — include in third-party notice set |
| Tokio / tracing / plist / zip / sha2 / serde | Rust runtime | Common permissive OSS | **reusable** (enumerate in NOTICE) |
| NeoSpring technique (`RespringHelper`) | Wallpaper respring only | Credit required; not used for Wallet apply | **unnecessary** for Wallet path |
| AirLift research credit (`0xjohnnydev/airlift`) | Exploit lineage | Attribution required | **licensing concern** / product-risk (exploit-based) |

**NAMAT rule:** Any AirCard-derived code ships with MIT notices and a `THIRD_PARTY_NOTICES` file. Do not strip copyright headers.

---

## 3. Build requirements

| Requirement | Detail | Classification |
|-------------|--------|----------------|
| Host | macOS 14+ with Xcode 16+ | **unknown / requires device test** (agent is Linux — cannot build) |
| XcodeGen | `project.yml` → Xcode project | **reusable** |
| Rust | Only if rebuilding `rust-core` / AirliftFFI | **reusable with changes** |
| Scripts | `build-ipa.sh`, `build-ios.sh` | **reusable with changes** |
| Simulator | AirliftFFI is **arm64-only**; x86_64 sim excluded | **security concern** / eng constraint — real device required |
| Distribution | SideStore / AltStore / TrollStore / LiveContainer / manual sign | Product decision for NAMAT |

---

## 4. Architecture map (Wallet-relevant)

```text
SwiftUI UI (AppViewModel / ContentView)
    │
    ├─ PairingController ── al_pairing_run_host (Bonjour RPPairing)
    │                      or import .mobiledevicepairing / .plist
    │
    ├─ NetworkStatus ────── detect utun/ipsec loopback (LocalDevVPN 10.7.0.1 / 127.0.0.1)
    │
    ├─ Card discovery ───── al_syslog_stream_start → regex pass hashes from device syslog
    │
    └─ flashCards() ─────── ImageEngine.prepareAllCardSkins
                           → al_exploit_write_dir into
                             /var/mobile/Library/Passes/Cards/<hash>.pkpass
                           → corrupt FrontFace/Preview/PlaceHolder cache leaves
                             under <hash>.cache / <hash>.pkcache
```

### Pairing flow — **reusable with changes**

- Import pairing file from SideStore / LiveContainer / Jitterbug / Mac lockdown export.
- Or on-device RPPairing host + Settings › Developer Mode PIN (README: iOS 27+).
- Pairing credentials stored in app Documents (`aircard_pairing.plist` / `airlift_pairing.plist`).
- Local Network + Bonjour (`_remotepairing-pairable-host._tcp`) required.

### LocalDevVPN — **reusable with changes** / **unknown / requires device test**

- Expected peer `10.7.0.1` or loopback `127.0.0.1`.
- App deep-links `localdevvpn://`.
- Flash still *attempts* without VPN detection (fallback notice in logs).

### Wallet / Passbook access path — **reusable with changes**

- Target directory: `/var/mobile/Library/Passes/Cards/<cardHash>.pkpass`
- Written assets include:
  - `cardBackgroundCombined@3x.png` (1536×969)
  - `cardBackgroundCombined@2x.png` (1024×646)
  - duplicates as `diffuse` / `background` / `strip`
  - PDF variants for transit passes (`cardBackgroundCombined.pdf`, etc.)
- Cache invalidation by overwriting cache leaf files with the string `corrupted`.

### Artwork apply logic — **reusable with changes**

`AppViewModel.flashCards()` stages skins in a temp dir and calls `al_exploit_write_dir`.  
This is the core NAMAT engine candidate, but must sit behind `WalletSkinEngine`.

### Cache refresh — **reusable with changes**

FrontFace / Preview / PlaceHolder invalidation is best-effort across `.cache` / `.pkcache`.  
User is instructed to force-quit Wallet. Reliability across iOS builds = **unknown / requires device test**.

### Restore / original artwork — **must be rewritten** + **unknown / requires device test**

**Finding:** Audited AirCard-iOS **does not implement restore-to-original** for Wallet cards.

- No backup of pre-apply `cardBackground*` assets was found.
- “Restore” wording in Rust exploit code refers to restoring **Books.plist** after the AirTraffic staging exploit, not Wallet artwork.
- Clearing a custom image in the app only deletes the **app’s** Documents copy, not the system pass artwork.

**NAMAT implication:** Restore must be designed as:

1. Before first Apply: read/copy original artwork bytes from the `.pkpass` bundle (via the same local exploit channel) into an **on-device encrypted/local** backup store.
2. Restore: write backup bytes back + invalidate caches.
3. Never upload originals or card hashes to NAMAT backend.

Until this exists **and** is verified on a supported iPhone, Wallet engine feasibility cannot be marked PASS.

---

## 5. Networking

| Path | Behavior | Classification |
|------|----------|----------------|
| Wallet apply / pairing / syslog | Local loopback / device services only | **reusable with changes** |
| Donation / social `Link`s in UI | Outbound HTTPS to X, GitHub, PayPal | **unnecessary** for NAMAT (remove) |
| Telemetry / analytics SDKs | **None found** in `ios-app` / `rust-core/src` (non-vendor) | Good baseline |
| NAMAT backend calls | None (upstream) | Keep Wallet path offline from NAMAT API |

**Card identifiers:** Pass hashes are stored in `UserDefaults` and shown/logged in UI (`Found card: …`). They do **not** appear to be uploaded remotely in upstream code — but they **must not** be sent to NAMAT servers, analytics, or crash reporters.

---

## 6. Logging / privacy — **security concern**

| Issue | Detail |
|-------|--------|
| Syslog harvesting | Live card detection streams device syslog and regex-extracts pass hashes |
| UI logs | Card hash prefixes / full IDs appear in on-screen logs |
| Rust tracing | Exploit path logs operational detail via callback into UI log arrays |
| Pairing PIN | Shown on device for Settings confirmation (expected) |
| Pairing file | Contains device identity material; must stay on device; treat as sensitive |

NAMAT must:

- Redact Wallet identifiers from any future remote logging.
- Avoid persisting raw syslog lines.
- Keep pairing files out of iCloud/backup if product policy requires (evaluate `NSURLIsExcludedFromBackupKey`).

---

## 7. Features unrelated to NAMAT — **unnecessary**

- Passcode dialer theming + `.passthm` import/export
- PosterBoard `.tendies` injection
- NeoSpring WebKit respring helper
- Donate / credits social links
- Batch “flash every card” UX (optional later; not required for v1)

These should be excluded from the NAMAT iOS product binary to reduce attack surface and review burden.

---

## 8. Component classification matrix

| Component | Classification |
|-----------|----------------|
| MIT license / attribution | **reusable** (mandatory keep) |
| `WalletSkinEngine`-shaped apply pipeline | **reusable with changes** |
| Pairing + LocalDevVPN prerequisites UX | **reusable with changes** |
| Syslog-based card discovery | **reusable with changes** + **security concern** (local-only; redact) |
| AirliftFFI exploit write path | **reusable with changes** + **licensing concern** + product/legal risk (non-App-Store, private API/exploit) |
| Artwork resize (1536×969 family) | **reusable** |
| Restore original | **must be rewritten** |
| Passcode / Tendies / NeoSpring | **unnecessary** |
| Outbound donation links | **unnecessary** |
| Prebuilt binary without macOS rebuild CI | **licensing concern** |
| Real-device Apply success | **unknown / requires device test** |
| Real-device Restore success | **unknown / requires device test** (and currently unimplemented) |
| Supported iOS matrix | **unknown / requires device test** |

---

## 9. Security concerns (NAMAT-specific)

1. **Wallet identifiers leave app memory into logs/UI** — harden before any analytics.
2. **Exploit-based write** — fragile across iOS updates; needs remote kill-switch / compatibility config (server-side capability flags **without** card data).
3. **Pairing credential theft** — if device is unlocked and Files sharing enabled, pairing plist is user-accessible; document threat model.
4. **No restore** — user can brick card art appearance until re-apply/reinstall card; commercial support risk.
5. **Do not send** PAN, CVV, PIN, bank credentials, Apple Pay tokens, or Wallet card hashes/IDs to Backend / AI services.

---

## 10. Feasibility judgment (code-only)

| Question | Answer |
|----------|--------|
| Can Apply be isolated behind an adapter? | Yes — map `flashCards` + AirliftFFI to `WalletSkinEngine.applySkin` |
| Can Restore be shipped from upstream as-is? | **No** — must be designed and implemented |
| Any evidence Wallet data leaves device upstream? | No remote Wallet upload found; local hash logging yes |
| Device-proven on supported iPhone in Phase 0? | **No** (environment blocker) |

**Engine verdict contribution:** cannot unlock Phase 0 **PASS**. See `docs/PHASE_0_RESULT.md`.
