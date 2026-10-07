import SwiftUI
#if canImport(NamatCore)
import NamatCore
#endif
import WalletSkinEngine

public struct SkinDetailScreen: View {
    let api: NamatAPIClient
    let skinID: String
    @State private var detail: SkinDetail?
    @State private var errorMessage: String?

    public init(api: NamatAPIClient, skinID: String) {
        self.api = api
        self.skinID = skinID
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let detail {
                    NamatCardFace(caption: detail.name) {
                        NamatRemoteArtwork(url: detail.artworkUrl)
                    }
                    Text(detail.name)
                        .font(.title2.weight(.semibold))
                    if let description = detail.description, !description.isEmpty {
                        Text(description)
                            .foregroundStyle(NamatColor.silver)
                    }
                    Text(L("Edition \(detail.version)", "الإصدار \(detail.version)"))
                        .font(.footnote)
                        .foregroundStyle(NamatColor.steel)
                    NamatNotice(text: L(
                        "Preview only. Nothing changes until you apply it.",
                        "معاينة فقط. لا يتغير شيء حتى تطبّق التصميم."
                    ))
                } else if let errorMessage {
                    NamatNotice(text: errorMessage, warning: true)
                } else {
                    ProgressView()
                        .tint(NamatColor.polar)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                }
            }
            .padding(24)
        }
        .namatPage(stage: true)
        .navigationTitle(L("Design", "التصميم"))
        .namatInlineTitle()
        .task {
            do {
                detail = try await api.fetchSkinDetail(id: skinID)
                errorMessage = nil
            } catch {
                detail = nil
                errorMessage = L("Skin details are unavailable.", "تفاصيل التصميم غير متاحة.")
            }
        }
    }
}

public struct PreviewScreen: View {
    let skin: SkinSummary

    public init(skin: SkinSummary) {
        self.skin = skin
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                NamatCardFace(caption: skin.name) {
                    NamatRemoteArtwork(url: skin.artworkUrl ?? skin.thumbnailUrl)
                }
                Text(skin.name)
                    .font(.title2.weight(.semibold))
                if skin.artworkUrl == nil && skin.thumbnailUrl == nil {
                    NamatNotice(text: L(
                        "No artwork URL was published for this skin.",
                        "لم يُنشر رابط شكل لهذا التصميم."
                    ))
                }
                NamatNotice(text: L(
                    "Preview only. Nothing changes until you apply it.",
                    "معاينة فقط. لا يتغير شيء حتى تطبّق التصميم."
                ))
            }
            .padding(24)
        }
        .namatPage(stage: true)
        .navigationTitle(L("Preview", "معاينة"))
        .namatInlineTitle()
    }
}

public struct ApplyScreen: View {
    let card: LocalCard
    let skin: SkinSummary
    @ObservedObject var vm: ApplyRestoreViewModel

    public init(card: LocalCard, skin: SkinSummary, vm: ApplyRestoreViewModel) {
        self.card = card
        self.skin = skin
        self.vm = vm
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                NamatCardFace(caption: skin.name) {
                    NamatRemoteArtwork(url: skin.artworkUrl ?? skin.thumbnailUrl)
                }
                VStack(spacing: 6) {
                    Text(skin.name)
                        .font(.title3.weight(.semibold))
                    Text(card.displayLabel)
                        .font(.subheadline)
                        .foregroundStyle(NamatColor.silver)
                }
                Text(L(
                    "NAMAT saves the original artwork on this iPhone before any change.",
                    "نحفظ شكل بطاقتك الأصلي على جهازك قبل أي تغيير."
                ))
                .font(.footnote)
                .foregroundStyle(NamatColor.silver)
                .multilineTextAlignment(.center)
                outcome
                NamatPrimaryButton(
                    title: L("Apply design", "تطبيق التصميم"),
                    busy: vm.isBusy
                ) {
                    Task { await vm.apply(card: card, skin: skin, artworkData: nil) }
                }
            }
            .padding(24)
        }
        .namatPage(stage: true)
        .navigationTitle(L("Apply design", "تطبيق التصميم"))
        .namatInlineTitle()
    }

    @ViewBuilder
    private var outcome: some View {
        if let status = vm.statusMessage {
            if vm.errorCode == nil && !vm.isBusy {
                NamatOutcome(text: status, failed: false)
            } else {
                NamatNotice(text: status, warning: vm.errorCode != nil)
            }
        }
    }
}

