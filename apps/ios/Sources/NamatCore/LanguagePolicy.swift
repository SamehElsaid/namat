import Foundation

/// Fresh installs are Arabic until the customer chooses otherwise.
public enum LanguagePolicy {
    public static let storageKey = "namat.language"

    public static func resolve(stored: String?) -> String {
        if stored == "en" || stored == "ar" {
            return stored ?? "ar"
        }
        return "ar"
    }
}
