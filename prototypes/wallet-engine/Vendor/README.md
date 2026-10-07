# AirliftFFI

Production iOS links a rebuilt Airlift framework:

`prototypes/wallet-engine/Vendor/AirliftFFI.xcframework`

The binary is not committed. `Vendor/airlift-rust` is the reproducible source of truth. That tree is AirCard-iOS `6342a3455e17ca357da19537d1e44317a3f69f32` plus `al_exploit_read_file`, the port of Mak5er/AirCard `d6320554c07d65f53be91fb578b3e57f996c2605` (`read_file`).

`RealAirliftFFIClient` calls `al_exploit_read_file` and `al_bytes_free` for the original combined PNGs, and `al_exploit_write_dir` for Apply, when the module is linked. A Release iOS build fails to compile if `AirliftFFI` cannot be imported. Unlinked non-Release builds fail closed with `NAMAT_WALLET_FFI_UNAVAILABLE`. Release does not instantiate `LocalStubEngine`.

Do not drop in the pre-read xcframework. It does not export `al_exploit_read_file`. Do not substitute `AirliftFFIStub` in a Release build.

## Persistent binary

GitHub Actions rebuilds the xcframework on `macos-14` from this vendored Rust tree (`Vendor/build-airlift-xcframework.sh`) and uploads it as the artifact `AirliftFFI.xcframework`. The script turns off thin LTO and embedded bitcode so Xcode 15/16 on that runner can `nm` and link the static library. The `namat-ios-release` job downloads that artifact and compiles the NAMAT iOS Release target against it. Symbol checks use `nm` on the static libraries and on the NAMAT executable.

Git LFS is not used. A GitHub Release binary is not used. Either would only be a cache of this same source build. The vendored Rust source stays the source of truth.
