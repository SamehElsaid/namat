import Foundation

#if canImport(Darwin)
import Darwin
#endif

#if os(iOS) && !DEBUG
#if !canImport(AirliftFFI)
#error("Release iOS requires AirliftFFI. Do not substitute LocalStubEngine.")
#endif
#endif

/// Device client for the Airlift FFI.
///
/// Read uses `al_exploit_read_file` / `al_bytes_free` from the port of
/// Mak5er/AirCard `d632055` (`read_file`: export, AFC read, exact write-back).
/// The base iOS revision remains AirCard-iOS `6342a3455e17ca357da19537d1e44317a3f69f32`.
/// Without a rebuilt `AirliftFFI` module this client fails closed.
public struct RealAirliftFFIClient: AirliftFFIClient {
    public static let auditedRevision = "6342a3455e17ca357da19537d1e44317a3f69f32"
    public static let desktopReadRevision = "d6320554c07d65f53be91fb578b3e57f996c2605"
    public static let artworkReadImplementation = "EXPORT_READ_RESTORE"
    public static let artworkReadReason =
        "al_exploit_read_file exports the existing leaf into Media, AFC-reads it, and writes those exact bytes back before Apply. Physical iPhone proof is still required. See docs/audit/WALLET_ORIGINAL_READ_INVESTIGATION.md."

    public static let frameworkLinked: Bool = {
        #if canImport(AirliftFFI)
        return true
        #else
        return false
        #endif
    }()

    public var discoveryWindowSeconds: TimeInterval

    public init(discoveryWindowSeconds: TimeInterval = 8) {
        self.discoveryWindowSeconds = discoveryWindowSeconds
        #if canImport(AirliftFFI)
        AirliftSymbols.retainLinkedExports()
        #endif
    }

    public func hasPairingRecord() async -> Bool {
        PairingFiles.existingPath() != nil
    }

    public func isLoopbackTunnelActive() async -> Bool {
        LoopbackTunnel.isActive(peer: "10.7.0.1")
    }

    public func probeAuthenticatedConnection(
        pairingPath: String,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification {
        if shouldCancel() { return .cancelled }
        guard PairingMaterial.isUsableFile(at: pairingPath) else { return .invalidMaterial }
        #if canImport(AirliftFFI)
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let verdict = AirliftSymbols.probeConnection(
                    path: pairingPath,
                    timeoutMilliseconds: 8_000,
                    shouldCancel: shouldCancel
                )
                continuation.resume(returning: verdict)
            }
        }
        #else
        return .connectionUnavailable
        #endif
    }

    public func discoverCardHashesFromSyslog() async throws -> [String] {
        let pairing = try requirePairingPath()
        #if canImport(AirliftFFI)
        return try AirliftSymbols.discoverCardHashes(
            pairingPath: pairing,
            window: discoveryWindowSeconds
        )
        #else
        _ = pairing
        throw WalletEngineError.ffiUnavailable()
        #endif
    }

    public func readPassAssets(localKey: String) async throws -> PassAssetSet {
        let pairing = try requirePairingPath()
        #if canImport(AirliftFFI)
        return try AirliftSymbols.readOriginalAssets(pairingPath: pairing, localKey: localKey)
        #else
        _ = pairing
        _ = localKey
        throw WalletEngineError.ffiUnavailable()
        #endif
    }

    public func readPassArtwork(localKey: String) async throws -> Data {
        let set = try await readPassAssets(localKey: localKey)
        guard let data = set.file(PassAssetSet.combined3x) else {
            throw WalletEngineError.ffiReadUnavailable(detail: Self.artworkReadReason)
        }
        return data
    }

    public func writePassDirectory(localKey: String, stagedDirectory: URL) async throws {
        let pairing = try requirePairingPath()
        let target = "/var/mobile/Library/Passes/Cards/\(localKey).pkpass"
        #if canImport(AirliftFFI)
        try AirliftSymbols.writeDirectory(
            pairingPath: pairing,
            sourceDir: stagedDirectory.path,
            targetDir: target
        )
        #else
        _ = pairing
        _ = target
        throw WalletEngineError.ffiUnavailable()
        #endif
    }

    public func invalidatePassCaches(localKey: String) async throws {
        let pairing = try requirePairingPath()
        #if canImport(AirliftFFI)
        try AirliftSymbols.invalidateCaches(pairingPath: pairing, localKey: localKey)
        #else
        _ = pairing
        throw WalletEngineError.ffiUnavailable()
        #endif
    }

    /// Starts the audited RPPairing host. Blocks until paired, cancelled, or failed.
    public func runPairingHost(
        bindAddress: String = "0.0.0.0",
        port: UInt16 = 0,
        name: String = "NAMAT",
        model: String = "Mac17,7"
    ) async throws -> String {
        _ = bindAddress
        _ = port
        _ = name
        _ = model
        return try await runInAppPairingHost(onPin: { _ in }, shouldCancel: { false })
    }

    public func runInAppPairingHost(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> String {
        let outPath = PairingFiles.preferredWritePath()
        #if canImport(AirliftFFI)
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let path = try AirliftSymbols.runPairingHost(
                        bindAddress: "0.0.0.0",
                        port: 0,
                        name: "NAMAT",
                        model: "Mac17,7",
                        outPath: outPath,
                        onPin: onPin,
                        shouldCancel: shouldCancel
                    )
                    PairingMaterial.protect(at: path)
                    continuation.resume(returning: path)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
        #else
        _ = outPath
        _ = onPin
        _ = shouldCancel
        throw WalletEngineError.ffiUnavailable()
        #endif
    }

    private func requireLinked() throws {
        if !Self.frameworkLinked {
            throw WalletEngineError.ffiUnavailable()
        }
    }

    private func requirePairingPath() throws -> String {
        try requireLinked()
        guard let path = PairingFiles.existingPath() else {
            throw WalletEngineError.pairingRequired()
        }
        return path
    }
}

