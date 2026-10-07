import Foundation

/// Wallet artwork size used by the card engine. Do not invent another size.
public enum CardArtworkFormat {
    public static let pixelWidth = 1536
    public static let pixelHeight = 969

    public static var aspect: Double {
        Double(pixelWidth) / Double(pixelHeight)
    }
}

public struct ArtworkCrop: Equatable, Sendable {
    public let originX: Double
    public let originY: Double
    public let width: Double
    public let height: Double

    public init(originX: Double, originY: Double, width: Double, height: Double) {
        self.originX = originX
        self.originY = originY
        self.width = width
        self.height = height
    }
}

public enum ArtworkCropper {
    /// Cover-crop that keeps the card aspect. Zoom shrinks the window.
    /// Pan values are clamped to -1...1 and move within the leftover image.
    public static func crop(
        imageWidth: Double,
        imageHeight: Double,
        zoom: Double,
        panX: Double,
        panY: Double
    ) -> ArtworkCrop {
        let safeWidth = max(imageWidth, 1)
        let safeHeight = max(imageHeight, 1)
        let aspect = CardArtworkFormat.aspect
        var windowWidth: Double
        var windowHeight: Double
        if safeWidth / safeHeight > aspect {
            windowHeight = safeHeight
            windowWidth = safeHeight * aspect
        } else {
            windowWidth = safeWidth
            windowHeight = safeWidth / aspect
        }
        let clampedZoom = min(max(zoom, 1), 8)
        windowWidth /= clampedZoom
        windowHeight /= clampedZoom
        let slackX = max(0, safeWidth - windowWidth)
        let slackY = max(0, safeHeight - windowHeight)
        let clampedPanX = min(max(panX, -1), 1)
        let clampedPanY = min(max(panY, -1), 1)
        let originX = slackX / 2 + clampedPanX * slackX / 2
        let originY = slackY / 2 + clampedPanY * slackY / 2
        return ArtworkCrop(
            originX: originX,
            originY: originY,
            width: windowWidth,
            height: windowHeight
        )
    }
}
