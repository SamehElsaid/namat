import SwiftUI

/// Shown instead of the workspace when the account/device/server state
/// must block flashing: no entitlement, maintenance, kill switch, or
/// an unsupported iOS version on the connected device.
struct GateView: View {
    @EnvironmentObject var app: AppState

    enum Reason: Identifiable {
        case noEntitlement, maintenance, killedApply, killedRestore, compatFail(String)

        var id: String {
            switch self {
            case .noEntitlement: return "noEntitlement"
            case .maintenance: return "maintenance"
            case .killedApply: return "killedApply"
            case .killedRestore: return "killedRestore"
            case .compatFail(let v): return "compat:\(v)"
            }
        }

        var messageKey: String {
            switch self {
            case .noEntitlement: return "gate.noEntitlement"
            case .maintenance: return "gate.maintenance"
            case .killedApply: return "gate.killed.apply"
            case .killedRestore: return "gate.killed.restore"
            case .compatFail: return "gate.compatFail"
            }
        }
    }

    let reason: Reason

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text(L10n.t(reason.messageKey))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)

            HStack {
                if case .noEntitlement = reason {
                    Button(L10n.t("gate.openSite")) {
                        NSWorkspace.shared.open(URL(string: "https://namat.shara.sa/pricing")!)
                    }
                    .buttonStyle(.borderedProminent)
                }
                Button(L10n.t("gate.retry")) {
                    Task { await app.refreshGate() }
                }
            }
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var icon: String {
        switch reason {
        case .noEntitlement: return "cart"
        case .maintenance: return "wrench.and.screwdriver"
        case .killedApply, .killedRestore: return "hand.raised"
        case .compatFail: return "iphone.gen3.slash"
        }
    }
}
