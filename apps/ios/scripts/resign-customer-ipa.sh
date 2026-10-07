#!/bin/bash
# Re-sign an unsigned NAMAT IPA with an Ad Hoc profile and a distribution identity.
# The p12 password is read from a file. It is not a script argument.
set -euo pipefail
umask 077

UNSIGNED=""
PROFILE=""
P12=""
P12_PASSWORD_FILE=""
KEYCHAIN_PASSWORD_FILE=""
OUTPUT=""
META_DIR=""
BUNDLE_ID="${NAMAT_BUNDLE_ID:-sa.shara.namat.app}"

while [ $# -gt 0 ]; do
  case "$1" in
    --unsigned-ipa) UNSIGNED="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --p12) P12="$2"; shift 2 ;;
    --p12-password-file) P12_PASSWORD_FILE="$2"; shift 2 ;;
    --keychain-password-file) KEYCHAIN_PASSWORD_FILE="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --meta-dir) META_DIR="$2"; shift 2 ;;
    *)
      echo "Unknown resign argument"
      exit 1
      ;;
  esac
done

if [ -z "$UNSIGNED" ] || [ -z "$PROFILE" ] || [ -z "$P12" ] || [ -z "$P12_PASSWORD_FILE" ] || [ -z "$KEYCHAIN_PASSWORD_FILE" ] || [ -z "$OUTPUT" ] || [ -z "$META_DIR" ]; then
  echo "Missing required resign argument"
  exit 1
fi

WORKDIR="$(mktemp -d)"
KEYCHAIN="$WORKDIR/namat.keychain-db"
cleanup() {
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

P12_PASS="$(cat "$P12_PASSWORD_FILE")"
KEYCHAIN_PASS="$(cat "$KEYCHAIN_PASSWORD_FILE")"
printf '%s\n' "$P12_PASS" >"$WORKDIR/p12.pass"

security create-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
import_p12() {
  security import "$1" -k "$KEYCHAIN" -P "$P12_PASS" -T /usr/bin/codesign -T /usr/bin/security
}
if ! import_p12 "$P12" 2>"$WORKDIR/import.err"; then
  if ! grep -F -q 'MAC verification failed' "$WORKDIR/import.err"; then
    echo "PKCS#12 import failed"
    exit 1
  fi
  echo "Converting PKCS#12 to the legacy container"
  if ! bash "$(dirname "$0")/legacy-pkcs12.sh" \
    --input "$P12" \
    --output "$WORKDIR/legacy.p12" \
    --password-file "$WORKDIR/p12.pass"; then
    echo "PKCS#12 legacy conversion failed"
    exit 1
  fi
  if ! import_p12 "$WORKDIR/legacy.p12" 2>"$WORKDIR/import.err"; then
    echo "PKCS#12 import failed after conversion"
    exit 1
  fi
fi
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASS" "$KEYCHAIN"
# shellcheck disable=SC2046
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')

# Decode the profile payload. This is not device authentication.
if ! security cms -D -i "$PROFILE" >"$WORKDIR/profile.plist" 2>"$WORKDIR/cms.err"; then
  if ! openssl cms -verify -inform DER -in "$PROFILE" -noverify -no_check_time -out "$WORKDIR/profile.plist" 2>>"$WORKDIR/cms.err"; then
    echo "Provisioning profile could not be decoded"
    exit 1
  fi
fi

python3 - "$WORKDIR/profile.plist" "$BUNDLE_ID" "$WORKDIR" <<'PY'
import plistlib
import sys
from pathlib import Path

profile_path, bundle, work = sys.argv[1:]
data = plistlib.loads(Path(profile_path).read_bytes())
entitlements = data.get("Entitlements") or {}
app_id = str(entitlements.get("application-identifier") or "")
if app_id != bundle and not app_id.endswith("." + bundle):
    raise SystemExit("provisioning profile bundle id mismatch")
Path(work, "entitlements.plist").write_bytes(
    plistlib.dumps(entitlements, fmt=plistlib.FMT_XML)
)
Path(work, "profile-id.txt").write_text(str(data.get("UUID") or data.get("Name") or "adhoc"))
PY

mkdir -p "$META_DIR"
cp "$WORKDIR/profile-id.txt" "$META_DIR/profile-id.txt"

unzip -q "$UNSIGNED" -d "$WORKDIR/unzipped"
APP="$WORKDIR/unzipped/Payload/Namat.app"
if [ ! -d "$APP" ]; then
  echo "Unsigned payload is missing Payload/Namat.app"
  exit 1
fi

python3 - "$APP/Info.plist" "$BUNDLE_ID" <<'PY'
import plistlib
import sys
from pathlib import Path

info = plistlib.loads(Path(sys.argv[1]).read_bytes())
if info.get("CFBundleIdentifier") != sys.argv[2]:
    raise SystemExit("app bundle id mismatch")
PY

cp "$PROFILE" "$APP/embedded.mobileprovision"

if [ -n "${NAMAT_SIGN_IDENTITY:-}" ]; then
  IDENTITY="$NAMAT_SIGN_IDENTITY"
else
  IDENTITY="$(
    security find-identity -v -p codesigning "$KEYCHAIN" \
      | sed -n 's/.*"\(.*\)"/\1/p' \
      | grep 'Apple Distribution' \
      | head -n 1 || true
  )"
fi
if [ -z "${IDENTITY:-}" ]; then
  echo "No code signing identity is available"
  exit 1
fi
if [ "${NAMAT_ALLOW_TEST_IDENTITY:-}" != "1" ]; then
  case "$IDENTITY" in
    *"Apple Distribution"*) ;;
    *)
      echo "Refusing a signing identity that is not Apple Distribution"
      exit 1
      ;;
  esac
fi

find "$APP" \( -name '*.framework' -o -name '*.appex' -o -name '*.dylib' \) -print \
  | awk '{ print length($0) " " $0 }' \
  | sort -nr \
  | cut -d' ' -f2- \
  | while IFS= read -r nested; do
      [ -n "$nested" ] || continue
      codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" --timestamp=none "$nested"
    done

codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" --entitlements "$WORKDIR/entitlements.plist" --timestamp=none "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -d --entitlements :- "$APP" >"$WORKDIR/signed-entitlements.plist"
python3 - "$WORKDIR/signed-entitlements.plist" "$BUNDLE_ID" <<'PY'
import plistlib
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_bytes()
start = raw.find(b"<?xml")
if start < 0:
    start = raw.find(b"<plist")
if start < 0:
    raise SystemExit("signed entitlements missing")
data = plistlib.loads(raw[start:])
app_id = str(data.get("application-identifier") or "")
bundle = sys.argv[2]
if app_id != bundle and not app_id.endswith("." + bundle):
    raise SystemExit("signed entitlements bundle id mismatch")
PY

rm -f "$OUTPUT"
(
  cd "$WORKDIR/unzipped"
  zip -qr "$OUTPUT" Payload
)
unzip -l "$OUTPUT" >"$WORKDIR/ipa-list.txt"
grep -F -q 'Payload/Namat.app/' "$WORKDIR/ipa-list.txt"
grep -F -q 'embedded.mobileprovision' "$WORKDIR/ipa-list.txt"
echo "Signed IPA packaged"
