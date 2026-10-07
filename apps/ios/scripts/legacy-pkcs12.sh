#!/bin/bash
# Rewrite a PKCS#12 file to the legacy container Apple's security(1) can import.
# OpenSSL 3 defaults to AES-256 and a SHA-256 MAC. security import reports that
# as a MAC verification failure even when the password is correct.
# The password is read from a file and is never printed.
set -euo pipefail
umask 077

INPUT=""
OUTPUT=""
PASSWORD_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --input) INPUT="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --password-file) PASSWORD_FILE="$2"; shift 2 ;;
    *)
      echo "Unknown legacy pkcs12 argument"
      exit 1
      ;;
  esac
done

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ] || [ -z "$PASSWORD_FILE" ]; then
  echo "Missing required legacy pkcs12 argument"
  exit 1
fi

pick_openssl() {
  local candidate resolved
  for candidate in \
    /opt/homebrew/opt/openssl@3/bin/openssl \
    /usr/local/opt/openssl@3/bin/openssl \
    /opt/homebrew/bin/openssl \
    openssl
  do
    resolved="$candidate"
    if [ ! -x "$resolved" ]; then
      resolved="$(command -v "$candidate" 2>/dev/null || true)"
    fi
    if [ -n "$resolved" ] && [ -x "$resolved" ] && "$resolved" version 2>/dev/null | grep -q '^OpenSSL 3'; then
      printf '%s\n' "$resolved"
      return 0
    fi
  done
  return 1
}

if ! BIN="$(pick_openssl)"; then
  echo "OpenSSL 3 is required to convert PKCS#12"
  exit 1
fi

PEM="$(mktemp)"
cleanup() {
  rm -f "$PEM"
}
trap cleanup EXIT

"$BIN" pkcs12 -in "$INPUT" -out "$PEM" -nodes -passin "file:$PASSWORD_FILE" >/dev/null 2>&1
"$BIN" pkcs12 -export -legacy \
  -in "$PEM" -inkey "$PEM" \
  -out "$OUTPUT" \
  -passout "file:$PASSWORD_FILE" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg SHA1 >/dev/null 2>&1
