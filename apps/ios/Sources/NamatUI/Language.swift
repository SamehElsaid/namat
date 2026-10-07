import Foundation
import SwiftUI
#if canImport(NamatCore)
import NamatCore
#endif

public final class LanguageStore: ObservableObject {
    public static let shared = LanguageStore()

    @Published public private(set) var code: String

    public init() {
        let stored = UserDefaults.standard.string(forKey: LanguagePolicy.storageKey)
        code = LanguagePolicy.resolve(stored: stored)
    }

    public var isArabic: Bool { code == "ar" }

    public func text(_ en: String, _ ar: String) -> String {
        isArabic ? ar : en
    }

    public func setCode(_ next: String) {
        let value = next == "en" ? "en" : "ar"
        code = value
        UserDefaults.standard.set(value, forKey: LanguagePolicy.storageKey)
    }
}

public func L(_ en: String, _ ar: String) -> String {
    LanguageStore.shared.text(en, ar)
}
