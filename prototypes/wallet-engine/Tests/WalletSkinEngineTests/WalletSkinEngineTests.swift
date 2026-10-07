import XCTest
@testable import WalletSkinEngine

final class WalletSkinEngineTests: XCTestCase {

    // MARK: - Happy paths

    func testDiscoverApplyRestoreRoundTrip() async throws {
        let engine = try await LocalStubEngine()
        let cards = try await engine.discoverCards()
        XCTAssertFalse(cards.isEmpty)

        let card = cards[0]
        let original = await engine.currentArtwork(for: card)
        XCTAssertEqual(original, Data("ORIGINAL:\(card.localKey)".utf8))

        let artwork = SkinArtwork(pngData: Data("skin-v1".utf8))
        try await engine.applySkin(card: card, artwork: artwork)
        let applied = await engine.currentArtwork(for: card)
        XCTAssertEqual(applied, artwork.pngData)

        let status = await engine.backupStatus(for: card)
        guard case .present(_, true) = status else {
            return XCTFail("expected verified backup after apply")
        }

        try await engine.restoreOriginal(card: card)
        let restored = await engine.currentArtwork(for: card)
        XCTAssertEqual(restored, Data("ORIGINAL:\(card.localKey)".utf8))
    }

    func testSkinAThenSkinBThenRestoreOriginal() async throws {
        let engine = try await LocalStubEngine()
        let card = try await engine.discoverCards()[0]
        let trueOriginal = await engine.currentArtwork(for: card)

        let skinA = SkinArtwork(pngData: Data("SKIN-A".utf8))
        let skinB = SkinArtwork(pngData: Data("SKIN-B".utf8))

        try await engine.applySkin(card: card, artwork: skinA)
        let afterA = await engine.currentArtwork(for: card)
        XCTAssertEqual(afterA, skinA.pngData)

        try await engine.applySkin(card: card, artwork: skinB)
        let afterB = await engine.currentArtwork(for: card)
        XCTAssertEqual(afterB, skinB.pngData)

        // Second apply must not overwrite original backup
        try await engine.restoreOriginal(card: card)
        let restored = await engine.currentArtwork(for: card)
        XCTAssertEqual(restored, trueOriginal)
        XCTAssertEqual(trueOriginal, Data("ORIGINAL:\(card.localKey)".utf8))
    }

