import Foundation
import WalletSkinEngine
#if canImport(NamatCore)
import NamatCore
#endif

@MainActor
public final class RootCoordinator: ObservableObject {
    public enum Route: Hashable {
        case onboarding
        case login
        case updateRequired
        case compatibility
        case pairing
        case guide
        case main
    }

    @Published public var route: Route = .onboarding
    @Published public var forceUpdateMessage: String?
    @Published public var openCards = false
    @Published public var resumeTick = 0

    public let env: AppEnvironment

    public init(env: AppEnvironment) {
        self.env = env
    }

    public func bootstrap() async {
        if !env.session.isAuthenticated {
            route = .login
            return
        }
        do {
            let remote = try await env.api.fetchRemoteConfig()
            let decision = RemotePolicyEvaluator.evaluateApply(
                remote,
                appVersion: env.api.appVersion,
                iosVersion: env.api.iosVersion
            )
            if remote.maintenanceMode || decision.code == "app_version" {
                forceUpdateMessage = L(
                    "A newer NAMAT is available. Install it from your account.",
                    "يتوفر إصدار أحدث من نَمَط. ثبّته من حسابك."
                )
                route = .updateRequired
                return
            }
        } catch {
            // Offline: the customer can still open NAMAT. Apply stays gated later.
        }
        route = .guide
    }

    public func completeOnboarding() {
        UserDefaults.standard.set(true, forKey: "namat.onboardingComplete")
        route = env.session.isAuthenticated ? .guide : .login
    }

    public func didLogin() {
        UserDefaults.standard.set(true, forKey: "namat.onboardingComplete")
        route = .guide
    }

    public func showCards() {
        openCards = true
        route = .main
    }

    public func noteResume() {
        resumeTick += 1
    }

    public func acknowledgeCompatibility() {
        UserDefaults.standard.set(true, forKey: "namat.compatibilityAcknowledged")
        route = .pairing
    }
}

@MainActor
public final class LoginViewModel: ObservableObject {
    @Published public var email: String = ""
    @Published public var otp: String = ""
    @Published public var step: Step = .choose
    @Published public var errorMessage: String?
    @Published public var isBusy = false
    @Published public var resendRemaining = 0

    public enum Step: Equatable { case choose, email, otp }

    private let api: NamatAPIClient
    private let google: any GoogleIdentitySigning
    private var ticker: Task<Void, Never>?

    public init(api: NamatAPIClient, google: any GoogleIdentitySigning = UnavailableGoogleIdentitySigning()) {
        self.api = api
        self.google = google
    }

    public func continueWithGoogle() async -> Bool {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            guard let idToken = try await google.idToken() else {
                return false
            }
            try await api.loginWithGoogle(idToken: idToken)
            return true
        } catch {
            errorMessage = message(for: error, fallbackStatus: 401, google: true)
            return false
        }
    }

    public func showEmail() {
        step = .email
        errorMessage = nil
    }

    public var canResend: Bool { resendRemaining <= 0 && !isBusy }

    public func requestOTP() async {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        email = address
        guard address.contains("@"), address.contains("."), !address.hasPrefix("@") else {
            errorMessage = CustomerCopy.authMessage(status: 400, code: "InvalidEmail", arabic: LanguageStore.shared.isArabic)
            return
        }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            let delivery = try await api.requestOTP(email: address)
            if delivery.delivery == "pending_smtp" {
                errorMessage = CustomerCopy.authMessage(
                    status: 503,
                    code: "EmailDeliveryUnavailable",
                    arabic: LanguageStore.shared.isArabic
                )
                return
            }
            otp = ""
            step = .otp
            startCooldown(delivery.cooldownSeconds ?? 60)
        } catch {
            errorMessage = message(for: error, fallbackStatus: 503)
            if let apiError = error as? NamatAPIError,
               case let .http(_, code, retry) = apiError,
               code == "OtpCooldown" {
                startCooldown(retry ?? 60)
            }
        }
    }

    public func verifyOTP() async -> Bool {
        let code = otp.filter(\.isNumber)
        otp = String(code.prefix(6))
        guard otp.count == 6 else {
            errorMessage = CustomerCopy.authMessage(status: 401, code: "OtpInvalid", arabic: LanguageStore.shared.isArabic)
            return false
        }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            try await api.verifyOTP(email: email, code: otp)
            return true
        } catch {
            errorMessage = message(for: error, fallbackStatus: 401)
            return false
        }
    }

    public func changeEmail() {
        step = .email
        otp = ""
        errorMessage = nil
    }

    public func backToChoices() {
        step = .choose
        otp = ""
        errorMessage = nil
    }

    private func message(for error: Error, fallbackStatus: Int, google: Bool = false) -> String {
        let arabic = LanguageStore.shared.isArabic
        if google {
            let code: String?
            if let apiError = error as? NamatAPIError, case let .http(_, parsed, _) = apiError {
                code = parsed ?? "GoogleAuthFailed"
            } else if error is GoogleSignInClientError {
                code = "GoogleAuthFailed"
            } else {
                code = "GoogleAuthFailed"
            }
            if let apiError = error as? NamatAPIError, case .network = apiError {
                return CustomerCopy.authMessage(status: 0, code: nil, arabic: arabic)
            }
            return CustomerCopy.authMessage(status: fallbackStatus, code: code, arabic: arabic)
        }
        if let apiError = error as? NamatAPIError {
            switch apiError {
            case let .http(status, code, _):
                return CustomerCopy.authMessage(status: status, code: code, arabic: arabic)
            case .network:
                return CustomerCopy.authMessage(status: 0, code: nil, arabic: arabic)
            default:
                break
            }
        }
        return CustomerCopy.authMessage(status: fallbackStatus, code: nil, arabic: arabic)
    }

    private func startCooldown(_ seconds: Int) {
        resendRemaining = max(0, seconds)
        ticker?.cancel()
        ticker = Task { @MainActor in
            while resendRemaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                resendRemaining -= 1
            }
        }
    }
}

