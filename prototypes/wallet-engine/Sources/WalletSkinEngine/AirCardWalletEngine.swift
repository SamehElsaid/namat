import Foundation

/// AirCard-backed adapter behind `WalletSkinEngine`.
///
/// Upstream AirCard-iOS (MIT) provides Apply via Airlift FFI but **does not** implement
/// Wallet artwork Restore. This adapter adds:
/// - on-device `OriginalArtworkVault` backup before first Apply
/// - never overwrite existing original backup
/// - transactional Apply with rollback attempt on failure
/// - Restore from local vault only
///
/// Networking: this adapter must not call NAMAT HTTP APIs.
public actor AirCardWalletEngine: WalletSkinEngine {
    public static let upstreamRepo = "https://github.com/Mak5er/AirCard-iOS"
    public static let auditedRevision = "6342a3455e17ca357da19537d1e44317a3f69f32"
    public static let license = "MIT"

    private let ffi: any AirliftFFIClient
    private let vault: OriginalArtworkVault
    private let logger: SanitizedLogger
    private let iosVersionProvider: @Sendable () -> String

    /// In-memory last-good device asset snapshot for rollback within an Apply call.
    private var lastKnownAssets: [String: [String: Data]] = [:]

    public init(
        ffi: any AirliftFFIClient = AirliftFFIStub(),
        vault: OriginalArtworkVault? = nil,
        logger: SanitizedLogger = SanitizedLogger(),
        iosVersionProvider: @escaping @Sendable () -> String = {
            #if os(iOS)
            return ProcessInfo.processInfo.operatingSystemVersionString
            #else
            return "unknown"
            #endif
        }
    ) async throws {
        self.ffi = ffi
        self.logger = logger
        self.iosVersionProvider = iosVersionProvider
        if let vault {
            self.vault = vault
        } else {
            self.vault = try OriginalArtworkVault(logger: logger)
        }
    }

    // MARK: - Detection helpers

    public func isPairingAvailable() async -> Bool {
        await ffi.hasPairingRecord()
    }

    public func isLocalDevVPNActive() async -> Bool {
        await ffi.isLoopbackTunnelActive()
    }

    public func backupStatus(for card: LocalCard) async -> ArtworkBackupStatus {
        await vault.status(forLocalKey: card.localKey)
    }

    public func checkCompatibility() async -> CompatibilityResult {
        let pairing = await isPairingAvailable()
        let vpn = await isLocalDevVPNActive()
        var notes: [String] = [
            "AirCard adapter — real Apply/Restore requires linked AirliftFFI + device.",
            "Upstream audited @ \(Self.auditedRevision)."
        ]
        if !pairing { notes.append("Pairing record missing.") }
        notes.append("Setup completes only after an authenticated engine connection.")

        let linked = !(ffi is AirliftFFIStub)
        if !linked { notes.append("AirliftFFI.xcframework is not linked. Apply cannot run.") }

        return CompatibilityResult(
            isSupported: false,
            iosVersion: iosVersionProvider(),
            notes: notes,
            requiresLocalDevVPN: true,
            requiresPairingRecord: true,
            pairingAvailable: pairing,
            localDevVPNActive: vpn
        )
    }

    public func discoverCards() async throws -> [LocalCard] {
        let compat = await checkCompatibility()
        guard compat.pairingAvailable else { throw WalletEngineError.pairingRequired() }
        // VPN soft-gate: discover may still work on some devices; product can require VPN.
        let hashes = try await ffi.discoverCardHashesFromSyslog()
        return hashes.enumerated().map { index, hash in
            LocalCard(
                localKey: hash,
                displayLabel: "Card \(index + 1)"
            )
        }
    }

    public func applySkin(card: LocalCard, artwork: SkinArtwork) async throws {
        guard artwork.isValid else { throw WalletEngineError.artworkInvalid() }
        let pairing = await isPairingAvailable()
        guard pairing else { throw WalletEngineError.pairingRequired() }
        let vpn = await isLocalDevVPNActive()
        guard vpn else { throw WalletEngineError.vpnRequired() }

        let fp = SanitizedLogger.fingerprint(card.localKey)
        logger.info("AirCard apply begin \(fp)")

        let preApply: [String: Data]
        do {
            let current = try await ffi.readPassAssets(localKey: card.localKey)
            preApply = current.files
            guard !preApply.isEmpty else {
                throw WalletEngineError.applyFailed(detail: "could not read current artwork")
            }
            try PassAssetSignatures.validateBackup(preApply)
            let stagedNames = Set(PassAssetSet.requiredNames)
            guard stagedNames.isSubset(of: Set(preApply.keys)) else {
                throw WalletEngineError.backupFailed(detail: "apply would write a leaf that was not backed up")
            }
            lastKnownAssets[card.localKey] = preApply
        } catch let error as WalletEngineError {
            throw error
        } catch {
            throw WalletEngineError.applyFailed(detail: "could not read current artwork")
        }

        let staging = FileManager.default.temporaryDirectory
            .appendingPathComponent("namat-stage-\(UUID().uuidString)", isDirectory: true)

        do {
            try await vault.storeOriginalSetIfAbsent(localKey: card.localKey, files: preApply)
            let status = await vault.status(forLocalKey: card.localKey)
            guard case .present(_, true) = status else {
                throw WalletEngineError.backupVerifyFailed()
            }

            let variants = try ArtworkPreparer.prepare(png: artwork.pngData)
            let expected: [String: Data] = [
                PassAssetSet.combined3x: variants.x3,
                PassAssetSet.combined2x: variants.x2,
            ]
            try stage(files: expected, at: staging)
            if variants.x3 == artwork.pngData && variants.x3 == variants.x2 {
                throw WalletEngineError.artworkInvalid()
            }

            try await ffi.writePassDirectory(localKey: card.localKey, stagedDirectory: staging)
            try await ffi.invalidatePassCaches(localKey: card.localKey)

            let written = try await ffi.readPassAssets(localKey: card.localKey)
            if written.file(PassAssetSet.combined3x) != variants.x3
                || written.file(PassAssetSet.combined2x) != variants.x2 {
                throw WalletEngineError.applyFailed(detail: "post-write verification mismatch")
            }

            logger.info("AirCard apply success \(fp)")
        } catch {
            logger.error("AirCard apply failed \(fp); attempting rollback")
            await rollback(card: card, preApply: preApply, staging: staging)
            if let engineError = error as? WalletEngineError {
                throw engineError
            }
            throw WalletEngineError.applyFailed(detail: String(describing: error))
        }

        try? FileManager.default.removeItem(at: staging)
    }

    public func beginInAppSetup(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> InAppSetupOutcome {
        let path = try await ffi.runInAppPairingHost(onPin: onPin, shouldCancel: shouldCancel)
        PairingMaterial.protect(at: path)
        if shouldCancel() {
            return .cancelled
        }
        return await outcome(for: path, shouldCancel: shouldCancel)
    }

    public func verifyDeviceSetup(
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification {
        if shouldCancel() { return .cancelled }
        switch PairingFiles.classify() {
        case .missing:
            return .notStarted
        case .invalid:
            return .invalidMaterial
        case .valid(let path):
            return await ffi.probeAuthenticatedConnection(pairingPath: path, shouldCancel: shouldCancel)
        }
    }

    private func outcome(
        for path: String,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> InAppSetupOutcome {
        guard PairingMaterial.isUsableFile(at: path) else { return .invalidMaterial }
        let verification = await ffi.probeAuthenticatedConnection(
            pairingPath: path,
            shouldCancel: shouldCancel
        )
        switch verification {
        case .verified: return .verified
        case .invalidMaterial, .notStarted: return .invalidMaterial
        case .connectionUnavailable: return .connectionUnavailable
        case .timedOut: return .timedOut
        case .cancelled: return .cancelled
        }
    }

    public func restoreOriginal(card: LocalCard) async throws {
        let pairing = await isPairingAvailable()
        guard pairing else { throw WalletEngineError.pairingRequired() }
        let vpn = await isLocalDevVPNActive()
        guard vpn else { throw WalletEngineError.vpnRequired() }

        let fp = SanitizedLogger.fingerprint(card.localKey)
        let original: [String: Data]
        do {
            original = try await vault.loadOriginalSet(localKey: card.localKey)
        } catch let error as WalletEngineError {
            throw error
        } catch {
            throw WalletEngineError.restoreFailed(detail: String(describing: error))
        }

        let staging = FileManager.default.temporaryDirectory
            .appendingPathComponent("namat-restore-\(UUID().uuidString)", isDirectory: true)
        do {
            try stage(files: original, at: staging)
            try await ffi.writePassDirectory(localKey: card.localKey, stagedDirectory: staging)
            try await ffi.invalidatePassCaches(localKey: card.localKey)
            let written = try await ffi.readPassAssets(localKey: card.localKey)
            if written.files != original {
                throw WalletEngineError.restoreFailed(detail: "restored asset set did not match the vault")
            }
            logger.info("AirCard restore success \(fp)")
        } catch let error as WalletEngineError {
            throw error
        } catch {
            throw WalletEngineError.restoreFailed(detail: String(describing: error))
        }
        try? FileManager.default.removeItem(at: staging)
    }

    private func stage(files: [String: Data], at directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for (name, bytes) in files {
            try bytes.write(to: directory.appendingPathComponent(name), options: .atomic)
        }
    }

    private func rollback(card: LocalCard, preApply: [String: Data], staging: URL) async {
        try? FileManager.default.removeItem(at: staging)
        let rollbackDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("namat-rollback-\(UUID().uuidString)", isDirectory: true)
        do {
            try stage(files: preApply, at: rollbackDir)
            try await ffi.writePassDirectory(localKey: card.localKey, stagedDirectory: rollbackDir)
            try await ffi.invalidatePassCaches(localKey: card.localKey)
            try? FileManager.default.removeItem(at: rollbackDir)
        } catch {
            logger.error(
                "rollback failed \(SanitizedLogger.fingerprint(card.localKey)): \(error.localizedDescription)"
            )
        }
    }
}

/// Documentation-level mapping retained for audits (Phase 0 sketch successor).
public enum AirCardAdapterNotes {
    public static let missingUpstreamCapabilities: [String] = [
        "Wallet artwork restore/original backup — implemented in NAMAT OriginalArtworkVault",
        "NAMAT-safe redacted logging — SanitizedLogger",
        "Removal of passcode/tendies/donation surfaces — product app scope"
    ]
}
