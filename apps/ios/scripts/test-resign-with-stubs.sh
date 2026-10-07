#!/bin/bash
# Proves resign-customer-ipa.sh packages a signed IPA when the signing tools succeed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STUBS="$ROOT/apps/ios/scripts/macos-stubs"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
export PATH="$STUBS:$PATH"
export NAMAT_ALLOW_TEST_IDENTITY=1
export NAMAT_SIGN_IDENTITY="NAMAT Test Distribution"
export NAMAT_CODESIGN_LOG="$WORKDIR/codesign.log"

APP="$WORKDIR/Payload/Namat.app"
mkdir -p "$APP/Frameworks/Dummy.framework"
printf 'int main(void){return 0;}\n' >"$APP/Namat"
printf 'dummy' >"$APP/Frameworks/Dummy.framework/Dummy"
cat >"$APP/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>sa.shara.namat.app</string>
<key>CFBundleExecutable</key><string>Namat</string>
<key>CFBundleName</key><string>Namat</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
EOF
(
  cd "$WORKDIR"
  zip -qr unsigned.ipa Payload
)

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

printf 'test-p12' >"$WORKDIR/cert.p12"
printf 'p12-secret' >"$WORKDIR/p12.pass"
printf 'kc-secret' >"$WORKDIR/kc.pass"
chmod 600 "$WORKDIR/p12.pass" "$WORKDIR/kc.pass"
mkdir -p "$WORKDIR/meta"

bash "$ROOT/apps/ios/scripts/resign-customer-ipa.sh" \
  --unsigned-ipa "$WORKDIR/unsigned.ipa" \
  --profile "$WORKDIR/profile.plist" \
  --p12 "$WORKDIR/cert.p12" \
  --p12-password-file "$WORKDIR/p12.pass" \
  --keychain-password-file "$WORKDIR/kc.pass" \
  --output "$WORKDIR/NAMAT.ipa" \
  --meta-dir "$WORKDIR/meta"

test -s "$WORKDIR/NAMAT.ipa"
# Do not pipe unzip into grep -q. pipefail treats the early close as failure.
unzip -l "$WORKDIR/NAMAT.ipa" >"$WORKDIR/ipa-list.txt"
grep -F -q 'Payload/Namat.app/' "$WORKDIR/ipa-list.txt"
grep -F -q 'embedded.mobileprovision' "$WORKDIR/ipa-list.txt"
grep -q -- '--verify --deep --strict' "$WORKDIR/codesign.log"
grep -q 'Dummy.framework' "$WORKDIR/codesign.log"
test "$(cat "$WORKDIR/meta/profile-id.txt")" = "11111111-2222-3333-4444-555555555555"
if grep -q 'p12-secret' "$WORKDIR/codesign.log"; then
  echo "password leaked into codesign log"
  exit 1
fi

set +e
NAMAT_ALLOW_TEST_IDENTITY= \
NAMAT_SIGN_IDENTITY="iPhone Developer" \
  bash "$ROOT/apps/ios/scripts/resign-customer-ipa.sh" \
    --unsigned-ipa "$WORKDIR/unsigned.ipa" \
    --profile "$WORKDIR/profile.plist" \
    --p12 "$WORKDIR/cert.p12" \
    --p12-password-file "$WORKDIR/p12.pass" \
    --keychain-password-file "$WORKDIR/kc.pass" \
    --output "$WORKDIR/rejected.ipa" \
    --meta-dir "$WORKDIR/meta" >"$WORKDIR/reject.txt" 2>&1
status=$?
set -e
if [ "$status" -eq 0 ]; then
  echo "development identity was accepted"
  exit 1
fi
echo "resign mechanics produced NAMAT.ipa"
