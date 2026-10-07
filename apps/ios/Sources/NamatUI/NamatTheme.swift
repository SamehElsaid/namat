import SwiftUI
#if canImport(NamatCore)
import NamatCore
#endif
#if os(iOS)
import UIKit
#endif

enum NamatColor {
    static let carbon = Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255)
    static let stage = Color.black
    static let polar = Color(red: 245 / 255, green: 245 / 255, blue: 247 / 255)
    static let graphite = Color(red: 29 / 255, green: 29 / 255, blue: 31 / 255)
    static let steel = Color(red: 134 / 255, green: 134 / 255, blue: 139 / 255)
    static let silver = Color(red: 204 / 255, green: 204 / 255, blue: 204 / 255)
    static let charcoal = Color(red: 51 / 255, green: 51 / 255, blue: 54 / 255)
    static let purchase = Color(red: 0 / 255, green: 113 / 255, blue: 227 / 255)
    static let link = Color(red: 41 / 255, green: 151 / 255, blue: 255 / 255)
    static let divider = Color(red: 110 / 255, green: 110 / 255, blue: 115 / 255)
}

enum NamatHaptic {
    static func tap() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
    }
}

struct NamatWordmark: View {
    var markSize: CGFloat = 72
    @ObservedObject private var language = LanguageStore.shared

    var body: some View {
        VStack(spacing: 18) {
            Image("BrandMark")
                .resizable()
                .scaledToFit()
                .frame(width: markSize, height: markSize)
                .padding(markSize > 64 ? 16 : 10)
                .background(NamatColor.polar, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .accessibilityLabel(language.isArabic ? "نَمَط" : "NAMAT")
            VStack(spacing: 6) {
                Text(language.isArabic ? "نَمَط" : "NAMAT")
                    .font(.system(size: markSize > 64 ? 40 : 28, weight: .semibold))
                Text(language.isArabic ? "NAMAT" : "نَمَط")
                    .font(.system(size: 12, weight: .regular))
                    .tracking(3)
                    .foregroundStyle(NamatColor.silver)
            }
        }
    }
}

struct NamatPrimaryButton: View {
    let title: String
    var busy = false
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button {
            NamatHaptic.tap()
            action()
        } label: {
            ZStack {
                if busy {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text(title)
                        .font(.body.weight(.semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 52)
            .foregroundStyle(.white)
            .background(NamatColor.purchase, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!enabled || busy)
        .opacity(enabled ? 1 : 0.55)
    }
}

struct NamatQuietButton: View {
    let title: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .font(.body.weight(.semibold))
            .foregroundStyle(NamatColor.link)
            .frame(minHeight: 44)
            .disabled(!enabled)
    }
}

struct NamatPanel<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(NamatColor.charcoal, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .foregroundStyle(NamatColor.polar)
    }
}

struct NamatActionTile: View {
    let title: String
    let subtitle: String
    var systemImage: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: systemImage)
                .font(.title3)
                .frame(width: 44, height: 44)
                .background(NamatColor.carbon, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(NamatColor.silver)
            }
            Spacer(minLength: 8)
        }
        .padding(18)
        .frame(minHeight: 92)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NamatColor.charcoal, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .foregroundStyle(NamatColor.polar)
    }
}

struct NamatStepRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(String(format: "%02d", number))
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(NamatColor.silver)
                .frame(width: 36, height: 36)
                .overlay(Circle().stroke(NamatColor.divider, lineWidth: 1))
            Text(text)
                .font(.body)
                .foregroundStyle(NamatColor.polar)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
        }
        .accessibilityElement(children: .combine)
    }
}

struct NamatNotice: View {
    let text: String
    var warning = false

    var body: some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(warning ? Color(red: 1, green: 121 / 255, blue: 27 / 255) : NamatColor.silver)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(
                (warning ? Color(red: 49 / 255, green: 20 / 255, blue: 0) : NamatColor.charcoal),
                in: RoundedRectangle(cornerRadius: 22, style: .continuous)
            )
    }
}

struct NamatOutcome: View {
    let text: String
    var failed: Bool

    var body: some View {
        if failed {
            NamatNotice(text: text, warning: true)
        } else {
            VStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(NamatColor.link)
                    .accessibilityHidden(true)
                Text(text)
                    .font(.body.weight(.semibold))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(22)
            .background(NamatColor.charcoal, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .accessibilityElement(children: .combine)
        }
    }
}

struct NamatRemoteArtwork: View {
    let url: URL?

    var body: some View {
        if let url {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    NamatColor.charcoal
                default:
                    ZStack {
                        NamatColor.charcoal
                        ProgressView()
                            .tint(NamatColor.polar)
                    }
                }
            }
        } else {
            LinearGradient(
                colors: [NamatColor.charcoal, NamatColor.stage],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

/// Artwork-only card face. No card number, brand network, or payment marks.
struct NamatCardFace<Artwork: View>: View {
    var caption: String?
    @ViewBuilder var artwork: () -> Artwork

    init(caption: String? = nil, @ViewBuilder artwork: @escaping () -> Artwork) {
        self.caption = caption
        self.artwork = artwork
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            artwork()
            LinearGradient(
                colors: [Color.black.opacity(0.45), Color.clear, Color.black.opacity(0.55)],
                startPoint: .top,
                endPoint: .bottom
            )
            VStack(alignment: .leading, spacing: 0) {
                Text("NAMAT")
                    .font(.system(size: 18, weight: .semibold))
                    .tracking(3)
                Spacer()
                if let caption {
                    Text(caption)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NamatColor.polar.opacity(0.92))
                }
            }
            .padding(20)
            .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(CGFloat(CardArtworkFormat.aspect), contentMode: .fit)
        .background(Color(red: 8 / 255, green: 8 / 255, blue: 8 / 255))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.45), radius: 24, y: 16)
        .accessibilityElement(children: .combine)
    }
}

extension View {
    func namatPage(stage: Bool = false) -> some View {
        frame(maxWidth: .infinity, maxHeight: .infinity)
            .background((stage ? NamatColor.stage : NamatColor.carbon).ignoresSafeArea())
            .foregroundStyle(NamatColor.polar)
            .namatBars()
    }

    @ViewBuilder
    func namatBars() -> some View {
        #if os(iOS)
        self
            .toolbarBackground(NamatColor.carbon, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        #else
        self
        #endif
    }

    func namatField() -> some View {
        padding(.horizontal, 18)
            .frame(minHeight: 52)
            .background(NamatColor.charcoal, in: Capsule())
            .overlay(Capsule().stroke(NamatColor.divider.opacity(0.7), lineWidth: 1))
            .foregroundStyle(NamatColor.polar)
    }
}
