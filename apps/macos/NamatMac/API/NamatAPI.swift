import Foundation

/// Minimal NAMAT API client (auth, entitlement, skins, remote config,
/// compatibility). Never sends Wallet identifiers or card data.
@MainActor
final class NamatAPI {
    let baseURL: URL
    let session: SessionStore

    init(baseURL: URL, session: SessionStore) {
        self.baseURL = baseURL
        self.session = session
    }

    // MARK: - Auth

    struct OTPRequest: Encodable { let email: String }
    struct OTPVerify: Encodable { let email: String; let code: String }
    struct GoogleRequest: Encodable { let idToken: String }

    func requestOTP(email: String) async throws -> OtpDelivery {
        try await post("auth/otp/request", body: OTPRequest(email: email), authed: false)
    }

    func verifyOTP(email: String, code: String) async throws -> AuthUserPayload {
        let r: AuthSessionResponse = try await post(
            "auth/otp/verify", body: OTPVerify(email: email, code: code), authed: false)
        session.applyLogin(email: r.user.email, token: r.accessToken)
        return r.user
    }

    func loginWithGoogle(idToken: String) async throws -> AuthUserPayload {
        let r: AuthSessionResponse = try await post(
            "auth/google", body: GoogleRequest(idToken: idToken), authed: false)
        session.applyLogin(email: r.user.email, token: r.accessToken)
        return r.user
    }

    private struct Ignored: Codable {}

    func logout() async throws {
        let _: Ignored? = try? await post("auth/logout", body: Empty(), authed: true)
        session.clear()
    }

    // MARK: - Entitlement / skins / config

    struct Empty: Encodable {}

    struct EntitlementEnvelope: Codable {
        let entitlement: EntitlementPayload?
        let activeDevices: Int
    }

    func fetchEntitlement() async throws -> EntitlementStatus {
        let e: EntitlementEnvelope = try await get("entitlements/me", authed: true)
        return EntitlementStatus(entitlement: e.entitlement, activeDevices: e.activeDevices)
    }

    struct SkinsEnvelope: Codable { let skins: [SkinSummary] }

    func fetchSkins() async throws -> [SkinSummary] {
        let e: SkinsEnvelope = try await get("skins/manifest", authed: false)
        return e.skins
    }

    func fetchSkinDetail(id: String) async throws -> SkinDetail {
        try await get("skins/\(id)", authed: true)
    }

    func fetchRemoteConfig() async throws -> RemoteAppConfig {
        try await get("remote-config", authed: false)
    }

    func fetchCompatibility() async throws -> CompatibilityCatalog {
        try await get("compatibility", authed: false)
    }

    func downloadArtwork(_ url: URL) async throws -> Data {
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NamatAPIError.http(status: (resp as? HTTPURLResponse)?.statusCode ?? -1, code: nil)
        }
        return data
    }

    // MARK: - Transport

    private func makeRequest(path: String, method: String, authed: Bool) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw NamatAPIError.network("bad_url")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if authed {
            guard let token = session.token else { throw NamatAPIError.notAuthenticated }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private func perform(_ req: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else {
                throw NamatAPIError.network("no_http_response")
            }
            return (data, http)
        } catch let e as NamatAPIError {
            throw e
        } catch {
            throw NamatAPIError.network(error.localizedDescription)
        }
    }

    private func validate(_ http: HTTPURLResponse, data: Data) throws {
        guard (200..<300).contains(http.statusCode) else {
            var code: String?
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                code = obj["code"] as? String ?? obj["error"] as? String
            }
            throw NamatAPIError.http(status: http.statusCode, code: code)
        }
    }

    private func get<T: Decodable>(_ path: String, authed: Bool) async throws -> T {
        let req = try makeRequest(path: path, method: "GET", authed: authed)
        let (data, http) = try await perform(req)
        try validate(http, data: data)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw NamatAPIError.decoding }
    }

    private func post<Body: Encodable, T: Decodable>(
        _ path: String, body: Body, authed: Bool
    ) async throws -> T {
        var req = try makeRequest(path: path, method: "POST", authed: authed)
        req.httpBody = try JSONEncoder().encode(body)
        let (data, http) = try await perform(req)
        try validate(http, data: data)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw NamatAPIError.decoding }
    }
}
