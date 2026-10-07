import SwiftUI
import UniformTypeIdentifiers
import WalletSkinEngine
#if canImport(NamatCore)
import NamatCore
#endif

public struct NamatRootView: View {
    @StateObject private var coordinator: RootCoordinator
    @ObservedObject private var language = LanguageStore.shared
    @Environment(\.scenePhase) private var scenePhase

    public init(env: AppEnvironment) {
        _coordinator = StateObject(wrappedValue: RootCoordinator(env: env))
    }

    public var body: some View {
        Group {
            switch coordinator.route {
            case .onboarding, .login:
                NavigationStack {
                    LoginScreen(api: coordinator.env.api, google: coordinator.env.google) {
                        coordinator.didLogin()
                    }
                }
            case .updateRequired:
                UpdateRequiredScreen(message: coordinator.forceUpdateMessage ?? L("Update required", "يلزم التحديث"))
            case .guide:
                CustomerGuideScreen(coordinator: coordinator)
            case .compatibility:
                NavigationStack {
                    CompatibilityScreen(engine: coordinator.env.engine) {
                        coordinator.acknowledgeCompatibility()
                    }
                }
            case .pairing:
                NavigationStack {
                    PairingSetupScreen(engine: coordinator.env.engine) {
                        coordinator.route = .main
                    }
                }
            case .main:
                MainTabScreen(env: coordinator.env, openCards: coordinator.openCards)
            }
        }
        .environment(\.layoutDirection, language.isArabic ? .rightToLeft : .leftToRight)
        .preferredColorScheme(.dark)
        .tint(NamatColor.purchase)
        .id(language.code)
        .task { await coordinator.bootstrap() }
        .onReceive(NotificationCenter.default.publisher(for: .namatSignedOut)) { _ in
            coordinator.route = .login
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                coordinator.noteResume()
            }
        }
    }
}

// MARK: - Onboarding

public struct OnboardingScreen: View {
    public var onContinue: () -> Void

    public init(onContinue: @escaping () -> Void) {
        self.onContinue = onContinue
    }

    public var body: some View {
        VStack(spacing: 28) {
            Spacer()
            NamatWordmark()
            Text(L(
                "Change your card’s look.\nKeep the original, always.",
                "غيّر مظهر بطاقتك.\nواحتفظ بالأصل دائمًا."
            ))
            .font(.title3)
            .multilineTextAlignment(.center)
            .foregroundStyle(NamatColor.silver)
            Spacer()
            NamatPrimaryButton(title: L("Sign in or create an account", "تسجيل الدخول أو إنشاء حساب"), action: onContinue)
        }
        .padding(28)
        .namatPage(stage: true)
    }
}

struct BrandLockup: View {
    var body: some View {
        NamatWordmark()
    }
}

// MARK: - Login (OTP)

public struct LoginScreen: View {
    @StateObject private var vm: LoginViewModel
    var onSuccess: () -> Void

