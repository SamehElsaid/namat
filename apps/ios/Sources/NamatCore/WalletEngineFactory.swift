import Foundation
import WalletSkinEngine

public enum WalletEngineKind: Sendable {
    case previewStub
    case productionAirlift
}

public enum WalletEngineFactory {
    /// Release builds use AirCard + RealAirliftFFIClient and never LocalStubEngine.
    public static func makeForCurrentBuild() async throws -> any WalletSkinEngine {
        #if DEBUG
        return try await make(kind: .previewStub)
        #else
        return try await make(kind: .productionAirlift)
        #endif
    }

    public static func make(kind: WalletEngineKind) async throws -> any WalletSkinEngine {
        switch kind {
        case .previewStub:
            #if DEBUG
            return try await LocalStubEngine()
            #else
            fatalError("Release builds must not instantiate LocalStubEngine.")
            #endif
        case .productionAirlift:
            return try await AirCardWalletEngine(ffi: RealAirliftFFIClient())
        }
    }
}