@MainActor
public final class CompatibilityViewModel: ObservableObject {
    @Published public var result: CompatibilityResult?
    @Published public var isBusy = false

    private let engine: any WalletSkinEngine

    public init(engine: any WalletSkinEngine) {
        self.engine = engine
    }

    public func refresh() async {
        isBusy = true
        defer { isBusy = false }
        result = await engine.checkCompatibility()
    }
}

@MainActor
public final class PairingViewModel: ObservableObject {
    @Published public var pairingAvailable = false
    @Published public var vpnActive = false
    @Published public var notes: [String] = []
    @Published public var importMessage: String?
    @Published public var phase: SetupPhase = .idle
    @Published public var pin: String?

    private let engine: any WalletSkinEngine
    private let control = SetupControl()
    private var timeoutTask: Task<Void, Never>?

    public init(engine: any WalletSkinEngine) {
        self.engine = engine
    }

    public func refresh() async {
        let verification = await engine.verifyDeviceSetup(shouldCancel: { false })
        pairingAvailable = verification == .verified || verification == .connectionUnavailable || verification == .timedOut
        vpnActive = verification == .verified
        phase = SetupSession.reduce(phase: phase, event: .refresh(verification))
    }

    public func start() async {
        control.reset()
        pin = nil
        importMessage = nil
        phase = .running
        timeoutTask?.cancel()
        let control = self.control
        timeoutTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 90_000_000_000)
            if Task.isCancelled { return }
            control.requestCancel(reason: .timeout)
        }
        defer { timeoutTask?.cancel() }
        do {
            let outcome = try await engine.beginInAppSetup(
                onPin: { pin in
                    let copy = pin
                    Task { @MainActor in
                        NotificationCenter.default.post(name: .namatPairingPin, object: copy)
                    }
                },
                shouldCancel: { control.isCancelled() }
            )
            phase = SetupSession.reduce(phase: phase, event: .outcome(outcome))
            pairingAvailable = outcome != .invalidMaterial
            vpnActive = outcome == .verified
        } catch {
            let reason: SetupCancelReason
            switch control.currentReason() {
            case .timeout: reason = .timeout
            case .user: reason = .user
            case .none: reason = .none
            }
            phase = SetupSession.reduce(phase: phase, event: .failed(reason))
        }
    }

    public func retry() async {
        phase = SetupSession.reduce(phase: phase, event: .retry)
        await start()
    }

    public func importSetup(from url: URL) async {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let incoming = directory.appendingPathComponent("aircard_pairing.incoming")
        let destination = directory.appendingPathComponent("aircard_pairing.plist")
        defer { try? FileManager.default.removeItem(at: incoming) }
        do {
            if FileManager.default.fileExists(atPath: incoming.path) {
                try FileManager.default.removeItem(at: incoming)
            }
            try FileManager.default.copyItem(at: url, to: incoming)
            guard PairingMaterial.installIfValid(incoming: incoming, destination: destination) else {
                importMessage = L("The device setup file is not valid.", "ملف إعداد الجهاز غير صالح.")
                phase = .invalidMaterial
                pairingAvailable = false
                vpnActive = false
                return
            }
            importMessage = L("Device setup file saved on this iPhone.", "حُفظ ملف إعداد الجهاز على هذا الآيفون.")
            let control = self.control
            let verification = await engine.verifyDeviceSetup(shouldCancel: { control.isCancelled() })
            phase = SetupSession.reduce(phase: .idle, event: .refresh(verification))
            pairingAvailable = verification != .invalidMaterial && verification != .notStarted
            vpnActive = verification == .verified
        } catch {
            importMessage = L("Could not save the device setup file.", "تعذر حفظ ملف إعداد الجهاز.")
        }
    }

    public func cancel() {
        control.requestCancel(reason: .user)
    }

    public func cancelIfStillRunning() {
        guard phase == .running else { return }
        cancel()
    }

    public func applyPin(_ value: String) {
        guard !value.isEmpty else { return }
        pin = value
    }
}

