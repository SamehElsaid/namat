import Foundation

#if canImport(ImageIO) && canImport(CoreGraphics)
import ImageIO
import CoreGraphics
#endif

/// Builds the audited Wallet variants. @2x is resampled; it is never a byte copy of @3x.
public enum ArtworkPreparer {
    public static let width3x = 1536
    public static let height3x = 969
    public static let width2x = 1024
    public static let height2x = 646

    public struct RGBA: Sendable {
        public let width: Int
        public let height: Int
        public let pixels: [UInt8]
    }

    public static func prepare(png: Data) throws -> (x3: Data, x2: Data) {
        #if canImport(ImageIO) && canImport(CoreGraphics)
        return try prepareWithImageIO(png)
        #else
        let source = try decodeStoredPNG(png)
        return try variants(from: source)
        #endif
    }

    public static func variants(from source: RGBA) throws -> (x3: Data, x2: Data) {
        let x3 = coverFit(source, width: width3x, height: height3x)
        let x2 = coverFit(source, width: width2x, height: height2x)
        let a = encodeStoredPNG(x3)
        let b = encodeStoredPNG(x2)
        if a == b {
            throw WalletEngineError.artworkInvalid()
        }
        return (a, b)
    }

    public static func coverFit(_ source: RGBA, width: Int, height: Int) -> RGBA {
        let scale = max(Double(width) / Double(source.width), Double(height) / Double(source.height))
        let ox = (Double(source.width) * scale - Double(width)) / 2
        let oy = (Double(source.height) * scale - Double(height)) / 2
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        for y in 0..<height {
            let sy = min(source.height - 1, max(0, Int((Double(y) + oy) / scale)))
            for x in 0..<width {
                let sx = min(source.width - 1, max(0, Int((Double(x) + ox) / scale)))
                let si = (sy * source.width + sx) * 4
                let di = (y * width + x) * 4
                pixels[di] = source.pixels[si]
                pixels[di + 1] = source.pixels[si + 1]
                pixels[di + 2] = source.pixels[si + 2]
                pixels[di + 3] = source.pixels[si + 3]
            }
        }
        return RGBA(width: width, height: height, pixels: pixels)
    }

    #if canImport(ImageIO) && canImport(CoreGraphics)
    private static func prepareWithImageIO(_ png: Data) throws -> (x3: Data, x2: Data) {
        guard let src = CGImageSourceCreateWithData(png as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
            throw WalletEngineError.artworkInvalid()
        }
        let x3 = try render(image, width: width3x, height: height3x)
        let x2 = try render(image, width: width2x, height: height2x)
        if x3 == x2 { throw WalletEngineError.artworkInvalid() }
        return (x3, x2)
    }

