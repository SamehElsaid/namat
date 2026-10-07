#!/bin/bash
# macOS CI: create a test signing identity, sign a tiny Namat.app, and require an IPA.
# This does not use the Apple Distribution certificate.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORKDIR="$(mktemp -d)"
cleanup() {
  security delete-keychain "$WORKDIR/prep.keychain-db" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT
export NAMAT_ALLOW_TEST_IDENTITY=1
export NAMAT_SIGN_IDENTITY="NAMAT Test Distribution"

if [ -x "$ROOT/prototypes/wallet-engine/Vendor/select-xcode.sh" ]; then
  bash "$ROOT/prototypes/wallet-engine/Vendor/select-xcode.sh"
fi

cat >"$WORKDIR/codesign.cnf" <<'EOF'
[req]
distinguished_name = req_dn
x509_extensions = v3_req
prompt = no
[req_dn]
CN = NAMAT Test Distribution
[v3_req]
keyUsage = critical, digitalSignature
extendedKeyUsage = codeSigning
EOF
openssl req -x509 -newkey rsa:2048 -keyout "$WORKDIR/key.pem" -out "$WORKDIR/cert.pem" \
  -days 2 -nodes -config "$WORKDIR/codesign.cnf" >/dev/null 2>&1
openssl pkcs12 -export -inkey "$WORKDIR/key.pem" -in "$WORKDIR/cert.pem" \
  -out "$WORKDIR/cert.p12" -passout pass:test-p12 -legacy >/dev/null 2>&1 \
  || openssl pkcs12 -export -inkey "$WORKDIR/key.pem" -in "$WORKDIR/cert.pem" \
    -out "$WORKDIR/cert.p12" -passout pass:test-p12 >/dev/null 2>&1
printf 'test-p12' >"$WORKDIR/p12.pass"
openssl rand -base64 24 >"$WORKDIR/kc.pass"
chmod 600 "$WORKDIR/p12.pass" "$WORKDIR/kc.pass" "$WORKDIR/cert.p12"

SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
cat >"$WORKDIR/main.c" <<'EOF'
int main(void) { return 0; }
EOF
APP="$WORKDIR/Payload/Namat.app/Frameworks/Dummy.framework"
mkdir -p "$APP"
xcrun --sdk iphoneos clang -arch arm64 -isysroot "$SDK" -miphoneos-version-min=15.0 \
  -o "$WORKDIR/Payload/Namat.app/Namat" "$WORKDIR/main.c"
xcrun --sdk iphoneos clang -arch arm64 -isysroot "$SDK" -miphoneos-version-min=15.0 \
  -dynamiclib -o "$APP/Dummy" "$WORKDIR/main.c"
cat >"$APP/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>sa.shara.namat.app.dummy</string>
<key>CFBundleExecutable</key><string>Dummy</string>
<key>CFBundleName</key><string>Dummy</string>
<key>CFBundlePackageType</key><string>FMWK</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
</dict></plist>
EOF
cat >"$WORKDIR/Payload/Namat.app/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>sa.shara.namat.app</string>
<key>CFBundleExecutable</key><string>Namat</string>
<key>CFBundleName</key><string>Namat</string>
<key>CFBundleDisplayName</key><string>NAMAT</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>MinimumOSVersion</key><string>15.0</string>
</dict></plist>
EOF

cat >"$WORKDIR/profile.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Name</key><string>NAMAT Ad Hoc</string>
<key>UUID</key><string>11111111-2222-3333-4444-555555555555</string>
<key>Entitlements</key><dict>
<key>application-identifier</key><string>TEAM.sa.shara.namat.app</string>
</dict>
</dict></plist>
EOF
PREP_KEYCHAIN="$WORKDIR/prep.keychain-db"
PREP_PASS="$(cat "$WORKDIR/kc.pass")"
security create-keychain -p "$PREP_PASS" "$PREP_KEYCHAIN"
security set-keychain-settings -lut 600 "$PREP_KEYCHAIN"
security unlock-keychain -p "$PREP_PASS" "$PREP_KEYCHAIN"
security import "$WORKDIR/cert.p12" -k "$PREP_KEYCHAIN" -P test-p12 -T /usr/bin/security -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PREP_PASS" "$PREP_KEYCHAIN"
security list-keychains -d user -s "$PREP_KEYCHAIN" $(security list-keychains -d user | tr -d '"')
security cms -S -N "NAMAT Test Distribution" -k "$PREP_KEYCHAIN" \
  -i "$WORKDIR/profile.plist" -o "$WORKDIR/profile.mobileprovision"
security delete-keychain "$PREP_KEYCHAIN"

(
  cd "$WORKDIR"
  zip -qr unsigned.ipa Payload
)
mkdir -p "$WORKDIR/meta"
bash "$ROOT/apps/ios/scripts/resign-customer-ipa.sh" \
  --unsigned-ipa "$WORKDIR/unsigned.ipa" \
  --profile "$WORKDIR/profile.mobileprovision" \
  --p12 "$WORKDIR/cert.p12" \
  --p12-password-file "$WORKDIR/p12.pass" \
  --keychain-password-file "$WORKDIR/kc.pass" \
  --output "$WORKDIR/NAMAT.ipa" \
  --meta-dir "$WORKDIR/meta"

test -s "$WORKDIR/NAMAT.ipa"
unzip -l "$WORKDIR/NAMAT.ipa" >"$WORKDIR/ipa-list.txt"
grep -F -q 'Payload/Namat.app/' "$WORKDIR/ipa-list.txt"
grep -F -q 'embedded.mobileprovision' "$WORKDIR/ipa-list.txt"
echo "macOS resign mechanics produced NAMAT.ipa"