enum PairingFiles {
    static let names = ["aircard_pairing.plist", "airlift_pairing.plist"]

    static func documentsDirectory() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
    }

    static func existingPath() -> String? {
        if case .valid(let path) = classify() { return path }
        return nil
    }

    static func classify() -> PairingMaterialState {
        let dir = documentsDirectory()
        var sawInvalid = false
        for name in names {
            let path = dir.appendingPathComponent(name).path
            guard FileManager.default.fileExists(atPath: path) else { continue }
            if PairingMaterial.isUsableFile(at: path) {
                return .valid(path)
            }
            sawInvalid = true
        }
        return sawInvalid ? .invalid : .missing
    }

    static func preferredWritePath() -> String {
        documentsDirectory().appendingPathComponent(names[0]).path
    }
}

enum PairingMaterialState: Equatable {
    case missing
    case invalid
    case valid(String)
}

/// Local pairing-file checks. The file is never uploaded or logged.
public enum PairingMaterial {
    /// Accepts a record only when the engine parser's rules match:
    /// a pairing plist whose Ed25519 public key belongs to its private key.
    /// When AirliftFFI is linked, `RpPairingFile::from_bytes` is the authority.
    public static func isUsableFile(at path: String) -> Bool {
        #if canImport(AirliftFFI)
        return AirliftSymbols.materialIsValid(path: path)
        #else
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)), !data.isEmpty else {
            return false
        }
        return PairingRecordGrammar.accepts(data)
        #endif
    }

    /// Copies `incoming` over `destination` only after the parser accepts it.
    /// The first valid destination is kept beside it so a later import cannot erase it.
    public static func installIfValid(incoming: URL, destination: URL) -> Bool {
        guard isUsableFile(at: incoming.path) else { return false }
        let backup = destination.deletingLastPathComponent().appendingPathComponent("aircard_pairing.original")
        if isUsableFile(at: destination.path), !FileManager.default.fileExists(atPath: backup.path) {
            try? FileManager.default.copyItem(at: destination, to: backup)
            protect(at: backup.path)
        }
        if FileManager.default.fileExists(atPath: destination.path) {
            try? FileManager.default.removeItem(at: destination)
        }
        do {
            try FileManager.default.copyItem(at: incoming, to: destination)
            protect(at: destination.path)
            return isUsableFile(at: destination.path)
        } catch {
            return false
        }
    }

    public static func protect(at path: String) {
        #if os(iOS) || os(macOS)
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: path
        )
        var url = URL(fileURLWithPath: path)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        #else
        _ = path
        #endif
    }
}

