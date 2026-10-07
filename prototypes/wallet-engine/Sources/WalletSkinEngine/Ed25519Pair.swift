import Foundation

/// Ed25519 seed → public key, used to accept only pairing records whose keys match.
/// Variable time is enough: this checks a local file and does not sign.
enum Ed25519Pair {
    static func publicKey(forSeed seed: [UInt8]) -> [UInt8]? {
        guard seed.count == 32 else { return nil }
        let digest = SHA512.hash(seed)
        var scalar = Array(digest.prefix(32))
        scalar[0] &= 248
        scalar[31] &= 63
        scalar[31] |= 64
        guard let point = Edwards.base.scalarMultiply(scalar) else { return nil }
        return point.encode()
    }

    static func matches(seed: [UInt8], publicKey: [UInt8]) -> Bool {
        guard publicKey.count == 32, let derived = self.publicKey(forSeed: seed) else { return false }
        return derived == publicKey
    }
}

enum SHA512 {
    private static let k: [UInt64] = [
        0x428a2f98d728ae22, 0x7137449123ef65cd, 0xb5c0fbcfec4d3b2f, 0xe9b5dba58189dbbc,
        0x3956c25bf348b538, 0x59f111f1b605d019, 0x923f82a4af194f9b, 0xab1c5ed5da6d8118,
        0xd807aa98a3030242, 0x12835b0145706fbe, 0x243185be4ee4b28c, 0x550c7dc3d5ffb4e2,
        0x72be5d74f27b896f, 0x80deb1fe3b1696b1, 0x9bdc06a725c71235, 0xc19bf174cf692694,
        0xe49b69c19ef14ad2, 0xefbe4786384f25e3, 0x0fc19dc68b8cd5b5, 0x240ca1cc77ac9c65,
        0x2de92c6f592b0275, 0x4a7484aa6ea6e483, 0x5cb0a9dcbd41fbd4, 0x76f988da831153b5,
        0x983e5152ee66dfab, 0xa831c66d2db43210, 0xb00327c898fb213f, 0xbf597fc7beef0ee4,
        0xc6e00bf33da88fc2, 0xd5a79147930aa725, 0x06ca6351e003826f, 0x142929670a0e6e70,
        0x27b70a8546d22ffc, 0x2e1b21385c26c926, 0x4d2c6dfc5ac42aed, 0x53380d139d95b3df,
        0x650a73548baf63de, 0x766a0abb3c77b2a8, 0x81c2c92e47edaee6, 0x92722c851482353b,
        0xa2bfe8a14cf10364, 0xa81a664bbc423001, 0xc24b8b70d0f89791, 0xc76c51a30654be30,
        0xd192e819d6ef5218, 0xd69906245565a910, 0xf40e35855771202a, 0x106aa07032bbd1b8,
        0x19a4c116b8d2d0c8, 0x1e376c085141ab53, 0x2748774cdf8eeb99, 0x34b0bcb5e19b48a8,
        0x391c0cb3c5c95a63, 0x4ed8aa4ae3418acb, 0x5b9cca4f7763e373, 0x682e6ff3d6b2b8a3,
        0x748f82ee5defb2fc, 0x78a5636f43172f60, 0x84c87814a1f0ab72, 0x8cc702081a6439ec,
        0x90befffa23631e28, 0xa4506cebde82bde9, 0xbef9a3f7b2c67915, 0xc67178f2e372532b,
        0xca273eceea26619c, 0xd186b8c721c0c207, 0xeada7dd6cde0eb1e, 0xf57d4f7fee6ed178,
        0x06f067aa72176fba, 0x0a637dc5a2c898a6, 0x113f9804bef90dae, 0x1b710b35131c471b,
        0x28db77f523047d84, 0x32caab7b40c72493, 0x3c9ebe0a15c9bebc, 0x431d67c49c100d4c,
        0x4cc5d4becb3e42b6, 0x597f299cfc657e2a, 0x5fcb6fab3ad6faec, 0x6c44198c4a475817,
    ]

