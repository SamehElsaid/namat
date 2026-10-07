import SwiftUI
import WalletSkinEngine
#if canImport(NamatCore)
import NamatCore
#endif

/// Login is already done. This screen separates purchase, device activation,
/// and local setup, and hides the tab bar until setup is verified.
public struct CustomerGuideScreen: View {
    @ObservedObject var coordinator: RootCoordinator
    @StateObject private var model: CustomerGuideModel
    @State private var showAccount = false

    public init(coordinator: RootCoordinator) {
        self.coordinator = coordinator
        _model = StateObject(wrappedValue: CustomerGuideModel(env: coordinator.env))
    }

    public var body: some View {
        NavigationStack {
            Group {
                if model.phase == .needsSetup {
                    PairingSetupScreen(engine: coordinator.env.engine) {
                        coordinator.showCards()
                    }
                } else {
                    guideBody
                }
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(L("Account", "الحساب")) { showAccount = true }
                }
            }
            .sheet(isPresented: $showAccount) {
                NavigationStack {
                    AccountLicenseScreen(env: coordinator.env)
                }
            }
        }
        .task { await model.reload() }
        .onChange(of: coordinator.resumeTick) { _, _ in
            Task { await model.reload() }
        }
        .onChange(of: model.phase) { _, phase in
            if phase == .ready {
                coordinator.showCards()
            }
        }
    }

    private var title: String {
        switch model.phase {
        case .loading, .ready:
            return L("Checking this iPhone", "جارٍ فحص هذا الآيفون")
        case .needsPurchase:
            return L("Activate NAMAT", "فعّل نَمَط")
        case .needsActivation:
            return L("Activate this iPhone", "تفعيل هذا الآيفون")
        case .needsSetup:
            return L("Set up this iPhone", "إعداد هذا الآيفون")
        case .connectionProblem:
            return L("Could not connect", "تعذر الاتصال")
        }
    }

    private var detail: String {
        switch model.phase {
        case .loading, .ready:
            return L("One-time purchase · lifetime access", "شراء لمرة واحدة · صلاحية دائمة")
        case .needsPurchase:
            return L(
                "NAMAT is not activated yet. A one-time purchase gives lifetime access on one iPhone.",
                "لم يُفعّل نَمَط بعد. شراء لمرة واحدة يمنح صلاحية دائمة على آيفون واحد."
            )
        case .needsActivation:
            return L(
                "Activate this iPhone. Only one iPhone stays active.",
                "فعّل هذا الآيفون. يبقى آيفون واحد مفعّلًا."
            )
        case .needsSetup:
            return L(
                "This iPhone needs to be set up once before a card’s look can change.",
                "نحتاج تهيئة هذا الآيفون مرة واحدة قبل تغيير شكل البطاقة."
            )
        case .connectionProblem:
            return L(
                "The account could not be confirmed. Try again.",
                "تعذر التحقق من الحساب. حاول مرة أخرى."
            )
        }
    }

    private var guideBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(title)
                    .font(.title2.weight(.semibold))
                Text(detail)
                    .foregroundStyle(NamatColor.silver)
                if let message = model.message {
                    NamatNotice(text: message, warning: model.messageIsWarning)
                }
                action
                NamatQuietButton(title: L("Refresh", "تحديث")) {
                    Task { await model.reload() }
                }
                supportLinks
            }
            .padding(24)
        }
        .namatPage()
        .navigationTitle(L("NAMAT", "نَمَط"))
        .namatInlineTitle()
    }

    private var supportLinks: some View {
        VStack(alignment: .leading, spacing: 4) {
            Link(destination: URL(string: "https://namat.shara.sa/support")!) {
                Text(L("Support", "الدعم"))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(NamatColor.link)
                    .frame(minHeight: 44)
            }
            Link(destination: URL(string: "https://namat.shara.sa/privacy")!) {
                Text(L("Privacy", "الخصوصية"))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(NamatColor.link)
                    .frame(minHeight: 44)
            }
            Link(destination: URL(string: "https://namat.shara.sa/terms")!) {
                Text(L("Terms", "الشروط"))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(NamatColor.link)
                    .frame(minHeight: 44)
            }
        }
    }

    @ViewBuilder
    private var action: some View {
        switch model.phase {
        case .loading, .ready:
            ProgressView()
                .tint(NamatColor.polar)
                .frame(maxWidth: .infinity)
        case .needsPurchase:
            Link(destination: URL(string: "https://namat.shara.sa/checkout")!) {
                Text(L("Activate NAMAT", "فعّل نَمَط"))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 52)
                    .background(NamatColor.purchase, in: Capsule())
            }
        case .needsActivation:
            NamatPrimaryButton(
                title: model.otherDeviceActive
                    ? L("Transfer activation to this iPhone", "نقل التفعيل إلى هذا الآيفون")
                    : L("Activate this iPhone", "تفعيل هذا الآيفون"),
                busy: model.busy
            ) {
                Task { await model.activateThisIPhone() }
            }
        case .needsSetup:
            EmptyView()
        case .connectionProblem:
            EmptyView()
        }
    }
}

