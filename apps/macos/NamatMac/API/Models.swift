import Foundation

// Mirrors services/api DTOs and apps/ios/Sources/NamatCore/Models.swift.
// Privacy contract: never include Wallet identifiers, PAN, CVV, localKey.

struct AuthUserPayload: Codable {
    let id: String
    let email: String
    let role: String
}

struct AuthSessionResponse: Codable {
    let accessToken: String
    let user: AuthUserPayload
}

struct OtpDelivery: Codable {
    let ok: Bool
    let expiresIn: Int
    let delivery: String
    let cooldownSeconds: Int?
}

struct EntitlementPayload: Codable {
    let id: String
    let status: String
    let plan: String
    let maxDevices: Int
    let purchaseId: String?
    let createdAt: String?
}

struct EntitlementStatus: Codable {
    let entitlement: EntitlementPayload?
    let activeDevices: Int

    var active: Bool { entitlement?.status == "active" }
}

struct SkinSummary: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let categoryId: String?
    let thumbnailUrl: URL?
    let artworkUrl: URL?
    let version: Int
    let contentHash: String?
}

struct SkinDetail: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let artworkUrl: URL?
    let version: Int
}

struct RemoteAppConfig: Codable {
    let killSwitchApply: Bool
    let killSwitchRestore: Bool
    let minAppVersion: String
    let minIosVersion: String
    let maintenanceMode: Bool
    let message: String?
}

struct CompatibilityRule: Codable {
    let id: String
    let minIosVersion: String
    let maxIosVersion: String?
    let supportedModels: [String]?
    let state: String
    let minAppVersion: String?
    let notes: String?
}

struct CompatibilityCatalog: Codable {
    let rules: [CompatibilityRule]
}

enum NamatAPIError: Error, LocalizedError {
    case notAuthenticated
    case http(status: Int, code: String?)
    case decoding
    case network(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return L10n.t("error.notAuthenticated")
        case .http(let s, let c): return "\(L10n.t("error.http")) \(s)\(c.map { " (\($0))" } ?? "")"
        case .decoding: return L10n.t("error.decoding")
        case .network(let m): return "\(L10n.t("error.network")): \(m)"
        }
    }
}