    static func hash(_ message: [UInt8]) -> [UInt8] {
        var state: [UInt64] = [
            0x6a09e667f3bcc908, 0xbb67ae8584caa73b, 0x3c6ef372fe94f82b, 0xa54ff53a5f1d36f1,
            0x510e527fade682d1, 0x9b05688c2b3e6c1f, 0x1f83d9abfb41bd6b, 0x5be0cd19137e2179,
        ]
        var data = message
        let bitLength = UInt64(message.count) * 8
        data.append(0x80)
        while (data.count % 128) != 112 {
            data.append(0)
        }
        for _ in 0..<8 {
            data.append(0)
        }
        for shift in stride(from: 56, through: 0, by: -8) {
            data.append(UInt8((bitLength >> shift) & 0xff))
        }
        var offset = 0
        while offset < data.count {
            var w = [UInt64](repeating: 0, count: 80)
            for i in 0..<16 {
                var word: UInt64 = 0
                for byte in 0..<8 {
                    word = (word << 8) | UInt64(data[offset + i * 8 + byte])
                }
                w[i] = word
            }
            for i in 16..<80 {
                let s0 = w[i - 15].rotateRight(1) ^ w[i - 15].rotateRight(8) ^ (w[i - 15] >> 7)
                let s1 = w[i - 2].rotateRight(19) ^ w[i - 2].rotateRight(61) ^ (w[i - 2] >> 6)
                w[i] = w[i - 16] &+ s0 &+ w[i - 7] &+ s1
            }
            var a = state[0], b = state[1], c = state[2], d = state[3]
            var e = state[4], f = state[5], g = state[6], h = state[7]
            for i in 0..<80 {
                let s1 = e.rotateRight(14) ^ e.rotateRight(18) ^ e.rotateRight(41)
                let ch = (e & f) ^ ((~e) & g)
                let temp1 = h &+ s1 &+ ch &+ k[i] &+ w[i]
                let s0 = a.rotateRight(28) ^ a.rotateRight(34) ^ a.rotateRight(39)
                let maj = (a & b) ^ (a & c) ^ (b & c)
                let temp2 = s0 &+ maj
                h = g
                g = f
                f = e
                e = d &+ temp1
                d = c
                c = b
                b = a
                a = temp1 &+ temp2
            }
            state[0] = state[0] &+ a
            state[1] = state[1] &+ b
            state[2] = state[2] &+ c
            state[3] = state[3] &+ d
            state[4] = state[4] &+ e
            state[5] = state[5] &+ f
            state[6] = state[6] &+ g
            state[7] = state[7] &+ h
            offset += 128
        }
        var out = [UInt8]()
        out.reserveCapacity(64)
        for word in state {
            for shift in stride(from: 56, through: 0, by: -8) {
                out.append(UInt8((word >> shift) & 0xff))
            }
        }
        return out
    }
}

private extension UInt64 {
    func rotateRight(_ count: UInt64) -> UInt64 {
        (self >> count) | (self << (64 - count))
    }
}

/// Little-endian unsigned integer. Used only for the Ed25519 field.
private struct Nat {
    var limbs: [UInt32]

    static let zero = Nat(limbs: [0])

    init(limbs: [UInt32]) {
        self.limbs = limbs
        trim()
    }

    init(bytes: [UInt8]) {
        var limbs: [UInt32] = []
        var index = 0
        while index < bytes.count {
            var word: UInt32 = 0
            for shift in 0..<4 where index + shift < bytes.count {
                word |= UInt32(bytes[index + shift]) << (8 * shift)
            }
            limbs.append(word)
            index += 4
        }
        self.init(limbs: limbs.isEmpty ? [0] : limbs)
    }

    var bytes32: [UInt8] {
        var out = [UInt8](repeating: 0, count: 32)
        for (index, limb) in limbs.prefix(8).enumerated() {
            out[index * 4] = UInt8(limb & 0xff)
            out[index * 4 + 1] = UInt8((limb >> 8) & 0xff)
            out[index * 4 + 2] = UInt8((limb >> 16) & 0xff)
            out[index * 4 + 3] = UInt8((limb >> 24) & 0xff)
        }
        return out
    }

    var isZero: Bool { limbs.allSatisfy { $0 == 0 } }

    static func == (lhs: Nat, rhs: Nat) -> Bool {
        !(lhs < rhs) && !(rhs < lhs)
    }

    var isOdd: Bool { (limbs.first ?? 0) & 1 == 1 }

    private mutating func trim() {
        while limbs.count > 1, limbs.last == 0 { limbs.removeLast() }
    }

