import SwiftUI

/// .passthm lock-screen keypad themes: inspect, apply, restore.
struct PasscodeThemesView: View {
    @EnvironmentObject var app: AppState
    @State private var passthmURL: URL?
    @State private var info: String?
    @State private var busy = false
    @State private var status: String?
    @State private var showPicker = false

    var body: some View {
        VStack(spacing: 20) {
            Text(L10n.t("passcode.title")).font(.title2).bold()

            if let url = passthmURL {
                Label(url.lastPathComponent, systemImage: "keyboard")
            }
            if let info {
                Text(info).font(.caption).foregroundStyle(.secondary)
            }

            Button(L10n.t("passcode.choose")) { showPicker = true }
            HStack {
                Button(L10n.t("passcode.apply")) { Task { await apply() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(passthmURL == nil || app.connectedDevice == nil || busy || !app.gateAllowsApply)
                Button(L10n.t("passcode.restore")) { Task { await restore() } }
                    .disabled(passthmURL == nil || app.connectedDevice == nil || busy || !app.gateAllowsRestore)
            }

            if busy { ProgressView().controlSize(.small) }
            if let status { Text(status).font(.callout).multilineTextAlignment(.center) }
            Spacer(minLength: 0)
        }
        .padding(30)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .fileImporter(isPresented: $showPicker, allowedContentTypes: [.data]) { result in
            guard case .success(let url) = result else { return }
            passthmURL = url
            Task { await inspect() }
        }
    }

    private func inspect() async {
        guard let url = passthmURL else { return }
        do {
            let obj = try await app.engine.inspectPassthm(url)
            let keys = obj.keys.sorted().joined(separator: ", ")
            info = keys
        } catch {
            info = error.localizedDescription
        }
    }

    private func apply() async {
        guard let url = passthmURL, let dev = app.connectedDevice else { return }
        busy = true
        do {
            let started = url.startAccessingSecurityScopedResource()
            defer { if started { url.stopAccessingSecurityScopedResource() } }
            let r = try await app.engine.flashPassthm(udid: dev.udid, path: url) { _ in }
            status = r.ok ? "🎉 \(L10n.t("passcode.restartHint"))" : "❌ \(L10n.t("studio.applyFailed"))"
        } catch {
            status = "❌ \(error.localizedDescription)"
        }
        busy = false
    }

    private func restore() async {
        guard let url = passthmURL, let dev = app.connectedDevice else { return }
        busy = true
        do {
            let r = try await app.engine.restorePassthm(udid: dev.udid, path: url)
            status = r.ok ? "✅ \(L10n.t("studio.restored"))" : "❌"
        } catch EngineBridge.BridgeError.engine(let m) where m == "no_backup" {
            status = L10n.t("studio.noBackup")
        } catch {
            status = "❌ \(error.localizedDescription)"
        }
        busy = false
    }
}
