import Foundation
import WalletSkinEngine

/// Dependency bag injected into SwiftUI views. Wallet engine stays local-only.
public struct AppEnvironment: Sendable {
    public let engine: any WalletSkinEngine
    public let api: NamatAPIClient
    public let session: SessionStore
    public let config: AppConfig
    public let google: any GoogleIdentitySigning

    public init(
        engine: any WalletSkinEngine,
        api: NamatAPIClient,
        session: SessionStore,
        config: AppConfig = .default,
        google: any GoogleIdentitySigning = UnavailableGoogleIdentitySigning()
    ) {
        self.engine = engine
        self.api = api
        self.session = session
        self.config = config
        self.google = google
    }

    @MainActor
    public static func makePreview() async throws -> AppEnvironment {
        #if DEBUG
        let engine = try await LocalStubEngine()
        let session = SessionStore()
        let api = NamatAPIClient(baseURL: AppConfig.default.apiBaseURL, session: session)
        return AppEnvironment(engine: engine, api: api, session: session)
        #else
        fatalError("Release builds must not instantiate LocalStubEngine.")
        #endif
    }
}

public struct AppConfig: Sendable {
    public let minSupportedAppVersion: String
    public let apiBaseURL: URL

    public init(minSupportedAppVersion: String, apiBaseURL: URL) {
        self.minSupportedAppVersion = minSupportedAppVersion
        self.apiBaseURL = apiBaseURL
    }

    /// Production URL. The Release Info.plist key `NamatAPIBaseURL` overrides this
    /// when present, and the packaged plist is what the device build uses.
    public static let productionAPIBaseURL = "https://namat.shara.sa/api/v1"

    public static var `default`: AppConfig {
        let raw = Bundle.main.object(forInfoDictionaryKey: "NamatAPIBaseURL") as? String
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let value = trimmed.isEmpty ? productionAPIBaseURL : trimmed
        return AppConfig(
            minSupportedAppVersion: "0.1.0",
            apiBaseURL: URL(string: value) ?? URL(string: productionAPIBaseURL)!
        )
    }
}