    func testBackupBeforeApplyNeverOverwritten() async throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("vault-test-\(UUID().uuidString)", isDirectory: true)
        let vault = try OriginalArtworkVault(rootDirectory: dir, useKeychain: false)
        let engine = try await LocalStubEngine(
            config: .init(),
            vault: vault
        )
        let card = try await engine.discoverCards()[0]

        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: Data("A".utf8)))
        let firstBackup = try await vault.loadOriginal(localKey: card.localKey)

        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: Data("B".utf8)))
        let secondBackup = try await vault.loadOriginal(localKey: card.localKey)

        XCTAssertEqual(firstBackup, secondBackup)
        XCTAssertEqual(firstBackup, Data("ORIGINAL:\(card.localKey)".utf8))

        // Direct vault call also refuses overwrite
        let wrote = try await vault.storeOriginalIfAbsent(
            localKey: card.localKey,
            bytes: Data("SHOULD-NOT-REPLACE".utf8)
        )
        XCTAssertFalse(wrote)
        let stillOriginal = try await vault.loadOriginal(localKey: card.localKey)
        XCTAssertEqual(stillOriginal, firstBackup)
    }

    // MARK: - Failure paths

    func testRestoreWithoutApplyFails() async throws {
        let engine = try await LocalStubEngine()
        do {
            let cards = try await engine.discoverCards()
            try await engine.restoreOriginal(card: cards[0])
            XCTFail("expected backupMissing")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_BACKUP_MISSING")
        }
    }

    func testApplyFailureRollsBackToPreApplyState() async throws {
        let engine = try await LocalStubEngine(
            config: .init(failVerification: true)
        )
        let card = try await engine.discoverCards()[0]
        let before = await engine.currentArtwork(for: card)

        do {
            try await engine.applySkin(
                card: card,
                artwork: SkinArtwork(pngData: Data("bad-apply".utf8))
            )
            XCTFail("expected apply failure")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_APPLY_FAILED")
        }

        let after = await engine.currentArtwork(for: card)
        XCTAssertEqual(after, before)
    }

    func testFailDuringWriteRollsBack() async throws {
        let engine = try await LocalStubEngine(
            config: .init(failDuringWrite: true)
        )
        let card = try await engine.discoverCards()[0]
        let before = await engine.currentArtwork(for: card)

        do {
            try await engine.applySkin(
                card: card,
                artwork: SkinArtwork(pngData: Data("x".utf8))
            )
            XCTFail("expected failure")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_APPLY_FAILED")
        }
        let after = await engine.currentArtwork(for: card)
        XCTAssertEqual(after, before)
    }

    func testInvalidArtworkRejected() async throws {
        let engine = try await LocalStubEngine()
        let card = try await engine.discoverCards()[0]
        do {
            try await engine.applySkin(
                card: card,
                artwork: SkinArtwork(pngData: Data(), pixelWidth: 0, pixelHeight: 0)
            )
            XCTFail("expected artworkInvalid")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_ARTWORK_INVALID")
        }
    }

    func testUnknownCardFails() async throws {
        let engine = try await LocalStubEngine()
        let ghost = LocalCard(localKey: "missing-cccccccccccccccc", displayLabel: "Ghost")
        do {
            try await engine.applySkin(
                card: ghost,
                artwork: SkinArtwork(pngData: Data("x".utf8))
            )
            XCTFail("expected cardNotFound")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_CARD_NOT_FOUND")
        }
    }

    func testPairingAndVPNDetectionHelpers() async throws {
        let engine = try await LocalStubEngine(
            config: .init(pairingAvailable: false, localDevVPNActive: false)
        )
        let pairing = await engine.isPairingAvailable()
        let vpn = await engine.isLocalDevVPNActive()
        XCTAssertFalse(pairing)
        XCTAssertFalse(vpn)
        let compat = await engine.checkCompatibility()
        XCTAssertFalse(compat.pairingAvailable)
        XCTAssertFalse(compat.localDevVPNActive)
    }

    func testErrorCodesAreStable() {
        XCTAssertEqual(WalletEngineError.applyFailed(detail: "x").code, "NAMAT_WALLET_APPLY_FAILED")
        XCTAssertEqual(WalletEngineError.restoreFailed(detail: "y").code, "NAMAT_WALLET_RESTORE_FAILED")
        XCTAssertEqual(WalletEngineError.backupFailed(detail: "z").code, "NAMAT_WALLET_BACKUP_FAILED")
        XCTAssertEqual(WalletEngineError.backupVerifyFailed().code, "NAMAT_WALLET_BACKUP_VERIFY_FAILED")
        XCTAssertEqual(WalletEngineError.rollbackFailed(detail: "r").code, "NAMAT_WALLET_ROLLBACK_FAILED")
    }

    func testSanitizedLoggerRedactsLocalKey() {
        let raw = "Found card localKey=stub-card-aaaaaaaaaaaaaaaaaaaa hash=0123456789abcdef0123456789abcdef"
        let redacted = SanitizedLogger.redact(raw)
        XCTAssertFalse(redacted.contains("stub-card-aaaaaaaaaaaaaaaaaaaa"))
        XCTAssertFalse(redacted.contains("0123456789abcdef0123456789abcdef"))
        XCTAssertTrue(redacted.contains("<redacted>"))
    }

    func testAirCardEngineCompatibilityWithStubFFI() async throws {
        let engine = try await AirCardWalletEngine(ffi: AirliftFFIStub())
        let compat = await engine.checkCompatibility()
        XCTAssertFalse(compat.isSupported)
        XCTAssertTrue(compat.requiresLocalDevVPN)
        XCTAssertTrue(compat.requiresPairingRecord)
    }

    func testInAppSetupFailsClosedWithoutPairingFramework() async throws {
        let stub = try await LocalStubEngine()
        do {
            _ = try await stub.beginInAppSetup(onPin: { _ in }, shouldCancel: { false })
            XCTFail("stub setup must not report success")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_FFI_UNAVAILABLE")
        }
        let air = try await AirCardWalletEngine(ffi: AirliftFFIStub())
        do {
            _ = try await air.beginInAppSetup(onPin: { _ in }, shouldCancel: { false })
            XCTFail("unlinked host must not report success")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_FFI_UNAVAILABLE")
        }
    }

    func testEd25519SeedMatchesTheRfcVector() {
        let empty = SHA512.hash([])
        XCTAssertEqual(
            empty.map { String(format: "%02x", $0) }.joined(),
            "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"
        )
        let seed = hexBytes("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
        let expected = hexBytes("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        XCTAssertEqual(Ed25519Pair.publicKey(forSeed: seed), expected)
    }

    func testPairingMaterialRejectsEmptyFiles() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("namat-pair-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let empty = directory.appendingPathComponent("empty.plist")
        let filled = directory.appendingPathComponent("filled.plist")
        let mismatched = directory.appendingPathComponent("mismatched.plist")
        let valid = directory.appendingPathComponent("valid.plist")
        XCTAssertTrue(FileManager.default.createFile(atPath: empty.path, contents: Data()))
        try Data("pairing".utf8).write(to: filled)
        try pairingRecord(publicKey: Data(repeating: 0x11, count: 32)).write(to: mismatched)
        try pairingRecord(
            publicKey: Data(hexBytes("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"))
        ).write(to: valid)
        XCTAssertFalse(PairingMaterial.isUsableFile(at: empty.path))
        XCTAssertFalse(PairingMaterial.isUsableFile(at: directory.appendingPathComponent("missing.plist").path))
        XCTAssertFalse(PairingMaterial.isUsableFile(at: filled.path))
        XCTAssertFalse(PairingMaterial.isUsableFile(at: mismatched.path))
        XCTAssertTrue(PairingMaterial.isUsableFile(at: valid.path))

        let original = directory.appendingPathComponent("aircard_pairing.plist")
        try pairingRecord(
            publicKey: Data(hexBytes("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")),
            identifier: "original"
        ).write(to: original)
        let originalBytes = try Data(contentsOf: original)
        XCTAssertFalse(PairingMaterial.installIfValid(incoming: filled, destination: original))
        XCTAssertEqual(try Data(contentsOf: original), originalBytes)
        let replacement = directory.appendingPathComponent("replacement.plist")
        try pairingRecord(
            publicKey: Data(hexBytes("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")),
            identifier: "replacement"
        ).write(to: replacement)
        XCTAssertTrue(PairingMaterial.installIfValid(incoming: replacement, destination: original))
        let backup = directory.appendingPathComponent("aircard_pairing.original")
        XCTAssertEqual(try Data(contentsOf: backup), originalBytes)
        XCTAssertTrue(PairingMaterial.isUsableFile(at: original.path))
    }

    func testUnrelatedVPNDoesNotMarkSetupReady() async throws {
        let unrelated = [
            LoopbackTunnel.InterfaceAddress(name: "utun0", address: "10.8.0.1"),
            LoopbackTunnel.InterfaceAddress(name: "ipsec0", address: "172.16.0.2"),
            LoopbackTunnel.InterfaceAddress(name: "en0", address: "10.7.0.1"),
            LoopbackTunnel.InterfaceAddress(name: "utun3", address: "127.0.0.1"),
        ]
        XCTAssertFalse(LoopbackTunnel.namatPeerPresent(unrelated, peer: "10.7.0.1"))
        XCTAssertTrue(
            LoopbackTunnel.namatPeerPresent(
                [LoopbackTunnel.InterfaceAddress(name: "utun4", address: "10.7.0.1")],
                peer: "10.7.0.1"
            )
        )
        let engine = try await LocalStubEngine(
            config: .init(pairingAvailable: true, localDevVPNActive: true, setupVerification: .connectionUnavailable)
        )
        let verification = await engine.verifyDeviceSetup(shouldCancel: { false })
        let phase = SetupSession.reduce(phase: .idle, event: .refresh(verification))
        XCTAssertFalse(SetupSession.opensMyCards(phase))
        XCTAssertNotEqual(verification, .verified)
    }

    func testFailedEngineConnectionDoesNotOpenMyCards() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("namat-probe-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let garbage = directory.appendingPathComponent("garbage.plist")
        try Data("pairing".utf8).write(to: garbage)
        let valid = directory.appendingPathComponent("valid.plist")
        try pairingRecord(
            publicKey: Data(hexBytes("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"))
        ).write(to: valid)

        let rejected = try await AirCardWalletEngine(
            ffi: ScriptedProbeFFI(hostPath: garbage.path, probe: .verified, vpn: true)
        )
        let rejectedOutcome = try await rejected.beginInAppSetup(onPin: { _ in }, shouldCancel: { false })
        XCTAssertEqual(rejectedOutcome, .invalidMaterial)
        XCTAssertFalse(SetupSession.opensMyCards(SetupSession.reduce(phase: .running, event: .outcome(rejectedOutcome))))

        let unavailable = try await AirCardWalletEngine(
            ffi: ScriptedProbeFFI(hostPath: valid.path, probe: .connectionUnavailable, vpn: true)
        )
        let unavailableOutcome = try await unavailable.beginInAppSetup(onPin: { _ in }, shouldCancel: { false })
        XCTAssertEqual(unavailableOutcome, .connectionUnavailable)
        XCTAssertFalse(SetupSession.opensMyCards(SetupSession.reduce(phase: .running, event: .outcome(unavailableOutcome))))

        let connected = try await AirCardWalletEngine(
            ffi: ScriptedProbeFFI(hostPath: valid.path, probe: .verified, vpn: false)
        )
        let connectedOutcome = try await connected.beginInAppSetup(onPin: { _ in }, shouldCancel: { false })
        XCTAssertEqual(connectedOutcome, .verified)
        XCTAssertTrue(SetupSession.opensMyCards(SetupSession.reduce(phase: .running, event: .outcome(connectedOutcome))))

        let cancelled = try await AirCardWalletEngine(
            ffi: ScriptedProbeFFI(hostPath: valid.path, probe: .verified, vpn: true)
        )
        let cancelledOutcome = try await cancelled.beginInAppSetup(onPin: { _ in }, shouldCancel: { true })
        XCTAssertEqual(cancelledOutcome, .cancelled)
        XCTAssertFalse(SetupSession.opensMyCards(SetupSession.reduce(phase: .running, event: .outcome(cancelledOutcome))))
    }

    func testSetupCancellationThenRetryCanSucceed() {
        var phase = SetupSession.reduce(phase: .running, event: .failed(.user))
        XCTAssertEqual(phase, .cancelled)
        XCTAssertFalse(SetupSession.opensMyCards(phase))
        phase = SetupSession.reduce(phase: phase, event: .retry)
        XCTAssertEqual(phase, .running)
        phase = SetupSession.reduce(phase: phase, event: .outcome(.timedOut))
        XCTAssertEqual(phase, .timedOut)
        XCTAssertFalse(SetupSession.opensMyCards(phase))
        phase = SetupSession.reduce(phase: phase, event: .retry)
        phase = SetupSession.reduce(phase: phase, event: .outcome(.verified))
        XCTAssertTrue(SetupSession.opensMyCards(phase))
    }

    func testAuthenticatedProbeDoesNotReadOrWriteWallet() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Vendor/airlift-rust/src/exploit.rs")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        guard let start = source.range(of: "pub async fn probe_authenticated_connection") else {
            XCTFail("probe is missing")
            return
        }
        let tail = source[start.lowerBound...]
        let end = tail.range(of: "\nfn probe_attempt")
        let body = String(tail[..<(end?.lowerBound ?? tail.endIndex)])
        XCTAssertTrue(body.contains("RpPairingFile::from_bytes"))
        XCTAssertTrue(body.contains("tunnel_create_remotexpc_multihost_async"))
        XCTAssertTrue(body.contains("tunnel_create_rppairing_multihost_async"))
        XCTAssertTrue(body.contains("start_session"))
        XCTAssertFalse(body.contains("read_file"))
        XCTAssertFalse(body.contains("write_dir"))
        XCTAssertFalse(body.contains("exploit_run"))
        let parser = try String(
            contentsOf: sourceURL
                .deletingLastPathComponent()
                .appendingPathComponent("pairing.rs"),
            encoding: .utf8
        )
        XCTAssertTrue(parser.contains("RpPairingFile::from_bytes"))
        XCTAssertTrue(parser.contains("file.authenticates()"))
    }

    func testPairingHostDoesNotLogThePin() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Vendor/airlift-rust/src/pairing.rs")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        XCTAssertFalse(source.contains("PIN issued —"))
        XCTAssertTrue(source.contains("PIN issued"))
        let bridge = try String(
            contentsOf: sourceURL
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Sources/WalletSkinEngine/RealAirliftFFIClient.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(bridge.contains("namatPairingReady"))
        XCTAssertTrue(bridge.contains("namatPairingPin"))
        XCTAssertTrue(bridge.contains("al_pairing_run_host"))
        XCTAssertFalse(bridge.contains("URLSession"))
    }

    func testAirCardEngineDiscoverRequiresPairing() async throws {
        let engine = try await AirCardWalletEngine(
            ffi: AirliftFFIStub(pairingPresent: false, vpnActive: true)
        )
        do {
            _ = try await engine.discoverCards()
            XCTFail("expected pairingRequired")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_PAIRING_REQUIRED")
        }
    }

    func testArtworkVariantsAreNotIdentical() throws {
        let source = ArtworkPreparer.RGBA(
            width: 8,
            height: 8,
            pixels: [UInt8](repeating: 200, count: 8 * 8 * 4)
        )
        let variants = try ArtworkPreparer.variants(from: source)
        XCTAssertNotEqual(variants.x3, variants.x2)
        let decoded = try ArtworkPreparer.decodeStoredPNG(variants.x3)
        XCTAssertEqual(decoded.width, ArtworkPreparer.width3x)
        XCTAssertEqual(decoded.height, ArtworkPreparer.height3x)
        let decoded2 = try ArtworkPreparer.decodeStoredPNG(variants.x2)
        XCTAssertEqual(decoded2.width, ArtworkPreparer.width2x)
        XCTAssertEqual(decoded2.height, ArtworkPreparer.height2x)
    }

    func testCorruptedBackupFailsVerification() async throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("vault-corrupt-\(UUID().uuidString)", isDirectory: true)
        let vault = try OriginalArtworkVault(rootDirectory: dir, useKeychain: false)
        let key = "card-local-key"
        let wrote = try await vault.storeOriginalIfAbsent(localKey: key, bytes: Data("ORIGINAL".utf8))
        XCTAssertTrue(wrote)
        let file = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
            .first { $0.pathExtension == "bak" }
        XCTAssertNotNil(file)
        try Data("garbage".utf8).write(to: file!)
        do {
            _ = try await vault.loadOriginal(localKey: key)
            XCTFail("expected verify failure")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_BACKUP_VERIFY_FAILED")
        }
    }

    func testInterruptedTempFileDoesNotBecomeBackup() async throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("vault-tmp-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let vault = try OriginalArtworkVault(rootDirectory: dir, useKeychain: false)
        let key = "card-local-key"
        let temp = dir.appendingPathComponent("interrupted.bak.tmp")
        try Data("partial".utf8).write(to: temp)
        let status = await vault.status(forLocalKey: key)
        XCTAssertEqual(status, .none)
    }

    func testRealFFIClientFailsClosedWithoutFramework() async {
        let client = RealAirliftFFIClient()
        XCTAssertFalse(RealAirliftFFIClient.frameworkLinked)
        XCTAssertEqual(RealAirliftFFIClient.artworkReadImplementation, "EXPORT_READ_RESTORE")
        XCTAssertEqual(
            RealAirliftFFIClient.desktopReadRevision,
            "d6320554c07d65f53be91fb578b3e57f996c2605"
        )
        XCTAssertTrue(RealAirliftFFIClient.artworkReadReason.contains("al_exploit_read_file"))
        do {
            _ = try await client.writePassDirectory(
                localKey: "local",
                stagedDirectory: FileManager.default.temporaryDirectory
            )
            XCTFail("expected ffi unavailable")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_FFI_UNAVAILABLE")
        } catch {
            XCTFail("unexpected error \(error)")
        }
    }

    func testRealBridgeSourceCallsAuditedFFISymbols() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/WalletSkinEngine/RealAirliftFFIClient.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        XCTAssertTrue(source.contains("al_exploit_write_dir"))
        XCTAssertTrue(source.contains("al_syslog_stream_start"))
        XCTAssertTrue(source.contains("al_syslog_stream_stop"))
        XCTAssertTrue(source.contains("al_pairing_run_host"))
        XCTAssertTrue(source.contains("al_string_free"))
        XCTAssertTrue(source.contains("ffiReadUnavailable"))
        XCTAssertTrue(source.contains("al_exploit_read_file"))
        XCTAssertTrue(source.contains("al_bytes_free"))
        XCTAssertTrue(source.contains("namatAirliftReadFile"))
        XCTAssertTrue(source.contains("retainLinkedExports"))
        XCTAssertTrue(
            source.contains(
                "#error(\"Release iOS requires AirliftFFI. Do not substitute LocalStubEngine.\")"
            )
        )
        XCTAssertFalse(source.contains("afc_file_read"))
        XCTAssertFalse(source.contains("URLSession"))
        XCTAssertFalse(source.contains("URLRequest"))
        XCTAssertFalse(source.contains("static func hasPairingRecord() -> Bool { false }"))
        XCTAssertFalse(source.contains("static func discoverCardHashes() throws -> [String] { [] }"))
    }

    func testApplyReadbackMatchesPreparedX3NotSourceBytes() async throws {
        let source = sampleArtworkPNG()
        let expected = try ArtworkPreparer.prepare(png: source)
        XCTAssertNotEqual(expected.x3, source)
        let original = originalAssetSet(tag: 1)
        let ffi = DirectoryPassFFI(assets: ["card-a": original])
        let vault = try tempVault()
        let engine = try await AirCardWalletEngine(ffi: ffi, vault: vault)
        let card = LocalCard(localKey: "card-a", displayLabel: "Card")
        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: source))
        let written = await ffi.snapshot("card-a")
        XCTAssertEqual(written?[PassAssetSet.combined3x], expected.x3)
        XCTAssertEqual(written?[PassAssetSet.combined2x], expected.x2)
        XCTAssertNotEqual(written?[PassAssetSet.combined3x], source)
    }

    func testFailedSkinCRollsBackToExactPreApplyAssets() async throws {
        let original = originalAssetSet(tag: 9)
        let ffi = DirectoryPassFFI(assets: ["card-a": original])
        let vault = try tempVault()
        let engine = try await AirCardWalletEngine(ffi: ffi, vault: vault)
        let card = LocalCard(localKey: "card-a", displayLabel: "Card")
        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: sampleArtworkPNG(seed: 2)))
        let skinB = await ffi.snapshot("card-a")
        XCTAssertNotEqual(skinB, original)
        await ffi.setFailNextWrite(true)
        do {
            try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: sampleArtworkPNG(seed: 3)))
            XCTFail("expected skin C to fail")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_APPLY_FAILED")
        }
        let after = await ffi.snapshot("card-a")
        XCTAssertEqual(after, skinB)
        XCTAssertNotEqual(after, original)
    }

    func testRestoreWritesExactOriginalAssetSet() async throws {
        let original = originalAssetSet(tag: 4)
        let ffi = DirectoryPassFFI(assets: ["card-a": original])
        let vault = try tempVault()
        let engine = try await AirCardWalletEngine(ffi: ffi, vault: vault)
        let card = LocalCard(localKey: "card-a", displayLabel: "Card")
        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: sampleArtworkPNG(seed: 5)))
        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: sampleArtworkPNG(seed: 6)))
        let afterSkins = await ffi.snapshot("card-a")
        XCTAssertNotEqual(afterSkins, original)
        try await engine.restoreOriginal(card: card)
        let restored = await ffi.snapshot("card-a")
        XCTAssertEqual(restored, original)
        let stored = try await vault.loadOriginalSet(localKey: card.localKey)
        XCTAssertEqual(stored, original)
    }

    func testApplyMutatesOnlyTheBackedUpCombinedAssets() {
        XCTAssertEqual(PassAssetSet.requiredNames, [PassAssetSet.combined3x, PassAssetSet.combined2x])
        for name in PassAssetSet.requiredNames {
            XCTAssertTrue(PassAssetSet.imageEngineSuite.contains(name))
        }
        XCTAssertTrue(PassAssetSet.imageEngineSuite.contains("diffuse@3x.png"))
        XCTAssertTrue(PassAssetSet.imageEngineSuite.contains("strip.pdf"))
        XCTAssertNotEqual(PassAssetSet.combined3x, PassAssetSet.combined2x)
    }

    func testInvalidSignatureBlocksApplyBeforeWrite() async throws {
        let original: [String: Data] = [
            PassAssetSet.combined3x: Data("not-a-png-3".utf8),
            PassAssetSet.combined2x: Data("not-a-png-2".utf8),
        ]
        let ffi = DirectoryPassFFI(assets: ["card-a": original])
        let vault = try tempVault()
        let engine = try await AirCardWalletEngine(ffi: ffi, vault: vault)
        let card = LocalCard(localKey: "card-a", displayLabel: "Card")
        do {
            try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: sampleArtworkPNG()))
            XCTFail("expected backup failure")
        } catch let error as WalletEngineError {
            XCTAssertEqual(error.code, "NAMAT_WALLET_BACKUP_FAILED")
        }
        let untouched = await ffi.snapshot("card-a")
        XCTAssertEqual(untouched, original)
        let status = await engine.backupStatus(for: card)
        XCTAssertEqual(status, .none)
    }

    func testUnmodifiedSuiteBytesSurviveApplyAndRestore() async throws {
        var original = originalAssetSet(tag: 4)
        original["strip@3x.png"] = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 9, 9])
        original["strip.pdf"] = Data("%PDF-1.4 original-strip".utf8)
        let ffi = DirectoryPassFFI(assets: ["card-a": original])
        let vault = try tempVault()
        let engine = try await AirCardWalletEngine(ffi: ffi, vault: vault)
        let card = LocalCard(localKey: "card-a", displayLabel: "Card")
        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: sampleArtworkPNG(seed: 5)))
        try await engine.applySkin(card: card, artwork: SkinArtwork(pngData: sampleArtworkPNG(seed: 6)))
        try await engine.restoreOriginal(card: card)
        let restored = await ffi.snapshot("card-a")
        XCTAssertEqual(restored, original)
        XCTAssertNotEqual(restored?[PassAssetSet.combined3x], restored?[PassAssetSet.combined2x])
        XCTAssertEqual(restored?["strip.pdf"], original["strip.pdf"])
    }

    func testWalletEngineSourcesDoNotUploadArtwork() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/WalletSkinEngine")
        let names = [
            "AirCardWalletEngine.swift",
            "RealAirliftFFIClient.swift",
            "OriginalArtworkVault.swift",
        ]
        for name in names {
            let source = try String(contentsOf: root.appendingPathComponent(name), encoding: .utf8)
            XCTAssertFalse(source.contains("URLSession"), name)
            XCTAssertFalse(source.contains("URLRequest"), name)
            XCTAssertFalse(source.contains("api.namat"), name)
            XCTAssertFalse(source.contains("/v1/"), name)
        }
    }
}

