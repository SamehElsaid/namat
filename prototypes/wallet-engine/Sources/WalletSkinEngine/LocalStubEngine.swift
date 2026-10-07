import Foundation

/// Offline stub used to unit-test product flows without device I/O or networking.
/// Implements transactional Apply + Restore with an on-device `OriginalArtworkVault`.
public actor LocalStubEngine: WalletSkinEngine {
    public struct Config: Sendable {
        public var cards: [LocalCard]
        public var supported: Bool
        public var pairingAvailable: Bool
        public var localDevVPNActive: Bool
        /// When true, apply fails after backup (exercises rollback).
        public var failAfterBackup: Bool
        /// When true, apply fails during write (exercises rollback).
        public var failDuringWrite: Bool
        /// When true, verification after write fails (exercises rollback).
        public var failVerification: Bool
        /// Seed pre-existing "on-device" artwork for cards (simulates pass bundle contents).
        public var seedArtwork: [String: Data]
        public var scriptedSetup: [InAppSetupOutcome]
        public var setupVerification: SetupVerification
        public var waitsForCancellation: Bool

        public init(
            cards: [LocalCard] = [
                LocalCard(localKey: "stub-card-aaaaaaaaaaaaaaaaaaaa", displayLabel: "Stub Card A"),
                LocalCard(localKey: "stub-card-bbbbbbbbbbbbbbbbbbbb", displayLabel: "Stub Card B")
            ],
            supported: Bool = true,
            pairingAvailable: Bool = true,
            localDevVPNActive: Bool = true,
            failAfterBackup: Bool = false,
            failDuringWrite: Bool = false,
            failVerification: Bool = false,
            seedArtwork: [String: Data] = [:],
            scriptedSetup: [InAppSetupOutcome] = [],
            setupVerification: SetupVerification = .notStarted,
            waitsForCancellation: Bool = false
        ) {
            self.cards = cards
            self.supported = supported
            self.pairingAvailable = pairingAvailable
            self.localDevVPNActive = localDevVPNActive
            self.failAfterBackup = failAfterBackup
            self.failDuringWrite = failDuringWrite
            self.failVerification = failVerification
            self.seedArtwork = seedArtwork
            self.scriptedSetup = scriptedSetup
            self.setupVerification = setupVerification
            self.waitsForCancellation = waitsForCancellation
        }
    }

    private var cards: [LocalCard]
    /// Current on-device artwork state (simulates .pkpass bundle contents).
    private var deviceArtwork: [String: Data]
    /// Simulated cache corruption flags.
    private var cacheInvalidated: [String: Bool] = [:]
    private let supported: Bool
    private var pairingAvailable: Bool
    private var localDevVPNActive: Bool
    private var failAfterBackup: Bool
    private var failDuringWrite: Bool
    private var failVerification: Bool
    private var scriptedSetup: [InAppSetupOutcome]
    private var setupVerification: SetupVerification
    private var waitsForCancellation: Bool
    private let vault: OriginalArtworkVault
    private let logger: SanitizedLogger

    public init(
        config: Config = Config(),
        vault: OriginalArtworkVault? = nil,
        logger: SanitizedLogger = SanitizedLogger()
    ) async throws {
        self.cards = config.cards
        self.supported = config.supported
        self.pairingAvailable = config.pairingAvailable
        self.localDevVPNActive = config.localDevVPNActive
        self.failAfterBackup = config.failAfterBackup
        self.failDuringWrite = config.failDuringWrite
        self.failVerification = config.failVerification
        self.scriptedSetup = config.scriptedSetup
        self.setupVerification = config.setupVerification
        self.waitsForCancellation = config.waitsForCancellation
        self.logger = logger

        var seeded: [String: Data] = [:]
        for card in config.cards {
            if let custom = config.seedArtwork[card.localKey] {
                seeded[card.localKey] = custom
            } else {
                seeded[card.localKey] = Data("ORIGINAL:\(card.localKey)".utf8)
            }
        }
        self.deviceArtwork = seeded

        if let vault {
            self.vault = vault
        } else {
            let dir = FileManager.default.temporaryDirectory
                .appendingPathComponent("NAMATStubVault-\(UUID().uuidString)", isDirectory: true)
            self.vault = try OriginalArtworkVault(
                rootDirectory: dir,
                logger: logger,
                useKeychain: false
            )
        }
    }

    /// Convenience for simple tests.
    public init(
        cards: [LocalCard] = [
            LocalCard(localKey: "stub-card-aaaaaaaaaaaaaaaaaaaa", displayLabel: "Stub Card A"),
            LocalCard(localKey: "stub-card-bbbbbbbbbbbbbbbbbbbb", displayLabel: "Stub Card B")
        ],
        supported: Bool = true
    ) async throws {
        try await self.init(config: Config(cards: cards, supported: supported))
    }

    // MARK: - WalletSkinEngine

    public func checkCompatibility() async -> CompatibilityResult {
        let pairing = pairingAvailable
        let vpn = localDevVPNActive
        return CompatibilityResult(
            isSupported: supported,
            iosVersion: "stub",
            notes: supported
                ? ["Stub engine only — not a device proof."]
                : ["Stub configured as unsupported."],
            requiresLocalDevVPN: true,
            requiresPairingRecord: true,
            pairingAvailable: pairing,
            localDevVPNActive: vpn
        )
    }

    public func isPairingAvailable() async -> Bool { pairingAvailable }

    public func isLocalDevVPNActive() async -> Bool { localDevVPNActive }

    public func backupStatus(for card: LocalCard) async -> ArtworkBackupStatus {
        await vault.status(forLocalKey: card.localKey)
    }

    public func discoverCards() async throws -> [LocalCard] {
        let compat = await checkCompatibility()
        guard compat.isSupported else { throw WalletEngineError.incompatibleDevice() }
        return cards
    }

    /// Transactional apply:
    /// 1. Capture pre-apply snapshot for rollback
    /// 2. Backup original if absent (never overwrite existing backup)
    /// 3. Verify backup
    /// 4. Write artwork variants
    /// 5. Invalidate caches
    /// 6. Verify write
    /// On any failure after mutation: attempt rollback to pre-apply state.
    public func applySkin(card: LocalCard, artwork: SkinArtwork) async throws {
        guard cards.contains(where: { $0.localKey == card.localKey }) else {
            throw WalletEngineError.cardNotFound()
        }
        guard artwork.isValid else {
            throw WalletEngineError.artworkInvalid()
        }

        let fp = SanitizedLogger.fingerprint(card.localKey)
        logger.info("apply begin \(fp)")

        // Pre-apply snapshot for transactional rollback
        let preApply = deviceArtwork[card.localKey]
        let preCache = cacheInvalidated[card.localKey] ?? false

        do {
            // 1–2. Backup original if needed (from current device bytes before overwrite)
            let current = deviceArtwork[card.localKey]
                ?? Data("ORIGINAL:\(card.localKey)".utf8)
            try await vault.storeOriginalIfAbsent(localKey: card.localKey, bytes: current)

            // 3. Verify backup before overwrite
            let status = await vault.status(forLocalKey: card.localKey)
            guard case .present(_, true) = status else {
                throw WalletEngineError.backupVerifyFailed()
            }

            if failAfterBackup {
                throw WalletEngineError.applyFailed(detail: "injected failAfterBackup")
            }

            // 4. Write artwork variants (stub: single payload + size markers)
            if failDuringWrite {
                throw WalletEngineError.applyFailed(detail: "injected failDuringWrite")
            }
            let variant3x = artwork.pngData
            let variant2x = Data(artwork.pngData.prefix(max(1, artwork.pngData.count / 2)))
            _ = variant2x // simulates writing @2x sibling
            deviceArtwork[card.localKey] = variant3x

            // 5. Invalidate caches
            cacheInvalidated[card.localKey] = true

            // 6. Verify
            if failVerification || deviceArtwork[card.localKey] != artwork.pngData {
                throw WalletEngineError.applyFailed(detail: "post-write verification failed")
            }

            logger.info("apply success \(fp)")
        } catch {
            logger.error("apply failed \(fp); attempting rollback")
            // Rollback to pre-apply state
            deviceArtwork[card.localKey] = preApply
            cacheInvalidated[card.localKey] = preCache
            if let preApply, deviceArtwork[card.localKey] != preApply {
                throw WalletEngineError.rollbackFailed(detail: "could not restore pre-apply artwork")
            }
            if let engineError = error as? WalletEngineError {
                throw engineError
            }
            throw WalletEngineError.applyFailed(detail: String(describing: error))
        }
    }

    public func beginInAppSetup(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> InAppSetupOutcome {
        _ = onPin
        if waitsForCancellation {
            while !shouldCancel() {
                try await Task.sleep(nanoseconds: 20_000_000)
            }
            setupVerification = .cancelled
            throw WalletEngineError.cancelled()
        }
        if shouldCancel() {
            setupVerification = .cancelled
            throw WalletEngineError.cancelled()
        }
        if !scriptedSetup.isEmpty {
            let outcome = scriptedSetup.removeFirst()
            setupVerification = Self.verification(for: outcome)
            return outcome
        }
        throw WalletEngineError.ffiUnavailable()
    }

    public func verifyDeviceSetup(
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification {
        if shouldCancel() { return .cancelled }
        return setupVerification
    }

    private static func verification(for outcome: InAppSetupOutcome) -> SetupVerification {
        switch outcome {
        case .verified: return .verified
        case .invalidMaterial: return .invalidMaterial
        case .connectionUnavailable: return .connectionUnavailable
        case .timedOut: return .timedOut
        case .cancelled: return .cancelled
        }
    }

    public func restoreOriginal(card: LocalCard) async throws {
        guard cards.contains(where: { $0.localKey == card.localKey }) else {
            throw WalletEngineError.cardNotFound()
        }
        let fp = SanitizedLogger.fingerprint(card.localKey)
        do {
            let original = try await vault.loadOriginal(localKey: card.localKey)
            deviceArtwork[card.localKey] = original
            cacheInvalidated[card.localKey] = true
            guard deviceArtwork[card.localKey] == original else {
                throw WalletEngineError.restoreFailed(detail: "verify after restore failed")
            }
            logger.info("restore success \(fp)")
        } catch let error as WalletEngineError {
            throw error
        } catch {
            throw WalletEngineError.restoreFailed(detail: String(describing: error))
        }
    }

    // MARK: - Test helpers (not part of production protocol)

    public func currentArtwork(for card: LocalCard) -> Data? {
        deviceArtwork[card.localKey]
    }

    public func isCacheInvalidated(for card: LocalCard) -> Bool {
        cacheInvalidated[card.localKey] ?? false
    }

    public func setPairingAvailable(_ value: Bool) {
        pairingAvailable = value
    }

    public func setLocalDevVPNActive(_ value: Bool) {
        localDevVPNActive = value
    }

    public func setFailAfterBackup(_ value: Bool) {
        failAfterBackup = value
    }

    public func setFailDuringWrite(_ value: Bool) {
        failDuringWrite = value
    }

    public func setFailVerification(_ value: Bool) {
        failVerification = value
    }
}