enum PairingRecordGrammar {
    static func accepts(_ data: Data) -> Bool {
        guard let object = try? PropertyListSerialization.propertyList(
            from: data,
            options: [],
            format: nil
        ) as? [String: Any] else {
            return false
        }
        guard let publicKey = object["public_key"] as? Data, publicKey.count == 32,
              let privateKey = object["private_key"] as? Data, privateKey.count == 32,
              let identifier = object["identifier"] as? String,
              !identifier.isEmpty else {
            return false
        }
        if let irk = object["alt_irk"], !(irk is Data) {
            return false
        }
        return Ed25519Pair.matches(seed: [UInt8](privateKey), publicKey: [UInt8](publicKey))
    }
}

enum HostAltIRKStore {
    static func load() -> String? {
        guard let path = filePath(),
              let text = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }
        let hex = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard hex.count == 32, hex.allSatisfy(\.isHexDigit) else { return nil }
        return hex
    }

    static func save(_ hex: String) {
        let trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard trimmed.count == 32, trimmed.allSatisfy(\.isHexDigit), let path = filePath() else {
            return
        }
        try? Data(trimmed.utf8).write(to: URL(fileURLWithPath: path), options: [.atomic])
        PairingMaterial.protect(at: path)
    }

    static func withCString<T>(_ body: (UnsafePointer<CChar>?) -> T) -> T {
        guard let hex = load() else { return body(nil) }
        return hex.withCString { body($0) }
    }

    private static func filePath() -> String? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        let directory = base.appendingPathComponent("NAMAT", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("host-alt-irk").path
    }
}

enum LoopbackTunnel {
    struct InterfaceAddress: Equatable {
        let name: String
        let address: String
    }

    /// A tunnel interface is not NAMAT. The peer address must sit on a tunnel.
    static func namatPeerPresent(_ interfaces: [InterfaceAddress], peer: String) -> Bool {
        guard !peer.isEmpty else { return false }
        return interfaces.contains { isTunnel($0.name) && $0.address == peer }
    }

    static func isTunnel(_ name: String) -> Bool {
        name.hasPrefix("utun") || name.hasPrefix("ipsec") || name.hasPrefix("tap") || name.hasPrefix("ppp")
    }

    static func isActive(peer: String) -> Bool {
        #if canImport(Darwin)
        return namatPeerPresent(
            ipv4Interfaces().map { InterfaceAddress(name: $0.name, address: $0.address) },
            peer: peer
        )
        #else
        _ = peer
        return false
        #endif
    }

    #if canImport(Darwin)
    private struct Iface {
        let name: String
        let address: String
    }

    private static func ipv4Interfaces() -> [Iface] {
        var result: [Iface] = []
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return [] }
        defer { freeifaddrs(head) }
        var cursor: UnsafeMutablePointer<ifaddrs>? = first
        while let current = cursor {
            defer { cursor = current.pointee.ifa_next }
            guard let addr = current.pointee.ifa_addr, addr.pointee.sa_family == sa_family_t(AF_INET) else {
                continue
            }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let length = socklen_t(MemoryLayout<sockaddr_in>.size)
            guard getnameinfo(addr, length, &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else {
                continue
            }
            result.append(Iface(name: String(cString: current.pointee.ifa_name), address: String(cString: host)))
        }
        return result
    }
    #endif
}

enum CardHashExtractor {
    static func hashes(from lines: [String]) -> [String] {
        var found: [String] = []
        let patterns = [
            #"/(?:Cards|Passes/Cards)/([-A-Za-z0-9_+=]{20,44})(?:\.pkpass|\.cache|\.pkcache|/|\s|"|'|\)|,|$)"#,
            #"/([-A-Za-z0-9_+=]{20,44})\.(?:pkpass|cache|pkcache)"#,
        ]
        for line in lines {
            let lower = line.lowercased()
            guard lower.contains("pass") || lower.contains("card") || lower.contains("wallet") else {
                continue
            }
            for pattern in patterns {
                guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
                let range = NSRange(line.startIndex..., in: line)
                for match in regex.matches(in: line, range: range) where match.numberOfRanges > 1 {
                    guard let slice = Range(match.range(at: 1), in: line) else { continue }
                    let hash = String(line[slice])
                    if !found.contains(hash) {
                        found.append(hash)
                    }
                }
            }
        }
        return found
    }
}

#if canImport(AirliftFFI)
import AirliftFFI