private actor DirectoryPassFFI: AirliftFFIClient {
    private var pairing = true
    private var vpn = true
    private var assets: [String: [String: Data]]
    private var failNextWrite = false

    init(assets: [String: [String: Data]]) {
        self.assets = assets
    }

    func snapshot(_ key: String) -> [String: Data]? { assets[key] }
    func setFailNextWrite(_ value: Bool) { failNextWrite = value }

    func hasPairingRecord() async -> Bool { pairing }
    func isLoopbackTunnelActive() async -> Bool { vpn }
    func discoverCardHashesFromSyslog() async throws -> [String] { Array(assets.keys) }

    func readPassAssets(localKey: String) async throws -> PassAssetSet {
        guard let files = assets[localKey] else { throw WalletEngineError.cardNotFound() }
        return PassAssetSet(files: files)
    }

    func readPassArtwork(localKey: String) async throws -> Data {
        guard let data = try await readPassAssets(localKey: localKey).file(PassAssetSet.combined3x) else {
            throw WalletEngineError.cardNotFound()
        }
        return data
    }

    func writePassDirectory(localKey: String, stagedDirectory: URL) async throws {
        if failNextWrite {
            failNextWrite = false
            throw WalletEngineError.applyFailed(detail: "injected write failure")
        }
        let names = try FileManager.default.contentsOfDirectory(atPath: stagedDirectory.path)
        var files = assets[localKey] ?? [:]
        for name in names where !name.hasPrefix(".") {
            files[name] = try Data(contentsOf: stagedDirectory.appendingPathComponent(name))
        }
        assets[localKey] = files
    }

    func invalidatePassCaches(localKey: String) async throws {
        _ = localKey
    }

    func runInAppPairingHost(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> String {
        _ = onPin
        _ = shouldCancel
        throw WalletEngineError.ffiUnavailable()
    }

    func probeAuthenticatedConnection(
        pairingPath: String,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification {
        _ = pairingPath
        if shouldCancel() { return .cancelled }
        return .connectionUnavailable
    }
}

private struct ScriptedProbeFFI: AirliftFFIClient {
    var hostPath: String
    var probe: SetupVerification
    var vpn: Bool

    func hasPairingRecord() async -> Bool { PairingMaterial.isUsableFile(at: hostPath) }
    func isLoopbackTunnelActive() async -> Bool { vpn }
    func discoverCardHashesFromSyslog() async throws -> [String] { [] }
    func readPassAssets(localKey: String) async throws -> PassAssetSet { throw WalletEngineError.cardNotFound() }
    func readPassArtwork(localKey: String) async throws -> Data { throw WalletEngineError.cardNotFound() }
    func writePassDirectory(localKey: String, stagedDirectory: URL) async throws {
        _ = localKey
        _ = stagedDirectory
        throw WalletEngineError.ffiUnavailable()
    }
    func invalidatePassCaches(localKey: String) async throws {
        _ = localKey
        throw WalletEngineError.ffiUnavailable()
    }
    func runInAppPairingHost(
        onPin: @escaping @Sendable (String) -> Void,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async throws -> String {
        _ = onPin
        _ = shouldCancel
        return hostPath
    }
    func probeAuthenticatedConnection(
        pairingPath: String,
        shouldCancel: @escaping @Sendable () -> Bool
    ) async -> SetupVerification {
        _ = pairingPath
        if shouldCancel() { return .cancelled }
        return probe
    }
}

private func pairingRecord(publicKey: Data, identifier: String = "namat-test") -> Data {
    let secret = Data(hexBytes("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"))
    let xml = """
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0"><dict>
    <key>identifier</key><string>\(identifier)</string>
    <key>private_key</key><data>\(secret.base64EncodedString())</data>
    <key>public_key</key><data>\(publicKey.base64EncodedString())</data>
    </dict></plist>
    """
    return Data(xml.utf8)
}

private func hexBytes(_ text: String) -> [UInt8] {
    var bytes: [UInt8] = []
    var index = text.startIndex
    while index < text.endIndex {
        let next = text.index(index, offsetBy: 2)
        bytes.append(UInt8(text[index..<next], radix: 16) ?? 0)
        index = next
    }
    return bytes
}

private func tempVault() throws -> OriginalArtworkVault {
    let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("namat-vault-\(UUID().uuidString)", isDirectory: true)
    return try OriginalArtworkVault(rootDirectory: dir, useKeychain: false)
}

private func originalAssetSet(tag: UInt8) -> [String: Data] {
    [
        PassAssetSet.combined3x: Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, tag, 3]),
        PassAssetSet.combined2x: Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, tag, 2]),
    ]
}

private func sampleArtworkPNG(seed: UInt8 = 1) -> Data {
    var pixels = [UInt8](repeating: 0, count: 8 * 8 * 4)
    for i in 0..<64 {
        pixels[i * 4] = UInt8((Int(seed) * 17 + i * 3) % 255)
        pixels[i * 4 + 1] = seed
        pixels[i * 4 + 2] = 180
        pixels[i * 4 + 3] = 255
    }
    return ArtworkPreparer.encodeStoredPNG(
        ArtworkPreparer.RGBA(width: 8, height: 8, pixels: pixels)
    )
}