public struct RestoreScreen: View {
    let card: LocalCard
    @ObservedObject var vm: ApplyRestoreViewModel
    @State private var confirmRestore = false

    public init(card: LocalCard, vm: ApplyRestoreViewModel) {
        self.card = card
        self.vm = vm
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                NamatCardFace(caption: card.displayLabel) {
                    LinearGradient(
                        colors: [NamatColor.charcoal, NamatColor.stage],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
                Text(L(
                    "This restores the original look from before the first change.",
                    "يعيد الشكل الأصلي كما كان قبل أول تغيير."
                ))
                .foregroundStyle(NamatColor.silver)
                Text(L("Card: \(card.displayLabel)", "البطاقة: \(card.displayLabel)"))
                    .font(.headline)
                if let status = vm.statusMessage {
                    if vm.errorCode == nil && !vm.isBusy {
                        NamatOutcome(text: status, failed: false)
                    } else {
                        NamatNotice(text: status, warning: vm.errorCode != nil)
                    }
                }
                Button {
                    NamatHaptic.tap()
                    confirmRestore = true
                } label: {
                    Text(L("Restore original design", "استعادة التصميم الأصلي"))
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 52)
                        .foregroundStyle(NamatColor.polar)
                        .background(NamatColor.charcoal, in: Capsule())
                        .overlay(Capsule().stroke(NamatColor.divider, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(vm.isBusy)
                .opacity(vm.isBusy ? 0.55 : 1)
                .alert(L("Restore original design", "استعادة التصميم الأصلي"), isPresented: $confirmRestore) {
                    Button(L("Restore", "استعادة"), role: .destructive) {
                        Task { await vm.restore(card: card) }
                    }
                    Button(L("Cancel", "إلغاء"), role: .cancel) {}
                } message: {
                    Text(L(
                        "This puts back the exact original look saved on this iPhone.",
                        "يعيد الشكل الأصلي المحفوظ على هذا الآيفون كما كان."
                    ))
                }
            }
            .padding(24)
        }
        .namatPage()
        .navigationTitle(L("Restore original", "استعادة التصميم الأصلي"))
        .namatInlineTitle()
        .task { await vm.refreshBackup(for: card) }
    }
}

public struct AccountLicenseScreen: View {
    let env: AppEnvironment
    @StateObject private var vm: AccountViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var transferMessage: String?
    @State private var transferFailed = false
    @State private var confirmTransfer = false
    @State private var confirmRemove: RegisteredDevice?
    @State private var expandedPurchase: String?

    public init(env: AppEnvironment) {
        self.env = env
        _vm = StateObject(wrappedValue: AccountViewModel(env: env))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let loadMessage = vm.loadMessage {
                    NamatNotice(text: loadMessage, warning: true)
                }
                NamatPanel {
                    accountRow(L("Email", "البريد"), vm.email ?? "—")
                    accountRow(
                        L("NAMAT", "نَمَط"),
                        !vm.entitlementConfirmed
                            ? L("Could not confirm", "تعذر التحقق")
                            : (vm.entitlement?.active == true
                                ? L("Activated", "مفعّل")
                                : L("Not activated", "غير مفعّل"))
                    )
                    Text(L("One-time purchase · lifetime access", "شراء لمرة واحدة · صلاحية دائمة"))
                        .font(.footnote)
                        .foregroundStyle(NamatColor.silver)
                }
                NamatPanel {
                    Text(L("Purchases", "المشتريات"))
                        .font(.headline)
                    if vm.purchasesConfirmed && vm.purchases.isEmpty {
                        Text(L("You have not purchased NAMAT yet.", "لم تشترِ نَمَط بعد."))
                            .foregroundStyle(NamatColor.silver)
                        if vm.entitlementConfirmed && vm.entitlement?.active != true {
                            Link(destination: URL(string: "https://namat.shara.sa/checkout")!) {
                                Text(L("Activate NAMAT", "فعّل نَمَط"))
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(NamatColor.link)
                                    .frame(minHeight: 44)
                            }
                        }
                    }
                    ForEach(vm.purchases) { purchase in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(purchase.reference)
                                .font(.body.weight(.semibold))
                            Text(purchaseStatus(purchase.status))
                                .font(.footnote)
                                .foregroundStyle(NamatColor.silver)
                            Text("\(purchase.createdAt.prefix(10))")
                                .font(.footnote)
                                .foregroundStyle(NamatColor.steel)
                            NamatQuietButton(title: L("View details", "عرض التفاصيل")) {
                                expandedPurchase = expandedPurchase == purchase.id ? nil : purchase.id
                            }
                            if expandedPurchase == purchase.id {
                                Text(amount(purchase))
                                Text(paymentLabel(purchase.paymentMethod))
                                    .foregroundStyle(NamatColor.silver)
                            }
                        }
                        .padding(.top, 4)
                    }
                }
                NamatPanel {
                    Text(L("Lifetime access", "الصلاحية الدائمة"))
                        .font(.headline)
                    Text(!vm.entitlementConfirmed
                        ? L("Could not confirm", "تعذر التحقق")
                        : (vm.entitlement?.active == true
                            ? L("Active · lifetime · one iPhone", "مفعّلة · دائمة · آيفون واحد")
                            : L("Not active", "غير مفعّلة"))
                    )
                    .foregroundStyle(NamatColor.silver)
                    if let created = vm.entitlement?.entitlement?.createdAt {
                        Text(L("Activated \(String(created.prefix(10)))", "تاريخ التفعيل \(String(created.prefix(10)))"))
                            .font(.footnote)
                            .foregroundStyle(NamatColor.steel)
                    }
                    if let purchaseID = vm.entitlement?.entitlement?.purchaseId,
                       let match = vm.purchases.first(where: { $0.id == purchaseID }) {
                        Text(L("Purchase \(match.reference)", "الشراء \(match.reference)"))
                            .font(.footnote)
                            .foregroundStyle(NamatColor.silver)
                    }
                    if vm.entitlementConfirmed && vm.entitlement?.active != true {
                        Link(destination: URL(string: "https://namat.shara.sa/checkout")!) {
                            Text(L("Activate NAMAT", "فعّل نَمَط"))
                                .font(.body.weight(.semibold))
                                .foregroundStyle(NamatColor.link)
                                .frame(minHeight: 44)
                        }
                    }
                }
                NamatPanel {
                    Text(L("This iPhone", "هذا الآيفون"))
                        .font(.headline)
                    if vm.devicesConfirmed && vm.devices.isEmpty {
                        Text(L("No iPhone is activated yet.", "لا يوجد آيفون مفعّل بعد."))
                            .foregroundStyle(NamatColor.silver)
                    } else if !vm.devicesConfirmed {
                        Text(L("The device check failed. Try again.", "تعذر التحقق من الجهاز. حاول مرة أخرى."))
                            .foregroundStyle(NamatColor.silver)
                    }
                    ForEach(vm.devices) { device in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(device.label ?? L("iPhone", "آيفون"))
                                .font(.body.weight(.semibold))
                            Text(device.status == "active" ? L("Active", "مفعّل") : L("Removed", "غير مفعّل"))
                                .font(.footnote)
                                .foregroundStyle(NamatColor.silver)
                            if let ios = device.iosVersion {
                                Text("iOS \(ios)")
                                    .font(.footnote)
                                    .foregroundStyle(NamatColor.steel)
                            }
                            if let app = device.appVersion {
                                Text(L("NAMAT \(app)", "نَمَط \(app)"))
                                    .font(.footnote)
                                    .foregroundStyle(NamatColor.steel)
                            }
                            if let seen = device.lastSeenAt {
                                Text(L("Last activity \(String(seen.prefix(10)))", "آخر نشاط \(String(seen.prefix(10)))"))
                                    .font(.footnote)
                                    .foregroundStyle(NamatColor.steel)
                            }
                            if device.status == "active" {
                                NamatQuietButton(title: L("Remove device", "إزالة الجهاز")) {
                                    confirmRemove = device
                                }
                            }
                        }
                        .padding(.top, 4)
                    }
                    if vm.devicesConfirmed {
                        NamatQuietButton(title: L("Transfer activation", "نقل التفعيل")) {
                            confirmTransfer = true
                        }
                    }
                    if let transferMessage {
                        NamatNotice(text: transferMessage, warning: transferFailed)
                    }
                }
                NamatPanel {
                    Text(L("App", "التطبيق"))
                        .font(.headline)
                    Text(L("This version \(RuntimeVersions.appVersion())", "الإصدار الحالي \(RuntimeVersions.appVersion())"))
                        .foregroundStyle(NamatColor.silver)
                    if let version = vm.release?.version,
                       !RuntimeVersions.appVersion().hasPrefix(version) {
                        Text(L("Newer version \(version)", "إصدار أحدث \(version)"))
                            .foregroundStyle(NamatColor.polar)
                    }
                    if vm.release?.downloadAvailable == true, let id = vm.release?.id,
                       let url = URL(string: "https://namat.shara.sa/api/v1/app-versions/\(id)/download") {
                        Link(destination: url) {
                            Text(L("Download update", "تنزيل التحديث"))
                                .font(.body.weight(.semibold))
                                .foregroundStyle(NamatColor.link)
                                .frame(minHeight: 44)
                        }
                    } else {
                        Text(L(
                            "A signed update appears here when it is published.",
                            "يظهر التحديث الموقّع هنا عند نشره."
                        ))
                        .font(.footnote)
                        .foregroundStyle(NamatColor.silver)
                    }
                }
                NamatPanel {
                    Link(destination: URL(string: "https://namat.shara.sa/support")!) {
                        Text(L("Support", "الدعم")).frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                    }
                    Link(destination: URL(string: "https://namat.shara.sa/privacy")!) {
                        Text(L("Privacy", "الخصوصية")).frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                    }
                    Link(destination: URL(string: "https://namat.shara.sa/terms")!) {
                        Text(L("Terms", "الشروط")).frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44)
                    }
                }
                Button(L("Sign out", "خروج")) {
                    NamatHaptic.tap()
                    vm.signOut()
                }
                .buttonStyle(.plain)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color(red: 1, green: 121 / 255, blue: 27 / 255))
                .frame(maxWidth: .infinity, minHeight: 52)
                Button(L("Sign out everywhere", "خروج من كل الأجهزة")) {
                    NamatHaptic.tap()
                    vm.signOut(everywhere: true)
                }
                .buttonStyle(.plain)
                .font(.body.weight(.semibold))
                .foregroundStyle(NamatColor.silver)
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .padding(20)
        }
        .namatPage()
        .navigationTitle(L("Account", "الحساب"))
        .namatInlineTitle()
        .task { await vm.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await vm.load() }
            }
        }
        .alert(L("Transfer activation", "نقل التفعيل"), isPresented: $confirmTransfer) {
            Button(L("Transfer", "نقل"), role: .destructive) {
                Task {
                    if let message = await vm.transfer() {
                        transferFailed = true
                        transferMessage = message
                    } else {
                        transferFailed = false
                        transferMessage = L(
                            "Activation moved. Only one iPhone stays active.",
                            "تم نقل التفعيل. يبقى آيفون واحد مفعّلًا."
                        )
                    }
                }
            }
            Button(L("Cancel", "إلغاء"), role: .cancel) {}
        } message: {
            Text(L(
                "This removes the active iPhone so another one can be activated.",
                "يزيل الآيفون المفعّل ليتمكن آيفون آخر من التفعيل."
            ))
        }
        .alert(L("Remove this iPhone", "إزالة هذا الآيفون"), isPresented: Binding(
            get: { confirmRemove != nil },
            set: { if !$0 { confirmRemove = nil } }
        )) {
            Button(L("Remove", "إزالة"), role: .destructive) {
                let deviceID = confirmRemove?.id
                if let deviceID {
                    Task { await vm.deactivate(id: deviceID) }
                }
            }
            Button(L("Cancel", "إلغاء"), role: .cancel) {}
        } message: {
            Text(L(
                "This iPhone will no longer be the active NAMAT device.",
                "لن يبقى هذا الآيفون هو الجهاز المفعّل لنَمَط."
            ))
        }
    }

    private func purchaseStatus(_ status: String) -> String {
        switch status {
        case "completed": return L("Completed", "مكتملة")
        case "pending": return L("Pending", "معلقة")
        case "failed": return L("Failed", "فشلت")
        case "refunded": return L("Refunded", "مستردة")
        default: return status
        }
    }

    private func paymentLabel(_ method: String) -> String {
        if method == "terminal" {
            return L("In-person payment", "دفع عبر الجهاز")
        }
        return L("Payment", "الدفع")
    }

    private func amount(_ purchase: CustomerPurchase) -> String {
        let major = Double(purchase.amountMinor) / 100
        return String(format: "%.2f %@", major, purchase.currency)
    }

    private func accountRow(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.footnote)
                .foregroundStyle(NamatColor.steel)
            Text(value)
                .font(.body.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

public struct SettingsScreen: View {
    let env: AppEnvironment

    public init(env: AppEnvironment) {
        self.env = env
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                NamatPanel {
                    Text(L("Language", "اللغة"))
                        .font(.headline)
                    LanguageToggle()
                }
                NavigationLink {
                    DiagnosticsSupportScreen(engine: env.engine, session: env.session, api: env.api)
                } label: {
                    NamatActionTile(
                        title: L("Support details", "تفاصيل الدعم"),
                        subtitle: L("Status for this iPhone", "حالة هذا الآيفون"),
                        systemImage: "questionmark.circle"
                    )
                }
                .buttonStyle(.plain)
                NavigationLink {
                    AISkinStudioScreen(api: env.api)
                } label: {
                    NamatActionTile(
                        title: L("Design with AI", "تصميم بالذكاء"),
                        subtitle: L("Describe a look", "صف شكلًا"),
                        systemImage: "sparkles"
                    )
                }
                .buttonStyle(.plain)
                NavigationLink {
                    SettingsCompatibilityScreen(engine: env.engine)
                } label: {
                    NamatActionTile(
                        title: L("This iPhone", "هذا الآيفون"),
                        subtitle: L("A quick look before you start", "نظرة سريعة قبل أن تبدأ"),
                        systemImage: "iphone"
                    )
                }
                .buttonStyle(.plain)
                NavigationLink {
                    SettingsPairingScreen(engine: env.engine)
                } label: {
                    NamatActionTile(
                        title: L("Device setup", "إعداد الجهاز"),
                        subtitle: L("Once on this iPhone", "مرة واحدة على هذا الآيفون"),
                        systemImage: "doc"
                    )
                }
                .buttonStyle(.plain)
                NamatNotice(text: L(
                    "Your card details stay on this iPhone.",
                    "تفاصيل بطاقتك تبقى على هذا الآيفون."
                ))
            }
            .padding(20)
        }
        .namatPage()
        .navigationTitle(L("Settings", "الإعدادات"))
        .namatInlineTitle()
    }
}

