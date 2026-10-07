import SwiftUI
import WalletSkinEngine
#if canImport(NamatCore)
import NamatCore
#endif

struct LanguageToggle: View {
    @ObservedObject private var language = LanguageStore.shared

    var body: some View {
        Picker(L("Language", "اللغة"), selection: Binding(
            get: { language.code },
            set: { language.setCode($0) }
        )) {
            Text("العربية").tag("ar")
            Text("English").tag("en")
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 240)
        .accessibilityLabel(L("Language", "اللغة"))
    }
}

public struct HomeScreen: View {
    let env: AppEnvironment

    public init(env: AppEnvironment) {
        self.env = env
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                LanguageToggle()
                    .padding(.top, 8)
                NamatWordmark()
                Text(L("Change your card’s look.", "غيّر مظهر بطاقتك."))
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                Text(L(
                    "Your photo or a NAMAT design. The original stays on this iPhone.",
                    "صورتك أو تصميم من نَمَط. الأصل يبقى على هذا الآيفون."
                ))
                .font(.body)
                .foregroundStyle(NamatColor.silver)
                .multilineTextAlignment(.center)
                NavigationLink {
                    StartGate(env: env)
                } label: {
                    Text(L("Start", "ابدأ"))
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 52)
                        .background(NamatColor.purchase, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("Start", "ابدأ"))
            }
            .padding(28)
        }
        .namatPage(stage: true)
        .navigationTitle(L("NAMAT", "نَمَط"))
        .namatInlineTitle()
    }
}

struct StartGate: View {
    let env: AppEnvironment
    @State private var needsSetup = false
    @State private var ready = false

    var body: some View {
        Group {
            if !ready {
                ProgressView()
                    .tint(NamatColor.polar)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .namatPage()
                    .accessibilityLabel(L("Checking this iPhone", "جارٍ فحص هذا الآيفون"))
            } else if needsSetup {
                PairingSetupScreen(engine: env.engine) {
                    needsSetup = false
                }
            } else {
                CardsScreen(engine: env.engine, api: env.api)
            }
        }
        .task { await check() }
    }

    private func check() async {
        let verification = await env.engine.verifyDeviceSetup(shouldCancel: { false })
        needsSetup = verification != .verified
        ready = true
    }
}

#if os(iOS)
import PhotosUI
import UIKit

struct PhotoDesignButton: View {
    var onImage: (UIImage) -> Void
    @State private var item: PhotosPickerItem?

    var body: some View {
        PhotosPicker(selection: $item, matching: .images, photoLibrary: .shared()) {
            NamatActionTile(
                title: L("Choose a photo", "اختر صورة"),
                subtitle: L("From your photos", "من صورك"),
                systemImage: "photo"
            )
        }
        .accessibilityLabel(L("Choose a photo from your photos", "اختر صورة من صورك"))
        .onChange(of: item) { _, newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let image = CardArtworkRenderer.downsample(data) {
                    onImage(image)
                }
            }
        }
    }
}

struct PhotoEditorScreen: View {
    let image: UIImage
    var onConfirm: (Data) -> Void
    var onCancel: () -> Void
    @State private var zoom: Double = 1
    @State private var panX: Double = 0
    @State private var panY: Double = 0
    @State private var gestureZoom: Double = 1
    @State private var gesturePanX: Double = 0
    @State private var gesturePanY: Double = 0