    private static func render(_ image: CGImage, width: Int, height: Int) throws -> Data {
        let scale = max(Double(width) / Double(image.width), Double(height) / Double(image.height))
        let drawW = Double(image.width) * scale
        let drawH = Double(image.height) * scale
        let ox = (Double(width) - drawW) / 2
        let oy = (Double(height) - drawH) / 2
        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw WalletEngineError.artworkInvalid()
        }
        ctx.draw(image, in: CGRect(x: ox, y: oy, width: drawW, height: drawH))
        guard let out = ctx.makeImage() else { throw WalletEngineError.artworkInvalid() }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, "public.png" as CFString, 1, nil) else {
            throw WalletEngineError.artworkInvalid()
        }
        CGImageDestinationAddImage(dest, out, nil)
        guard CGImageDestinationFinalize(dest) else { throw WalletEngineError.artworkInvalid() }
        return data as Data
    }
    #endif

    /// PNG encoder using zlib stored blocks so Linux tests do not need libpng.
    public static func encodeStoredPNG(_ image: RGBA) -> Data {
        var raw = Data()
        raw.reserveCapacity((image.width * 4 + 1) * image.height)
        for y in 0..<image.height {
            raw.append(0)
            let start = y * image.width * 4
            raw.append(contentsOf: image.pixels[start..<(start + image.width * 4)])
        }
        var png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        var ihdr = Data()
        ihdr.append(uint32(UInt32(image.width)))
        ihdr.append(uint32(UInt32(image.height)))
        ihdr.append(contentsOf: [8, 6, 0, 0, 0])
        png.append(chunk("IHDR", ihdr))
        png.append(chunk("IDAT", zlibStore(raw)))
        png.append(chunk("IEND", Data()))
        return png
    }

    public static func decodeStoredPNG(_ data: Data) throws -> RGBA {
        guard data.count > 8, data.starts(with: [0x89, 0x50, 0x4E, 0x47]) else {
            throw WalletEngineError.artworkInvalid()
        }
        var offset = 8
        var width = 0
        var height = 0
        var idat = Data()
        while offset + 8 <= data.count {
            let length = int32(data, offset)
            let type = String(data: data.subdata(in: (offset + 4)..<(offset + 8)), encoding: .ascii) ?? ""
            let start = offset + 8
            let end = start + length
            guard end + 4 <= data.count else { throw WalletEngineError.artworkInvalid() }
            let chunk = data.subdata(in: start..<end)
            if type == "IHDR", chunk.count >= 8 {
                width = int32(chunk, 0)
                height = int32(chunk, 4)
            } else if type == "IDAT" {
                idat.append(chunk)
            } else if type == "IEND" {
                break
            }
            offset = end + 4
        }
        guard width > 0, height > 0 else { throw WalletEngineError.artworkInvalid() }
        let inflated = try zlibInflateStored(idat)
        var pixels = [UInt8]()
        pixels.reserveCapacity(width * height * 4)
        var cursor = 0
        for _ in 0..<height {
            guard cursor < inflated.count, inflated[cursor] == 0 else {
                throw WalletEngineError.artworkInvalid()
            }
            cursor += 1
            let rowEnd = cursor + width * 4
            guard rowEnd <= inflated.count else { throw WalletEngineError.artworkInvalid() }
            pixels.append(contentsOf: inflated[cursor..<rowEnd])
            cursor = rowEnd
        }
        return RGBA(width: width, height: height, pixels: pixels)
    }

    private static func uint32(_ value: UInt32) -> Data {
        Data([
            UInt8((value >> 24) & 0xff),
            UInt8((value >> 16) & 0xff),
            UInt8((value >> 8) & 0xff),
            UInt8(value & 0xff),
        ])
    }

    private static func int32(_ data: Data, _ offset: Int) -> Int {
        Int(data[offset]) << 24 | Int(data[offset + 1]) << 16 | Int(data[offset + 2]) << 8 | Int(data[offset + 3])
    }

    private static func chunk(_ type: String, _ payload: Data) -> Data {
        var out = uint32(UInt32(payload.count))
        let typeBytes = Data(type.utf8)
        out.append(typeBytes)
        out.append(payload)
        var crcInput = typeBytes
        crcInput.append(payload)
        out.append(uint32(crc32(crcInput)))
        return out
    }

    private static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xffff_ffff
        for byte in data {
            crc ^= UInt32(byte)
            for _ in 0..<8 {
                let mask = (crc & 1) == 1 ? UInt32(0xedb8_8320) : 0
                crc = (crc >> 1) ^ mask
            }
        }
        return crc ^ 0xffff_ffff
    }

    private static func zlibStore(_ data: Data) -> Data {
        var out = Data([0x78, 0x01])
        var offset = 0
        while offset < data.count {
            let n = min(65535, data.count - offset)
            let final: UInt8 = offset + n == data.count ? 1 : 0
            out.append(final)
            out.append(UInt8(n & 0xff))
            out.append(UInt8((n >> 8) & 0xff))
            let nlen = n ^ 0xffff
            out.append(UInt8(nlen & 0xff))
            out.append(UInt8((nlen >> 8) & 0xff))
            out.append(data.subdata(in: offset..<(offset + n)))
            offset += n
        }
        let sum = adler32(data)
        out.append(uint32(sum))
        return out
    }

    private static func zlibInflateStored(_ data: Data) throws -> Data {
        guard data.count > 6, data[0] == 0x78 else { throw WalletEngineError.artworkInvalid() }
        var offset = 2
        var raw = Data()
        while offset < data.count - 4 {
            let header = data[offset]
            offset += 1
            guard offset + 4 <= data.count else { throw WalletEngineError.artworkInvalid() }
            let n = Int(data[offset]) | (Int(data[offset + 1]) << 8)
            offset += 4
            guard offset + n <= data.count else { throw WalletEngineError.artworkInvalid() }
            raw.append(data.subdata(in: offset..<(offset + n)))
            offset += n
            if header & 1 == 1 { break }
        }
        return raw
    }

    private static func adler32(_ data: Data) -> UInt32 {
        var a: UInt32 = 1
        var b: UInt32 = 0
        for byte in data {
            a = (a + UInt32(byte)) % 65521
            b = (b + a) % 65521
        }
        return (b << 16) | a
    }
}