public struct DiagnosticsSupportScreen: View {
    @StateObject private var vm: DiagnosticsViewModel

    public init(engine: any WalletSkinEngine, session: SessionStore, api: NamatAPIClient) {
        _vm = StateObject(wrappedValue: DiagnosticsViewModel(engine: engine, session: session, api: api))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L("Status for this iPhone.", "حالة هذا الآيفون."))
                    .font(.title3.weight(.semibold))
                if vm.lines.isEmpty {
                    ProgressView()
                        .tint(NamatColor.polar)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(vm.lines, id: \.self) { line in
                        Text(line)
                            .font(.body)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18)
                            .background(NamatColor.charcoal, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                }
                NamatNotice(text: L(
                    "Support reports do not include card numbers or payment details.",
                    "تقارير الدعم لا تتضمن رقم البطاقة أو بيانات الدفع."
                ))
            }
            .padding(24)
        }
        .namatPage()
        .navigationTitle(L("Support details", "تفاصيل الدعم"))
        .namatInlineTitle()
        .task { await vm.collect() }
        .refreshable { await vm.collect() }
    }
}

public struct AISkinStudioScreen: View {
    @StateObject private var vm: AISkinStudioViewModel

    private let styles: [(String, String, String)] = [
        ("default", "Default", "افتراضي"),
        ("sand", "Sand", "رملي"),
        ("marble", "Marble", "رخام"),
        ("night", "Night", "ليلي"),
        ("geometric", "Geometric", "هندسي"),
    ]