enum RecoveryFiles {
    static func directory() throws -> String {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dir = base.appendingPathComponent("NAMATAirliftRecovery", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        #if os(iOS) || os(macOS) || os(tvOS) || os(watchOS)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = dir
        try? mutable.setResourceValues(values)
        #endif
        return dir.path
    }
}

@_silgen_name("al_exploit_read_file")
func namatAirliftReadFile(
    _ pairingPath: UnsafePointer<CChar>?,
    _ targetDir: UnsafePointer<CChar>?,
    _ leaf: UnsafePointer<CChar>?,
    _ recoveryDir: UnsafePointer<CChar>?,
    _ logCallback: (@convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>?) -> Void)?,
    _ context: UnsafeMutableRawPointer?,
    _ outBytes: UnsafeMutablePointer<UnsafeMutablePointer<UInt8>?>?,
    _ outLen: UnsafeMutablePointer<Int>?,
    _ outError: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32

@_silgen_name("al_bytes_free")
func namatAirliftBytesFree(_ pointer: UnsafeMutablePointer<UInt8>?, _ length: Int)

@_silgen_name("al_pairing_material_valid")
func namatPairingMaterialValid(_ path: UnsafePointer<CChar>?) -> Int32

@_silgen_name("al_pairing_probe_connection")
func namatPairingProbeConnection(_ path: UnsafePointer<CChar>?, _ timeoutMs: UInt32) -> Int32

@_silgen_name("al_pairing_probe_cancel")
func namatPairingProbeCancel()

private func namatAirliftSyslogLine(
    _ context: UnsafeMutableRawPointer?,
    _ line: UnsafePointer<CChar>?
) {
    _ = context
    guard let line else { return }
    AirliftSymbols.appendCapturedLine(String(cString: line))
}

enum AirliftSymbols {
    private static let captureLock = NSLock()
    private static var capturedLines: [String] = []

    /// Keep a live relocation from this client to each C export so Release
    /// dead-stripping cannot drop the read, write, syslog, or pairing symbols.
    @_optimize(none)
    static func retainLinkedExports() {
        withExtendedLifetime(namatAirliftReadFile) {}
        withExtendedLifetime(namatAirliftBytesFree) {}
        withExtendedLifetime(al_exploit_write_dir) {}
        withExtendedLifetime(al_syslog_stream_start) {}
        withExtendedLifetime(al_pairing_run_host) {}
        withExtendedLifetime(namatPairingMaterialValid) {}
        withExtendedLifetime(namatPairingProbeConnection) {}
        withExtendedLifetime(namatPairingProbeCancel) {}
    }

    static func materialIsValid(path: String) -> Bool {
        path.withCString { namatPairingMaterialValid($0) == 0 }
    }

    static func probeConnection(
        path: String,
        timeoutMilliseconds: UInt32,
        shouldCancel: @escaping @Sendable () -> Bool
    ) -> SetupVerification {
        if shouldCancel() { return .cancelled }
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now() + .milliseconds(200), repeating: .milliseconds(200))
        timer.setEventHandler {
            if shouldCancel() {
                namatPairingProbeCancel()
            }
        }
        timer.resume()
        defer { timer.cancel() }
        let code = path.withCString { namatPairingProbeConnection($0, timeoutMilliseconds) }
        switch code {
        case 0: return .verified
        case 1: return .invalidMaterial
        case 3: return .timedOut
        case 4: return .cancelled
        default: return .connectionUnavailable
        }
    }

    fileprivate static func appendCapturedLine(_ text: String) {
        captureLock.lock()
        capturedLines.append(text)
        captureLock.unlock()
    }

    static func readOriginalAssets(pairingPath: String, localKey: String) throws -> PassAssetSet {
        let recovery = try RecoveryFiles.directory()
        let target = "/var/mobile/Library/Passes/Cards/\(localKey).pkpass"
        var files: [String: Data] = [:]
        for name in PassAssetSet.requiredNames {
            files[name] = try readLeaf(
                pairingPath: pairingPath,
                targetDir: target,
                leaf: name,
                recoveryDir: recovery
            )
        }
        try PassAssetSignatures.validateBackup(files)
        return PassAssetSet(files: files)
    }

