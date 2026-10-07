#!/bin/bash
# Download the durable unsigned Release payload from NAMAT storage and check its SHA-256.
set -euo pipefail
umask 077

: "${NAMAT_API_BASE:?}"
: "${SIGNING_CALLBACK_TOKEN:?}"
: "${RUNNER_TEMP:?}"

BASE="${NAMAT_API_BASE%/}"
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${SIGNING_CALLBACK_TOKEN}" \
  -o "$RUNNER_TEMP/stable-manifest.json" \
  "${BASE}/device-enrollment/stable-manifest"

python3 - "$RUNNER_TEMP/stable-manifest.json" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text())
required = ["sourceCommit", "airliftSha", "appVersion", "buildNumber", "unsignedIpaSha256"]
for key in required:
    if not str(manifest.get(key) or "").strip():
        raise SystemExit("stable manifest is incomplete")
sha = str(manifest["unsignedIpaSha256"]).strip().lower()
if len(sha) != 64:
    raise SystemExit("stable manifest checksum is invalid")
Path(sys.argv[1]).write_text(json.dumps(manifest))
print(sha)
PY
SHA="$(python3 -c 'import json,os; print(json.load(open(os.environ["RUNNER_TEMP"] + "/stable-manifest.json"))["unsignedIpaSha256"].strip().lower())')"

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${SIGNING_CALLBACK_TOKEN}" \
  -H "X-Namat-Sha256: ${SHA}" \
  -o "$RUNNER_TEMP/unsigned.ipa" \
  "${BASE}/device-enrollment/stable-payload"

python3 - "$RUNNER_TEMP" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

runner = Path(sys.argv[1])
manifest = json.loads((runner / "stable-manifest.json").read_text())
actual = hashlib.sha256((runner / "unsigned.ipa").read_bytes()).hexdigest()
expected = str(manifest["unsignedIpaSha256"]).strip().lower()
if actual != expected:
    raise SystemExit("stable payload checksum mismatch")
(runner / "unsigned-identity.json").write_text(json.dumps(manifest))
PY
test -s "$RUNNER_TEMP/unsigned.ipa"
echo "Stable unsigned payload verified"
