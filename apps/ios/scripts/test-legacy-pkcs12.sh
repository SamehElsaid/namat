#!/bin/bash
# Linux/macOS: a modern PKCS#12 file must convert to the SHA-1 / 3DES container.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORKDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT
umask 077

openssl req -x509 -newkey rsa:2048 -keyout "$WORKDIR/key.pem" -out "$WORKDIR/cert.pem" \
  -days 2 -nodes -subj '/CN=NAMAT Legacy Test' >/dev/null 2>&1
printf '%s' 'test-pass' >"$WORKDIR/pass"
openssl pkcs12 -export -inkey "$WORKDIR/key.pem" -in "$WORKDIR/cert.pem" \
  -out "$WORKDIR/modern.p12" -passout "file:$WORKDIR/pass" >/dev/null 2>&1

info="$(openssl pkcs12 -info -in "$WORKDIR/modern.p12" -passin "file:$WORKDIR/pass" -noout 2>&1)"
printf '%s\n' "$info" | grep -F -q 'MAC: sha256'
printf '%s\n' "$info" | grep -F -q 'AES-256-CBC'

bash "$ROOT/apps/ios/scripts/legacy-pkcs12.sh" \
  --input "$WORKDIR/modern.p12" \
  --output "$WORKDIR/legacy.p12" \
  --password-file "$WORKDIR/pass"

legacy="$(openssl pkcs12 -info -in "$WORKDIR/legacy.p12" -passin "file:$WORKDIR/pass" -noout 2>&1)"
printf '%s\n' "$legacy" | grep -F -q 'MAC: sha1'
printf '%s\n' "$legacy" | grep -F -q 'pbeWithSHA1And3-KeyTripleDES-CBC'
openssl pkcs12 -in "$WORKDIR/legacy.p12" -nokeys -passin "file:$WORKDIR/pass" >/dev/null

printf 'wrong-pass' >"$WORKDIR/wrong"
if bash "$ROOT/apps/ios/scripts/legacy-pkcs12.sh" \
  --input "$WORKDIR/modern.p12" \
  --output "$WORKDIR/nope.p12" \
  --password-file "$WORKDIR/wrong" >/dev/null 2>&1; then
  echo "Wrong password was accepted"
  exit 1
fi

echo "Legacy PKCS#12 conversion kept the password and switched to SHA-1 / 3DES"