    static func < (lhs: Nat, rhs: Nat) -> Bool {
        let n = max(lhs.limbs.count, rhs.limbs.count)
        for index in stride(from: n - 1, through: 0, by: -1) {
            let l = index < lhs.limbs.count ? lhs.limbs[index] : 0
            let r = index < rhs.limbs.count ? rhs.limbs[index] : 0
            if l != r { return l < r }
        }
        return false
    }

    static func + (lhs: Nat, rhs: Nat) -> Nat {
        let n = max(lhs.limbs.count, rhs.limbs.count)
        var limbs = [UInt32]()
        var carry: UInt64 = 0
        for index in 0..<n {
            let l = index < lhs.limbs.count ? UInt64(lhs.limbs[index]) : 0
            let r = index < rhs.limbs.count ? UInt64(rhs.limbs[index]) : 0
            let sum = l + r + carry
            limbs.append(UInt32(sum & 0xffff_ffff))
            carry = sum >> 32
        }
        if carry != 0 { limbs.append(UInt32(carry)) }
        return Nat(limbs: limbs)
    }

    static func - (lhs: Nat, rhs: Nat) -> Nat {
        var limbs = lhs.limbs
        var borrow: Int64 = 0
        for index in 0..<max(limbs.count, rhs.limbs.count) {
            let l = index < limbs.count ? Int64(limbs[index]) : 0
            let r = index < rhs.limbs.count ? Int64(rhs.limbs[index]) : 0
            var diff = l - r - borrow
            if diff < 0 {
                diff += 1 << 32
                borrow = 1
            } else {
                borrow = 0
            }
            if index < limbs.count {
                limbs[index] = UInt32(diff)
            } else {
                limbs.append(UInt32(diff))
            }
        }
        return Nat(limbs: limbs)
    }

    static func * (lhs: Nat, rhs: Nat) -> Nat {
        var limbs = [UInt32](repeating: 0, count: lhs.limbs.count + rhs.limbs.count + 1)
        for i in 0..<lhs.limbs.count {
            var carry: UInt64 = 0
            for j in 0..<rhs.limbs.count {
                let index = i + j
                let product = UInt64(lhs.limbs[i]) * UInt64(rhs.limbs[j]) + UInt64(limbs[index]) + carry
                limbs[index] = UInt32(product & 0xffff_ffff)
                carry = product >> 32
            }
            var index = i + rhs.limbs.count
            while carry != 0 {
                let sum = UInt64(limbs[index]) + carry
                limbs[index] = UInt32(sum & 0xffff_ffff)
                carry = sum >> 32
                index += 1
            }
        }
        return Nat(limbs: limbs)
    }

    func mod(_ modulus: Nat) -> Nat {
        guard !modulus.isZero else { return self }
        var value = self
        if value < modulus { return value }
        var shifted = modulus
        var shifts = 0
        while !(value < shifted) {
            shifted = shifted.shiftLeftOne()
            shifts += 1
            if shifts > 8192 { break }
        }
        while shifts > 0 {
            shifted = shifted.shiftRightOne()
            shifts -= 1
            if !(value < shifted) {
                value = value - shifted
            }
        }
        return value
    }

    func modInverse(_ modulus: Nat) -> Nat? {
        var exponent = modulus - Nat(limbs: [2])
        var base = mod(modulus)
        var result = Nat(limbs: [1])
        while !exponent.isZero {
            if exponent.isOdd {
                result = (result * base).mod(modulus)
            }
            base = (base * base).mod(modulus)
            exponent = exponent.shiftRightOne()
        }
        return result
    }

    func shiftLeftOne() -> Nat {
        var limbs = self.limbs
        var carry: UInt32 = 0
        for index in 0..<limbs.count {
            let next = limbs[index] >> 31
            limbs[index] = (limbs[index] << 1) | carry
            carry = next
        }
        if carry != 0 { limbs.append(carry) }
        return Nat(limbs: limbs)
    }

    func shiftRightOne() -> Nat {
        var limbs = self.limbs
        var carry: UInt32 = 0
        for index in stride(from: limbs.count - 1, through: 0, by: -1) {
            let next = limbs[index] & 1
            limbs[index] = (limbs[index] >> 1) | (carry << 31)
            carry = next
        }
        return Nat(limbs: limbs)
    }
}

private enum Field {
    static let p = Nat(bytes: {
        var bytes = [UInt8](repeating: 0xff, count: 32)
        bytes[0] = 0xed
        bytes[31] = 0x7f
        return bytes
    }())

    static func norm(_ value: Nat) -> Nat { value.mod(p) }

