#!/usr/bin/env bash
# Build NamatMac.app (universal arm64 + x86_64) + DMG.
# Requires macOS with Command Line Tools or Xcode. Run: ./build.sh
# Optional: CODESIGN_IDENTITY="Developer ID Application: ..." ./build.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="NamatMac"
APP_VERSION="${APP_VERSION:-1.0.0}"
APP_BUILD="${APP_BUILD:-1}"
VENDOR="Vendor/AirCard"

echo "==> [1/7] Building universal helper binaries (device_helper & airtraffic_host)..."
make -C "$VENDOR" clean
make -C "$VENDOR" all

APP_DIR="build/${APP_NAME}.app"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
BIN_DIR="${RESOURCES_DIR}/bin"

echo "==> [2/7] Scaffolding ${APP_NAME}.app bundle structure..."
rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$BIN_DIR"

# Write Info.plist
cat << EOF > "${CONTENTS_DIR}/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>sa.namat.app</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>NAMAT</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${APP_VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${APP_BUILD}</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
EOF

echo "==> [3/7] Bundling vendored AirCard engine (MIT — see Vendor/AirCard/LICENSE)..."
cp "${VENDOR}/build/device_helper" "$BIN_DIR/"
cp "${VENDOR}/build/airtraffic_host" "$BIN_DIR/"
cp "${VENDOR}/apply_card_skin.py" "$RESOURCES_DIR/"
cp "${VENDOR}/aircard.py" "$RESOURCES_DIR/"
cp "${VENDOR}/aircard_backend.py" "$RESOURCES_DIR/"
cp "${VENDOR}/card_assets.py" "$RESOURCES_DIR/"
cp "${VENDOR}/wallet_catalog.py" "$RESOURCES_DIR/"

# NAMAT bridge (JSON command layer over the engine)
cp "NamatMac/Engine/namat_bridge.py" "$RESOURCES_DIR/"

for tool in device_helper airtraffic_host; do
    if [ ! -x "${BIN_DIR}/${tool}" ]; then
        echo "ERROR: ${BIN_DIR}/${tool} is missing from the bundle." >&2
        exit 1
    fi
done

echo "==> [4/7] Compiling universal Swift binary (arm64 + x86_64)..."
if [ -z "${SWIFT_SDK:-}" ]; then
    SWIFT_SDK="$(xcrun --sdk macosx --show-sdk-path)"
    CLT_SWIFTUI_SDK="/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk"
    if [ "$(xcode-select -p)" = "/Library/Developer/CommandLineTools" ] && [ -d "$CLT_SWIFTUI_SDK" ]; then
        SWIFT_SDK="$CLT_SWIFTUI_SDK"
    fi
fi

SWIFT_SOURCES=(
    NamatMac/NamatMacApp.swift
    NamatMac/API/Models.swift
    NamatMac/API/NamatAPI.swift
    NamatMac/Store/SessionStore.swift
    NamatMac/Engine/EngineBridge.swift
    NamatMac/Engine/ArtworkPreparer.swift
    NamatMac/Views/LoginView.swift
    NamatMac/Views/GateView.swift
    NamatMac/Views/LibraryView.swift
    NamatMac/Views/CardStudioView.swift
    NamatMac/Views/PasscodeThemesView.swift
    NamatMac/Views/SettingsView.swift
    NamatMac/i18n/L10n.swift
)

swiftc -sdk "$SWIFT_SDK" -O -parse-as-library -target arm64-apple-macosx14.0 \
    "${SWIFT_SOURCES[@]}" -o "build/${APP_NAME}_arm64"
swiftc -sdk "$SWIFT_SDK" -O -parse-as-library -target x86_64-apple-macosx14.0 \
    "${SWIFT_SOURCES[@]}" -o "build/${APP_NAME}_x86_64"
lipo -create -output "${MACOS_DIR}/${APP_NAME}" "build/${APP_NAME}_arm64" "build/${APP_NAME}_x86_64"
chmod +x "${MACOS_DIR}/${APP_NAME}"

echo "==> [5/7] Copying localizations..."
cp -R NamatMac/i18n/ar.lproj "$RESOURCES_DIR/"
cp -R NamatMac/i18n/en.lproj "$RESOURCES_DIR/"

echo "==> [6/7] Setting permissions and signing ${APP_NAME}.app bundle..."
chmod -R 755 "$APP_DIR"
xattr -cr "$APP_DIR" 2>/dev/null || true
CODESIGN_IDENTITY="${CODESIGN_IDENTITY:--}"
if [ "$CODESIGN_IDENTITY" = "-" ]; then
    codesign --force --deep --sign - "$APP_DIR"
else
    for tool in "${BIN_DIR}"/*; do
        [ -f "$tool" ] || continue
        codesign --force --options runtime --timestamp \
            --sign "$CODESIGN_IDENTITY" "$tool"
    done
    codesign --force --options runtime --timestamp \
        --sign "$CODESIGN_IDENTITY" "$APP_DIR"
    codesign --verify --strict --verbose=1 "$APP_DIR"
    for nested in "$APP_DIR/Contents/MacOS"/* "$BIN_DIR"/*; do
        [ -f "$nested" ] || continue
        if codesign -dv "$nested" 2>&1 | grep -q "adhoc"; then
            echo "ERROR: $nested is still ad-hoc signed" >&2
            exit 1
        fi
    done
fi

for binary in "${MACOS_DIR}/${APP_NAME}" "${BIN_DIR}"/*; do
    [ -f "$binary" ] || continue
    actual="$(otool -l "$binary" | awk '/minos/ {print $2; exit}')"
    if [ -n "$actual" ] && [ "$actual" != "14.0" ]; then
        echo "ERROR: $(basename "$binary") targets macOS $actual, but the app claims 14.0" >&2
        exit 1
    fi
done

echo "==> [7/7] Generating DMG (${APP_NAME}.dmg)..."
DMG_STAGING="/tmp/namatmac_dmg_staging"
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"
cp -R "$APP_DIR" "$DMG_STAGING/"

rm -f "build/${APP_NAME}.dmg"

ln -s /Applications "$DMG_STAGING/Applications"
hdiutil create -volname "NAMAT" -srcfolder "$DMG_STAGING" -ov -format UDZO "build/${APP_NAME}.dmg"

if [ "$CODESIGN_IDENTITY" != "-" ]; then
    codesign --force --sign "$CODESIGN_IDENTITY" --timestamp "build/${APP_NAME}.dmg"
fi

echo "============================================================"
echo "SUCCESS: build/${APP_NAME}.dmg is ready!"
if [ "$CODESIGN_IDENTITY" != "-" ]; then
    echo "   Signed with: $CODESIGN_IDENTITY"
    echo "   Notarise with: xcrun notarytool submit build/${APP_NAME}.dmg \\"
    echo "                    --keychain-profile <profile> --wait"
    echo "   Then staple:   xcrun stapler staple build/${APP_NAME}.dmg"
fi
echo "============================================================"
