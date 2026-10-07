#!/usr/bin/env bash
# Verify a customer IPA on macOS and, when IPA_VERIFICATION_PRIVATE_KEY is set,
# write a signed attestation bound to that file's SHA-256.
# The production API is Linux and does not treat this script's unchecked JSON,
# or an owner checkbox, as publication proof.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "IPA verification must run on macOS, where codesign can inspect the app and nested executable."
  echo "Linux publication stays blocked until a signed attestation for the same SHA-256 is presented."
  exit 3
fi

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "usage: attest-customer-ipa.sh <file.ipa>"
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
pnpm exec ts-node --transpile-only src/modules/compatibility/attest-ipa.cli.ts "$1"
