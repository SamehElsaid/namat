import XCTest
import WalletSkinEngine
@testable import NamatCore

final class NamatCoreTests: XCTestCase {
    func testAPIClientRejectsWalletMaterialInPrompts() {
        XCTAssertThrowsError(
            try NamatAPIClient.assertNoWalletMaterial(in: "localKey=abc123")
        )
        XCTAssertThrowsError(
            try NamatAPIClient.assertNoWalletMaterial(
                in: "hash 0123456789abcdef0123456789abcdef01234567"
            )
        )
        XCTAssertNoThrow(
            try NamatAPIClient.assertNoWalletMaterial(in: "warm sand dunes at dusk")
        )
    }

    func testSessionStoresInstallationIDNotWalletKey() {
        UserDefaults.standard.removeObject(forKey: "namat.accessToken")
        UserDefaults.standard.removeObject(forKey: "namat.email")
        UserDefaults.standard.removeObject(forKey: "namat.entitlementActive")
        let session = SessionStore(deviceInstallationID: "install-test-1")
        XCTAssertEqual(session.deviceInstallationID, "install-test-1")
        XCTAssertFalse(session.installationToken.isEmpty)
        XCTAssertNotEqual(session.installationToken, session.deviceInstallationID)
        XCTAssertNil(session.accessToken)
        session.applyLogin(email: "a@b.c", token: "t", entitlementActive: true)
        XCTAssertTrue(session.isAuthenticated)
        session.clear()
        XCTAssertFalse(session.isAuthenticated)
        XCTAssertEqual(session.deviceInstallationID, "install-test-1")
        let restored = SessionStore(deviceInstallationID: "install-test-1")
        XCTAssertNil(restored.accessToken)
    }

    func testRemotePolicyBlocksApplyWithoutBlockingRestore() {
        let policy = RemoteAppConfig(
            killSwitchApply: true,
            killSwitchRestore: false,
            minAppVersion: "1.0.0",
            minIosVersion: "17.0",
            maintenanceMode: false,
            message: "Paused"
        )
        let apply = RemotePolicyEvaluator.evaluateApply(policy, appVersion: "1.2.0", iosVersion: "18.0")
        XCTAssertFalse(apply.allowed)
        XCTAssertEqual(apply.reason, "Paused")
        XCTAssertTrue(RemotePolicyEvaluator.evaluateRestore(policy).allowed)
        let restoreOff = RemoteAppConfig(
            killSwitchApply: false,
            killSwitchRestore: true,
            minAppVersion: "1.0.0",
            minIosVersion: "17.0",
            maintenanceMode: false
        )
        XCTAssertFalse(RemotePolicyEvaluator.evaluateRestore(restoreOff).allowed)
        XCTAssertTrue(RemotePolicyEvaluator.evaluateApply(restoreOff, appVersion: "1.2.0", iosVersion: "18.0").allowed)
    }

    func testProductionEngineIsNotTheStub() async throws {
        let engine = try await WalletEngineFactory.make(kind: .productionAirlift)
        let name = String(describing: type(of: engine))
        XCTAssertTrue(name.contains("AirCard"))
        XCTAssertFalse(name.contains("LocalStub"))
    }

