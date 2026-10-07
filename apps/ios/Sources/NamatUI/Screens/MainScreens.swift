import SwiftUI
#if canImport(NamatCore)
import NamatCore
#endif
#if os(iOS)
import UIKit
#endif
import WalletSkinEngine

public struct MainTabScreen: View {
    let env: AppEnvironment
    var openCards: Bool
    @State private var homePath = NavigationPath()

    private enum HomeRoute: Hashable { case cards }

    public init(env: AppEnvironment, openCards: Bool = false) {
        self.env = env
        self.openCards = openCards
    }

    public var body: some View {
        TabView {
            NavigationStack(path: $homePath) {
                HomeScreen(env: env)
                    .navigationDestination(for: HomeRoute.self) { _ in
                        StartGate(env: env)
                    }
            }
            .tabItem { Label(L("Home", "الرئيسية"), systemImage: "house") }

            NavigationStack {
                AccountLicenseScreen(env: env)
            }
            .tabItem { Label(L("Account", "الحساب"), systemImage: "person.crop.circle") }

            NavigationStack {
                SettingsScreen(env: env)
            }
            .tabItem { Label(L("Settings", "الإعدادات"), systemImage: "gearshape") }
        }
        #if os(iOS)
        .toolbarBackground(NamatColor.carbon, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarColorScheme(.dark, for: .tabBar)
        #endif
        .task {
            if openCards {
                homePath.append(HomeRoute.cards)
            }
        }
    }
}

public struct CardsScreen: View {
    let engine: any WalletSkinEngine
    let api: NamatAPIClient
    @StateObject private var vm: CardsViewModel

    public init(engine: any WalletSkinEngine, api: NamatAPIClient) {
        self.engine = engine
        self.api = api
        _vm = StateObject(wrappedValue: CardsViewModel(engine: engine))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L("Choose the card whose look you want to change.", "اختر البطاقة التي تريد تغيير مظهرها."))
                    .foregroundStyle(NamatColor.silver)
                if let error = vm.errorMessage {
                    NamatNotice(text: error, warning: true)
                }
                if vm.cards.isEmpty && !vm.isBusy {
                    NamatNotice(text: L(
                        "No supported card was found on this iPhone.",
                        "لم يتم العثور على بطاقة مدعومة على هذا الآيفون."
                    ))
                }
                ForEach(vm.cards) { card in
                    NavigationLink {
                        CardWorkspaceScreen(card: card, engine: engine, api: api)
                    } label: {
                        NamatCardFace(caption: card.displayLabel) {
                            LinearGradient(
                                colors: [NamatColor.charcoal, NamatColor.stage],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(card.displayLabel)
                }
                NamatQuietButton(title: L("Find cards", "البحث عن البطاقات")) {
                    Task { await vm.discover() }
                }
            }
            .padding(20)
        }
        .namatPage()
        .navigationTitle(L("My Cards", "بطاقاتي"))
        .namatInlineTitle()
        .task { await vm.discover() }
    }
}

public struct CardWorkspaceScreen: View {
    let card: LocalCard
    let engine: any WalletSkinEngine
    let api: NamatAPIClient
    @StateObject private var applyVM: ApplyRestoreViewModel
    @State private var routeSkin: SkinSummary?
    #if os(iOS)
    private enum PhotoStep: Hashable {
        case editor
        case preview
    }
    @State private var photo: UIImage?
    @State private var renderedPhoto: Data?
    @State private var photoStep: PhotoStep?
    #endif

