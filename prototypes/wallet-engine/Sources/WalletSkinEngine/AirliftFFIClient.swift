import Foundation

/// Protocol boundary for Airlift FFI operations.
/// Real `AirliftFFI.xcframework` links only on device/macOS builds; Linux CI uses stubs.
public protocol AirliftFFIClient: Sendable {
    func hasPairingRecord() async -> Bool
    func isLoopbackTunnelActive() async -> Bool
    /// Discover local card hashes from device syslog (results stay on-device).
    func discoverCardHashesFromSyslog() async throws -> [String]
    /// Read the pass asset set from `/var/mobile/Library/Passes/Cards/<hash>.pkpass`.
    func readPassAssets(localKey: String) async throws -> PassAssetSet
    /// Read @3x artwork bytes. Prefer `readPassAssets` for backup and verification.
    func readPassArtwork(localKey: String) async throws -> Data
    /// Write staged artwork directory into the pass bundle via exploit write path.
    func writePassDirectory(localKey: String, stagedDirectory: URL) async throws
    /// Corrupt FrontFace/Preview/PlaceHolder cache leaves under `.cache` / `.pkcache`.
    func invalidatePassCaches(localKey: String) async throws
    /// Blocks until a peer completes pairing or the attempt is cancelled.
    /// Returns the local pairing-file path. Does not upload that file.
    func runInAppPairingHost(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> String
    /// Authenticate with one local pairing file and close the tunnel.
    /// Implementations must not read or write Wallet.
    func probeAuthenticatedConnection(
        pairingPath: String,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification
}

/// Compile-everywhere stub. Does not perform device I/O.
public struct AirliftFFIStub: AirliftFFIClient {
    public enum StubError: Error {
        case notLinked
    }

    public var pairingPresent: Bool
    public var vpnActive: Bool
    public var cardHashes: [String]
    public var artworkByKey: [String: Data]

    public init(
        pairingPresent: Bool = false,
        vpnActive: Bool = false,
        cardHashes: [String] = [],
        artworkByKey: [String: Data] = [:]
    ) {
        self.pairingPresent = pairingPresent
        self.vpnActive = vpnActive
        self.cardHashes = cardHashes
        self.artworkByKey = artworkByKey
    }

    public func hasPairingRecord() async -> Bool { pairingPresent }
    public func isLoopbackTunnelActive() async -> Bool { vpnActive }

    public func discoverCardHashesFromSyslog() async throws -> [String] {
        cardHashes
    }

    public func readPassAssets(localKey: String) async throws -> PassAssetSet {
        if let data = artworkByKey[localKey] {
            return PassAssetSet(files: [PassAssetSet.combined3x: data])
        }
        throw WalletEngineError.cardNotFound()
    }

    public func readPassArtwork(localKey: String) async throws -> Data {
        let set = try await readPassAssets(localKey: localKey)
        if let data = set.file(PassAssetSet.combined3x) { return data }
        throw WalletEngineError.cardNotFound()
    }

    public func writePassDirectory(localKey: String, stagedDirectory: URL) async throws {
        _ = localKey
        _ = stagedDirectory
        throw StubError.notLinked
    }

    public func invalidatePassCaches(localKey: String) async throws {
        _ = localKey
        throw StubError.notLinked
    }

    public func runInAppPairingHost(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> String {
        _ = onPin
        _ = shouldCancel
        throw WalletEngineError.ffiUnavailable()
    }

    public func probeAuthenticatedConnection(
        pairingPath: String,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification {
        _ = pairingPath
        if shouldCancel() { return .cancelled }
        return .connectionUnavailable
    }
}

#if canImport(AirliftFFI)
// When the real xcframework is linked on macOS/iOS device builds, provide a thin wrapper.
// Mapping (AirCard-iOS @ 6342a345…):
//   al_pairing_run_host / pairing plist presence
//   LocalDevVPN utun/ipsec detect (10.7.0.1 / 127.0.0.1)
//   al_syslog_stream_start → card hash regex
//   al_exploit_write_dir → Passes/Cards/<hash>.pkpass
//   cache leaf corruption under .cache / .pkcache
#endif
