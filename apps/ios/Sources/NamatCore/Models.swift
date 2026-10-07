import Foundation

public struct SkinSummary: Identifiable, Codable, Sendable, Hashable {
    public let id: String
    public let name: String
    public let categoryId: String?
    public let thumbnailUrl: URL?
    public let artworkUrl: URL?
    public let version: Int
    public let contentHash: String?

    public init(
        id: String,
        name: String,
        categoryId: String? = nil,
        thumbnailUrl: URL? = nil,
        artworkUrl: URL? = nil,
        version: Int = 1,
        contentHash: String? = nil
    ) {
        self.id = id
        self.name = name
        self.categoryId = categoryId
        self.thumbnailUrl = thumbnailUrl
        self.artworkUrl = artworkUrl
        self.version = version
        self.contentHash = contentHash
    }
}

public struct SkinDetail: Identifiable, Codable, Sendable {
    public let id: String
    public let name: String
    public let description: String?
    public let artworkUrl: URL?
    public let version: Int

    public init(
        id: String,
        name: String,
        description: String? = nil,
        artworkUrl: URL? = nil,
        version: Int = 1
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.artworkUrl = artworkUrl
        self.version = version
    }
}

public struct OtpDelivery: Codable, Sendable {
    public let ok: Bool
    public let expiresIn: Int
    public let delivery: String
    public let cooldownSeconds: Int?
}

public struct RegisteredDevice: Codable, Identifiable, Sendable {
    public let id: String
    public let installationId: String
    public let label: String?
    public let status: String
    public let appVersion: String?
    public let iosVersion: String?
    public let lastSeenAt: String?
}

public struct AppReleaseInfo: Codable, Sendable {
    public let id: String?
    public let version: String?
    public let releaseNotes: String?
    public let checksum: String?
    public let downloadAvailable: Bool?
    public let isMandatory: Bool?
}

public struct EntitlementPayload: Codable, Sendable {
    public let id: String
    public let status: String
    public let plan: String
    public let maxDevices: Int
    public let purchaseId: String?
    public let createdAt: String?
}

public struct CustomerPurchase: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let reference: String
    public let createdAt: String
    public let amountMinor: Int
    public let currency: String
    public let status: String
    public let paymentMethod: String
}

public struct EntitlementStatus: Codable, Sendable {
    public let entitlement: EntitlementPayload?
    public let activeDevices: Int

    public var active: Bool { entitlement?.status == "active" }
    public var plan: String? { entitlement?.plan }

    public init(entitlement: EntitlementPayload?, activeDevices: Int) {
        self.entitlement = entitlement
        self.activeDevices = activeDevices
    }
}

public struct RemoteAppConfig: Codable, Sendable {
    public let killSwitchApply: Bool
    public let killSwitchRestore: Bool
    public let minAppVersion: String
    public let minIosVersion: String
    public let maintenanceMode: Bool
    public let message: String?

    public init(
        killSwitchApply: Bool,
        killSwitchRestore: Bool,
        minAppVersion: String,
        minIosVersion: String,
        maintenanceMode: Bool,
        message: String? = nil
    ) {
        self.killSwitchApply = killSwitchApply
        self.killSwitchRestore = killSwitchRestore
        self.minAppVersion = minAppVersion
        self.minIosVersion = minIosVersion
        self.maintenanceMode = maintenanceMode
        self.message = message
    }
}

public struct AIGenerationRequest: Codable, Sendable {
    public let prompt: String
    public let stylePresetId: String?

    public init(prompt: String, stylePresetId: String? = nil) {
        self.prompt = prompt
        self.stylePresetId = stylePresetId
    }
}

public struct AIGenerationResult: Codable, Sendable {
    public let id: String
    public let resultUrl: URL?
    public let status: String?

    public init(id: String, resultUrl: URL? = nil, status: String? = nil) {
        self.id = id
        self.resultUrl = resultUrl
        self.status = status
    }
}

public struct CompatibilityRule: Codable, Sendable, Equatable {
    public let id: String
    public let minIosVersion: String
    public let maxIosVersion: String?
    public let supportedModels: [String]?
    public let state: String
    public let minAppVersion: String?
    public let notes: String?

    public init(
        id: String,
        minIosVersion: String,
        maxIosVersion: String? = nil,
        supportedModels: [String]? = nil,
        state: String,
        minAppVersion: String? = nil,
        notes: String? = nil
    ) {
        self.id = id
        self.minIosVersion = minIosVersion
        self.maxIosVersion = maxIosVersion
        self.supportedModels = supportedModels
        self.state = state
        self.minAppVersion = minAppVersion
        self.notes = notes
    }
}

public struct CompatibilityCatalog: Codable, Sendable, Equatable {
    public let rules: [CompatibilityRule]

    public init(rules: [CompatibilityRule]) {
        self.rules = rules
    }
}

public struct AuthUserPayload: Codable, Sendable {
    public let id: String
    public let email: String
    public let role: String
}
