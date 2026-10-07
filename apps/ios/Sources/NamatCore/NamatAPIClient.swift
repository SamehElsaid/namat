import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct GoogleLoginRequest: Encodable, Equatable {
    public let idToken: String

    public init(idToken: String) {
        self.idToken = idToken
    }
}

public enum NamatAPIError: Error, Sendable, Equatable {
    case notAuthenticated
    case http(status: Int, code: String?, retryAfterSeconds: Int?)
    case decoding
    case network(String)
    case privacyViolationAttempt
}

/// HTTP client for NAMAT account / entitlement / skins / AI prompt paths.
///
/// **Privacy contract:** payloads may include account email, OTP, entitlement,
/// device installation ID, skin IDs, prompts — **never** `localKey`, PAN, CVV,
/// PIN, Apple Pay tokens, or Wallet identifiers.
public struct NamatAPIClient: Sendable {
    public let baseURL: URL
    public let session: SessionStore
    private let urlSession: URLSession

    public let appVersion: String
    public let iosVersion: String
    public let deviceKey: any DeviceKeySigning

    public init(
        baseURL: URL,
        session: SessionStore,
        urlSession: URLSession = .shared,
        appVersion: String? = nil,
        iosVersion: String? = nil,
        deviceKey: any DeviceKeySigning = UnavailableDeviceKey()
    ) {
        self.baseURL = baseURL
        self.session = session
        self.urlSession = urlSession
        self.appVersion = appVersion ?? RuntimeVersions.appVersion()
        self.iosVersion = iosVersion ?? RuntimeVersions.iosVersion()
        self.deviceKey = deviceKey
    }

    // MARK: - Auth

    public func requestOTP(email: String) async throws -> OtpDelivery {
        struct Body: Encodable { let email: String }
        return try await postJSON("auth/otp/request", body: Body(email: email), authed: false)
    }

    public func verifyOTP(email: String, code: String) async throws {
        struct Body: Encodable { let email: String; let code: String }
        let response: AuthSessionResponse = try await postJSON(
            "auth/otp/verify",
            body: Body(email: email, code: code),
            authed: false
        )
        try await finishLogin(response)
    }

    /// Sends only the Google ID token. Wallet data is never attached.
    public func loginWithGoogle(idToken: String) async throws {
        let response: AuthSessionResponse = try await postJSON(
            "auth/google",
            body: GoogleLoginRequest(idToken: idToken),
            authed: false
        )
        try await finishLogin(response)
    }

    private struct AuthSessionResponse: Decodable {
        let accessToken: String
        let user: AuthUserPayload
    }

    private func finishLogin(_ response: AuthSessionResponse) async throws {
        session.applyLogin(email: response.user.email, token: response.accessToken, entitlementActive: false)
        if response.user.role == "owner" {
            try? await ensureOwnerTestEntitlement()
        }
        if let entitlement = try? await fetchEntitlement() {
            session.applyLogin(
                email: response.user.email,
                token: response.accessToken,
                entitlementActive: entitlement.active
            )
        }
    }

    // MARK: - Devices / entitlement (installation ID only — not Wallet keys)

    public func fetchDevices() async throws -> [RegisteredDevice] {
        try await getJSON("devices", authed: true)
    }

    public func deactivateDevice(id: String) async throws {
        var request = try makeRequest(path: "devices/\(id)", method: "DELETE", authed: true)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await perform(request)
        try validate(response, data: data)
    }

    public func fetchPurchases() async throws -> [CustomerPurchase] {
        struct Envelope: Decodable { let purchases: [CustomerPurchase] }
        let envelope: Envelope = try await getJSON("purchases/mine", authed: true)
        return envelope.purchases
    }

    public func logout() async throws {
        try await post("auth/logout", body: EmptyBody(), authed: true)
    }

    public func logoutEverywhere() async throws {
        try await post("auth/logout-all", body: EmptyBody(), authed: true)
    }

    /// Revokes a token that has already been removed from the local session.
    public func revokeSession(token: String, everywhere: Bool) async throws {
        try await post(
            everywhere ? "auth/logout-all" : "auth/logout",
            body: EmptyBody(),
            authed: true,
            bearer: token
        )
    }

    public func fetchLatestAppVersion() async throws -> AppReleaseInfo {
        try await getJSON("app-versions/latest", authed: false)
    }

    public func registerDevice() async throws {
        struct Body: Encodable {
            let installationId: String
            let appVersion: String
            let iosVersion: String
            let installationToken: String
            let publicKeyPoint: String?
        }
        try await post(
            "devices/register",
            body: Body(
                installationId: session.deviceInstallationID,
                appVersion: appVersion,
                iosVersion: iosVersion,
                installationToken: session.installationToken,
                publicKeyPoint: deviceKey.publicKeyPoint
            ),
            authed: true
        )
    }

    public struct ApplyChallenge: Decodable, Equatable, Sendable {
        public let challengeId: String
        public let nonce: String
    }

    /// Proves this installation's device key. Does not send Wallet or photo bytes.
    public func authorizeApply() async throws {
        struct ChallengeBody: Encodable { let installationId: String }
        struct ProveBody: Encodable {
            let challengeId: String
            let nonce: String
            let signature: String
        }
        let challenge: ApplyChallenge = try await postJSON(
            "devices/activation/challenge",
            body: ChallengeBody(installationId: session.deviceInstallationID),
            authed: true
        )
        let signature = try deviceKey.signature(forNonce: challenge.nonce)
        try await post(
            "devices/activation/prove",
            body: ProveBody(
                challengeId: challenge.challengeId,
                nonce: challenge.nonce,
                signature: signature
            ),
            authed: true
        )
    }

