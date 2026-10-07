# WalletSkinEngine Prototype

Isolated on-device Wallet artwork engine harness for NAMAT.

## Goals

- Discover supported Wallet cards **locally**
- Backup original artwork on-device before first Apply
- Apply skin (transactional) + invalidate caches
- Restore true original artwork
- Emit explicit error codes
- Never upload Wallet identifiers

## Hard rules

- Never transmit card numbers, CVV, PIN, Apple Pay tokens, or Wallet identifiers to any NAMAT backend.
- No NAMAT networking in this package.
- AirCard-derived implementation details stay behind `WalletSkinEngine` / `AirCardWalletEngine`.

## Status (Phase 1)

| Capability | Status |
|------------|--------|
| Protocol + models + error codes | Implemented |
| Pairing / LocalDevVPN helpers | Implemented on protocol |
| Backup status query | Implemented |
| `OriginalArtworkVault` (local, first-write-wins) | Implemented |
| Sanitized logger (redacts localKey) | Implemented |
| LocalStubEngine transactional Apply + Restore | Implemented |
| `AirCardWalletEngine` + Airlift FFI stubs | Structure + stubs (real FFI not linked here) |
| Apply + Restore on real iPhone | **BLOCKED** — needs macOS/Xcode + supported device |

## Layout

```text
prototypes/wallet-engine/
  Package.swift
  README.md
  THIRD_PARTY_NOTICES
  Sources/WalletSkinEngine/
    WalletSkinEngine.swift       # protocol + models + errors
    OriginalArtworkVault.swift   # on-device original artwork store
    SanitizedLogger.swift
    NAMATDigest.swift
    LocalStubEngine.swift        # offline transactional stub
    AirliftFFIClient.swift       # FFI protocol + stub
    AirCardWalletEngine.swift    # AirCard-backed adapter
  Tests/WalletSkinEngineTests/
    WalletSkinEngineTests.swift
```

## Protocol

```swift
public protocol WalletSkinEngine: Sendable {
    func checkCompatibility() async -> CompatibilityResult
    func isPairingAvailable() async -> Bool
    func isLocalDevVPNActive() async -> Bool
    func backupStatus(for card: LocalCard) async -> ArtworkBackupStatus
    func discoverCards() async throws -> [LocalCard]
    func applySkin(card: LocalCard, artwork: SkinArtwork) async throws
    func restoreOriginal(card: LocalCard) async throws
}
```

### Transactional Apply

1. Capture pre-apply artwork (rollback snapshot)
2. Backup original if absent (vault never overwrites)
3. Verify backup
4. Write artwork variants
5. Invalidate caches
6. Verify write  
On failure → attempt rollback to pre-apply state.

### Restore

Reads **only** from `OriginalArtworkVault` (local). Upstream AirCard has no Restore — this is NAMAT-owned.

## How to run tests (macOS)

```bash
cd prototypes/wallet-engine
swift test
```

Linux agents: install a Swift toolchain then `swift test`, or document **NOT RUN**.

## Device verification checklist (required for PASS)

1. Sideload a NAMAT build that wires real AirliftFFI (not stubs).
2. Pair + LocalDevVPN as documented in `docs/audit/AIRCARD_AUDIT.md`.
3. Discover a real card hash locally.
4. Confirm vault backup before first Apply.
5. Apply Skin A → Skin B → Restore → confirm true original.
6. Confirm no Wallet identifiers in network captures to NAMAT hosts.

**Apply + Restore device proof remains BLOCKED without a real iPhone.**
