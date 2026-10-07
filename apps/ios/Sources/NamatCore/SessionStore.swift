import Foundation

/// Account/session state. Never stores Wallet local keys or card material.
public final class SessionStore: @unchecked Sendable {
    private let lock = NSLock()
    private var _accessToken: String?
    private var _email: String?
    private var _deviceInstallationID: String
    private var _installationToken: String
    private var _entitlementActive: Bool = false

    public init(deviceInstallationID: String? = nil) {
        if let deviceInstallationID {
            _deviceInstallationID = deviceInstallationID
        } else if let existing = UserDefaults.standard.string(forKey: "namat.deviceInstallationID") {
            _deviceInstallationID = existing
        } else {
            let id = UUID().uuidString
            UserDefaults.standard.set(id, forKey: "namat.deviceInstallationID")
            _deviceInstallationID = id
        }
        if let existingToken = UserDefaults.standard.string(forKey: "namat.installationToken") {
            _installationToken = existingToken
        } else {
            let token = UUID().uuidString
            UserDefaults.standard.set(token, forKey: "namat.installationToken")
            _installationToken = token
        }
        _accessToken = UserDefaults.standard.string(forKey: "namat.accessToken")
        _email = UserDefaults.standard.string(forKey: "namat.email")
        _entitlementActive = UserDefaults.standard.bool(forKey: "namat.entitlementActive")
    }

    public var accessToken: String? {
        lock.lock(); defer { lock.unlock() }
        return _accessToken
    }

    public var email: String? {
        lock.lock(); defer { lock.unlock() }
        return _email
    }

    public var deviceInstallationID: String {
        lock.lock(); defer { lock.unlock() }
        return _deviceInstallationID
    }

    /// App-generated activation secret. Not an Apple UDID and not a Wallet identifier.
    public var installationToken: String {
        lock.lock(); defer { lock.unlock() }
        return _installationToken
    }

    public var entitlementActive: Bool {
        lock.lock(); defer { lock.unlock() }
        return _entitlementActive
    }

    public var isAuthenticated: Bool { accessToken != nil }

    public func applyLogin(email: String, token: String, entitlementActive: Bool) {
        lock.lock()
        _email = email
        _accessToken = token
        _entitlementActive = entitlementActive
        lock.unlock()
        UserDefaults.standard.set(email, forKey: "namat.email")
        UserDefaults.standard.set(token, forKey: "namat.accessToken")
        UserDefaults.standard.set(entitlementActive, forKey: "namat.entitlementActive")
    }

    public func clear() {
        lock.lock()
        _email = nil
        _accessToken = nil
        _entitlementActive = false
        lock.unlock()
        UserDefaults.standard.removeObject(forKey: "namat.email")
        UserDefaults.standard.removeObject(forKey: "namat.accessToken")
        UserDefaults.standard.removeObject(forKey: "namat.entitlementActive")
        NotificationCenter.default.post(name: .namatSignedOut, object: nil)
    }
}

public extension Notification.Name {
    static let namatSignedOut = Notification.Name("namat.signedOut")
}