extension Notification.Name {
    static let namatPairingPin = Notification.Name("namat.pairingPin")
}

final class SetupControl: @unchecked Sendable {
    enum Reason: Equatable { case none, user, timeout }
    private let lock = NSLock()
    private var cancelled = false
    private var reason: Reason = .none

    func reset() {
        lock.lock()
        cancelled = false
        reason = .none
        lock.unlock()
    }

    func requestCancel(reason: Reason) {
        lock.lock()
        cancelled = true
        if self.reason == .none {
            self.reason = reason
        }
        lock.unlock()
    }

    func isCancelled() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }

    func currentReason() -> Reason {
        lock.lock()
        defer { lock.unlock() }
        return reason
    }
}

@MainActor
public final class CardsViewModel: ObservableObject {
    @Published public var cards: [LocalCard] = []
    @Published public var errorMessage: String?
    @Published public var isBusy = false
    @Published public var selected: LocalCard?

    private let engine: any WalletSkinEngine

    public init(engine: any WalletSkinEngine) {
        self.engine = engine
    }

    public func discover() async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            cards = try await engine.discoverCards()
        } catch let error as WalletEngineError {
            errorMessage = CustomerCopy.flowMessage(code: error.code, arabic: LanguageStore.shared.isArabic)
        } catch {
            errorMessage = L("Cards could not be found.", "تعذر العثور على البطاقات.")
        }
    }
}

@MainActor
public final class SkinLibraryViewModel: ObservableObject {
    @Published public var skins: [SkinSummary] = []
    @Published public var errorMessage: String?
    @Published public var isBusy = false

    private let api: NamatAPIClient

    public init(api: NamatAPIClient) {
        self.api = api
    }

    public func load() async {
        isBusy = true
        defer { isBusy = false }
        do {
            skins = try await api.fetchSkins()
        } catch {
            skins = []
            errorMessage = L("Skin catalog is unavailable.", "مكتبة التصاميم غير متاحة.")
        }
    }
}

@MainActor
public final class ApplyRestoreViewModel: ObservableObject {
    @Published public var statusMessage: String?
    @Published public var errorCode: String?
    @Published public var backupStatus: ArtworkBackupStatus = .none
    @Published public var isBusy = false
    /// True until a linked Airlift framework reports a real device session.
    @Published public var deviceProofBlocked = true

    private let engine: any WalletSkinEngine
    private let api: NamatAPIClient

    public init(engine: any WalletSkinEngine, api: NamatAPIClient) {
        self.engine = engine
        self.api = api
    }

    public func refreshBackup(for card: LocalCard) async {
        backupStatus = await engine.backupStatus(for: card)
    }