    static func add(_ a: Nat, _ b: Nat) -> Nat { norm(a + b) }
    static func sub(_ a: Nat, _ b: Nat) -> Nat { norm(p + a - b) }
    static func mul(_ a: Nat, _ b: Nat) -> Nat { norm(a * b) }

    static func inv(_ a: Nat) -> Nat? { a.modInverse(p) }

    static func pow(_ base: Nat, _ exponent: Nat) -> Nat {
        var result = Nat(limbs: [1])
        var base = norm(base)
        var exponent = exponent
        while !exponent.isZero {
            if exponent.isOdd { result = mul(result, base) }
            base = mul(base, base)
            exponent = exponent.shiftRightOne()
        }
        return result
    }

    static let d: Nat = {
        let minus121665 = sub(Nat.zero, Nat(limbs: [121665]))
        let inv = Nat(limbs: [121666]).modInverse(p) ?? Nat.zero
        return mul(minus121665, inv)
    }()
}

private struct EdwardsPoint {
    var x: Nat
    var y: Nat
    var z: Nat
    var t: Nat

    static let identity = EdwardsPoint(x: Nat.zero, y: Nat(limbs: [1]), z: Nat(limbs: [1]), t: Nat.zero)

    static func add(_ p: EdwardsPoint, _ q: EdwardsPoint) -> EdwardsPoint {
        let a = Field.mul(Field.sub(p.y, p.x), Field.sub(q.y, q.x))
        let b = Field.mul(Field.add(p.y, p.x), Field.add(q.y, q.x))
        let c = Field.mul(Field.mul(p.t, q.t), Field.add(Field.d, Field.d))
        let d = Field.mul(Field.add(p.z, p.z), q.z)
        let e = Field.sub(b, a)
        let f = Field.sub(d, c)
        let g = Field.add(d, c)
        let h = Field.add(b, a)
        return EdwardsPoint(
            x: Field.mul(e, f),
            y: Field.mul(g, h),
            z: Field.mul(f, g),
            t: Field.mul(e, h)
        )
    }

    func scalarMultiply(_ scalar: [UInt8]) -> EdwardsPoint? {
        var result = EdwardsPoint.identity
        var addend = self
        for byte in scalar {
            var mask = byte
            for _ in 0..<8 {
                if mask & 1 == 1 {
                    result = EdwardsPoint.add(result, addend)
                }
                addend = EdwardsPoint.add(addend, addend)
                mask >>= 1
            }
        }
        return result
    }

    func encode() -> [UInt8]? {
        guard let zInv = Field.inv(z) else { return nil }
        let x = Field.mul(self.x, zInv)
        let y = Field.mul(self.y, zInv)
        var bytes = y.bytes32
        if x.isOdd { bytes[31] |= 0x80 }
        return bytes
    }
}

private enum Edwards {
    static let base: EdwardsPoint = {
        let y = Field.mul(Nat(limbs: [4]), Field.inv(Nat(limbs: [5])) ?? Nat.zero)
        let y2 = Field.mul(y, y)
        let u = Field.sub(y2, Nat(limbs: [1]))
        let v = Field.add(Field.mul(Field.d, y2), Nat(limbs: [1]))
        let x = sqrtRatio(u: u, v: v) ?? Nat.zero
        let even = x.isOdd ? Field.sub(Nat.zero, x) : x
        return EdwardsPoint(x: even, y: y, z: Nat(limbs: [1]), t: Field.mul(even, y))
    }()

    private static func sqrtRatio(u: Nat, v: Nat) -> Nat? {
        guard let vInv = Field.inv(v) else { return nil }
        let ratio = Field.mul(u, vInv)
        // p = 2^255 - 19 and (p + 3) / 8 = 2^252 - 2.
        let root = Field.pow(ratio, pow2(252) - Nat(limbs: [2]))
        if Field.mul(root, root) == ratio {
            return root
        }
        return Field.mul(root, sqrtMinusOne)
    }

    private static func pow2(_ n: Int) -> Nat {
        var value = Nat(limbs: [1])
        for _ in 0..<n { value = value.shiftLeftOne() }
        return value
    }

    private static let sqrtMinusOne: Nat = {
        // 2^((p - 1) / 4) mod p, with (p - 1) / 4 = 2^253 - 5.
        return Field.pow(Nat(limbs: [2]), pow2(253) - Nat(limbs: [5]))
    }()
}
