import Foundation

/// Talks to the vendored AirCard engine through `namat_bridge.py`
/// (bundled in the app Resources) using single-line JSON messages.
final class EngineBridge: @unchecked Sendable {
    struct Device: Codable, Identifiable {
        let udid: String
        let name: String
        let product: String?
        var id: String { udid }
    }

    struct DevicesResult: Codable {
        let connected: Bool
        let error: String?
        let devices: [Device]
    }

    struct CardsResult: Codable {
        let ok: Bool
        let cards: [String]
        let new: [String]?
    }

    struct OKResult: Codable {
        let ok: Bool
        let error: String?
    }

    enum BridgeError: Error, LocalizedError {
        case pythonMissing
        case badOutput
        case engine(String)

        var errorDescription: String? {
            switch self {
            case .pythonMissing: return "/usr/bin/python3 missing"
            case .badOutput: return "engine: unparseable output"
            case .engine(let m): return m
            }
        }
    }

    private let python = "/usr/bin/python3"
    private let bridge: URL

    init() {
        // Bundled at Contents/Resources/namat_bridge.py by build.sh
        let bundle = Bundle.main.resourceURL
            ?? URL(fileURLWithPath: "/Applications/NamatMac.app/Contents/Resources")
        self.bridge = bundle.appendingPathComponent("namat_bridge.py")
    }

    // MARK: - Running

    /// Runs the bridge once and parses the LAST JSON line as `T`.
    private func run<T: Decodable>(_ args: [String]) async throws -> T {
        let output = try await runStreaming(args) { _ in }
        guard let line = output.reversed().first(where: { $0.hasPrefix("{") }),
              let data = line.data(using: .utf8) else {
            throw BridgeError.badOutput
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw BridgeError.badOutput
        }
    }

    /// Runs the bridge, invoking `onEvent` for every streamed JSON line.
    @discardableResult
    private func runStreaming(
        _ args: [String],
        onEvent: @escaping ([String: Any]) -> Void
    ) async throws -> [String] {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: python)
            process.arguments = [bridge.path] + args
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = FileHandle.nullDevice

            var lines: [String] = []
            var leftover = Data()
            pipe.fileHandleForReading.readabilityHandler = { handle in
                let chunk = handle.availableData
                if chunk.isEmpty { return }
                leftover.append(chunk)
                while let range = leftover.range(of: Data([0x0A])) {
                    let lineData = leftover.subdata(in: ..<range.lowerBound)
                    leftover.removeSubrange(...range.lowerBound)
                    guard let line = String(data: lineData, encoding: .utf8),
                          line.hasPrefix("{") else { continue }
                    lines.append(line)
                    if let obj = try? JSONSerialization.jsonObject(with: lineData),
                       let dict = obj as? [String: Any] {
                        DispatchQueue.main.async { onEvent(dict) }
                    }
                }
            }

            do {
                try process.run()
            } catch {
                continuation.resume(throwing: BridgeError.pythonMissing)
                return
            }

            process.terminationHandler = { proc in
                pipe.fileHandleForReading.readabilityHandler = nil
                if proc.terminationReason == .exit, proc.terminationStatus == 0 {
                    continuation.resume(returning: lines)
                } else {
                    let tail = lines.last ?? "{}"
                    continuation.resume(throwing: BridgeError.engine(tail))
                }
            }
        }
    }

    // MARK: - Commands

    func devices() async throws -> DevicesResult {
        try await run(["devices"])
    }

    func scan(udid: String, seconds: Int, onEvent: @escaping ([String: Any]) -> Void) async throws -> CardsResult {
        try await runStreaming(["scan", udid, String(seconds)], onEvent: onEvent)
            .last.flatMap { $0.data(using: .utf8) }
            .flatMap { try? JSONDecoder().decode(CardsResult.self, from: $0) }
            ?? CardsResult(ok: false, cards: [], new: [])
    }

    func prepareImage(src: URL, dst: URL) async throws -> OKResult {
        try await run(["prepare-image", src.path, dst.path])
    }

    /// Backup-then-flash. The engine keeps the first backup (pristine look).
    func flash(udid: String, cardHash: String, image: URL,
               onEvent: @escaping ([String: Any]) -> Void) async throws -> OKResult {
        try await runStreaming(["flash", udid, cardHash, image.path], onEvent: onEvent)
            .last.flatMap { $0.data(using: .utf8) }
            .flatMap { try? JSONDecoder().decode(OKResult.self, from: $0) }
            ?? OKResult(ok: false, error: "flash_failed")
    }

    func restore(udid: String, cardHash: String) async throws -> OKResult {
        let r: OKResult = try await run(["restore", udid, cardHash])
        if !r.ok, r.error == "no_backup" { throw BridgeError.engine("no_backup") }
        return r
    }

    func inspectPassthm(_ path: URL) async throws -> [String: Any] {
        let lines = try await runStreaming(["inspect-passthm", path.path]) { _ in }
        guard let line = lines.last,
              let data = line.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw BridgeError.badOutput
        }
        return obj
    }

    func flashPassthm(udid: String, path: URL, version: String = "TelephonyUI-10",
                      onEvent: @escaping ([String: Any]) -> Void) async throws -> OKResult {
        try await runStreaming(
            ["flash-passthm", udid, path.path, version, "all", "both"],
            onEvent: onEvent
        )
        .last.flatMap { $0.data(using: .utf8) }
        .flatMap { try? JSONDecoder().decode(OKResult.self, from: $0) }
        ?? OKResult(ok: false, error: "flash_failed")
    }

    func restorePassthm(udid: String, path: URL) async throws -> OKResult {
        let r: OKResult = try await run(["restore-passthm", udid, path.path])
        if !r.ok, r.error == "no_backup" { throw BridgeError.engine("no_backup") }
        return r
    }
}