    public init(api: NamatAPIClient) {
        _vm = StateObject(wrappedValue: AISkinStudioViewModel(api: api))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L("Describe a look. Only that description is sent.", "صف الشكل. يُرسل هذا الوصف فقط."))
                    .foregroundStyle(NamatColor.silver)
                TextField(L("Description", "الوصف"), text: $vm.prompt, axis: .vertical)
                    .lineLimit(3...6)
                    .padding(18)
                    .background(NamatColor.charcoal, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .foregroundStyle(NamatColor.polar)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(styles, id: \.0) { style in
                            let selected = vm.styleID == style.0
                            Button(L(style.1, style.2)) {
                                vm.styleID = style.0
                            }
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 40)
                            .foregroundStyle(selected ? NamatColor.graphite : NamatColor.polar)
                            .background(selected ? NamatColor.polar : NamatColor.charcoal, in: Capsule())
                        }
                    }
                }
                NamatNotice(text: L(
                    "Only the description you write is sent. Card details stay on this iPhone.",
                    "يُرسل الوصف الذي تكتبه فقط. تفاصيل البطاقة تبقى على هذا الآيفون."
                ))
                if let error = vm.errorMessage {
                    NamatNotice(text: error, warning: true)
                }
                if let url = vm.resultURL {
                    NamatCardFace(caption: L("Generated look", "الشكل الناتج")) {
                        NamatRemoteArtwork(url: url)
                    }
                }
                NamatPrimaryButton(
                    title: L("Generate", "توليد"),
                    busy: vm.isBusy,
                    enabled: !vm.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ) {
                    Task { await vm.generate() }
                }
            }
            .padding(24)
        }
        .namatPage()
        .navigationTitle(L("Design with AI", "تصميم بالذكاء"))
        .namatInlineTitle()
    }
}

private struct SettingsCompatibilityScreen: View {
    let engine: any WalletSkinEngine
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        CompatibilityScreen(engine: engine) {
            dismiss()
        }
    }
}

private struct SettingsPairingScreen: View {
    let engine: any WalletSkinEngine
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        PairingSetupScreen(engine: engine) {
            dismiss()
        }
    }
}
