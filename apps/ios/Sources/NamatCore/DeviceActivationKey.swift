import Foundation

public enum DeviceKeyError: Error {
    case unavailable
}

/// Signs an activation nonce. The private key never leaves the iPhone.
public protocol DeviceKeySigning: Sendable {
    var publicKeyPoint: String? { get }
    func signature(forNonce nonce: String) throws -> String
}

public struct UnavailableDeviceKey: DeviceKeySigning {
    public init() {}
    public var publicKeyPoint: String? { nil }
    public func signature(forNonce nonce: String) throws -> String {
        throw DeviceKeyError.unavailable
    }
}

#if os(iOS)
import Security

public final class KeychainDeviceKey: DeviceKeySigning, @unchecked Sendable {
    public let publicKeyPoint: String?
    private let privateKey: SecKey?

    public init() {
        let tag = Data("sa.shara.namat.device-activation".utf8)
        if let existing = Self.load(tag: tag) {
            privateKey = existing
            publicKeyPoint = Self.point(for: existing)
            return
        }
        let created = Self.generate(tag: tag, secureEnclave: true) ?? Self.generate(tag: tag, secureEnclave: false)
        privateKey = created
        publicKeyPoint = created.flatMap(Self.point(for:))
    }

    public func signature(forNonce nonce: String) throws -> String {
        guard let privateKey else { throw DeviceKeyError.unavailable }
        var error: Unmanaged<CFError>?
        let data = Data(nonce.utf8) as CFData
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            data,
            &error
        ) as Data? else {
            throw DeviceKeyError.unavailable
        }
        return signature.base64EncodedString()
    }

    private static func load(tag: Data) -> SecKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let item else { return nil }
        return (item as! SecKey)
    }

    private static func generate(tag: Data, secureEnclave: Bool) -> SecKey? {
        var privateAttrs: [String: Any] = [
            kSecAttrIsPermanent as String: true,
            kSecAttrApplicationTag as String: tag,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        var attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecPrivateKeyAttrs as String: privateAttrs,
        ]
        if secureEnclave {
            attributes[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave
            if let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                .privateKeyUsage,
                nil
            ) {
                privateAttrs[kSecAttrAccessControl as String] = access
            }
            attributes[kSecPrivateKeyAttrs as String] = privateAttrs
        }
        var error: Unmanaged<CFError>?
        return SecKeyCreateRandomKey(attributes as CFDictionary, &error)
    }

    private static func point(for privateKey: SecKey) -> String? {
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else { return nil }
        var error: Unmanaged<CFError>?
        guard let data = SecKeyCopyExternalRepresentation(publicKey, &error) as Data?,
              data.count == 65,
              data.first == 0x04 else {
            return nil
        }
        return data.base64EncodedString()
    }
}
#endif
