import SwiftUI
import WalletSkinEngine
// SwiftPM builds NamatCore, NamatUI, and NamatApp as separate modules.
// The Xcode app target compiles those sources into one module.
#if canImport(NamatCore)
import NamatCore
#endif
#if canImport(NamatUI)
import NamatUI
#endif

@main
struct NamatAppMain: App {
    @State private var environment: AppEnvironment?
    @State private var bootError: String?

    var body: some Scene {
        WindowGroup {
            Group {
                if let environment {
                    NamatRootView(env: environment)
                } else if let bootError {
                    VStack(spacing: 16) {
                        Text("نَمَط")
                            .font(.largeTitle.weight(.semibold))
                            .foregroundStyle(Color(red: 245 / 255, green: 245 / 255, blue: 247 / 255))
                        Text(bootError)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Color(red: 204 / 255, green: 204 / 255, blue: 204 / 255))
                    }
                    .padding(28)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255).ignoresSafeArea())
                } else {
                    ProgressView()
                        .tint(Color(red: 245 / 255, green: 245 / 255, blue: 247 / 255))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.ignoresSafeArea())
                        .accessibilityLabel(L("Loading", "جارٍ التحميل"))
                }
            }
            .preferredColorScheme(.dark)
            .task {
                await boot()
            }
            .onOpenURL { url in
                _ = GoogleAuthCallback.handle(url)
            }
        }
    }

    @MainActor
    private func boot() async {
        do {
            let session = SessionStore()
            let config = AppConfig.default
            #if os(iOS)
            let api = NamatAPIClient(
                baseURL: config.apiBaseURL,
                session: session,
                deviceKey: KeychainDeviceKey()
            )
            #else
            let api = NamatAPIClient(baseURL: config.apiBaseURL, session: session)
            #endif
            // Debug uses LocalStubEngine. Release uses AirCardWalletEngine and
            // fails to compile without AirliftFFI.
            let engine = try await WalletEngineFactory.makeForCurrentBuild()
            #if os(iOS) && canImport(GoogleSignIn)
            let google: any GoogleIdentitySigning = DeviceGoogleIdentitySigning()
            #else
            let google: any GoogleIdentitySigning = UnavailableGoogleIdentitySigning()
            #endif
            environment = AppEnvironment(
                engine: engine,
                api: api,
                session: session,
                config: config,
                google: google
            )
        } catch {
            bootError = L(
                "NAMAT could not start. Close the app and open it again.",
                "تعذر تشغيل نَمَط. أغلق التطبيق ثم افتحه مرة أخرى."
            )
        }
    }
}
