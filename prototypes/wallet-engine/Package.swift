// swift-tools-version: 5.9
import Foundation
import PackageDescription

func airliftFrameworkPresent() -> Bool {
    let manifest = URL(fileURLWithPath: #filePath)
    let info = manifest
        .deletingLastPathComponent()
        .appendingPathComponent("Vendor/AirliftFFI.xcframework/Info.plist")
    return FileManager.default.fileExists(atPath: info.path)
}

#if os(Linux)
let package = Package(
    name: "WalletSkinEngine",
    products: [
        .library(name: "WalletSkinEngine", targets: ["WalletSkinEngine"])
    ],
    targets: [
        .target(
            name: "WalletSkinEngine",
            path: "Sources/WalletSkinEngine"
        ),
        .testTarget(
            name: "WalletSkinEngineTests",
            dependencies: ["WalletSkinEngine"],
            path: "Tests/WalletSkinEngineTests"
        )
    ]
)
#else
var engineDependencies: [Target.Dependency] = []
var engineTargets: [Target] = []
if airliftFrameworkPresent() {
    engineTargets.append(
        .binaryTarget(name: "AirliftFFI", path: "Vendor/AirliftFFI.xcframework")
    )
    engineDependencies.append(
        .target(name: "AirliftFFI", condition: .when(platforms: [.iOS]))
    )
}
var engineLinkerSettings: [LinkerSetting] = []
if airliftFrameworkPresent() {
    engineLinkerSettings.append(.linkedLibrary("c++"))
}
engineTargets.append(
    .target(
        name: "WalletSkinEngine",
        dependencies: engineDependencies,
        path: "Sources/WalletSkinEngine",
        linkerSettings: engineLinkerSettings
    )
)
engineTargets.append(
    .testTarget(
        name: "WalletSkinEngineTests",
        dependencies: ["WalletSkinEngine"],
        path: "Tests/WalletSkinEngineTests"
    )
)
let package = Package(
    name: "WalletSkinEngine",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "WalletSkinEngine", targets: ["WalletSkinEngine"])
    ],
    targets: engineTargets
)
#endif
