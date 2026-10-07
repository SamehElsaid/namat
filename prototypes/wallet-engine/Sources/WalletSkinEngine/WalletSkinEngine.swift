import Foundation

// MARK: - Public models

/// Local-only card handle. The `localKey` is an opaque on-device identifier
/// (e.g. Pass hash). It must never be uploaded to NAMAT servers.
public struct LocalCard: Identifiable, Hashable, Sendable {
    public let id: String
    /// Opaque local key (Pass directory / hash). Treat as sensitive.
    public let localKey: String
    public let displayLabel: String

    public init(id: String = UUID().uuidString, localKey: String, displayLabel: String) {
        self.id = id
        self.localKey = localKey
        self.displayLabel = displayLabel
    }
}

public struct SkinArtwork: Sendable {
    public let pngData: Data
    public let pixelWidth: Int
    public let pixelHeight: Int

    public init(pngData: Data, pixelWidth: Int = 1536, pixelHeight: Int = 969) {
        self.pngData = pngData
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
    }

    public var isValid: Bool {
        !pngData.isEmpty && pixelWidth > 0 && pixelHeight > 0
    }
}

public struct CompatibilityResult: Sendable {
    public let isSupported: Bool
    public let iosVersion: String
    public let notes: [String]
    public let requiresLocalDevVPN: Bool
    public let requiresPairingRecord: Bool
    public let pairingAvailable: Bool
    public let localDevVPNActive: Bool

    public init(
        isSupported: Bool,
        iosVersion: String,
        notes: [String],
        requiresLocalDevVPN: Bool,
        requiresPairingRecord: Bool,
        pairingAvailable: Bool = false,
        localDevVPNActive: Bool = false
    ) {
        self.isSupported = isSupported
        self.iosVersion = iosVersion
        self.notes = notes
        self.requiresLocalDevVPN = requiresLocalDevVPN
        self.requiresPairingRecord = requiresPairingRecord
        self.pairingAvailable = pairingAvailable
        self.localDevVPNActive = localDevVPNActive
    }
}

/// Status of on-device original artwork backup for a local card key.
public enum ArtworkBackupStatus: Sendable, Equatable {
    case none
    case present(byteCount: Int, verified: Bool)

    public var hasBackup: Bool {
        if case .present = self { return true }
        return false
    }
}

// MARK: - Errors

public enum WalletEngineError: Error, Equatable, Sendable {
    case incompatibleDevice(code: String = "NAMAT_WALLET_INCOMPATIBLE")
    case pairingRequired(code: String = "NAMAT_WALLET_PAIRING_REQUIRED")
    case vpnRequired(code: String = "NAMAT_WALLET_VPN_REQUIRED")
    case cardNotFound(code: String = "NAMAT_WALLET_CARD_NOT_FOUND")
    case artworkInvalid(code: String = "NAMAT_WALLET_ARTWORK_INVALID")
    case applyFailed(code: String = "NAMAT_WALLET_APPLY_FAILED", detail: String)
    case restoreFailed(code: String = "NAMAT_WALLET_RESTORE_FAILED", detail: String)
    case backupMissing(code: String = "NAMAT_WALLET_BACKUP_MISSING")
    case backupFailed(code: String = "NAMAT_WALLET_BACKUP_FAILED", detail: String)
    case backupVerifyFailed(code: String = "NAMAT_WALLET_BACKUP_VERIFY_FAILED")
    case rollbackFailed(code: String = "NAMAT_WALLET_ROLLBACK_FAILED", detail: String)
    case cancelled(code: String = "NAMAT_WALLET_CANCELLED")
    case ffiUnavailable(code: String = "NAMAT_WALLET_FFI_UNAVAILABLE")
    /// Audited AirliftFFI has no artwork-read symbol. This is a hard blocker, not a stub success.
    case ffiReadUnavailable(code: String = "NAMAT_WALLET_FFI_READ_BLOCKED", detail: String)

    public var code: String {
        switch self {
        case .incompatibleDevice(let code): return code
        case .pairingRequired(let code): return code
        case .vpnRequired(let code): return code
        case .cardNotFound(let code): return code
        case .artworkInvalid(let code): return code
        case .applyFailed(let code, _): return code
        case .restoreFailed(let code, _): return code
        case .backupMissing(let code): return code
        case .backupFailed(let code, _): return code
        case .backupVerifyFailed(let code): return code
        case .rollbackFailed(let code, _): return code
        case .cancelled(let code): return code
        case .ffiUnavailable(let code): return code
        case .ffiReadUnavailable(let code, _): return code
        }
    }
}

/// Result of an in-app pairing attempt.
/// `.verified` requires parser-valid pairing material and an authenticated engine connection.
public enum InAppSetupOutcome: Sendable, Equatable {
    case verified
    case invalidMaterial
    case connectionUnavailable
    case timedOut
    case cancelled
}

/// What a bounded setup check found. File size and VPN presence are not verdicts.
public enum SetupVerification: Sendable, Equatable {
    case verified
    case invalidMaterial
    case connectionUnavailable
    case timedOut
    case cancelled
    case notStarted
}

public enum SetupPhase: Sendable, Equatable {
    case idle
    case running
    case verified
    case needsConnection
    case failed
    case timedOut
    case cancelled
    case invalidMaterial
}