    static func readLeaf(
        pairingPath: String,
        targetDir: String,
        leaf: String,
        recoveryDir: String
    ) throws -> Data {
        var outBytes: UnsafeMutablePointer<UInt8>?
        var outLen = 0
        var outError: UnsafeMutablePointer<CChar>?
        let rc: Int32 = pairingPath.withCString { pairC in
            targetDir.withCString { targetC in
                leaf.withCString { leafC in
                    recoveryDir.withCString { recoveryC in
                        namatAirliftReadFile(
                            pairC,
                            targetC,
                            leafC,
                            recoveryC,
                            nil,
                            nil,
                            &outBytes,
                            &outLen,
                            &outError
                        )
                    }
                }
            }
        }
        let message = consumeError(&outError)
        defer {
            if let outBytes {
                namatAirliftBytesFree(outBytes, outLen)
            }
        }
        guard rc == 0, let outBytes, outLen > 0 else {
            throw WalletEngineError.ffiReadUnavailable(
                detail: message ?? "al_exploit_read_file failed (\(rc))"
            )
        }
        return Data(bytes: outBytes, count: outLen)
    }

    static func writeDirectory(pairingPath: String, sourceDir: String, targetDir: String) throws {
        var outError: UnsafeMutablePointer<CChar>?
        let rc: Int32 = pairingPath.withCString { pairC in
            sourceDir.withCString { srcC in
                targetDir.withCString { tgtC in
                    al_exploit_write_dir(pairC, srcC, tgtC, nil, nil, &outError)
                }
            }
        }
        let message = consumeError(&outError)
        if rc != 0 {
            throw WalletEngineError.applyFailed(detail: message ?? "al_exploit_write_dir failed")
        }
    }

    static func invalidateCaches(pairingPath: String, localKey: String) throws {
        let stage = FileManager.default.temporaryDirectory
            .appendingPathComponent("namat-cache-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: stage, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: stage) }
        for leaf in ["FrontFace", "Preview", "PlaceHolder"] {
            try Data("corrupted".utf8).write(to: stage.appendingPathComponent(leaf), options: .atomic)
        }
        for ext in [".cache", ".pkcache"] {
            let target = "/var/mobile/Library/Passes/Cards/\(localKey)\(ext)"
            try writeDirectory(pairingPath: pairingPath, sourceDir: stage.path, targetDir: target)
        }
    }

    static func discoverCardHashes(pairingPath: String, window: TimeInterval) throws -> [String] {
        captureLock.lock()
        capturedLines.removeAll()
        captureLock.unlock()

        let thread = Thread {
            var localError: UnsafeMutablePointer<CChar>?
            _ = pairingPath.withCString { pairC in
                al_syslog_stream_start(pairC, namatAirliftSyslogLine, nil, &localError)
            }
            if let localError {
                al_string_free(localError)
            }
        }
        thread.stackSize = 4 * 1024 * 1024
        thread.start()
        Thread.sleep(forTimeInterval: window)
        al_syslog_stream_stop()
        let deadline = Date().addingTimeInterval(2)
        while thread.isExecuting, Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        captureLock.lock()
        let lines = capturedLines
        capturedLines.removeAll()
        captureLock.unlock()
        return CardHashExtractor.hashes(from: lines)
    }

    static func runPairingHost(
        bindAddress: String,
        port: UInt16,
        name: String,
        model: String,
        outPath: String,
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) throws -> String {
        let session = PairingHostSession(onPin: onPin, shouldCancel: shouldCancel)
        let retained = Unmanaged.passRetained(session)
        defer {
            session.stopAdvertising()
            retained.release()
        }
        let watchdog = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        watchdog.schedule(deadline: .now() + .milliseconds(200), repeating: .milliseconds(200))
        watchdog.setEventHandler {
            if shouldCancel() {
                session.pokeIfBound()
            }
        }
        watchdog.resume()
        defer { watchdog.cancel() }

        var result = ALPairResult()
        let ctx = retained.toOpaque()
        let rc: Int32 = bindAddress.withCString { bindC in
            name.withCString { nameC in
                model.withCString { modelC in
                    outPath.withCString { outC in
                        HostAltIRKStore.withCString { irkC in
                            al_pairing_run_host(
                                bindC,
                                port,
                                nameC,
                                modelC,
                                outC,
                                irkC,
                                namatPairingReady,
                                namatPairingPin,
                                ctx,
                                &result
                            )
                        }
                    }
                }
            }
        }
        let path = result.pairing_file_path.map { String(cString: $0) }
        if let irk = result.host_alt_irk_hex.map({ String(cString: $0) }) {
            HostAltIRKStore.save(irk)
        }
        al_pairing_result_free(&result)
        if rc == 0, let path, PairingMaterial.isUsableFile(at: path) {
            PairingMaterial.protect(at: path)
            return path
        }
        if shouldCancel() {
            throw WalletEngineError.cancelled()
        }
        throw WalletEngineError.pairingRequired()
    }

    private static func consumeError(_ pointer: inout UnsafeMutablePointer<CChar>?) -> String? {
        guard let pointer else { return nil }
        let message = String(cString: pointer)
        al_string_free(pointer)
        return message
    }
}

/// Keeps the Bonjour advertisement alive for one host run.
/// Callbacks copy strings before returning. Nothing here is logged or uploaded.
final class PairingHostSession: @unchecked Sendable {
    private let lock = NSLock()
    private let onPin: @Sendable (String) -> Void
    private let shouldCancel: @Sendable () -> Bool
    private var port: UInt16 = 0
    private var poked = false
    private var service: NetService?

