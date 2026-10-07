import Foundation

/// Bilingual UI (ar / en) backed by Localizable.strings in the app bundle.
enum L10n {
    static var language: Language {
        get { Language(rawValue: UserDefaults.standard.string(forKey: "namat.language") ?? "") ?? .system }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "namat.language") }
    }

    enum Language: String, CaseIterable, Identifiable {
        case system = "system"
        case arabic = "ar"
        case english = "en"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .system: return t("lang.system")
            case .arabic: return "العربية"
            case .english: return "English"
            }
        }
    }

    static var effectiveLocale: Locale {
        switch language {
        case .arabic: return Locale(identifier: "ar")
        case .english: return Locale(identifier: "en")
        case .system: return Locale.current
        }
    }

    static var isRTL: Bool {
        effectiveLocale.languageCode?.hasPrefix("ar") ?? false
    }

    static func t(_ key: String, _ args: CVarArg...) -> String {
        let locale = effectiveLocale
        let bundle: Bundle = {
            guard let path = Bundle.main.path(
                forResource: locale.languageCode?.hasPrefix("ar") == true ? "ar" : "en",
                ofType: "lproj"
            ), let b = Bundle(path: path) else { return .main }
            return b
        }()
        let format = bundle.localizedString(forKey: key, value: nil, table: nil)
        return args.isEmpty ? format : String(format: format, arguments: args)
    }
}