    var body: some View {
        VStack(spacing: 20) {
            Text(L("Move and pinch the photo until it sits on the card.", "حرّك الصورة وقرّبها حتى تستقر على البطاقة."))
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(NamatColor.silver)
            Text(L("What you see inside the card is the final crop.", "ما يظهر داخل البطاقة هو القص النهائي."))
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(NamatColor.steel)
            CardArtworkPreview(image: image, zoom: zoom * gestureZoom, panX: panX + gesturePanX, panY: panY + gesturePanY)
                .gesture(drag)
                .simultaneousGesture(magnify)
                .accessibilityLabel(L("Card preview", "معاينة البطاقة"))
            HStack {
                NamatQuietButton(title: L("Reset", "إعادة")) {
                    zoom = 1
                    panX = 0
                    panY = 0
                    gestureZoom = 1
                    gesturePanX = 0
                    gesturePanY = 0
                }
                Spacer()
                NamatQuietButton(title: L("Cancel", "إلغاء")) {
                    onCancel()
                }
            }
            NamatPrimaryButton(title: L("Preview on the card", "عاين على البطاقة")) {
                let pixels = CardArtworkRenderer.pixelSize(image)
                let crop = ArtworkCropper.crop(
                    imageWidth: pixels.width,
                    imageHeight: pixels.height,
                    zoom: zoom * gestureZoom,
                    panX: panX + gesturePanX,
                    panY: panY + gesturePanY
                )
                if let data = CardArtworkRenderer.renderPNG(image: image, crop: crop) {
                    onConfirm(data)
                }
            }
        }
        .padding(24)
        .namatPage(stage: true)
        .navigationTitle(L("Edit photo", "تعديل الصورة"))
        .namatInlineTitle()
    }

    private var drag: some Gesture {
        DragGesture()
            .onChanged { value in
                gesturePanX = Double(value.translation.width / 160)
                gesturePanY = Double(value.translation.height / 160)
            }
            .onEnded { _ in
                panX = min(max(panX + gesturePanX, -1), 1)
                panY = min(max(panY + gesturePanY, -1), 1)
                gesturePanX = 0
                gesturePanY = 0
            }
    }

    private var magnify: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                gestureZoom = value.magnification
            }
            .onEnded { value in
                zoom = min(max(zoom * value.magnification, 1), 8)
                gestureZoom = 1
            }
    }
}

struct CardArtworkPreview: View {
    let image: UIImage
    var zoom: Double
    var panX: Double
    var panY: Double

    var body: some View {
        let crop = ArtworkCropper.crop(
            imageWidth: CardArtworkRenderer.pixelSize(image).width,
            imageHeight: CardArtworkRenderer.pixelSize(image).height,
            zoom: zoom,
            panX: panX,
            panY: panY
        )
        NamatCardFace {
            GeometryReader { geo in
                let scale = geo.size.width / CGFloat(crop.width)
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .frame(
                        width: CGFloat(CardArtworkRenderer.pixelSize(image).width) * scale,
                        height: CGFloat(CardArtworkRenderer.pixelSize(image).height) * scale
                    )
                    .offset(
                        x: -CGFloat(crop.originX) * scale,
                        y: -CGFloat(crop.originY) * scale
                    )
                    .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
                    .clipped()
            }
        }
    }
}

enum CardArtworkRenderer {
    static func pixelSize(_ image: UIImage) -> (width: Double, height: Double) {
        let width = Double(image.size.width * image.scale)
        let height = Double(image.size.height * image.scale)
        return (width, height)
    }

    static func downsample(_ data: Data, maxPixel: CGFloat = 2048) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    static func renderPNG(image: UIImage, crop: ArtworkCrop) -> Data? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: CardArtworkFormat.pixelWidth, height: CardArtworkFormat.pixelHeight),
            format: format
        )
        let png = renderer.pngData { _ in
            let width = image.size.width * image.scale
            let height = image.size.height * image.scale
            guard width > 0, height > 0, let cgImage = image.cgImage else { return }
            let sx = CGFloat(crop.originX) / width
            let sy = CGFloat(crop.originY) / height
            let sw = CGFloat(crop.width) / width
            let sh = CGFloat(crop.height) / height
            let cropRect = CGRect(
                x: sx * CGFloat(cgImage.width),
                y: sy * CGFloat(cgImage.height),
                width: sw * CGFloat(cgImage.width),
                height: sh * CGFloat(cgImage.height)
            ).integral
            guard let cropped = cgImage.cropping(to: cropRect) else { return }
            UIImage(cgImage: cropped).draw(in: CGRect(
                x: 0,
                y: 0,
                width: CardArtworkFormat.pixelWidth,
                height: CardArtworkFormat.pixelHeight
            ))
        }
        return png.isEmpty ? nil : png
    }
}
#endif
