#!/bin/bash
# Fail unless the rebuilt AirliftFFI.xcframework contains both slices,
# a real module map, the read export in the copied headers, and defined
# Mach-O symbols in each static library. Header text alone is not enough.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FW="${1:-$ROOT/AirliftFFI.xcframework}"

if [[ ! -f "$FW/Info.plist" && -f "$FW/AirliftFFI.xcframework/Info.plist" ]]; then
  FW="$FW/AirliftFFI.xcframework"
fi

SYMBOLS="al_exploit_read_file al_bytes_free al_exploit_write_dir al_syslog_stream_start al_pairing_run_host al_pairing_material_valid al_pairing_probe_connection al_pairing_probe_cancel"

fail() {
  echo "AirliftFFI verification failed: $*" >&2
  exit 1
}

[[ -f "$FW/Info.plist" ]] || fail "Info.plist missing at $FW"
plutil -lint "$FW/Info.plist" >/dev/null

plist_text="$(plutil -p "$FW/Info.plist")"
# "ios-arm64" is a prefix of "ios-arm64-simulator", so require a boundary.
echo "$plist_text" | grep -E 'ios-arm64([^A-Za-z0-9-]|$)' >/dev/null || fail "Info.plist has no ios-arm64 library"
echo "$plist_text" | grep -F 'ios-arm64-simulator' >/dev/null || fail "Info.plist has no ios-arm64-simulator library"

require_defined_symbol() {
  local listing="$1"
  local sym="$2"
  if ! grep -E "[ 	][TtDS] _?${sym}\$" "$listing" >/dev/null; then
    echo "missing defined symbol ${sym}" >&2
    echo "---- nm ----" >&2
    grep -E "${sym}" "$listing" >&2 || true
    return 1
  fi
}

require_platform() {
  local lib="$1"
  local platform="$2"
  local tmp obj found
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2164
  (cd "$tmp" && ar -x "$lib")
  found=0
  obj=""
  for candidate in "$tmp"/*.o; do
    [[ -f "$candidate" ]] || continue
    if [[ -z "$obj" ]]; then
      obj="$candidate"
    fi
    if otool -l "$candidate" | grep -q "platform ${platform}"; then
      found=1
      break
    fi
  done
  [[ -n "$obj" ]] || fail "no object files in $lib"
  file "$obj" | grep -q 'Mach-O' || fail "$obj is not Mach-O: $(file "$obj")"
  file "$obj" | grep -q 'arm64' || fail "$obj is not arm64: $(file "$obj")"
  if [[ "$found" -ne 1 ]]; then
    echo "platform ${platform} not found in $lib" >&2
    otool -l "$obj" | head -n 60 >&2 || true
    rm -rf "$tmp"
    exit 1
  fi
  rm -rf "$tmp"
}

check_slice() {
  local slice="$1"
  local platform="$2"
  local dir="$FW/$slice"
  local lib="$dir/libairlift_ffi.a"
  local headers="$dir/Headers"
  local listing
  [[ -d "$dir" ]] || fail "missing slice directory $dir"
  [[ -f "$lib" ]] || fail "missing static library $lib"
  file "$lib" | grep -q 'ar archive' || fail "$lib is not an ar archive: $(file "$lib")"
  lipo -info "$lib" | grep -q 'arm64' || fail "$lib has no arm64 slice: $(lipo -info "$lib")"
  if lipo -info "$lib" | grep -q 'x86_64'; then
    fail "$lib unexpectedly contains x86_64"
  fi
  require_platform "$lib" "$platform"

  [[ -f "$headers/airlift.h" ]] || fail "missing $headers/airlift.h"
  grep -q 'al_exploit_read_file' "$headers/airlift.h" || fail "header in $slice does not declare al_exploit_read_file"
  grep -q 'al_bytes_free' "$headers/airlift.h" || fail "header in $slice does not declare al_bytes_free"
  [[ -f "$headers/module.modulemap" ]] || fail "missing module.modulemap in $slice"
  grep -q 'module AirliftFFI' "$headers/module.modulemap" || fail "module.modulemap in $slice is not AirliftFFI"
  grep -q 'umbrella header "airlift.h"' "$headers/module.modulemap" || fail "module.modulemap in $slice has no umbrella header"

  local sdk="iphoneos"
  local target="arm64-apple-ios17.0"
  if [[ "$slice" == "ios-arm64-simulator" ]]; then
    sdk="iphonesimulator"
    target="arm64-apple-ios17.0-simulator"
  fi
  listing="$(mktemp)"
  nm_err="$(mktemp)"
  # Apple nm returns non-zero when it cannot parse newer LLVM bitcode, even if
  # it already printed the defined exports. The symbol listing is the check.
  set +e
  nm -gU "$lib" >"$listing" 2>"$nm_err"
  nm "$lib" >>"$listing" 2>>"$nm_err"
  set -e
  if ! grep -E "[ 	][TtDS] _?al_exploit_read_file\$" "$listing" >/dev/null; then
    sysroot="$(rustc --print sysroot 2>/dev/null || true)"
    llvm_nm=""
    if [[ -n "$sysroot" ]]; then
      llvm_nm="$(find "$sysroot" -name 'llvm-nm' -type f 2>/dev/null | head -n 1 || true)"
    fi
    if [[ -n "$llvm_nm" ]]; then
      "$llvm_nm" -gU "$lib" >>"$listing" 2>>"$nm_err" || true
    fi
  fi
  for sym in $SYMBOLS; do
    if ! require_defined_symbol "$listing" "$sym"; then
      echo "---- nm stderr ----" >&2
      tail -n 20 "$nm_err" >&2 || true
      rm -f "$listing" "$nm_err"
      fail "symbol $sym is not defined in $lib"
    fi
  done
  echo "$slice exports: $SYMBOLS"
  rm -f "$listing" "$nm_err"

  local probe
  probe="$(mktemp -d)"
  mkdir -p "$probe/cache"
  printf '@import AirliftFFI;\n' >"$probe/check.m"
  # These Clang options are joined. A space-separated form is an unknown argument.
  if ! xcrun --sdk "$sdk" clang -fsyntax-only -fmodules \
    -fmodules-cache-path="$probe/cache" \
    -fmodule-map-file="$headers/module.modulemap" \
    -target "$target" \
    -I "$headers" \
    "$probe/check.m"
  then
    rm -rf "$probe"
    fail "module.modulemap in $slice did not import"
  fi
  rm -rf "$probe"
}

check_slice "ios-arm64" "2"
check_slice "ios-arm64-simulator" "7"
echo "AirliftFFI.xcframework verified at $FW"