    public init(card: LocalCard, engine: any WalletSkinEngine, api: NamatAPIClient) {
        self.card = card
        self.engine = engine
        self.api = api
        _applyVM = StateObject(wrappedValue: ApplyRestoreViewModel(engine: engine, api: api))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(card.displayLabel)
                    .font(.title3.weight(.semibold))
                Text(backupLine)
                    .font(.footnote)
                    .foregroundStyle(NamatColor.silver)
                #if os(iOS)
                if let renderedPhoto, let image = UIImage(data: renderedPhoto) {
                    NamatCardFace {
                        Image(uiImage: image).resizable().scaledToFill()
                    }
                    .accessibilityLabel(L("Card preview", "معاينة البطاقة"))
                    NamatPrimaryButton(title: L("Apply design", "تطبيق التصميم")) {
                        photoStep = .preview
                    }
                    NamatQuietButton(title: L("Edit photo", "تعديل الصورة")) {
                        photoStep = .editor
                    }
                }
                PhotoDesignButton { image in
                    photo = image
                    renderedPhoto = nil
                    photoStep = .editor
                }
                #endif
                NavigationLink {
                    SkinLibraryScreen(api: api) { skin in
                        routeSkin = skin
                    }
                } label: {
                    NamatActionTile(
                        title: L("Browse designs", "استعرض التصاميم"),
                        subtitle: L("From NAMAT", "من نَمَط"),
                        systemImage: "square.grid.2x2"
                    )
                }
                .buttonStyle(.plain)
                NavigationLink {
                    RestoreScreen(card: card, vm: applyVM)
                } label: {
                    Text(L("Restore original design", "استعادة التصميم الأصلي"))
                        .font(.body.weight(.semibold))
                        .foregroundStyle(NamatColor.link)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(minHeight: 44)
                }
            }
            .padding(20)
        }
        .namatPage()
        .navigationTitle(L("My Card", "بطاقتي"))
        .namatInlineTitle()
        .navigationDestination(item: $routeSkin) { skin in
            ApplyScreen(card: card, skin: skin, vm: applyVM)
        }
        #if os(iOS)
        .navigationDestination(item: $photoStep) { step in
            photoDestination(step)
        }
        #endif
        .task { await applyVM.refreshBackup(for: card) }
    }

    #if os(iOS)
    @ViewBuilder
    private func photoDestination(_ step: PhotoStep) -> some View {
        switch step {
        case .editor:
            if let photo {
                PhotoEditorScreen(image: photo, onConfirm: { data in
                    renderedPhoto = data
                    photoStep = .preview
                }, onCancel: {
                    self.photo = nil
                    renderedPhoto = nil
                    photoStep = nil
                })
            } else {
                EmptyView()
            }
        case .preview:
            if let renderedPhoto {
                PhotoApplyScreen(card: card, artwork: renderedPhoto, vm: applyVM)
            } else {
                EmptyView()
            }
        }
    }
    #endif

    private var backupLine: String {
        switch applyVM.backupStatus {
        case .none:
            return L(
                "The original look is saved on this iPhone before the first change.",
                "نحفظ شكل بطاقتك الأصلي على جهازك قبل أي تغيير."
            )
        case .present:
            return L(
                "Original look saved on this iPhone.",
                "الشكل الأصلي محفوظ على هذا الآيفون."
            )
        }
    }
}

#if os(iOS)
struct PhotoApplyScreen: View {
    let card: LocalCard
    let artwork: Data
    @ObservedObject var vm: ApplyRestoreViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if let image = UIImage(data: artwork) {
                    NamatCardFace {
                        Image(uiImage: image).resizable().scaledToFill()
                    }
                    .accessibilityLabel(L("Card preview", "معاينة البطاقة"))
                }
                Text(L(
                    "NAMAT saves the original artwork on this iPhone before any change.",
                    "نحفظ شكل بطاقتك الأصلي على جهازك قبل أي تغيير."
                ))
                .font(.footnote)
                .foregroundStyle(NamatColor.silver)
                .multilineTextAlignment(.center)
                if let status = vm.statusMessage {
                    if vm.errorCode == nil && !vm.isBusy {
                        NamatOutcome(text: status, failed: false)
                    } else {
                        NamatNotice(text: status, warning: vm.errorCode != nil)
                    }
                }
                NamatPrimaryButton(
                    title: L("Apply design", "تطبيق التصميم"),
                    busy: vm.isBusy
                ) {
                    Task {
                        await vm.apply(
                            card: card,
                            skin: SkinSummary(id: "photo", name: L("Photo", "صورة"), thumbnailUrl: nil, artworkUrl: nil),
                            artworkData: artwork
                        )
                    }
                }
            }
            .padding(24)
        }
        .namatPage(stage: true)
        .navigationTitle(L("Preview", "معاينة"))
        .namatInlineTitle()
    }
}
#endif

public struct SkinLibraryScreen: View {
    let api: NamatAPIClient
    @StateObject private var vm: SkinLibraryViewModel
    var onSelect: ((SkinSummary) -> Void)?

    public init(api: NamatAPIClient, onSelect: ((SkinSummary) -> Void)? = nil) {
        self.api = api
        _vm = StateObject(wrappedValue: SkinLibraryViewModel(api: api))
        self.onSelect = onSelect
    }

    public var body: some View {
        ScrollView {
            if let error = vm.errorMessage {
                NamatNotice(text: error, warning: true)
                    .padding(.horizontal, 20)
            }
            if vm.skins.isEmpty && !vm.isBusy && vm.errorMessage == nil {
                NamatNotice(text: L("No designs are published yet.", "لا توجد تصاميم منشورة بعد."))
                    .padding(.horizontal, 20)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 16)], spacing: 16) {
                ForEach(vm.skins) { skin in
                    if let onSelect {
                        Button {
                            onSelect(skin)
                        } label: {
                            card(skin)
                        }
                        .buttonStyle(.plain)
                    } else {
                        NavigationLink {
                            SkinDetailScreen(api: api, skinID: skin.id)
                        } label: {
                            card(skin)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .namatPage()
        .navigationTitle(L("Designs", "التصاميم"))
        .namatInlineTitle()
        .task { await vm.load() }
    }

    private func card(_ skin: SkinSummary) -> some View {
        NamatCardFace(caption: skin.name) {
            NamatRemoteArtwork(url: skin.thumbnailUrl ?? skin.artworkUrl)
        }
        .accessibilityLabel(skin.name)
    }
}
