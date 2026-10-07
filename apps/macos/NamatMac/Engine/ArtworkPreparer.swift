import AppKit
import CoreImage

/// Turns a customer image into Wallet-ready artwork (1536×969 PNG) with an
/// interactive pan/zoom "framing" model. Rendering happens in Swift (CIImage);
/// the engine's own prepare-image step remains the final authority.
struct CardFraming: Equatable {
    static let cardSize = CGSize(width: 1536, height: 969)

    var scale: CGFloat = 1.0
    var offset: CGSize = .zero

    mutating func clamp(imageSize: CGSize) {
        let sx = CardFraming.cardSize.width / max(imageSize.width, 1)
        let sy = CardFraming.cardSize.height / max(imageSize.height, 1)
        let minScale = max(sx, sy)               // cover the card fully
        scale = max(scale, minScale)
        let maxOffsetX = (imageSize.width * scale - CardFraming.cardSize.width) / 2
        let maxOffsetY = (imageSize.height * scale - CardFraming.cardSize.height) / 2
        offset.width = min(max(offset.width, -max(maxOffsetX, 0)), max(maxOffsetX, 0))
        offset.height = min(max(offset.height, -max(maxOffsetY, 0)), max(maxOffsetY, 0))
    }

    /// Centers the image to cover the card at 1x zoom-out max.
    static func initial(imageSize: CGSize) -> CardFraming {
        var f = CardFraming()
        f.clamp(imageSize: imageSize)
        return f
    }
}

enum ArtworkPreparer {
    /// Renders the framed image into a 1536×969 PNG on disk.
    static func render(image: NSImage, framing: CardFraming, to url: URL) throws {
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            throw NSError(domain: "sa.namat.artwork", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "could not decode image"])
        }
        let ci = CIImage(cgImage: cg)
        let imageSize = CGSize(width: cg.width, height: cg.height)
        var f = framing
        f.clamp(imageSize: imageSize)

        // Translate so the card crop is centered on the framing offset.
        let originX = (imageSize.width * f.scale - CardFraming.cardSize.width) / 2 - f.offset.width
        let originY = (imageSize.height * f.scale - CardFraming.cardSize.height) / 2 - f.offset.height

        let scaled = ci.transformed(by: CGAffineTransform(scaleX: f.scale, y: f.scale))
        let cropped = scaled.cropped(to: CGRect(
            x: originX, y: originY,
            width: CardFraming.cardSize.width,
            height: CardFraming.cardSize.height
        ))

        let context = CIContext()
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        try context.writePNGRepresentation(
            of: cropped,
            to: url,
            format: .RGBA8,
            colorSpace: colorSpace
        )
    }
}