    init(onPin: @escaping @Sendable (String) -> Void, shouldCancel: @escaping @Sendable () -> Bool) {
        self.onPin = onPin
        self.shouldCancel = shouldCancel
    }

    func publish(name: String, port: UInt16, txt: [String: Data]) {
        lock.lock()
        self.port = port
        lock.unlock()
        let advertise = {
            let service = NetService(
                domain: "local.",
                type: "_remotepairing-pairable-host._tcp.",
                name: name.isEmpty ? "NAMAT" : name,
                port: Int32(port)
            )
            service.setTXTRecord(NetService.data(fromTXTRecord: txt))
            service.schedule(in: RunLoop.main, forMode: .common)
            service.publish()
            self.lock.lock()
            self.service = service
            self.lock.unlock()
            if self.shouldCancel() {
                self.pokeIfBound()
            }
        }
        if Thread.isMainThread {
            advertise()
        } else {
            DispatchQueue.main.sync(execute: advertise)
        }
    }

    func deliverPin(_ pin: String) {
        let copy = pin
        DispatchQueue.main.async {
            self.onPin(copy)
        }
    }

    func pokeIfBound() {
        let portToPoke: UInt16? = {
            lock.lock()
            defer { lock.unlock() }
            guard port != 0, !poked else { return nil }
            poked = true
            return port
        }()
        guard let portToPoke else { return }
        pokeLoopback(port: portToPoke)
    }

    func stopAdvertising() {
        let stop = {
            self.lock.lock()
            let service = self.service
            self.service = nil
            self.lock.unlock()
            service?.stop()
        }
        if Thread.isMainThread {
            stop()
        } else {
            DispatchQueue.main.sync(execute: stop)
        }
    }
}

private func namatPairingReady(
    _ ctx: UnsafeMutableRawPointer?,
    _ serviceID: UnsafePointer<CChar>?,
    _ port: UInt16,
    _ keys: UnsafePointer<UnsafePointer<CChar>?>?,
    _ values: UnsafePointer<UnsafePointer<CChar>?>?,
    _ count: Int
) {
    guard let ctx else { return }
    let session = Unmanaged<PairingHostSession>.fromOpaque(ctx).takeUnretainedValue()
    let name = serviceID.map { String(cString: $0) } ?? "NAMAT"
    var txt: [String: Data] = [:]
    if let keys, let values, count > 0 {
        for index in 0..<count {
            guard let keyPointer = keys[index], let valuePointer = values[index] else { continue }
            let key = String(cString: keyPointer)
            let value = String(cString: valuePointer)
            txt[key] = Data(value.utf8)
        }
    }
    session.publish(name: name, port: port, txt: txt)
}

private func namatPairingPin(
    _ pin: UnsafePointer<CChar>?,
    _ ctx: UnsafeMutableRawPointer?
) {
    guard let pin, let ctx else { return }
    let copy = String(cString: pin)
    let session = Unmanaged<PairingHostSession>.fromOpaque(ctx).takeUnretainedValue()
    session.deliverPin(copy)
}

private func pokeLoopback(port: UInt16) {
    let descriptor = socket(AF_INET, Int32(SOCK_STREAM), 0)
    guard descriptor >= 0 else { return }
    defer { close(descriptor) }
    let flags = fcntl(descriptor, F_GETFL, Int32(0))
    if flags >= 0 {
        _ = fcntl(descriptor, F_SETFL, flags | Int32(O_NONBLOCK))
    }
    var address = sockaddr_in()
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    address.sin_addr.s_addr = UInt32(0x7f000001).bigEndian
    _ = withUnsafePointer(to: &address) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { rebound in
            connect(descriptor, rebound, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
}
#endif
