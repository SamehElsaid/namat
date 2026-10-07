import SwiftUI

@main
struct NamatMacApp: App {
    @StateObject private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .id(L10n.language.rawValue + L10n.effectiveLocale.identifier)
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 980, height: 680)
    }
}

// MARK: - App state

@MainActor
final class AppState: ObservableObject {
    let session = SessionStore()
    let engine = EngineBridge()

    private(set) lazy var api = NamatAPI(
        baseURL: URL(string: UserDefaults.standard.string(forKey: "namat.apiUrl")
                     ?? "https://namat.shara.sa/api/v1")!,
        session: session
    )

    @Published var connectedDevice: EngineBridge.Device?
    @Published var remoteConfig: RemoteAppConfig?
    @Published var compatibility: CompatibilityCatalog?
    @Published var gateAllowsApply = false
    @Published var gateAllowsRestore = false
    @Published var blockReason: GateView.Reason?

    private var deviceTimer: Timer?

    init() {
        Task { await refreshDevice() }
        deviceTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in
            Task { await self.refreshDevice() }
        }
    }

    func afterLogin(userEmail: String) async {
        do {
            let e = try await api.fetchEntitlement()
            session.applyEntitlement(e.active)
        } catch {
            session.applyEntitlement(false)
        }
        await refreshGate()
    }

    /// Re-checks kill switch / maintenance / compatibility after login,
    /// after device changes, or when the user presses Retry.
    func refreshGate() async {
        do { remoteConfig = try await api.fetchRemoteConfig() } catch { /* keep last */ }
        do { compatibility = try await api.fetchCompatibility() } catch { /* keep last */ }

        guard session.isLoggedIn else { blockReason = nil; return }

        if remoteConfig?.maintenanceMode == true {
            blockReason = .maintenance; gateAllowsApply = false; gateAllowsRestore = false; return
        }
        if session.entitlementActive == false {
            blockReason = .noEntitlement; gateAllowsApply = false; gateAllowsRestore = false; return
        }
        if let dev = connectedDevice {
            let supported = isIOSCompatible(dev)
            if !supported {
                blockReason = .compatFail(dev.product ?? dev.udid)
                gateAllowsApply = false; gateAllowsRestore = false; return
            }
        }
        gateAllowsApply = remoteConfig?.killSwitchApply != true
        gateAllowsRestore = remoteConfig?.killSwitchRestore != true
        blockReason = gateAllowsApply ? nil : .killedApply
    }

    private func isIOSCompatible(_ device: EngineBridge.Device) -> Bool {
        // The engine reads iOS version from the device during operations;
        // the server-side compatibility matrix remains the authority. Here we
        // conservatively allow and let the engine report per-version failures.
        guard let catalog = compatibility else { return true }
        return !catalog.rules.contains { $0.state == "blocked" && matches(device, rule: $0) }
    }

    private func matches(_ device: EngineBridge.Device, rule: CompatibilityRule) -> Bool {
        if let models = rule.supportedModels, !models.isEmpty {
            let p = device.product ?? ""
            return models.contains { p.hasPrefix($0) || device.udid.hasPrefix($0) }
        }
        return true
    }

    func refreshDevice() async {
        guard let r = try? await engine.devices() else { return }
        let wasNil = connectedDevice == nil
        connectedDevice = r.devices.first
        if wasNil != (connectedDevice == nil) {
            await refreshGate()
        }
    }
}

// MARK: - Root

struct RootView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        Group {
            if !app.session.isLoggedIn {
                LoginView()
            } else if let reason = app.blockReason {
                GateView(reason: reason)
            } else {
                workspace
            }
        }
        .frame(minWidth: 860, minHeight: 600)
    }

    private var workspace: some View {
        TabView {
            NavigationStack { LibraryView() }
                .tabItem { Label(L10n.t("tab.cards"), systemImage: "creditcard") }
            NavigationStack { PasscodeThemesView() }
                .tabItem { Label(L10n.t("tab.passcode"), systemImage: "number.square") }
            NavigationStack { SettingsView() }
                .tabItem { Label(L10n.t("tab.settings"), systemImage: "gear") }
        }
    }
}