    public func transferActivation() async throws {
        try await post("devices/transfer", body: EmptyBody(), authed: true)
    }

    public func fetchEntitlement() async throws -> EntitlementStatus {
        try await getJSON("entitlements/me", authed: true)
    }

    /// Owner sessions only. A normal account receives an authorization failure and no grant.
    public func ensureOwnerTestEntitlement() async throws {
        try await post("admin/entitlements/owner-test", body: EmptyBody(), authed: true)
    }

    // MARK: - Skins

    public func fetchSkins() async throws -> [SkinSummary] {
        struct Envelope: Decodable { let skins: [SkinSummary] }
        let env: Envelope = try await getJSON("skins/manifest", authed: false)
        return env.skins
    }

    public func fetchSkinDetail(id: String) async throws -> SkinDetail {
        // skin id only — never attach localKey
        try await getJSON("skins/\(id)", authed: true)
    }

    public func downloadArtwork(url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        let (data, response) = try await perform(request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NamatAPIError.http(
                status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                code: nil,
                retryAfterSeconds: nil
            )
        }
        return data
    }

    // MARK: - Remote config

    public func fetchRemoteConfig() async throws -> RemoteAppConfig {
        try await getJSON("remote-config", authed: false)
    }

    public func fetchCompatibility() async throws -> CompatibilityCatalog {
        try await getJSON("compatibility", authed: false)
    }

    // MARK: - AI Skin Studio (prompt only — no wallet data)

    public func generateSkin(prompt: String, styleID: String?) async throws -> AIGenerationResult {
        // Explicit guard: reject accidental Wallet-looking fields in prompt payloads
        let request = AIGenerationRequest(prompt: prompt, stylePresetId: styleID)
        try Self.assertNoWalletMaterial(in: prompt)
        return try await postJSON("ai/generations", body: request, authed: true)
    }

    /// Defense-in-depth: refuse strings that look like pass hashes / localKey assignments.
    public static func assertNoWalletMaterial(in text: String) throws {
        let lowered = text.lowercased()
        if lowered.contains("localkey") || lowered.contains("passhash") || lowered.contains("cardhash") {
            throw NamatAPIError.privacyViolationAttempt
        }
        if let regex = try? NSRegularExpression(pattern: #"(?i)\b[0-9a-f]{32,}\b"#) {
            let range = NSRange(text.startIndex..., in: text)
            if regex.firstMatch(in: text, range: range) != nil {
                throw NamatAPIError.privacyViolationAttempt
            }
        }
    }

    // MARK: - Transport

    private func getJSON<T: Decodable>(_ path: String, authed: Bool) async throws -> T {
        let request = try makeRequest(path: path, method: "GET", authed: authed)
        let (data, response) = try await perform(request)
        try validate(response, data: data)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw NamatAPIError.decoding
        }
    }

    private func postJSON<Body: Encodable, T: Decodable>(
        _ path: String,
        body: Body,
        authed: Bool
    ) async throws -> T {
        var request = try makeRequest(path: path, method: "POST", authed: authed)
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await perform(request)
        try validate(response, data: data)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw NamatAPIError.decoding
        }
    }

    private struct EmptyBody: Encodable {}

    private func post<Body: Encodable>(
        _ path: String,
        body: Body,
        authed: Bool,
        bearer: String? = nil
    ) async throws {
        var request = try makeRequest(path: path, method: "POST", authed: authed, bearer: bearer)
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await perform(request)
        try validate(response, data: data)
    }

    /// Async URLSession bridge that works on Apple (native async) and Linux (callback).
    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        #if canImport(FoundationNetworking)
        try await withCheckedThrowingContinuation { continuation in
            let task = urlSession.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: NamatAPIError.network(error.localizedDescription))
                    return
                }
                guard let data, let response else {
                    continuation.resume(throwing: NamatAPIError.network("empty response"))
                    return
                }
                continuation.resume(returning: (data, response))
            }
            task.resume()
        }
        #else
        try await urlSession.data(for: request)
        #endif
    }

    private func makeRequest(
        path: String,
        method: String,
        authed: Bool,
        bearer: String? = nil
    ) throws -> URLRequest {
        let root = baseURL.absoluteString.hasSuffix("/") ? baseURL.absoluteString : baseURL.absoluteString + "/"
        guard let url = URL(string: path, relativeTo: URL(string: root))?.absoluteURL else {
            throw NamatAPIError.network("invalid url")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if authed {
            guard let token = bearer ?? session.accessToken else { throw NamatAPIError.notAuthenticated }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        // Device installation ID header — never a Wallet local key
        request.setValue(session.deviceInstallationID, forHTTPHeaderField: "X-Namat-Device-Installation-Id")
        return request
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw NamatAPIError.network("invalid response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let parsed = Self.parseFailure(data)
            throw NamatAPIError.http(
                status: http.statusCode,
                code: parsed.code,
                retryAfterSeconds: parsed.retryAfterSeconds
            )
        }
    }

    static func parseFailure(_ data: Data) -> (code: String?, retryAfterSeconds: Int?) {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (nil, nil)
        }
        let retry = object["retryAfterSeconds"] as? Int
        if let code = object["error"] as? String, !isGenericHTTPName(code) {
            return (code, retry)
        }
        if let message = object["message"] as? [String: Any],
           let code = message["error"] as? String {
            return (code, (message["retryAfterSeconds"] as? Int) ?? retry)
        }
        return (nil, retry)
    }

    private static func isGenericHTTPName(_ code: String) -> Bool {
        [
            "Bad Request",
            "Unauthorized",
            "Forbidden",
            "Not Found",
            "Conflict",
            "Too Many Requests",
            "Internal Server Error",
            "Service Unavailable",
        ].contains(code)
    }
}