    public init(
        api: NamatAPIClient,
        google: any GoogleIdentitySigning = UnavailableGoogleIdentitySigning(),
        onSuccess: @escaping () -> Void
    ) {
        _vm = StateObject(wrappedValue: LoginViewModel(api: api, google: google))
        self.onSuccess = onSuccess
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                LanguageToggle()
                NamatWordmark()
                    .padding(.top, 8)
                Text(L(
                    "Change your card’s look.\nKeep the original, always.",
                    "غيّر مظهر بطاقتك.\nواحتفظ بالأصل دائمًا."
                ))
                .font(.title3)
                .multilineTextAlignment(.center)
                .foregroundStyle(NamatColor.silver)
                if vm.step == .choose {
                    Button {
                        Task {
                            if await vm.continueWithGoogle() {
                                onSuccess()
                            }
                        }
                    } label: {
                        HStack(spacing: 12) {
                            if vm.isBusy {
                                ProgressView()
                                    .tint(NamatColor.graphite)
                            } else {
                                Image("GoogleG")
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 22, height: 22)
                                    .accessibilityHidden(true)
                            }
                            Text(L("Continue with Google", "المتابعة باستخدام Google"))
                                .font(.body.weight(.semibold))
                                .foregroundStyle(NamatColor.graphite)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 52)
                        .background(Color.white, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(vm.isBusy)
                    .accessibilityLabel(L("Continue with Google", "المتابعة باستخدام Google"))
                    NamatQuietButton(title: L("Continue with email", "الدخول بالبريد الإلكتروني"), enabled: !vm.isBusy) {
                        vm.showEmail()
                    }
                } else if vm.step == .email {
                    TextField(L("Email", "البريد الإلكتروني"), text: $vm.email)
                        .textFieldStyle(.plain)
                        .namatEmailInput()
                        .namatField()
                        .accessibilityLabel(L("Email", "البريد الإلكتروني"))
                    NamatPrimaryButton(
                        title: L("Send verification code", "إرسال رمز التحقق"),
                        busy: vm.isBusy
                    ) {
                        Task { await vm.requestOTP() }
                    }
                    NamatQuietButton(title: L("Back", "رجوع"), enabled: !vm.isBusy) {
                        vm.backToChoices()
                    }
                } else {
                    Text(L("Verification code", "رمز التحقق"))
                        .font(.title3.weight(.semibold))
                    Text(vm.email)
                        .font(.footnote)
                        .foregroundStyle(NamatColor.silver)
                    TextField(L("6-digit code", "الرمز المكوّن من 6 أرقام"), text: $vm.otp)
                        .textFieldStyle(.plain)
                        .namatOTPInput()
                        .namatField()
                        .multilineTextAlignment(.center)
                        .font(.title2.monospacedDigit())
                        .accessibilityLabel(L("Verification code", "رمز التحقق"))
                        .onChange(of: vm.otp) { _, value in
                            let digits = value.filter(\.isNumber)
                            if digits != value || digits.count > 6 {
                                vm.otp = String(digits.prefix(6))
                            }
                        }
                    NamatPrimaryButton(
                        title: L("Verify", "تحقق"),
                        busy: vm.isBusy,
                        enabled: vm.otp.filter(\.isNumber).count == 6
                    ) {
                        Task {
                            if await vm.verifyOTP() {
                                onSuccess()
                            }
                        }
                    }
                    Button {
                        Task { await vm.requestOTP() }
                    } label: {
                        if vm.resendRemaining > 0 {
                            Text(L(
                                "Resend in \(vm.resendRemaining)s",
                                "إعادة الإرسال خلال \(vm.resendRemaining) ث"
                            ))
                        } else {
                            Text(L("Resend code", "إعادة إرسال الرمز"))
                        }
                    }
                    .font(.body.weight(.semibold))
                    .foregroundStyle(NamatColor.link)
                    .frame(minHeight: 44)
                    .disabled(!vm.canResend)
                    NamatQuietButton(title: L("Change email", "تغيير البريد"), enabled: !vm.isBusy) {
                        vm.changeEmail()
                    }
                }
                if let error = vm.errorMessage {
                    NamatNotice(text: error, warning: true)
                }
            }
            .padding(24)
        }
        .namatAuthScroll()
        .namatPage(stage: true)
        .navigationTitle(L("Sign in", "تسجيل الدخول"))
        .namatInlineTitle()
    }
}

extension View {
    @ViewBuilder
    func namatEmailInput() -> some View {
        #if os(iOS)
        self
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.continue)
        #else
        self.autocorrectionDisabled()
        #endif
    }

    @ViewBuilder
    func namatOTPInput() -> some View {
        #if os(iOS)
        self
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
        #else
        self
        #endif
    }

    @ViewBuilder
    func namatAuthScroll() -> some View {
        #if os(iOS)
        self.scrollDismissesKeyboard(.interactively)
        #else
        self
        #endif
    }

    @ViewBuilder
    func namatInlineTitle() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }
}

// MARK: - Compatibility

public struct CompatibilityScreen: View {
    @StateObject private var vm: CompatibilityViewModel
    var onContinue: () -> Void

