import Foundation

#if canImport(Security)
import Security
#endif

/// On-device vault for original Wallet artwork bytes.
///
/// - Keyed by local card key (stored under a SHA-256 file name — never uploaded)
/// - First write wins: later skins MUST NOT overwrite the original backup
/// - Atomic writes where possible; verify before treating backup as ready
/// - Encrypted-at-rest when Keychain is available; otherwise Data Protection / file ACL
public actor OriginalArtworkVault {
    public struct Entry: Sendable, Equatable {
        public let bytes: Data
        public let createdAt: Date
        public let contentSHA256: String
        public let files: [String: Data]?
        public let filesSHA256: String?

        public init(
            bytes: Data,
            createdAt: Date = Date(),
            contentSHA256: String? = nil,
            files: [String: Data]? = nil,
            filesSHA256: String? = nil
        ) {
            self.bytes = bytes
            self.createdAt = createdAt
            self.contentSHA256 = contentSHA256 ?? Self.hash(bytes)
            self.files = files
            self.filesSHA256 = filesSHA256
        }

        public static func hash(_ data: Data) -> String {
            NAMATDigest.sha256Hex(data)
        }

        public static func hashFiles(_ files: [String: Data]) -> String {
            var payload = Data()
            for name in files.keys.sorted() {
                payload.append(Data(name.utf8))
                payload.append(0)
                payload.append(files[name] ?? Data())
            }
            return hash(payload)
        }

        public func matches(_ data: Data) -> Bool {
            contentSHA256 == Self.hash(data) && bytes == data
        }
    }

    private let rootDirectory: URL
    private let logger: SanitizedLogger
    private let useKeychain: Bool

    public init(
        rootDirectory: URL? = nil,
        logger: SanitizedLogger = SanitizedLogger(),
        useKeychain: Bool = true
    ) throws {
        let base: URL
        if let rootDirectory {
            base = rootDirectory
        } else {
            let appSupport = FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first
                ?? FileManager.default.temporaryDirectory
            base = appSupport.appendingPathComponent("NAMATOriginalArtwork", isDirectory: true)
        }
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        #if os(iOS) || os(macOS) || os(tvOS) || os(watchOS)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = base
        try? mutable.setResourceValues(values)
        #endif
        self.rootDirectory = base
        self.logger = logger
        #if canImport(Security)
        self.useKeychain = useKeychain
        #else
        self.useKeychain = false
        _ = useKeychain
        #endif
    }

    // MARK: - Public API

    public func status(forLocalKey localKey: String) async -> ArtworkBackupStatus {
        do {
            guard let entry = try loadEntry(localKey: localKey) else {
                return .none
            }
            if let files = entry.files, !files.isEmpty {
                let verified = entry.filesSHA256 == Entry.hashFiles(files)
                    && files.values.allSatisfy { !$0.isEmpty }
                let total = files.values.reduce(0) { $0 + $1.count }
                return .present(byteCount: total, verified: verified)
            }
            let verified = entry.matches(entry.bytes) && !entry.bytes.isEmpty
            return .present(byteCount: entry.bytes.count, verified: verified)
        } catch {
            logger.warning("vault status read failed: \(error.localizedDescription)")
            return .none
        }
    }

    public func hasOriginal(forLocalKey localKey: String) async -> Bool {
        if case .present = await status(forLocalKey: localKey) { return true }
        return false
    }

    /// Stores original artwork **only if** no backup exists yet.
    /// Returns `true` if a new backup was written, `false` if one already existed (left untouched).
    @discardableResult
    public func storeOriginalIfAbsent(localKey: String, bytes: Data) async throws -> Bool {
        guard !bytes.isEmpty else {
            throw WalletEngineError.backupFailed(detail: "empty original bytes")
        }
        if try loadEntry(localKey: localKey) != nil {
            logger.info(
                "original backup already present for \(SanitizedLogger.fingerprint(localKey)); skipping overwrite"
            )
            return false
        }
        let entry = Entry(bytes: bytes)
        try atomicWrite(localKey: localKey, entry: entry)
        // Verify before reporting success
        guard let loaded = try loadEntry(localKey: localKey), loaded.matches(bytes) else {
            try? deleteFile(localKey: localKey)
            throw WalletEngineError.backupVerifyFailed()
        }
        logger.info(
            "stored original backup \(SanitizedLogger.fingerprint(localKey)) bytes=\(bytes.count)"
        )
        return true
    }

    /// Stores the complete original asset set once. Later applies must not replace it.
    @discardableResult
    public func storeOriginalSetIfAbsent(localKey: String, files: [String: Data]) async throws -> Bool {
        let cleaned = files.filter { !$0.value.isEmpty }
        guard !cleaned.isEmpty else {
            throw WalletEngineError.backupFailed(detail: "empty original asset set")
        }
        if try loadEntry(localKey: localKey) != nil {
            logger.info(
                "original backup already present for \(SanitizedLogger.fingerprint(localKey)); skipping overwrite"
            )
            return false
        }
        let primary = cleaned[PassAssetSet.combined3x] ?? cleaned.values.first ?? Data()
        let entry = Entry(
            bytes: primary,
            files: cleaned,
            filesSHA256: Entry.hashFiles(cleaned)
        )
        try atomicWrite(localKey: localKey, entry: entry)
        guard let loaded = try loadEntry(localKey: localKey),
              loaded.files == cleaned,
              loaded.filesSHA256 == Entry.hashFiles(cleaned) else {
            try? deleteFile(localKey: localKey)
            throw WalletEngineError.backupVerifyFailed()
        }
        logger.info(
            "stored original asset set \(SanitizedLogger.fingerprint(localKey)) files=\(cleaned.count)"
        )
        return true
    }

    public func loadOriginalSet(localKey: String) async throws -> [String: Data] {
        let entry: Entry?
        do {
            entry = try loadEntry(localKey: localKey)
        } catch {
            throw WalletEngineError.backupVerifyFailed()
        }
        guard let entry else {
            throw WalletEngineError.backupMissing()
        }
        if let files = entry.files, !files.isEmpty {
            guard entry.filesSHA256 == Entry.hashFiles(files) else {
                throw WalletEngineError.backupVerifyFailed()
            }
            return files
        }
        guard entry.matches(entry.bytes), !entry.bytes.isEmpty else {
            throw WalletEngineError.backupVerifyFailed()
        }
        return [PassAssetSet.combined3x: entry.bytes]
    }

    public func loadOriginal(localKey: String) async throws -> Data {
        let entry: Entry?
        do {
            entry = try loadEntry(localKey: localKey)
        } catch {
            throw WalletEngineError.backupVerifyFailed()
        }
        guard let entry else {
            throw WalletEngineError.backupMissing()
        }
        guard entry.matches(entry.bytes), !entry.bytes.isEmpty else {
            throw WalletEngineError.backupVerifyFailed()
        }
        return entry.bytes
    }

    /// Test / maintenance helper — never called by Apply paths for production overwrite.
    public func forceDeleteForTests(localKey: String) async throws {
        try deleteFile(localKey: localKey)
        #if canImport(Security)
        if useKeychain {
            _ = deleteKeychain(localKey: localKey)
        }
        #endif
    }

    // MARK: - Storage

    private func fileURL(for localKey: String) -> URL {
        let name = Entry.hash(Data(localKey.utf8)) + ".bak"
        return rootDirectory.appendingPathComponent(name, isDirectory: false)
    }

    private func atomicWrite(localKey: String, entry: Entry) throws {
        let payload = try encode(entry)
        let dest = fileURL(for: localKey)
        let temp = dest.appendingPathExtension("tmp-\(UUID().uuidString)")

        try payload.write(to: temp, options: [.atomic])
        // Verify temp before replace
        let readBack = try Data(contentsOf: temp)
        guard readBack == payload else {
            try? FileManager.default.removeItem(at: temp)
            throw WalletEngineError.backupVerifyFailed()
        }

        if FileManager.default.fileExists(atPath: dest.path) {
            // Never overwrite an existing original backup.
            try? FileManager.default.removeItem(at: temp)
            logger.warning("refusing to overwrite existing vault file")
            return
        }

        try FileManager.default.moveItem(at: temp, to: dest)

        #if canImport(Security)
        if useKeychain {
            // Mirror into Keychain for encrypted-at-rest when available.
            _ = storeKeychain(localKey: localKey, data: payload)
        }
        #endif
    }

    private func loadEntry(localKey: String) throws -> Entry? {
        #if canImport(Security)
        if useKeychain, let keychainData = loadKeychain(localKey: localKey) {
            return try decode(keychainData)
        }
        #endif
        let dest = fileURL(for: localKey)
        guard FileManager.default.fileExists(atPath: dest.path) else {
            return nil
        }
        let data = try Data(contentsOf: dest)
        return try decode(data)
    }

    private func deleteFile(localKey: String) throws {
        let dest = fileURL(for: localKey)
        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
    }

    private struct WireFormat: Codable {
        let bytes: Data
        let createdAt: Date
        let contentSHA256: String
        let files: [String: Data]?
        let filesSHA256: String?
    }

    private func encode(_ entry: Entry) throws -> Data {
        let wire = WireFormat(
            bytes: entry.bytes,
            createdAt: entry.createdAt,
            contentSHA256: entry.contentSHA256,
            files: entry.files,
            filesSHA256: entry.filesSHA256
        )
        return try JSONEncoder().encode(wire)
    }

    private func decode(_ data: Data) throws -> Entry {
        let wire = try JSONDecoder().decode(WireFormat.self, from: data)
        return Entry(
            bytes: wire.bytes,
            createdAt: wire.createdAt,
            contentSHA256: wire.contentSHA256,
            files: wire.files,
            filesSHA256: wire.filesSHA256
        )
    }

    // MARK: - Keychain (Apple platforms)

    #if canImport(Security)
    private func keychainAccount(_ localKey: String) -> String {
        "namat.original." + Entry.hash(Data(localKey.utf8))
    }

    private func storeKeychain(localKey: String, data: Data) -> Bool {
        let account = keychainAccount(localKey)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "ai.namat.OriginalArtworkVault",
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        return status == errSecSuccess
    }

    private func loadKeychain(localKey: String) -> Data? {
        let account = keychainAccount(localKey)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "ai.namat.OriginalArtworkVault",
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return data
    }

    private func deleteKeychain(localKey: String) -> Bool {
        let account = keychainAccount(localKey)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "ai.namat.OriginalArtworkVault",
            kSecAttrAccount as String: account
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
    #endif
}
