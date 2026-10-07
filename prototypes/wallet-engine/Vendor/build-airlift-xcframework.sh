#!/bin/bash
# Rebuild AirliftFFI.xcframework from Vendor/airlift-rust.
# Requires macOS, Xcode, and rustup targets aarch64-apple-ios and aarch64-apple-ios-sim.
# Linux cannot produce this Mach-O framework. Do not substitute a stub binary.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CRATE="$ROOT/airlift-rust"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is not available. AirliftFFI.xcframework was not rebuilt." >&2
  exit 1
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is not available. AirliftFFI.xcframework was not rebuilt." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$HOME/.cargo/env" 2>/dev/null || true
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# aws-lc and the iOS SDK pick the deployment target from the environment.
export IPHONEOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-17.0}"

# The crate profile enables thin LTO, which embeds LLVM bitcode. Xcode 15 and
# 16 on the macos-14 runner cannot parse bitcode from a newer rustc and then
# fail nm and ld with "Unknown attribute kind". Ship machine code instead.
export CARGO_PROFILE_RELEASE_LTO=false
export CARGO_TARGET_AARCH64_APPLE_IOS_RUSTFLAGS="${CARGO_TARGET_AARCH64_APPLE_IOS_RUSTFLAGS:-} -C embed-bitcode=no"
export CARGO_TARGET_AARCH64_APPLE_IOS_SIM_RUSTFLAGS="${CARGO_TARGET_AARCH64_APPLE_IOS_SIM_RUSTFLAGS:-} -C embed-bitcode=no"

cd "$CRATE"
cargo build --release --locked --target aarch64-apple-ios
cargo build --release --locked --target aarch64-apple-ios-sim

rm -rf "$ROOT/AirliftFFI.xcframework"
xcodebuild -create-xcframework \
  -library "$CRATE/target/aarch64-apple-ios/release/libairlift_ffi.a" \
  -headers "$CRATE/include" \
  -library "$CRATE/target/aarch64-apple-ios-sim/release/libairlift_ffi.a" \
  -headers "$CRATE/include" \
  -output "$ROOT/AirliftFFI.xcframework"

echo "Rebuilt $ROOT/AirliftFFI.xcframework"