    public init(engine: any WalletSkinEngine, onContinue: @escaping () -> Void) {
        _vm = StateObject(wrappedValue: CompatibilityViewModel(engine: engine))
        self.onContinue = onContinue
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L("A quick look at this iPhone.", "فحص سريع لهذا الآيفون."))
                    .font(.title3.weight(.semibold))
                if let result = vm.result {
                    statusRow(
                        L("This iPhone", "هذا الآيفون"),
                        result.isSupported
                            ? L("Ready to try", "جاهز للتجربة")
                            : L("Setup still needs to finish", "يحتاج إكمال الإعداد")
                    )
                    statusRow("iOS", result.iosVersion)
                    statusRow(
                        L("Device setup", "إعداد الجهاز"),
                        result.pairingAvailable
                            ? L("Ready", "جاهز")
                            : L("This iPhone needs setup", "هذا الآيفون يحتاج إعدادًا")
                    )
                    statusRow(
                        L("Local connection", "الاتصال المحلي"),
                        result.localDevVPNActive ? L("Ready", "جاهز") : L("Needed", "مطلوب")
                    )
                    NamatNotice(text: L(
                        "Card compatibility is checked before any change.",
                        "نفحص توافق البطاقة قبل أي تغيير."
                    ))
                } else if vm.isBusy {
                    ProgressView()
                        .tint(NamatColor.polar)
                        .frame(maxWidth: .infinity)
                }
                NamatPrimaryButton(
                    title: L("Continue", "متابعة"),
                    enabled: vm.result != nil,
                    action: onContinue
                )
            }
            .padding(24)
        }
        .namatPage()
        .navigationTitle(L("This iPhone", "هذا الآيفون"))
        .namatInlineTitle()
        .task { await vm.refresh() }
        .refreshable { await vm.refresh() }
    }

    private func statusRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(NamatColor.silver)
        }
        .font(.body)
        .padding(18)
        .background(NamatColor.charcoal, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

// MARK: - Pairing / Setup

public struct PairingSetupScreen: View {
    @StateObject private var vm: PairingViewModel
    @State private var showImporter = false
    @State private var showAlternative = false
    var onContinue: () -> Void

    public init(engine: any WalletSkinEngine, onContinue: @escaping () -> Void) {
        _vm = StateObject(wrappedValue: PairingViewModel(engine: engine))
        self.onContinue = onContinue
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(L("Set up this iPhone", "إعداد هذا الآيفون"))
                    .font(.title2.weight(.semibold))
                Text(L(
                    "This iPhone needs to be set up once before a card’s look can change.",
                    "نحتاج تهيئة هذا الآيفون مرة واحدة قبل تغيير شكل البطاقة."
                ))
                .foregroundStyle(NamatColor.silver)
                if vm.phase == .running {
                    NamatNotice(text: L(
                        "Setting up this iPhone…",
                        "جارٍ إعداد هذا الآيفون…"
                    ))
                    NamatNotice(text: L(
                        "Allow access when the request appears.",
                        "اسمح بالوصول عندما يظهر الطلب."
                    ))
                }
                if let pin = vm.pin {
                    NamatPanel {
                        Text(L(
                            "If a code is requested, enter this one.",
                            "إذا طُلب رمز، أدخل هذا الرمز."
                        ))
                        .foregroundStyle(NamatColor.silver)
                        Text(pin)
                            .font(.title.weight(.semibold).monospacedDigit())
                            .foregroundStyle(NamatColor.polar)
                    }
                }
                if vm.phase == .verified {
                    NamatNotice(text: L("This iPhone is set up.", "تم إعداد هذا الآيفون."))
                }
                if vm.phase == .needsConnection {
                    NamatNotice(text: L(
                        "The setup file is saved. The local connection is still needed before cards can open.",
                        "حُفظ ملف الإعداد. الاتصال المحلي ما زال مطلوبًا قبل فتح البطاقات."
                    ))
                }
                if vm.phase == .failed || vm.phase == .timedOut || vm.phase == .invalidMaterial {
                    NamatNotice(
                        text: L(
                            "Setup could not be completed. Try the alternative method.",
                            "تعذر إكمال الإعداد — جرّب الطريقة البديلة."
                        ),
                        warning: true
                    )
                }
                if vm.phase == .cancelled {
                    NamatNotice(text: L("Setup was cancelled. You can start again.", "تم إلغاء الإعداد. يمكنك البدء من جديد."))
                }
                statusLine(
                    L("Device setup", "إعداد الجهاز"),
                    vm.pairingAvailable,
                    waiting: L("This iPhone needs setup", "هذا الآيفون يحتاج إعدادًا")
                )
                statusLine(
                    L("Local connection", "الاتصال المحلي"),
                    vm.phase == .verified,
                    waiting: L("Needed", "مطلوب")
                )
                if let importMessage = vm.importMessage {
                    NamatNotice(text: importMessage)
                }
                NamatPrimaryButton(
                    title: L("Start setup", "بدء الإعداد"),
                    busy: vm.phase == .running,
                    enabled: vm.phase != .running
                ) {
                    Task { await vm.start() }
                }
                if vm.phase == .running {
                    NamatQuietButton(title: L("Cancel", "إلغاء")) {
                        vm.cancel()
                    }
                } else if vm.phase == .failed || vm.phase == .timedOut || vm.phase == .cancelled || vm.phase == .invalidMaterial || vm.phase == .needsConnection {
                    NamatQuietButton(title: L("Try again", "إعادة المحاولة")) {
                        Task { await vm.retry() }
                    }
                }
                NamatQuietButton(title: L("Alternative setup method", "طريقة إعداد بديلة")) {
                    showAlternative = true
                }
                if showAlternative {
                    Text(L(
                        "Choose a device setup file saved on this iPhone.",
                        "اختر ملف إعداد الجهاز المحفوظ لهذا الآيفون."
                    ))
                    .foregroundStyle(NamatColor.silver)
                    NamatQuietButton(title: L("Choose device setup file", "اختيار ملف إعداد الجهاز")) {
                        showImporter = true
                    }
                }
            }
            .padding(24)
        }
        .namatPage()
        .navigationTitle(L("Set up this iPhone", "إعداد هذا الآيفون"))
        .namatInlineTitle()
        .task { await vm.refresh() }
        .onChange(of: vm.phase) { _, phase in
            if phase == .verified {
                onContinue()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .namatPairingPin)) { note in
            if let pin = note.object as? String {
                vm.applyPin(pin)
            }
        }
        .onDisappear { vm.cancelIfStillRunning() }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.data, .propertyList, .xml]) { result in
            switch result {
            case .success(let url):
                Task { await vm.importSetup(from: url) }
            case .failure:
                vm.importMessage = L("Could not read the device setup file.", "تعذر قراءة ملف إعداد الجهاز.")
            }
        }
    }

    private func statusLine(_ title: String, _ ready: Bool, waiting: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(ready ? L("Ready", "جاهز") : waiting)
                .foregroundStyle(ready ? NamatColor.polar : NamatColor.silver)
        }
        .padding(18)
        .background(NamatColor.charcoal, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

// MARK: - Update required

public struct UpdateRequiredScreen: View {
    public let message: String
    public var body: some View {
        VStack(spacing: 22) {
            NamatWordmark(markSize: 64)
            Text(L("A newer NAMAT is available", "يتوفر إصدار أحدث من نَمَط"))
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(NamatColor.silver)
            Link(destination: URL(string: "https://namat.shara.sa/account")!) {
                Text(L("Open account", "فتح الحساب"))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 52)
                    .background(NamatColor.purchase, in: Capsule())
            }
            Link(destination: URL(string: "https://namat.shara.sa/account/install")!) {
                Text(L("Set up this iPhone", "إعداد هذا الآيفون"))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(NamatColor.link)
                    .frame(minHeight: 44)
            }
        }
        .padding(28)
        .namatPage(stage: true)
    }
}