    func testReleaseSourceDoesNotReturnTheStub() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/NamatCore/WalletEngineFactory.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        XCTAssertTrue(source.contains("#if DEBUG"))
        XCTAssertTrue(source.contains("fatalError(\"Release builds must not instantiate LocalStubEngine.\")"))
        XCTAssertTrue(source.contains("return try await make(kind: .productionAirlift)"))
    }

    func testRuntimeVersionsUseBundleAndDoNotHardcodeCurrentRelease() {
        XCTAssertEqual(RuntimeVersions.appVersion(shortVersion: nil, build: nil), "unknown")
        XCTAssertEqual(RuntimeVersions.appVersion(shortVersion: " ", build: "9"), "unknown")
        XCTAssertEqual(RuntimeVersions.appVersion(shortVersion: "1.4.2", build: "9"), "1.4.2+9")
        XCTAssertNotEqual(RuntimeVersions.appVersion(shortVersion: nil, build: nil), "0.1.0")
        XCTAssertNotEqual(RuntimeVersions.iosVersion(), "17.0")
        let client = NamatAPIClient(
            baseURL: URL(string: "https://namat.shara.sa/api/v1")!,
            session: SessionStore(),
            appVersion: nil,
            iosVersion: nil
        )
        XCTAssertNotEqual(client.appVersion, "0.1.0")
        XCTAssertFalse(client.iosVersion == "17.0" && client.appVersion == "0.1.0")
    }

    func testCompatibilityMatrixBlocksAndMarksTesting() {
        let blocked = CompatibilityRule(
            id: "b",
            minIosVersion: "17.0",
            state: "BLOCKED"
        )
        let blockedDecision = RemotePolicyEvaluator.evaluateCompatibilityMatrix(
            [blocked],
            appVersion: "1.2.0",
            iosVersion: "18.0",
            deviceModel: "iPhone16,1"
        )
        XCTAssertFalse(blockedDecision.allowed)
        XCTAssertEqual(blockedDecision.code, "compatibility_blocked")

        let unsupported = CompatibilityRule(
            id: "u",
            minIosVersion: "17.0",
            state: "UNSUPPORTED"
        )
        XCTAssertEqual(
            RemotePolicyEvaluator.evaluateCompatibilityMatrix(
                [unsupported],
                appVersion: "1.2.0",
                iosVersion: "18.0",
                deviceModel: nil
            ).code,
            "compatibility_unsupported"
        )

        let testing = CompatibilityRule(
            id: "t",
            minIosVersion: "17.0",
            maxIosVersion: "18.9",
            supportedModels: ["iPhone16,1"],
            state: "TESTING",
            minAppVersion: "1.0.0"
        )
        let testingDecision = RemotePolicyEvaluator.evaluateCompatibilityMatrix(
            [testing],
            appVersion: "1.2.0",
            iosVersion: "18.1",
            deviceModel: "iPhone16,1"
        )
        XCTAssertTrue(testingDecision.allowed)
        XCTAssertEqual(testingDecision.code, "compatibility_testing")

        let oldApp = RemotePolicyEvaluator.evaluateCompatibilityMatrix(
            [testing],
            appVersion: "0.9.0",
            iosVersion: "18.1",
            deviceModel: "iPhone16,1"
        )
        XCTAssertFalse(oldApp.allowed)
        XCTAssertEqual(oldApp.code, "app_version")
    }

    func testContractPayloadsDecode() throws {
        let entitlement = try JSONDecoder().decode(
            EntitlementStatus.self,
            from: Data(#"{"entitlement":{"id":"e1","status":"active","plan":"lifetime","maxDevices":2},"activeDevices":1}"#.utf8)
        )
        XCTAssertTrue(entitlement.active)
        XCTAssertEqual(entitlement.activeDevices, 1)
        let skins = try JSONDecoder().decode(
            SkinManifest.self,
            from: Data(#"{"skins":[{"id":"s1","name":"Dune","categoryId":null,"thumbnailUrl":null,"artworkUrl":null,"version":2,"contentHash":"abc"}]}"#.utf8)
        )
        XCTAssertEqual(skins.skins.first?.version, 2)
        let remote = try JSONDecoder().decode(
            RemoteAppConfig.self,
            from: Data(#"{"killSwitchApply":false,"killSwitchRestore":true,"minAppVersion":"1.0.0","minIosVersion":"17.0","maintenanceMode":false}"#.utf8)
        )
        XCTAssertTrue(remote.killSwitchRestore)
        let ai = try JSONDecoder().decode(
            AIGenerationResult.self,
            from: Data(#"{"id":"g1","resultUrl":null,"status":"completed"}"#.utf8)
        )
        XCTAssertEqual(ai.id, "g1")
    }

    func testCustomerAuthCopyDoesNotLeakServiceNames() {
        let arabic = CustomerCopy.authMessage(status: 503, code: "EmailDeliveryUnavailable", arabic: true)
        XCTAssertEqual(arabic, "تعذر إرسال رمز التحقق الآن. حاول مرة أخرى لاحقًا.")
        XCTAssertFalse(arabic.lowercased().contains("smtp"))
        XCTAssertEqual(
            CustomerCopy.authMessage(status: 401, code: "OtpExpired", arabic: true),
            "انتهت صلاحية الرمز. اطلب رمزًا جديدًا."
        )
        XCTAssertEqual(
            CustomerCopy.authMessage(status: 401, code: "OtpInvalid", arabic: false),
            "That code is not correct."
        )
        XCTAssertEqual(
            CustomerCopy.flowMessage(code: "entitlement_required", arabic: true),
            "فعّل نَمَط على هذا الحساب للمتابعة."
        )
        XCTAssertNil(CustomerCopy.safeDetail("AirliftFFI is not linked"))
        XCTAssertEqual(CustomerCopy.safeDetail("Try again"), "Try again")
        let google = CustomerCopy.authMessage(status: 401, code: "GoogleAuthFailed", arabic: true)
        XCTAssertEqual(google, "تعذر تسجيل الدخول باستخدام Google. حاول مرة أخرى.")
        XCTAssertFalse(google.lowercased().contains("oauth"))
        XCTAssertFalse(google.lowercased().contains("token"))
    }

    func testGoogleLoginBodyContainsOnlyTheIDToken() throws {
        let body = GoogleLoginRequest(idToken: "header.payload.signature")
        let data = try JSONEncoder().encode(body)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: String]
        XCTAssertEqual(object, ["idToken": "header.payload.signature"])
    }

    func testGoogleSignInRequestsNoExtraScopes() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/NamatCore/GoogleSignInBridge.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        XCTAssertTrue(source.contains("additionalScopes: nil"))
        let lowered = source.lowercased()
        XCTAssertFalse(lowered.contains("gmail"))
        XCTAssertFalse(lowered.contains("drive"))
        XCTAssertFalse(lowered.contains("calendar"))
        XCTAssertFalse(lowered.contains("contacts"))
        XCTAssertFalse(lowered.contains("client_secret"))
        let project = try String(
            contentsOf: sourceURL
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("project.yml"),
            encoding: .utf8
        )
        XCTAssertTrue(project.contains("com.googleusercontent.apps.588751829801-o1l3gdt9fcquhn4ncq5kgig10c7fb0tq"))
        XCTAssertTrue(project.contains("588751829801-hncn7v533cpfbbhj6f6nodi7emk92spf.apps.googleusercontent.com"))
    }

    func testLoginScreenLeadsWithGoogleAndKeepsEmailFallback() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let screens = try String(
            contentsOf: root.appendingPathComponent("Sources/NamatUI/Screens/FlowScreens.swift"),
            encoding: .utf8
        )
        let models = try String(
            contentsOf: root.appendingPathComponent("Sources/NamatUI/ViewModels.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(screens.contains("المتابعة باستخدام Google"))
        XCTAssertTrue(screens.contains("Continue with Google"))
        XCTAssertTrue(screens.contains("الدخول بالبريد الإلكتروني"))
        XCTAssertTrue(screens.contains("Continue with email"))
        XCTAssertTrue(models.contains("step: Step = .choose"))
        XCTAssertTrue(models.contains("google.signOut()"))
    }

    func testFailureParserReadsErrorCodesWithoutGenericNames() {
        let parsed = NamatAPIClient.parseFailure(
            Data(#"{"statusCode":503,"error":"EmailDeliveryUnavailable","message":"Verification email is unavailable."}"#.utf8)
        )
        XCTAssertEqual(parsed.code, "EmailDeliveryUnavailable")
        let generic = NamatAPIClient.parseFailure(
            Data(#"{"statusCode":401,"error":"Unauthorized","message":"nope"}"#.utf8)
        )
        XCTAssertNil(generic.code)
    }

    func testProductionAPIURLAndBrandAssets() {
        XCTAssertEqual(AppConfig.productionAPIBaseURL, "https://namat.shara.sa/api/v1")
        XCTAssertEqual(AppConfig.default.apiBaseURL.absoluteString, AppConfig.productionAPIBaseURL)
        let resources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")
        XCTAssertTrue(FileManager.default.fileExists(atPath: resources.path))
        let brand = resources
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("BrandMark.imageset/BrandMark.png")
        XCTAssertTrue(FileManager.default.fileExists(atPath: brand.path))
    }

    func testFreshLanguageDefaultsToArabic() {
        XCTAssertEqual(LanguagePolicy.resolve(stored: nil), "ar")
        XCTAssertEqual(LanguagePolicy.resolve(stored: ""), "ar")
        XCTAssertEqual(LanguagePolicy.resolve(stored: "en"), "en")
        XCTAssertEqual(LanguagePolicy.resolve(stored: "ar"), "ar")
        XCTAssertEqual(LanguagePolicy.resolve(stored: "fr"), "ar")
    }

    func testArtworkCropKeepsCardAspectAndStaysInsideTheImage() {
        XCTAssertEqual(CardArtworkFormat.pixelWidth, 1536)
        XCTAssertEqual(CardArtworkFormat.pixelHeight, 969)
        let crop = ArtworkCropper.crop(imageWidth: 3000, imageHeight: 2000, zoom: 1, panX: 0, panY: 0)
        XCTAssertEqual(crop.width / crop.height, CardArtworkFormat.aspect, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(crop.originX, 0)
        XCTAssertGreaterThanOrEqual(crop.originY, 0)
        XCTAssertLessThanOrEqual(crop.originX + crop.width, 3000.01)
        XCTAssertLessThanOrEqual(crop.originY + crop.height, 2000.01)
        let zoomed = ArtworkCropper.crop(imageWidth: 3000, imageHeight: 2000, zoom: 2, panX: 1, panY: -1)
        XCTAssertEqual(zoomed.width, crop.width / 2, accuracy: 0.01)
        XCTAssertGreaterThan(zoomed.originX, crop.originX)
        let reset = ArtworkCropper.crop(imageWidth: 3000, imageHeight: 2000, zoom: 1, panX: 0, panY: 0)
        XCTAssertEqual(reset, crop)
    }

    func testUnavailableDeviceKeyCannotSignApply() {
        let key = UnavailableDeviceKey()
        XCTAssertNil(key.publicKeyPoint)
        XCTAssertThrowsError(try key.signature(forNonce: "nonce"))
    }

    func testLoginDoesNotActivateTheDeviceAndSetupDoesNotLeadWithAMac() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let models = try String(contentsOf: root.appendingPathComponent("Sources/NamatUI/ViewModels.swift"), encoding: .utf8)
        let screens = try String(contentsOf: root.appendingPathComponent("Sources/NamatUI/Screens/FlowScreens.swift"), encoding: .utf8)
        let settings = try String(contentsOf: root.appendingPathComponent("Sources/NamatUI/Screens/ProductScreens.swift"), encoding: .utf8)
        let guide = try String(contentsOf: root.appendingPathComponent("Sources/NamatUI/Screens/CustomerGuide.swift"), encoding: .utf8)
        XCTAssertFalse(models.contains("registerDevice"))
        XCTAssertTrue(guide.contains("registerDevice()"))
        XCTAssertTrue(guide.contains("بدء الإعداد") || screens.contains("بدء الإعداد"))
        XCTAssertTrue(screens.contains("بدء الإعداد"))
        XCTAssertFalse(screens.contains("من جهاز ماك"))
        XCTAssertFalse(settings.contains("من جهاز ماك"))
        XCTAssertTrue(screens.contains("نفحص توافق البطاقة قبل أي تغيير."))
        guard let restoreStart = models.range(of: "public func restore(card: LocalCard)") else {
            XCTFail("restore is missing")
            return
        }
        let restoreTail = models[restoreStart.lowerBound...]
        let restoreEnd = restoreTail.range(of: "final class AISkinStudioViewModel")
        let restoreBody = String(restoreTail[..<(restoreEnd?.lowerBound ?? restoreTail.endIndex)])
        XCTAssertFalse(restoreBody.contains("entitlement"))
        XCTAssertTrue(restoreBody.contains("restoreOriginal"))
        XCTAssertFalse(guide.contains("try? await env.api.fetchEntitlement"))
        XCTAssertFalse(guide.contains("try? await env.api.fetchDevices"))
        XCTAssertTrue(guide.contains("CustomerAccessPlanner"))
        XCTAssertFalse(models.contains("try? await api.fetchEntitlement"))
        XCTAssertTrue(models.contains("ApplyEntitlementGate"))
        let engine = try String(
            contentsOf: root
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("prototypes/wallet-engine/Sources/WalletSkinEngine/AirCardWalletEngine.swift"),
            encoding: .utf8
        )
        XCTAssertFalse(engine.contains("pairingSavedConnectionNeeded"))
        XCTAssertTrue(engine.contains("probeAuthenticatedConnection"))
    }

    func testEntitlementAndDeviceFailuresDoNotBecomePurchaseOrActivation() {
        let installation = "this-iphone"
        let active = CustomerDeviceFact(installationId: installation, status: "active")
        let other = CustomerDeviceFact(installationId: "other-iphone", status: "active")

        for failure in [CustomerAccessFailure.network, .server, .decoding] {
            let entitlementFailure = CustomerAccessPlanner.decide(
                entitlement: .failure(failure),
                devices: nil,
                setup: .verified,
                installationId: installation,
                previouslyConfirmedSetup: true
            )
            XCTAssertFalse(entitlementFailure.offersPurchase)
            XCTAssertFalse(entitlementFailure.offersActivation)
            XCTAssertFalse(entitlementFailure.opensMyCards)
            if case .retryEntitlement(let holding) = entitlementFailure {
                XCTAssertTrue(holding)
            } else {
                XCTFail("expected an entitlement retry")
            }

            let deviceFailure = CustomerAccessPlanner.decide(
                entitlement: .success(true),
                devices: .failure(failure),
                setup: .notStarted,
                installationId: installation,
                previouslyConfirmedSetup: false
            )
            XCTAssertFalse(deviceFailure.offersPurchase)
            XCTAssertFalse(deviceFailure.offersActivation)
            XCTAssertFalse(deviceFailure.opensMyCards)
        }

        let expired = CustomerAccessPlanner.decide(
            entitlement: .failure(.unauthenticated),
            devices: nil,
            setup: .verified,
            installationId: installation,
            previouslyConfirmedSetup: true
        )
        XCTAssertEqual(expired, .recoverAuthentication)
        XCTAssertFalse(expired.offersPurchase)

        let inactive = CustomerAccessPlanner.decide(
            entitlement: .success(false),
            devices: .success([active]),
            setup: .verified,
            installationId: installation,
            previouslyConfirmedSetup: true
        )
        XCTAssertEqual(inactive, .purchase)
        XCTAssertTrue(inactive.offersPurchase)
        XCTAssertFalse(inactive.opensMyCards)

        let needsActivation = CustomerAccessPlanner.decide(
            entitlement: .success(true),
            devices: .success([other]),
            setup: .verified,
            installationId: installation,
            previouslyConfirmedSetup: false
        )
        XCTAssertEqual(needsActivation, .activate(otherDeviceActive: true))

        let ready = CustomerAccessPlanner.decide(
            entitlement: .success(true),
            devices: .success([active]),
            setup: .verified,
            installationId: installation,
            previouslyConfirmedSetup: false
        )
        XCTAssertEqual(ready, .cards)

        for setup in [SetupVerification.notStarted, .invalidMaterial, .connectionUnavailable, .timedOut, .cancelled] {
            let waiting = CustomerAccessPlanner.decide(
                entitlement: .success(true),
                devices: .success([active]),
                setup: setup,
                installationId: installation,
                previouslyConfirmedSetup: false
            )
            XCTAssertEqual(waiting, .setup)
            XCTAssertFalse(waiting.opensMyCards)
        }
    }

    func testApplyDoesNotTreatAFailedEntitlementFetchAsNotPurchased() {
        XCTAssertEqual(ApplyEntitlementGate.decide(.failure(.network)), .retry)
        XCTAssertEqual(ApplyEntitlementGate.decide(.failure(.server)), .retry)
        XCTAssertEqual(ApplyEntitlementGate.decide(.failure(.decoding)), .retry)
        XCTAssertEqual(ApplyEntitlementGate.decide(.failure(.unauthenticated)), .recoverAuthentication)
        XCTAssertEqual(ApplyEntitlementGate.decide(.success(false)), .purchase)
        XCTAssertEqual(ApplyEntitlementGate.decide(.success(true)), .allow)
        XCTAssertEqual(CustomerAccessFailure(NamatAPIError.notAuthenticated), .unauthenticated)
        XCTAssertEqual(CustomerAccessFailure(NamatAPIError.http(status: 401, code: nil, retryAfterSeconds: nil)), .unauthenticated)
        XCTAssertEqual(CustomerAccessFailure(NamatAPIError.http(status: 503, code: nil, retryAfterSeconds: nil)), .server)
        XCTAssertEqual(CustomerAccessFailure(NamatAPIError.network("offline")), .network)
    }

    func testCustomerPurchaseDecodesSafeFieldsOnly() throws {
        let purchase = try JSONDecoder().decode(
            CustomerPurchase.self,
            from: Data(#"{"id":"p1","reference":"namat_ref","createdAt":"2026-04-01T00:00:00.000Z","amountMinor":29900,"currency":"SAR","status":"completed","paymentMethod":"terminal"}"#.utf8)
        )
        XCTAssertEqual(purchase.reference, "namat_ref")
        XCTAssertEqual(purchase.status, "completed")
        XCTAssertEqual(purchase.amountMinor, 29900)
    }

    func testOtpDeliveryDecodesCooldown() throws {
        let delivery = try JSONDecoder().decode(
            OtpDelivery.self,
            from: Data(#"{"ok":true,"expiresIn":600,"cooldownSeconds":60,"delivery":"smtp"}"#.utf8)
        )
        XCTAssertEqual(delivery.cooldownSeconds, 60)
        XCTAssertEqual(delivery.delivery, "smtp")
    }
}

private struct SkinManifest: Decodable {
    let skins: [SkinSummary]
}
