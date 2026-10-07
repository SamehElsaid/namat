#!/bin/bash
# Package a generic iOS Release .app into an unsigned IPA.
# UNSIGNED TEST BUILD — REQUIRES APPLE SIGNING BEFORE DEVICE INSTALLATION.
set -euo pipefail

APP="${1:?path to Namat.app}"
OUT="${2:?output directory}"
COMMIT_SHA="${3:-unknown}"
AIRLIFT_SHA="${4:-unknown}"

test -d "$APP"
mkdir -p "$OUT"

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist")"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

rm -rf "$OUT/Payload" "$OUT/Namat.app" "$OUT/Namat-unsigned.ipa"
cp -a "$APP" "$OUT/Namat.app"
mkdir -p "$OUT/Payload"
cp -a "$APP" "$OUT/Payload/Namat.app"
(
  cd "$OUT"
  zip -qr Namat-unsigned.ipa Payload
)
rm -rf "$OUT/Payload"

# Zip the .app as its own artifact. An unsigned IPA is not installable.
ditto -c -k --keepParent "$OUT/Namat.app" "$OUT/Namat-unsigned.app.zip"

APP_SHA="$(shasum -a 256 "$OUT/Namat-unsigned.app.zip" | awk '{print $1}')"
IPA_SHA="$(shasum -a 256 "$OUT/Namat-unsigned.ipa" | awk '{print $1}')"

cat >"$OUT/BUILD-MANIFEST.txt" <<EOF
UNSIGNED TEST BUILD — REQUIRES APPLE SIGNING BEFORE DEVICE INSTALLATION

This archive is not a production customer download and is not installable
on an iPhone until it is signed with an Apple Developer certificate and
provisioning profile.

version: ${VERSION}
build: ${BUILD}
commit: ${COMMIT_SHA}
airlift_ffi_source_sha: ${AIRLIFT_SHA}
built_at_utc: ${STAMP}
namat_app_zip_sha256: ${APP_SHA}
unsigned_ipa_sha256: ${IPA_SHA}
EOF

cat >"$OUT/SHA256SUMS" <<EOF
${APP_SHA}  Namat-unsigned.app.zip
${IPA_SHA}  Namat-unsigned.ipa
EOF

echo "Packaged unsigned NAMAT ${VERSION} (${BUILD})"
cat "$OUT/BUILD-MANIFEST.txt"