    public func apply(card: LocalCard, skin: SkinSummary, artworkData: Data?) async {
        isBusy = true
        errorCode = nil
        statusMessage = nil
        defer { isBusy = false }

        if let remote = try? await api.fetchRemoteConfig() {
            let decision = RemotePolicyEvaluator.evaluateApply(
                remote,
                appVersion: api.appVersion,
                iosVersion: api.iosVersion
            )
            if !decision.allowed {
                errorCode = decision.code
                statusMessage = CustomerCopy.safeDetail(decision.reason)
                    ?? CustomerCopy.flowMessage(code: decision.code, arabic: LanguageStore.shared.isArabic)
                return
            }
        } else {
            errorCode = "remote_config"
            statusMessage = L(
                "Remote policy could not be loaded. Apply is blocked.",
                "تعذر تحميل السياسة البعيدة. التطبيق محظور."
            )
            return
        }

        guard let catalog = try? await api.fetchCompatibility() else {
            errorCode = "compatibility"
            statusMessage = L(
            "Compatibility policy could not be loaded. Apply is blocked.",
            "تعذر تحميل سياسة التوافق. التطبيق محظور."
        )
            return
        }
        let matrix = RemotePolicyEvaluator.evaluateCompatibilityMatrix(
            catalog.rules,
            appVersion: api.appVersion,
            iosVersion: api.iosVersion,
            deviceModel: RuntimeVersions.deviceModel()
        )
        if !matrix.allowed {
            errorCode = matrix.code
            statusMessage = CustomerCopy.safeDetail(matrix.reason)
                ?? CustomerCopy.flowMessage(code: matrix.code, arabic: LanguageStore.shared.isArabic)
            return
        }
        let testingNote = matrix.code == "compatibility_testing" ? matrix.reason : nil

        let entitlementResult: Result<Bool, CustomerAccessFailure>
        do {
            let entitlement = try await api.fetchEntitlement()
            entitlementResult = .success(entitlement.active)
        } catch let error as NamatAPIError {
            entitlementResult = .failure(CustomerAccessFailure(error))
        } catch {
            entitlementResult = .failure(.network)
        }
        switch ApplyEntitlementGate.decide(entitlementResult) {
        case .allow:
            break
        case .purchase:
            errorCode = "entitlement_required"
            statusMessage = CustomerCopy.flowMessage(
                code: "entitlement_required",
                arabic: LanguageStore.shared.isArabic
            )
            return
        case .retry:
            errorCode = "connection"
            statusMessage = L(
                "The purchase could not be confirmed. Try again.",
                "تعذر التحقق من الشراء. حاول مرة أخرى."
            )
            return
        case .recoverAuthentication:
            errorCode = "session"
            statusMessage = L("Sign in again to continue.", "سجّل الدخول مرة أخرى للمتابعة.")
            api.session.clear()
            return
        }

        let data: Data
        if let artworkData {
            data = artworkData
        } else if let url = skin.artworkUrl ?? skin.thumbnailUrl,
                  let downloaded = try? await api.downloadArtwork(url: url) {
            data = downloaded
        } else {
            errorCode = "artwork_missing"
            statusMessage = L("Artwork could not be downloaded.", "تعذر تنزيل الشكل.")
            return
        }

        do {
            statusMessage = L(
                "Saving the original look on this iPhone before any change.",
                "نحفظ شكل بطاقتك الأصلي على جهازك قبل أي تغيير."
            )
            await Task.yield()
            do {
                try await api.authorizeApply()
            } catch let error as NamatAPIError {
                let code = apiCode(error) ?? "activation_required"
                errorCode = code
                statusMessage = CustomerCopy.flowMessage(code: code, arabic: LanguageStore.shared.isArabic)
                return
            } catch {
                errorCode = "activation_required"
                statusMessage = CustomerCopy.flowMessage(code: "activation_required", arabic: LanguageStore.shared.isArabic)
                return
            }
            statusMessage = L("Applying the design.", "جارٍ تطبيق التصميم.")
            await Task.yield()
            try await engine.applySkin(
                card: card,
                artwork: SkinArtwork(pngData: data)
            )
            await refreshBackup(for: card)
            if testingNote != nil {
                statusMessage = L(
                    "Applied \(skin.name). Compatibility is still being tested on this iPhone.",
                    "تم تطبيق \(skin.name). التوافق ما زال قيد الاختبار على هذا الجهاز."
                )
            } else {
                statusMessage = L("Applied \(skin.name).", "تم تطبيق \(skin.name).")
            }
        } catch let error as WalletEngineError {
            errorCode = error.code
            statusMessage = CustomerCopy.flowMessage(code: error.code, arabic: LanguageStore.shared.isArabic)
        } catch {
            errorCode = "apply_failed"
            statusMessage = CustomerCopy.flowMessage(code: "apply_failed", arabic: LanguageStore.shared.isArabic)
        }
    }

