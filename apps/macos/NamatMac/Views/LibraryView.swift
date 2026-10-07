import SwiftUI

/// NAMAT skin library + device scan + entry into the card studio.
struct LibraryView: View {
    @EnvironmentObject var app: AppState
    @State private var skins: [SkinSummary] = []
    @State private var loading = true
    @State private var scanning = false
    @State private var scanSecondsLeft = 0
    @State private var picked: SkinSummary?

    let columns = [GridItem(.adaptive(minimum: 170), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                deviceBar
                if loading { ProgressView().frame(maxWidth: .infinity, minHeight: 200) }
                else if skins.isEmpty {
                    Text(L10n.t("library.empty")).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 120)
                } else {
                    LazyVGrid(columns: columns, spacing: 16) {
                        uploadTile
                        ForEach(skins) { skin in
                            SkinTile(skin: skin) { picked = skin }
                        }
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle(L10n.t("library.title"))
        .task { await load() }
        .sheet(item: $picked) { skin in
            CardStudioView(source: .skin(skin))
                .environmentObject(app)
        }
        .fileImporter(isPresented: $showPicker, allowedContentTypes: [.image]) { result in
            if case .success(let url) = result {
                picked = nil
                showCustomImage = url
            }
        }
        .sheet(isPresented: Binding(get: { showCustomImage != nil }, set: { if !$0 { showCustomImage = nil } })) {
            if let url = showCustomImage {
                CardStudioView(source: .customImage(url))
                    .environmentObject(app)
            }
        }
    }

    @State private var showPicker = false
    @State private var showCustomImage: URL?

    @ViewBuilder
    private var deviceBar: some View {
        HStack {
            if let d = app.connectedDevice {
                Label(String(format: L10n.t("device.connected"), d.name), systemImage: "iphone")
                    .foregroundStyle(.green)
            } else {
                Label(L10n.t("device.none"), systemImage: "iphone.slash")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if scanning {
                Text(String(format: L10n.t("device.scanning"), scanSecondsLeft))
                    .font(.callout)
                    .foregroundStyle(.orange)
            } else {
                Button(L10n.t("device.scan")) { Task { await scan() } }
                    .disabled(app.connectedDevice == nil)
            }
        }
    }

    private var uploadTile: some View {
        Button { showPicker = true } label: {
            VStack(spacing: 8) {
                Image(systemName: "photo.badge.plus")
                    .font(.largeTitle)
                Text(L10n.t("library.upload"))
                    .font(.callout)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
        }
        .buttonStyle(.bordered)
    }

    private func load() async {
        do { skins = try await app.api.fetchSkins() } catch { skins = [] }
        loading = false
    }

    private func scan() async {
        guard let udid = app.connectedDevice?.udid else { return }
        scanning = true
        scanSecondsLeft = 60
        let timer = Task {
            while scanSecondsLeft > 0 { try? await Task.sleep(nanoseconds: 1_000_000_000); scanSecondsLeft -= 1 }
        }
        defer { timer.cancel(); scanning = false }
        _ = try? await app.engine.scan(udid: udid, seconds: 60) { _ in }
    }
}

private struct SkinTile: View {
    let skin: SkinSummary
    let onPick: () -> Void

    var body: some View {
        Button(action: onPick) {
            VStack(spacing: 8) {
                Group {
                    if let url = skin.thumbnailUrl ?? skin.artworkUrl {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img): img.resizable().aspectRatio(1536.0/969.0, contentMode: .fit)
                            default: Color.secondary.opacity(0.15)
                            }
                        }
                    } else {
                        Color.secondary.opacity(0.15)
                    }
                }
                .frame(maxWidth: .infinity).aspectRatio(1536.0/969.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                Text(skin.name).font(.caption).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}
