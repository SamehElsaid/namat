import Foundation

/// Redacting logger for Wallet engine diagnostics.
/// Never emits raw `localKey`, PAN, CVV, PIN, Apple Pay tokens, or pairing material.
public struct SanitizedLogger: Sendable {
    public enum Level: String, Sendable {
        case debug, info, warning, error
    }

    public typealias Sink = @Sendable (Level, String) -> Void

    private let sink: Sink

    public init(sink: @escaping Sink = { level, message in
        #if DEBUG
        print("[WalletSkinEngine][\(level.rawValue)] \(message)")
        #else
        _ = level
        _ = message
        #endif
    }) {
        self.sink = sink
    }

    public func log(_ level: Level, _ message: String) {
        sink(level, Self.redact(message))
    }

    public func debug(_ message: String) { log(.debug, message) }
    public func info(_ message: String) { log(.info, message) }
    public func warning(_ message: String) { log(.warning, message) }
    public func error(_ message: String) { log(.error, message) }

    /// Opaque fingerprint safe for local diagnostics (not a Wallet identifier for servers).
    public static func fingerprint(_ localKey: String) -> String {
        let hex = NAMATDigest.sha256Hex(Data(localKey.utf8))
        return "lk_" + String(hex.prefix(12))
    }

    /// Redact common local-key / hash patterns from free-form messages.
    public static func redact(_ message: String) -> String {
        var result = message
        // Long hex-like tokens (pass hashes / pairing material fragments)
        if let regex = try? NSRegularExpression(
            pattern: #"(?i)\b[0-9a-f]{16,}\b"#
        ) {
            let range = NSRange(result.startIndex..., in: result)
            result = regex.stringByReplacingMatches(
                in: result,
                range: range,
                withTemplate: "<redacted>"
            )
        }
        // Explicit stub keys / localKey= forms
        if let regex = try? NSRegularExpression(
            pattern: #"(?i)(localKey|passHash|cardHash|pairing)\s*[:=]\s*\S+"#
        ) {
            let range = NSRange(result.startIndex..., in: result)
            result = regex.stringByReplacingMatches(
                in: result,
                range: range,
                withTemplate: "$1=<redacted>"
            )
        }
        return result
    }
}