public enum SetupCancelReason: Sendable, Equatable {
    case none
    case user
    case timeout
}

public enum SetupEvent: Sendable, Equatable {
    case refresh(SetupVerification)
    case outcome(InAppSetupOutcome)
    case failed(SetupCancelReason)
    case retry
}

public enum SetupSession {
    public static func reduce(phase: SetupPhase, event: SetupEvent) -> SetupPhase {
        switch event {
        case .retry:
            return .running
        case .outcome(let outcome):
            switch outcome {
            case .verified: return .verified
            case .invalidMaterial: return .invalidMaterial
            case .connectionUnavailable: return .needsConnection
            case .timedOut: return .timedOut
            case .cancelled: return .cancelled
            }
        case .failed(let reason):
            switch reason {
            case .timeout: return .timedOut
            case .user: return .cancelled
            case .none: return .failed
            }
        case .refresh(let verification):
            if phase == .running { return phase }
            switch verification {
            case .verified: return .verified
            case .invalidMaterial: return .invalidMaterial
            case .connectionUnavailable: return .needsConnection
            case .timedOut: return .timedOut
            case .cancelled: return .cancelled
            case .notStarted:
                return phase == .verified ? .idle : phase
            }
        }
    }

    public static func opensMyCards(_ phase: SetupPhase) -> Bool {
        phase == .verified
    }
}

/// Wallet pass files that belong to one original or applied state.
public struct PassAssetSet: Sendable, Equatable {
    public static let combined3x = "cardBackgroundCombined@3x.png"
    public static let combined2x = "cardBackgroundCombined@2x.png"
    /// Both scales are captured before Apply and restored as the original bytes.
    /// NAMAT does not rebuild one scale from the other.
    public static let requiredNames = [combined3x, combined2x]
    /// AirCard-iOS `ImageEngine.prepareAllCardSkins` at 6342a345, plus the desktop
    /// combined assets. Apply writes only `requiredNames`. The other leaves are
    /// not export-moved: a missing file cannot be probed without a move.
    public static let imageEngineSuite = [
        "cardBackgroundCombined@3x.png",
        "diffuse@3x.png",
        "background@3x.png",
        "strip@3x.png",
        "cardBackgroundCombined@2x.png",
        "diffuse@2x.png",
        "background@2x.png",
        "strip@2x.png",
        "cardBackgroundCombined.pdf",
        "background.pdf",
        "strip.pdf",
    ]

    public var files: [String: Data]

    public init(files: [String: Data]) {
        self.files = files
    }

    public func file(_ name: String) -> Data? {
        files[name]
    }
}

/// PNG and PDF checks for a captured original set. Invalid bytes are not stored.
public enum PassAssetSignatures {
    public static func isPNG(_ data: Data) -> Bool {
        data.count >= 8 && data.starts(with: Data([0x89, 0x50, 0x4E, 0x47]))
    }

    public static func isPDF(_ data: Data) -> Bool {
        data.starts(with: Data("%PDF".utf8))
    }

    public static func validateBackup(_ files: [String: Data]) throws {
        for name in PassAssetSet.requiredNames {
            guard let data = files[name], isPNG(data) else {
                throw WalletEngineError.backupFailed(detail: "required artwork \(name) is missing or not a PNG")
            }
        }
        for (name, data) in files {
            if data.isEmpty {
                throw WalletEngineError.backupFailed(detail: "\(name) is empty")
            }
            if name.hasSuffix(".png"), !isPNG(data) {
                throw WalletEngineError.backupFailed(detail: "\(name) is not a PNG")
            }
            if name.hasSuffix(".pdf"), !isPDF(data) {
                throw WalletEngineError.backupFailed(detail: "\(name) is not a PDF")
            }
        }
    }
}

// MARK: - Engine boundary

/// All AirCard / Airlift details must remain behind this protocol.
///
/// Privacy: implementations must never upload PAN/CVV/PIN/Apple Pay tokens,
/// Wallet identifiers, or `LocalCard.localKey` to NAMAT APIs, analytics, or AI.
public protocol WalletSkinEngine: Sendable {
    func checkCompatibility() async -> CompatibilityResult
    /// Whether a local pairing record is present (device-only check).
    func isPairingAvailable() async -> Bool
    /// Whether LocalDevVPN / loopback tunnel appears active (device-only check).
    func isLocalDevVPNActive() async -> Bool
    /// Query on-device original artwork backup status for a card.
    func backupStatus(for card: LocalCard) async -> ArtworkBackupStatus
    func discoverCards() async throws -> [LocalCard]
    /// Transactional apply: backup (if needed) → write variants → invalidate caches → verify.
    /// On failure, attempts rollback to pre-apply state.
    func applySkin(card: LocalCard, artwork: SkinArtwork) async throws
    /// Writes true original artwork from on-device vault; never from network.
    func restoreOriginal(card: LocalCard) async throws
    /// Runs the local pairing host. Pairing material stays on device.
    /// `onPin` receives a copy of a code if the protocol issues one.
    /// `shouldCancel` is polled so the blocked host can be released.
    func beginInAppSetup(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> InAppSetupOutcome
    /// Parser-valid pairing material plus a bounded authenticated engine connection.
    /// A VPN interface or a non-empty file is not enough.
    func verifyDeviceSetup(
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification
}
