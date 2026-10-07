// swift-tools-version: 5.9
import PackageDescription

#if os(Linux)
let includeUI = false
#else
let includeUI = true
#endif

var products: [Product] = [
    .library(name: "NamatCore", targets: ["NamatCore"])
]
var targets: [Target] = [
    .target(
        name: "NamatCore",
        dependencies: [
            .product(name: "WalletSkinEngine", package: "wallet-engine")
        ],
        path: "Sources/NamatCore"
    ),
    .testTarget(
        name: "NamatCoreTests",
        dependencies: ["NamatCore"],
        path: "Tests/NamatCoreTests"
    )
]

if includeUI {
    products.append(.library(name: "NamatUI", targets: ["NamatUI"]))
    targets.append(
        .target(
            name: "NamatUI",
            dependencies: ["NamatCore"],
            path: "Sources/NamatUI"
        )
    )
    targets.append(
        .executableTarget(
            name: "NamatApp",
            dependencies: ["NamatUI", "NamatCore"],
            path: "Sources/NamatApp"
        )
    )
    targets.append(
        .testTarget(
            name: "NamatUITests",
            dependencies: [
                "NamatUI",
                "NamatCore",
                .product(name: "WalletSkinEngine", package: "wallet-engine"),
            ],
            path: "Tests/NamatUITests"
        )
    )
}

#if os(Linux)
let package = Package(
    name: "Namat",
    products: products,
    dependencies: [
        .package(path: "../../prototypes/wallet-engine")
    ],
    targets: targets
)
#else
let package = Package(
    name: "Namat",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: products,
    dependencies: [
        .package(path: "../../prototypes/wallet-engine")
    ],
    targets: targets
)
#endif
