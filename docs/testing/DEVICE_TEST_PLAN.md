# NAMAT — Real iPhone Device Test Plan

**Status:** PHYSICAL DEVICE REQUIRED — **NOT PASSED**. No signed Release build has been installed on a physical iPhone in this remediation.  
**Purpose:** Exact owner/operator checklist to prove Wallet Apply → Apply → Restore on a supported iPhone.  
**Do not** mark device validation PASS until every Required row below is executed on a physical device and evidence is attached.

---

## Distinction

| Category | Meaning |
|----------|---------|
| **Executed (agent/server)** | Done during production activation from Linux agents / origin host. Does **not** prove Wallet Apply/Restore. |
| **Device-required** | Must run on a real supported iPhone with a signed IPA. Until done, Wallet production readiness remains **incomplete**. |

---

## Executed elsewhere (not device proof)

These were verified on origin / public HTTPS during activation and are **not** substitutes for device tests:

- Public DNS A for `namat.shara.sa` / `admin.namat.shara.sa`
- TLS + HTTP→HTTPS redirects
- `GET /health`, `GET /ready`, skins manifest, admin login page
- API privacy guard unit tests (forbidden Wallet fields)
- NearPay **mock** checkout path (not live money)
- AI **mock** provider (no Wallet fields in AI interface)

---

## Device-required matrix

| # | Test | Pass criteria | Evidence to attach | Status |
|---|------|---------------|--------------------|--------|
| D1 | Install signed NAMAT IPA on supported iPhone | App launches; API base `https://namat.shara.sa/api/v1` reachable | Screenshot of home + build/version | **NOT RUN** |
| D2 | OTP login (after SMTP configured) | Receives email OTP; session established | Redacted screenshot (no full OTP in docs) | **NOT RUN** (blocked on SMTP owner config + device) |
| D3 | Purchase / entitlement (NearPay sandbox or mock disclosure) | Entitlement active in Account | Screenshot Account entitlement | **NOT RUN** |
| D4 | Register device (≤2) | Device appears; 3rd install rejected | Screenshots | **NOT RUN** |
| D5 | **Apply Skin A** | Wallet shows Skin A artwork; on-device backup of original created | Before/after photos of Wallet card | **NOT RUN** — **required for Wallet PASS** |
| D6 | **Apply Skin B** (without Restore) | Skin B applied; Skin A backup chain preserved per engine rules | Photos + note that original backup still present | **NOT RUN** — **required** |
| D7 | **Restore true original** | Wallet card restored to pre-NAMAT original artwork | Photo matching pre-Apply original | **NOT RUN** — **required** |
| D8 | Kill switch | With `killSwitchApply=true`, Apply disabled in app; Restore policy as configured | Admin toggle + app screenshot | **NOT RUN** |
| D9 | Network privacy | Capture (Charles/Proxyman/Wireshark): **no** PAN, CVV, PIN, `walletLocalKey`, pass hashes, Apple Pay tokens to NAMAT hosts | Redacted HAR or filter log summary | **NOT RUN** — **required** |
| D10 | Offline Apply/Restore | Apply/Restore work without NAMAT API for local engine paths (entitlement may be cached per app design) | Note + screenshots | **NOT RUN** |
| D11 | Unsupported device messaging | Unsupported model/OS shows compatibility message; no crash | Screenshot | **NOT RUN** |

---

## macOS / Xcode build (required before any device row)

1. On a Mac with Xcode, open the iOS package and build **Release**.
2. Confirm the binary uses `WalletEngineFactory.makeForCurrentBuild()` and that Release is not compiled with `DEBUG`, so `LocalStubEngine` is not instantiated.
3. Link the `AirliftFFI.xcframework` that CI builds from `prototypes/wallet-engine/Vendor/airlift-rust`. Do not substitute the older pre-read binary.
4. Sign with the Apple team, install on a compatible iPhone, and only then execute D1–D11.
5. Capture the network path and confirm no Wallet identifier leaves the phone.

Release engine verification, signing, pairing, LocalDevVPN, card discovery, original backup, Skin A, Skin B, Restore of the true original, force-quit persistence, kill-switch Apply, Restore policy, unsupported OS, and network capture remain **NOT PASSED**.

## Exact Apply → Apply → Restore procedure (owner)

1. Photograph the **current** Apple Wallet card face (true original).
2. Open NAMAT → ensure entitlement + device registered.
3. Apply **Skin A** → confirm Wallet updates → photograph.
4. Apply **Skin B** → confirm Wallet updates → photograph. Confirm original backup still held on-device (engine local vault).
5. Tap **Restore** → confirm Wallet matches step-1 original → photograph.
6. Repeat once after app force-quit to confirm persistence of backup vault.

---

## Compatibility targets

Use the matrix in `docs/COMPATIBILITY.md`. Record exact:

- iPhone model
- iOS version
- NAMAT app version / build
- Whether AirCard/Airlift path or stub path was used (engine adapter)

---

## Sign-off template (fill only after device run)

```text
Tester:
Device:
iOS:
App build:
D5 Apply A: PASS/FAIL — evidence:
D6 Apply B: PASS/FAIL — evidence:
D7 Restore: PASS/FAIL — evidence:
D9 Network privacy: PASS/FAIL — evidence:
Overall device validation: NOT PASSED | PASSED
Date:
```

**Current overall device validation: NOT PASSED.**
