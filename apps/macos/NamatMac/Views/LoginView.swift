import SwiftUI

struct LoginView: View {
    @EnvironmentObject var app: AppState
    @State private var email = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 20) {
            Text(L10n.t("app.name"))
                .font(.largeTitle).bold()
            Text(L10n.t("login.subtitle"))
                .font(.callout)
                .foregroundStyle(.secondary)

            TextField(L10n.t("login.email"), text: $email)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 320)
                .disabled(codeSent)

            if codeSent {
                TextField(L10n.t("login.code"), text: $code)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 320)
            }

            if let error {
                Text(error).foregroundStyle(.red).font(.callout)
            }

            Button(codeSent ? L10n.t("login.verify") : L10n.t("login.sendCode")) {
                Task { await codeSent ? verify() : send() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || email.isEmpty || (codeSent && code.isEmpty))

            if busy { ProgressView().controlSize(.small) }

            Link(L10n.t("login.buyPrompt"), destination: URL(string: "https://namat.shara.sa/pricing")!)
                .font(.callout)
        }
        .padding(40)
        .frame(minWidth: 480, minHeight: 360)
    }

    private func send() async {
        busy = true; error = nil
        do {
            _ = try await app.api.requestOTP(email: email.trimmingCharacters(in: .whitespaces))
            codeSent = true
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func verify() async {
        busy = true; error = nil
        do {
            let user = try await app.api.verifyOTP(email: email.trimmingCharacters(in: .whitespaces), code: code.trimmingCharacters(in: .whitespaces))
            await app.afterLogin(userEmail: user.email)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
