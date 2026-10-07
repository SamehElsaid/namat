import SwiftUI
import AppKit

/// Pick a card, frame the artwork (library skin or customer upload),
/// apply it (backup → flash), or restore the original look.
struct CardStudioView: View {
    enum Source: Identifiable {
        case skin(SkinSummary)
        case customImage(URL)
        var id: String {
            switch self {
            case .skin(let s): return "skin:\(s.id)"
            case .customImage(let u): return "img:\(u.path)"
            }
        }
    }

    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss

    let source: Source

    @State private var image: NSImage?
    @State private var imageSize: CGSize = .zero
    @State private var framing = CardFraming()
    @State private var cards: [String] = []
    @State private var selectedCard: String?
    @State private var busy = false
    @State private var status: String?

    var body: some View {
        VStack(spacing: 16) {
            Text(L10n.t("studio.title")).font(.title2).bold()
            Text(L10n.t("studio.hint")).font(.callout).foregroundStyle(.secondary)

            if let image {
                CardCanvas(image: image, imageSize: imageSize, framing: $framing)
                    .frame(maxWidth: 620)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .shadow(radius: 8)
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 200)
            }

            cardPicker

            HStack {
                Button(L10n.t("studio.apply")) { Task { await apply() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canApply)
                Button(L10n.t("studio.restore")) { Task { await restore() } }
                    .disabled(selectedCard == nil || busy)
            }

            if busy { ProgressView().controlSize(.small) }
            if let status {
                Text(status).font(.callout)
                    .foregroundStyle(status.contains("✅") || status.contains("🎉") ? .green : .primary)
                    .multilineTextAlignment(.center)
            }
            Spacer(minLength: 0)
        }
        .padding(24)
        .frame(minWidth: 720, minHeight: 560)
        .task { await prepare() }
    }

    private var canApply: Bool {
        image != nil && selectedCard != nil && !busy && app.gateAllowsApply
    }

    @ViewBuilder
    private var cardPicker: some View {
        if cards.isEmpty {
            Button(L10n.t("device.scan")) { Task { await scanCards() } }
                .disabled(app.connectedDevice == nil)
        } else {
            Picker(L10n.t("device.selectCard"), selection: $selectedCard) {
                ForEach(cards, id: \.self) { Text(shortHash($0)).tag(Optional($0)) }
            }
            .frame(maxWidth: 260)
        }
    }

    private func shortHash(_ h: String) -> String {
        h.count > 12 ? String(h.prefix(6)) + "…" + String(h.suffix(4)) : h
    }

    // MARK: - Flow

    private func prepare() async {
        do {
            switch source {
            case .skin(let skin):
                let detail = try await app.api.fetchSkinDetail(id: skin.id)
                guard let url = detail.artworkUrl ?? skin.artworkUrl else { return }
                let data = try await app.api.downloadArtwork(url)
                image = NSImage(data: data)
            case .customImage(let url):
                let started = url.startAccessingSecurityScopedResource()
                defer { if started { url.stopAccessingSecurityScopedResource() } }
                image = NSImage(contentsOf: url)
            }
            if let cg = image?.cgImage(forProposedRect: nil, context: nil, hints: nil) {
                imageSize = CGSize(width: cg.width, height: cg.height)
                framing = CardFraming.initial(imageSize: imageSize)
            }
        } catch {
            status = error.localizedDescription
        }
    }

    private func scanCards() async {
        guard let udid = app.connectedDevice?.udid else { return }
        status = String(format: L10n.t("device.scanning"), 60)
        do {
            let r = try await app.engine.scan(udid: udid, seconds: 60) { _ in }
            cards = r.cards
            selectedCard = r.cards.first
            status = String(format: L10n.t("device.scanDone"), r.cards.count)
        } catch {
            status = error.localizedDescription
        }
    }

    private func apply() async {
        guard let img = image, let card = selectedCard, let dev = app.connectedDevice else { return }
        busy = true
        status = L10n.t("studio.applying")
        do {
            // Render the framed artwork, then hand it to the engine
            // (engine re-validates size and flashes with cache invalidation).
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("namat-\(UUID().uuidString).png")
            try ArtworkPreparer.render(image: img, framing: framing, to: tmp)
            let r = try await app.engine.flash(udid: dev.udid, cardHash: card, image: tmp) { _ in }
            try? FileManager.default.removeItem(at: tmp)
            status = r.ok ? "🎉 \(L10n.t("studio.done"))" : "❌ \(L10n.t("studio.applyFailed"))"
        } catch {
            status = "❌ \(error.localizedDescription)"
        }
        busy = false
    }

    private func restore() async {
        guard let card = selectedCard, let dev = app.connectedDevice else { return }
        busy = true
        do {
            let r = try await app.engine.restore(udid: dev.udid, cardHash: card)
            status = r.ok ? "✅ \(L10n.t("studio.restored"))" : "❌ \(L10n.t("studio.applyFailed"))"
        } catch EngineBridge.BridgeError.engine(let m) where m == "no_backup" {
            status = L10n.t("studio.noBackup")
        } catch {
            status = "❌ \(error.localizedDescription)"
        }
        busy = false
    }
}

/// Pan/zoom preview of the artwork inside the card aspect ratio.
private struct CardCanvas: View {
    let image: NSImage
    let imageSize: CGSize
    @Binding var framing: CardFraming

    var body: some View {
        GeometryReader { geo in
            let card = geo.size
            let sx = card.width / CardFraming.cardSize.width
            let sy = card.height / CardFraming.cardSize.height
            let s = min(sx, sy)

            Canvas { ctx, _ in
                var x = (card.width - imageSize.width * framing.scale * s) / 2
                var y = (card.height - imageSize.height * framing.scale * s) / 2
                x += framing.offset.width * s
                y -= framing.offset.height * s
                ctx.draw(Image(nsImage: image), in: CGRect(
                    x: x, y: y,
                    width: imageSize.width * framing.scale * s,
                    height: imageSize.height * framing.scale * s
                ))
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture()
                    .onChanged { v in
                        var f = framing
                        f.offset.width += v.translation.width / s
                        f.offset.height -= v.translation.height / s
                        f.clamp(imageSize: imageSize)
                        framing = f
                    }
            )
            .gesture(
                MagnificationGesture()
                    .onChanged { m in
                        var f = framing
                        f.scale *= m
                        f.clamp(imageSize: imageSize)
                        framing = f
                    }
            )
        }
        .aspectRatio(1536.0/969.0, contentMode: .fit)
        .background(Color.black.opacity(0.05))
    }
}