    public func restore(card: LocalCard) async {
        isBusy = true
        errorCode = nil
        statusMessage = nil
        defer { isBusy = false }
        if let remote = try? await api.fetchRemoteConfig() {
            let decision = RemotePolicyEvaluator.evaluateRestore(remote)
            if !decision.allowed {
                errorCode = decision.code
                statusMessage = CustomerCopy.safeDetail(decision.reason)
                    ?? CustomerCopy.flowMessage(code: decision.code, arabic: LanguageStore.shared.isArabic)
                return
            }
        }
        do {
            try await engine.restoreOriginal(card: card)
            await refreshBackup(for: card)
            statusMessage = L("Restored original artwork.", "تمت استعادة الشكل الأصلي.")
        } catch let error as WalletEngineError {
            errorCode = error.code
            statusMessage = CustomerCopy.flowMessage(code: error.code, arabic: LanguageStore.shared.isArabic)
        } catch {
            errorCode = "restore_failed"
            statusMessage = CustomerCopy.flowMessage(code: "restore_failed", arabic: LanguageStore.shared.isArabic)
        }
    }
}

@MainActor
public final class AISkinStudioViewModel: ObservableObject {
    @Published public var prompt: String = ""
    @Published public var styleID: String = "default"
    @Published public var resultURL: URL?
    @Published public var errorMessage: String?
    @Published public var isBusy = false

    private let api: NamatAPIClient

    public init(api: NamatAPIClient) {
        self.api = api
    }

    public func generate() async {
        isBusy = true
        errorMessage = nil
        resultURL = nil
        defer { isBusy = false }
        do {
            let entitlementResult: Result<Bool, CustomerAccessFailure>
            do {
                entitlementResult = .success((try await api.fetchEntitlement()).active)
            } catch let error as NamatAPIError {
                entitlementResult = .failure(CustomerAccessFailure(error))
            } catch {
                entitlementResult = .failure(.network)
            }
            switch ApplyEntitlementGate.decide(entitlementResult) {
            case .allow:
                break
            case .purchase:
                errorMessage = L(
                    "Activate NAMAT on this account to continue.",
                    "فعّل نَمَط على هذا الحساب للمتابعة."
                )
                return
            case .retry:
                errorMessage = L(
                    "The purchase could not be confirmed. Try again.",
                    "تعذر التحقق من الشراء. حاول مرة أخرى."
                )
                return
            case .recoverAuthentication:
                errorMessage = L("Sign in again to continue.", "سجّل الدخول مرة أخرى للمتابعة.")
                api.session.clear()
                return
            }
            let result = try await api.generateSkin(prompt: prompt, styleID: styleID)
            resultURL = result.resultUrl
        } catch let error as NamatAPIError {
            if case .http(let status, _, _) = error, status == 429 {
                errorMessage = L("AI usage limit reached.", "بلغ حد استخدام الذكاء.")
            } else if case .privacyViolationAttempt = error {
                errorMessage = L(
                    "That description cannot be used. Write a visual description only.",
                    "لا يمكن استخدام هذا الوصف. اكتب وصفًا للشكل فقط."
                )
            } else {
                errorMessage = L(
                    "Generation failed. Check the connection and try again.",
                    "فشل التوليد. تحقق من الاتصال وحاول مرة أخرى."
                )
            }
        } catch {
            errorMessage = L(
                "Generation failed. Check the connection and try again.",
                "فشل التوليد. تحقق من الاتصال وحاول مرة أخرى."
            )
        }
    }
}

@MainActor
public final class AccountViewModel: ObservableObject {
    @Published public var email: String?
    @Published public var entitlement: EntitlementStatus?
    @Published public var entitlementConfirmed = false
    @Published public var deviceID: String = ""
    @Published public var devices: [RegisteredDevice] = []
    @Published public var devicesConfirmed = false
    @Published public var purchases: [CustomerPurchase] = []
    @Published public var purchasesConfirmed = false
    @Published public var release: AppReleaseInfo?
    @Published public var loadMessage: String?

