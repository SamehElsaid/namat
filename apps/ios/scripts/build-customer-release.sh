#!/bin/bash
# FULL_REBUILD: rebuild AirliftFFI, archive a Release NAMAT app, and package an unsigned IPA.
# The caller then signs that IPA with the customer Ad Hoc profile.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
: "${RUNNER_TEMP:?}"

bash "$ROOT/prototypes/wallet-engine/Vendor/select-xcode.sh"
command -v cmake >/dev/null 2>&1 || brew install cmake
command -v xcodegen >/dev/null 2>&1 || brew install xcodegen
bash "$ROOT/prototypes/wallet-engine/Vendor/build-airlift-xcframework.sh"

(
  cd "$ROOT/apps/ios"
  xcodegen generate
  xcodebuild \
    -project Namat.xcodeproj \
    -scheme Namat \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$RUNNER_TEMP/namat-customer-release" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY=- \
    DEVELOPMENT_TEAM= \
    build
)

APP="$RUNNER_TEMP/namat-customer-release/Build/Products/Release-iphoneos/Namat.app"
test -d "$APP"
AIRLIFT_SHA="$(git -C "$ROOT" rev-parse "HEAD:prototypes/wallet-engine/Vendor/airlift-rust")"
COMMIT_SHA="${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
bash "$ROOT/apps/ios/scripts/package-unsigned-release.sh" \
  "$APP" \
  "$RUNNER_TEMP/unsigned-dist" \
  "$COMMIT_SHA" \
  "$AIRLIFT_SHA"
cp "$RUNNER_TEMP/unsigned-dist/Namat-unsigned.ipa" "$RUNNER_TEMP/unsigned.ipa"

python3 - "$RUNNER_TEMP" "$COMMIT_SHA" "$AIRLIFT_SHA" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

runner, commit, airlift = sys.argv[1:]
root = Path(runner)
ipa = (root / "unsigned.ipa").read_bytes()
sha = hashlib.sha256(ipa).hexdigest()
version = "1.0.0"
build = "1"
manifest = (root / "unsigned-dist" / "BUILD-MANIFEST.txt").read_text()
for line in manifest.splitlines():
    if line.startswith("version: "):
        version = line.split(": ", 1)[1].strip()
    if line.startswith("build: "):
        build = line.split(": ", 1)[1].strip()
(root / "unsigned-identity.json").write_text(
    json.dumps(
        {
            "sourceCommit": commit,
            "airliftSha": airlift,
            "appVersion": version,
            "buildNumber": build,
            "unsignedIpaSha256": sha,
        }
    )
)
PY
test -s "$RUNNER_TEMP/unsigned.ipa"
echo "Unsigned Release payload built"
