import Foundation
#if os(iOS) && canImport(GoogleSignIn)
import GoogleSignIn
import UIKit
#endif

public protocol GoogleIdentitySigning: Sendable {
    @MainActor func idToken() async throws -> String?
    @MainActor func signOut()
}

public enum GoogleSignInClientError: Error, Equatable {
    case unavailable
    case failed
}

public struct UnavailableGoogleIdentitySigning: GoogleIdentitySigning {
    public init() {}

    public func idToken() async throws -> String? {
        throw GoogleSignInClientError.unavailable
    }

    public func signOut() {}
}

/// Basic sign-in only. `additionalScopes: nil` keeps the request to openid, email, and profile.
#if os(iOS) && canImport(GoogleSignIn)
public struct DeviceGoogleIdentitySigning: GoogleIdentitySigning {
    public init() {}

    public func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }

    public func idToken() async throws -> String? {
        guard
            let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
            let serverClientID = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String,
            !clientID.isEmpty,
            !serverClientID.isEmpty,
            let controller = Self.presentingController()
        else {
            throw GoogleSignInClientError.unavailable
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: clientID,
            serverClientID: serverClientID
        )
        return try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(
                withPresenting: controller,
                hint: nil,
                additionalScopes: nil
            ) { result, error in
                if let error {
                    let nsError = error as NSError
                    // Cancellation is not a failure shown to the customer.
                    if nsError.domain == kGIDSignInErrorDomain && nsError.code == -5 {
                        continuation.resume(returning: nil)
                        return
                    }
                    continuation.resume(throwing: GoogleSignInClientError.failed)
                    return
                }
                guard let token = result?.user.idToken?.tokenString, !token.isEmpty else {
                    continuation.resume(throwing: GoogleSignInClientError.failed)
                    return
                }
                continuation.resume(returning: token)
            }
        }
    }

    private static func presentingController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.flatMap(\.windows).first
        var controller = window?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller
    }
}
#endif

public enum GoogleAuthCallback {
    public static func handle(_ url: URL) -> Bool {
        #if os(iOS) && canImport(GoogleSignIn)
        return GIDSignIn.sharedInstance.handle(url)
        #else
        _ = url
        return false
        #endif
    }
}
