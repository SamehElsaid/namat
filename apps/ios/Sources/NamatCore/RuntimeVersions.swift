import Foundation

/// Installed app and operating-system versions.
/// Production values come from the bundle and the running OS, never from a hardcoded current version.
public enum RuntimeVersions {
    public static func appVersion(
        shortVersion: String? = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
        build: String? = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    ) -> String {
        let short = shortVersion?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !short.isEmpty else { return "unknown" }
        let buildNumber = build?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if buildNumber.isEmpty { return short }
        return "\(short)+\(buildNumber)"
    }

    public static func iosVersion(
        version: OperatingSystemVersion = ProcessInfo.processInfo.operatingSystemVersion
    ) -> String {
        #if os(iOS)
        return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
        #else
        _ = version
        return "unknown"
        #endif
    }

    public static func deviceModel() -> String {
        #if os(iOS)
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
        #else
        return ""
        #endif
    }
}
