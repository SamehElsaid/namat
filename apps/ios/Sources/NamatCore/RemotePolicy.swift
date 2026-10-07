import Foundation

public struct ApplyDecision: Equatable, Sendable {
    public let allowed: Bool
    public let code: String
    public let reason: String
}

public enum RemotePolicyEvaluator {
    public static func compareVersions(_ a: String, _ b: String) -> Int {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }
        let pb = b.split(separator: ".").map { Int($0) ?? 0 }
        let n = max(pa.count, pb.count)
        for i in 0..<n {
            let da = i < pa.count ? pa[i] : 0
            let db = i < pb.count ? pb[i] : 0
            if da > db { return 1 }
            if da < db { return -1 }
        }
        return 0
    }

    public static func evaluateApply(
        _ policy: RemoteAppConfig,
        appVersion: String,
        iosVersion: String
    ) -> ApplyDecision {
        if policy.maintenanceMode {
            return ApplyDecision(
                allowed: false,
                code: "maintenance",
                reason: policy.message?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    ?? "NAMAT is temporarily unavailable."
            )
        }
        if policy.killSwitchApply {
            return ApplyDecision(
                allowed: false,
                code: "kill_switch_apply",
                reason: policy.message?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    ?? "Applying skins is temporarily disabled."
            )
        }
        if compareVersions(appVersion, policy.minAppVersion) < 0 {
            return ApplyDecision(
                allowed: false,
                code: "app_version",
                reason: "Update NAMAT to \(policy.minAppVersion) or newer before applying a skin."
            )
        }
        if compareVersions(iosVersion, policy.minIosVersion) < 0 {
            return ApplyDecision(
                allowed: false,
                code: "ios_version",
                reason: "This iOS version is below the minimum (\(policy.minIosVersion))."
            )
        }
        return ApplyDecision(allowed: true, code: "allowed", reason: "")
    }

    /// Restore stays available when Apply is disabled.
    public static func evaluateRestore(_ policy: RemoteAppConfig) -> ApplyDecision {
        if policy.killSwitchRestore {
            return ApplyDecision(
                allowed: false,
                code: "kill_switch_restore",
                reason: policy.message?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    ?? "Restoring original artwork is temporarily disabled."
            )
        }
        return ApplyDecision(allowed: true, code: "allowed", reason: "")
    }

    /// TESTING allows Apply and is reported explicitly. It is not a silent SUPPORTED result.
    /// BLOCKED and UNSUPPORTED block Apply. A missing catalog is handled by the caller.
    public static func evaluateCompatibilityRule(
        state: String,
        minIosVersion: String?,
        maxIosVersion: String?,
        minAppVersion: String?,
        supportedModels: [String]?,
        iosVersion: String,
        appVersion: String,
        deviceModel: String?
    ) -> ApplyDecision {
        if state == "BLOCKED" {
            return ApplyDecision(
                allowed: false,
                code: "compatibility_blocked",
                reason: "This device is blocked by the compatibility policy."
            )
        }
        if state == "UNSUPPORTED" {
            return ApplyDecision(
                allowed: false,
                code: "compatibility_unsupported",
                reason: "This device or iOS version is not supported."
            )
        }
        if let minIosVersion, compareVersions(iosVersion, minIosVersion) < 0 {
            return ApplyDecision(
                allowed: false,
                code: "ios_version",
                reason: "iOS \(minIosVersion) or newer is required."
            )
        }
        if let maxIosVersion, compareVersions(iosVersion, maxIosVersion) > 0 {
            return ApplyDecision(
                allowed: false,
                code: "ios_version",
                reason: "iOS newer than \(maxIosVersion) is not supported yet."
            )
        }
        if let minAppVersion, compareVersions(appVersion, minAppVersion) < 0 {
            return ApplyDecision(
                allowed: false,
                code: "app_version",
                reason: "Update NAMAT to \(minAppVersion) or newer."
            )
        }
        if let supportedModels, !supportedModels.isEmpty {
            let model = deviceModel ?? ""
            if !supportedModels.contains(model) {
                return ApplyDecision(
                    allowed: false,
                    code: "compatibility_unsupported",
                    reason: "This device model is not in the supported list."
                )
            }
        }
        if state == "TESTING" {
            return ApplyDecision(
                allowed: true,
                code: "compatibility_testing",
                reason: "TESTING: this iOS, app, and model combination is not production-verified. Apply is allowed and the result is unverified."
            )
        }
        return ApplyDecision(allowed: true, code: "allowed", reason: "")
    }

    public static func evaluateCompatibilityMatrix(
        _ rules: [CompatibilityRule],
        appVersion: String,
        iosVersion: String,
        deviceModel: String?
    ) -> ApplyDecision {
        let inRange = rules.filter { rule in
            compareVersions(iosVersion, rule.minIosVersion) >= 0
                && (rule.maxIosVersion == nil || compareVersions(iosVersion, rule.maxIosVersion ?? iosVersion) <= 0)
        }
        if inRange.isEmpty {
            return ApplyDecision(
                allowed: true,
                code: "compatibility_unlisted",
                reason: "No compatibility rule matches this iOS version."
            )
        }
        var sawTesting = false
        var sawMatch = false
        for rule in inRange {
            let models = rule.supportedModels ?? []
            if !models.isEmpty, !(deviceModel.map(models.contains) ?? false) {
                continue
            }
            sawMatch = true
            let decision = evaluateCompatibilityRule(
                state: rule.state,
                minIosVersion: rule.minIosVersion,
                maxIosVersion: rule.maxIosVersion,
                minAppVersion: rule.minAppVersion,
                supportedModels: rule.supportedModels,
                iosVersion: iosVersion,
                appVersion: appVersion,
                deviceModel: deviceModel
            )
            if !decision.allowed {
                return decision
            }
            if decision.code == "compatibility_testing" {
                sawTesting = true
            }
        }
        if !sawMatch {
            return ApplyDecision(
                allowed: false,
                code: "compatibility_unsupported",
                reason: "This device model is not in the supported list."
            )
        }
        if sawTesting {
            return ApplyDecision(
                allowed: true,
                code: "compatibility_testing",
                reason: "TESTING: this iOS, app, and model combination is not production-verified. Apply is allowed and the result is unverified."
            )
        }
        return ApplyDecision(allowed: true, code: "allowed", reason: "")
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
