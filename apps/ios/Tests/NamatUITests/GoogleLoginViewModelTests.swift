import XCTest
import WalletSkinEngine
@testable import NamatCore
@testable import NamatUI

@MainActor
final class GoogleLoginViewModelTests: XCTestCase {
    private var preserved: [String: Any?] = [:]

    override func setUp() {
        super.setUp()
        for key in ["namat.accessToken", "namat.email", "namat.entitlementActive", "namat.language"] {
            preserved[key] = UserDefaults.standard.object(forKey: key)
        }
        UserDefaults.standard.removeObject(forKey: "namat.accessToken")
        UserDefaults.standard.removeObject(forKey: "namat.email")
        UserDefaults.standard.set(false, forKey: "namat.entitlementActive")
        LanguageStore.shared.setCode("ar")
        GoogleLoginStubURLProtocol.reset()
    }

    override func tearDown() {
        for (key, value) in preserved {
            if let value {
                UserDefaults.standard.set(value, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
        GoogleLoginStubURLProtocol.reset()
        super.tearDown()
    }

    func testChooseIsTheInitialLoginStep() {
        let vm = LoginViewModel(api: client(), google: ScriptedGoogleSigner(.success(nil)))
        XCTAssertEqual(vm.step, .choose)
    }

    func testCancelledGoogleLoginCreatesNoSessionAndNoError() async {
        let session = SessionStore(deviceInstallationID: "google-cancel-\(UUID().uuidString)")
        let vm = LoginViewModel(
            api: client(session: session),
            google: ScriptedGoogleSigner(.success(nil))
        )
        let signedIn = await vm.continueWithGoogle()
        XCTAssertFalse(signedIn)
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(session.isAuthenticated)
        XCTAssertTrue(GoogleLoginStubURLProtocol.requests.isEmpty)
    }

    func testGoogleFailureStaysOnTheChoiceScreenWithACustomerMessage() async {
        let session = SessionStore(deviceInstallationID: "google-fail-\(UUID().uuidString)")
        let vm = LoginViewModel(
            api: client(session: session),
            google: ScriptedGoogleSigner(.failure(GoogleSignInClientError.failed))
        )
        let signedIn = await vm.continueWithGoogle()
        XCTAssertFalse(signedIn)
        XCTAssertEqual(vm.step, .choose)
        XCTAssertEqual(vm.errorMessage, "تعذر تسجيل الدخول باستخدام Google. حاول مرة أخرى.")
        XCTAssertFalse(session.isAuthenticated)
    }

    func testSuccessfulGoogleLoginStoresTheNamatSessionOnly() async throws {
        let session = SessionStore(deviceInstallationID: "google-ok-\(UUID().uuidString)")
        let idToken = "header.payload.signature-value"
        let vm = LoginViewModel(
            api: client(session: session),
            google: ScriptedGoogleSigner(.success(idToken))
        )
        let signedIn = await vm.continueWithGoogle()
        XCTAssertTrue(signedIn)
        XCTAssertNil(vm.errorMessage)
        XCTAssertTrue(session.isAuthenticated)
        XCTAssertEqual(session.accessToken, "namat-session-token")
        XCTAssertEqual(session.email, "person@example.com")
        XCTAssertNotEqual(session.accessToken, idToken)

        let login = GoogleLoginStubURLProtocol.requests.first { $0.url?.path.hasSuffix("auth/google") == true }
        let request = try XCTUnwrap(login)
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        let body = try XCTUnwrap(GoogleLoginStubURLProtocol.body(of: request))
        let object = try JSONSerialization.jsonObject(with: body) as? [String: String]
        XCTAssertEqual(object, ["idToken": idToken])
    }

    func testSignOutClearsTheNamatSessionAndTheGoogleSession() async throws {
        let session = SessionStore(deviceInstallationID: "google-out-\(UUID().uuidString)")
        session.applyLogin(email: "person@example.com", token: "namat-session-token", entitlementActive: false)
        let signer = ScriptedGoogleSigner(.success(nil))
        let engine = try await LocalStubEngine(cards: [], supported: true)
        let env = AppEnvironment(
            engine: engine,
            api: client(session: session),
            session: session,
            google: signer
        )
        let account = AccountViewModel(env: env)
        account.signOut()
        XCTAssertTrue(signer.didSignOut)
        XCTAssertFalse(session.isAuthenticated)
        XCTAssertNil(session.accessToken)
    }

    private func client(session: SessionStore = SessionStore(deviceInstallationID: "google-unused")) -> NamatAPIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [GoogleLoginStubURLProtocol.self]
        return NamatAPIClient(
            baseURL: URL(string: "https://namat.shara.sa/api/v1")!,
            session: session,
            urlSession: URLSession(configuration: configuration)
        )
    }
}

private final class ScriptedGoogleSigner: GoogleIdentitySigning, @unchecked Sendable {
    var outcome: Result<String?, Error>
    private(set) var didSignOut = false

    init(_ outcome: Result<String?, Error>) {
        self.outcome = outcome
    }

    func idToken() async throws -> String? {
        try outcome.get()
    }

    func signOut() {
        didSignOut = true
    }
}

private final class GoogleLoginStubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var requests: [URLRequest] = []

    static func reset() {
        requests = []
    }

    static func body(of request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1024)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let count = stream.read(buffer, maxLength: 1024)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests.append(request)
        let path = request.url?.path ?? ""
        let status: Int
        let payload: Data
        if path.hasSuffix("auth/google") {
            status = 200
            payload = Data(
                #"{"accessToken":"namat-session-token","user":{"id":"user-1","email":"person@example.com","role":"user"}}"#.utf8
            )
        } else {
            status = 404
            payload = Data(#"{"error":"Not Found"}"#.utf8)
        }
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://namat.shara.sa/api/v1")!,
            statusCode: status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: payload)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