@MainActor
final class CustomerGuideModel: ObservableObject {
    enum Phase: Equatable {
        case loading
        case needsPurchase
        case needsActivation
        case needsSetup
        case ready
        case connectionProblem
    }

    @Published var phase: Phase = .loading
    @Published var message: String?
    @Published var messageIsWarning = false
    @Published var busy = false
    @Published var otherDeviceActive = false

    private let env: AppEnvironment
    private var previouslyConfirmedSetup = false

    init(env: AppEnvironment) {
        self.env = env
    }

    func reload() async {
        message = nil
        messageIsWarning = false
        let entitlementResult: Result<Bool, CustomerAccessFailure>
        do {
            let entitlement = try await env.api.fetchEntitlement()
            entitlementResult = .success(entitlement.active)
        } catch let error as NamatAPIError {
            entitlementResult = .failure(CustomerAccessFailure(error))
        } catch {
            entitlementResult = .failure(.network)
        }

        var deviceResult: Result<[CustomerDeviceFact], CustomerAccessFailure>?
        if case .success(true) = entitlementResult {
            do {
                let devices = try await env.api.fetchDevices()
                deviceResult = .success(devices.map {
                    CustomerDeviceFact(installationId: $0.installationId, status: $0.status)
                })
            } catch let error as NamatAPIError {
                deviceResult = .failure(CustomerAccessFailure(error))
            } catch {
                deviceResult = .failure(.network)
            }
        }

        let setup: SetupVerification
        if case .success(let devices) = deviceResult,
           devices.contains(where: { $0.installationId == env.session.deviceInstallationID && $0.status == "active" }) {
            setup = await env.engine.verifyDeviceSetup(shouldCancel: { false })
        } else {
            setup = .notStarted
        }

        let decision = CustomerAccessPlanner.decide(
            entitlement: entitlementResult,
            devices: deviceResult,
            setup: setup,
            installationId: env.session.deviceInstallationID,
            previouslyConfirmedSetup: previouslyConfirmedSetup
        )
        apply(decision)
    }

    private func apply(_ decision: CustomerAccess) {
        switch decision {
        case .purchase:
            previouslyConfirmedSetup = false
            otherDeviceActive = false
            phase = .needsPurchase
        case .activate(let other):
            previouslyConfirmedSetup = false
            otherDeviceActive = other
            phase = .needsActivation
        case .setup:
            previouslyConfirmedSetup = true
            otherDeviceActive = false
            phase = .needsSetup
        case .cards:
            previouslyConfirmedSetup = true
            otherDeviceActive = false
            phase = .ready
        case .retryEntitlement(let holding):
            messageIsWarning = true
            message = holding
                ? L(
                    "NAMAT was active. The latest check failed. Try again.",
                    "كانت صلاحية نَمَط قائمة. تعذر آخر فحص. حاول مرة أخرى."
                )
                : L(
                    "The account could not be confirmed. Try again.",
                    "تعذر التحقق من الحساب. حاول مرة أخرى."
                )
            phase = .connectionProblem
        case .retryDevices(let holding):
            messageIsWarning = true
            message = holding
                ? L(
                    "This iPhone was activated. The latest check failed. Try again.",
                    "هذا الآيفون كان مفعّلًا. تعذر آخر فحص. حاول مرة أخرى."
                )
                : L(
                    "The device check failed. Try again.",
                    "تعذر التحقق من الجهاز. حاول مرة أخرى."
                )
            otherDeviceActive = false
            phase = .connectionProblem
        case .recoverAuthentication:
            previouslyConfirmedSetup = false
            otherDeviceActive = false
            phase = .connectionProblem
            messageIsWarning = true
            message = L("Sign in again to continue.", "سجّل الدخول مرة أخرى للمتابعة.")
            env.session.clear()
        }
    }

    func activateThisIPhone() async {
        guard phase == .needsActivation else { return }
        busy = true
        defer { busy = false }
        message = nil
        do {
            if otherDeviceActive {
                try await env.api.transferActivation()
            }
            try await env.api.registerDevice()
            await reload()
        } catch let error as NamatAPIError {
            messageIsWarning = true
            let code: String
            if case .http(_, let parsed, _) = error {
                code = parsed ?? "activation_required"
            } else {
                code = "activation_required"
            }
            message = CustomerCopy.flowMessage(code: code, arabic: LanguageStore.shared.isArabic)
        } catch {
            messageIsWarning = true
            message = CustomerCopy.flowMessage(code: "activation_required", arabic: LanguageStore.shared.isArabic)
        }
    }
}