    private let env: AppEnvironment

    public init(env: AppEnvironment) {
        self.env = env
    }

    public func load() async {
        email = env.session.email
        deviceID = env.session.deviceInstallationID
        loadMessage = nil
        do {
            entitlement = try await env.api.fetchEntitlement()
            entitlementConfirmed = true
        } catch let error as NamatAPIError {
            if CustomerAccessFailure(error) == .unauthenticated {
                env.session.clear()
                return
            }
            loadMessage = L(
                "The account could not be confirmed. Try again.",
                "تعذر التحقق من الحساب. حاول مرة أخرى."
            )
        } catch {
            loadMessage = L(
                "The account could not be confirmed. Try again.",
                "تعذر التحقق من الحساب. حاول مرة أخرى."
            )
        }
        do {
            devices = try await env.api.fetchDevices()
            devicesConfirmed = true
        } catch let error as NamatAPIError {
            if CustomerAccessFailure(error) == .unauthenticated {
                env.session.clear()
                return
            }
            if loadMessage == nil {
                loadMessage = L(
                    "The device check failed. Try again.",
                    "تعذر التحقق من الجهاز. حاول مرة أخرى."
                )
            }
        } catch {
            if loadMessage == nil {
                loadMessage = L(
                    "The device check failed. Try again.",
                    "تعذر التحقق من الجهاز. حاول مرة أخرى."
                )
            }
        }
        do {
            purchases = try await env.api.fetchPurchases()
            purchasesConfirmed = true
        } catch let error as NamatAPIError {
            if CustomerAccessFailure(error) == .unauthenticated {
                env.session.clear()
                return
            }
        } catch {
        }
        release = try? await env.api.fetchLatestAppVersion()
    }

    public func deactivate(id: String) async {
        try? await env.api.deactivateDevice(id: id)
        await load()
    }

    public func signOut(everywhere: Bool = false) {
        let token = env.session.accessToken
        env.google.signOut()
        env.session.clear()
        guard let token else { return }
        let api = env.api
        Task {
            try? await api.revokeSession(token: token, everywhere: everywhere)
        }
    }

    public func transfer() async -> String? {
        do {
            try await env.api.transferActivation()
            await load()
            return nil
        } catch let error as NamatAPIError {
            let code: String
            if case .http(_, let parsed, _) = error {
                code = parsed ?? "DeviceTransferLimited"
            } else {
                code = "activation_required"
            }
            return CustomerCopy.flowMessage(code: code, arabic: LanguageStore.shared.isArabic)
        } catch {
            return CustomerCopy.flowMessage(code: "activation_required", arabic: LanguageStore.shared.isArabic)
        }
    }
}

private func apiCode(_ error: NamatAPIError) -> String? {
    if case .http(_, let code, _) = error {
        return code
    }
    return nil
}

@MainActor
public final class DiagnosticsViewModel: ObservableObject {
    @Published public var lines: [String] = []

    private let engine: any WalletSkinEngine
    private let session: SessionStore
    private let api: NamatAPIClient

    public init(engine: any WalletSkinEngine, session: SessionStore, api: NamatAPIClient) {
        self.engine = engine
        self.session = session
        self.api = api
    }

    public func collect() async {
        let verification = await engine.verifyDeviceSetup(shouldCancel: { false })
        let compat = await engine.checkCompatibility()
        let release = try? await api.fetchLatestAppVersion()
        // Never log localKey / pass hashes. Checksums stay in support details.
        var rows = [
            "NAMAT \(RuntimeVersions.appVersion())",
            "iOS \(compat.iosVersion)",
            verification == .invalidMaterial
                ? L("Setup file: not valid", "ملف الإعداد: غير صالح")
                : (verification == .notStarted
                    ? L("This iPhone needs setup", "هذا الآيفون يحتاج إعدادًا")
                    : L("Setup file: ready", "ملف الإعداد: جاهز")),
            verification == .verified
                ? L("Local connection: ready", "الاتصال المحلي: جاهز")
                : L("Local connection: needed", "الاتصال المحلي: مطلوب"),
        ]
        if let checksum = release?.checksum, !checksum.isEmpty {
            rows.append("SHA-256 \(checksum)")
        }
        _ = session
        lines = rows
    }
}
