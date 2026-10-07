#!/bin/bash
# Confirm a Release Namat.app is a physical-test candidate:
# production API, NAMAT display name, compiled app icon, and the real engine.
set -euo pipefail

APP="${1:?path to Namat.app}"
test -d "$APP"
BIN="$APP/Namat"
PLIST="$APP/Info.plist"
test -f "$BIN"
test -f "$PLIST"

dump_plist() {
  echo "Packaged Info.plist:" >&2
  plutil -p "$PLIST" >&2 || true
}

name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$PLIST" 2>/dev/null || true)"
bundle="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" 2>/dev/null || true)"
api="$(/usr/libexec/PlistBuddy -c 'Print :NamatAPIBaseURL' "$PLIST" 2>/dev/null || true)"
launch="$(/usr/libexec/PlistBuddy -c 'Print :UILaunchScreen:UIImageName' "$PLIST" 2>/dev/null || true)"
scheme="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0' "$PLIST" 2>/dev/null || true)"
gid="$(/usr/libexec/PlistBuddy -c 'Print :GIDClientID' "$PLIST" 2>/dev/null || true)"
server="$(/usr/libexec/PlistBuddy -c 'Print :GIDServerClientID' "$PLIST" 2>/dev/null || true)"
expected_scheme="com.googleusercontent.apps.588751829801-o1l3gdt9fcquhn4ncq5kgig10c7fb0tq"
expected_ios="588751829801-o1l3gdt9fcquhn4ncq5kgig10c7fb0tq.apps.googleusercontent.com"
expected_server="588751829801-hncn7v533cpfbbhj6f6nodi7emk92spf.apps.googleusercontent.com"
[[ "$name" == "NAMAT" ]] || {
  echo "CFBundleDisplayName is '$name', expected NAMAT" >&2
  dump_plist
  exit 1
}
[[ "$launch" == "LaunchMark" ]] || {
  echo "UILaunchScreen image is '$launch', expected LaunchMark" >&2
  dump_plist
  exit 1
}
[[ "$scheme" == "$expected_scheme" ]] || {
  echo "Google callback scheme is '$scheme'" >&2
  dump_plist
  exit 1
}
[[ "$gid" == "$expected_ios" && "$server" == "$expected_server" ]] || {
  echo "Google client IDs in the packaged plist do not match the iOS and server clients" >&2
  dump_plist
  exit 1
}
[[ "$bundle" == "sa.shara.namat.app" ]] || {
  echo "Unexpected bundle id: $bundle" >&2
  dump_plist
  exit 1
}
local_network="$(/usr/libexec/PlistBuddy -c 'Print :NSLocalNetworkUsageDescription' "$PLIST" 2>/dev/null || true)"
bonjour="$(/usr/libexec/PlistBuddy -c 'Print :NSBonjourServices:0' "$PLIST" 2>/dev/null || true)"
[[ -n "$local_network" && "$bonjour" == "_remotepairing-pairable-host._tcp" ]] || {
  echo "Local network permission or Bonjour service is missing from the packaged plist" >&2
  dump_plist
  exit 1
}
[[ "$api" == "https://namat.shara.sa/api/v1" ]] || {
  echo "NamatAPIBaseURL is '$api', expected the production API" >&2
  dump_plist
  exit 1
}
case "$api" in
  http://*|https://localhost*|https://127.*|http://127.*)
    echo "Packaged API URL is not production: $api" >&2
    exit 1
    ;;
esac

if [[ ! -f "$APP/Assets.car" ]]; then
  echo "Release app is missing Assets.car (AppIcon was not compiled in)" >&2
  exit 1
fi

# A source PNG is not evidence. The compiled catalog inside the .app must
# name the AppIcon set.
icon_info="$(mktemp)"
if ! xcrun --sdk iphoneos assetutil --info "$APP/Assets.car" >"$icon_info"; then
  echo "assetutil could not read Assets.car" >&2
  exit 1
fi
if ! grep -q '"Name" : "AppIcon"' "$icon_info"; then
  echo "Compiled Assets.car does not contain AppIcon" >&2
  exit 1
fi
if ! grep -q 'Icon Image' "$icon_info"; then
  echo "Compiled Assets.car has no icon image for AppIcon" >&2
  exit 1
fi
rm -f "$icon_info"

# Search the binary directly. `strings | grep -q` exits early and, under
# pipefail, SIGPIPE makes a present GIDSignIn look missing.
if ! grep -a -F -q 'GIDSignIn' "$BIN"; then
  echo "Release binary does not contain Google Sign-In" >&2
  exit 1
fi

bash "$(cd "$(dirname "$0")/../../.." && pwd)/prototypes/wallet-engine/Vendor/verify-namat-release-exports.sh" "$BIN"

factory="$(cd "$(dirname "$0")/.." && pwd)/Sources/NamatCore/WalletEngineFactory.swift"
grep -q 'fatalError("Release builds must not instantiate LocalStubEngine.")' "$factory"
grep -q 'return try await make(kind: .productionAirlift)' "$factory"

echo "Release app has NAMAT icon, Google callback, production API, and Airlift exports"
