import Foundation
import Security

/// Holds the NAMAT session token in the Keychain and UI state in memory.
@MainActor
final class SessionStore: ObservableObject {
    @Published var email: String?
    @Published var isLoggedIn = false
    @Published var entitlementActive = false

    private let tokenKey = "sa.namat.app.token"
    private let emailKey = "sa.namat.app.email"

    var token: String? { Keychain.read(key: tokenKey) }

    init() {
        if let t = Keychain.read(key: tokenKey), let e = Keychain.read(key: emailKey) {
            email = e
            isLoggedIn = true
            _ = t
        }
    }

    func applyLogin(email: String, token: String) {
        Keychain.write(key: tokenKey, value: token)
        Keychain.write(key: emailKey, value: email)
        self.email = email
        self.isLoggedIn = true
    }

    func applyEntitlement(_ active: Bool) {
        self.entitlementActive = active
    }

    func clear() {
        Keychain.delete(key: tokenKey)
        Keychain.delete(key: emailKey)
        email = nil
        isLoggedIn = false
        entitlementActive = false
    }
}

enum Keychain {
    static func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func write(key: String, value: String) -> Bool {
        delete(key: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
