import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        Form {
            Section(L10n.t("settings.account")) {
                if let email = app.session.email {
                    LabeledContent(L10n.t("login.email"), value: email)
                }
                Button(L10n.t("settings.logout")) {
                    Task { try? await app.api.logout() }
                }
            }

            Section(L10n.t("settings.language")) {
                Picker(L10n.t("settings.language"), selection: Binding(
                    get: { L10n.language },
                    set: { L10n.language = $0 }
                )) {
                    ForEach(L10n.Language.allCases) { Text($0.displayName).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Section(L10n.t("settings.apiUrl")) {
                Text(app.api.baseURL.absoluteString)
                    .textSelection(.enabled)
                    .font(.callout)
            }

            Section {
                LabeledContent(L10n.t("settings.version"),
                               value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                LabeledContent("", value: L10n.t("settings.engine"))
                    .font(.caption)
            }
        }
        .formStyle(.grouped)
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
