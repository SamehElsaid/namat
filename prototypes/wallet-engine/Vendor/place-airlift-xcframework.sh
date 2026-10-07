#!/bin/bash
# download-artifact may nest the xcframework. SPM looks for Info.plist at
# Vendor/AirliftFFI.xcframework/Info.plist, so flatten one download layout.
set -euo pipefail

DEST="${1:?destination xcframework directory}"
if [[ -f "$DEST/Info.plist" ]]; then
  echo "xcframework ready at $DEST"
  exit 0
fi

found=""
for candidate in \
  "$DEST"/Info.plist \
  "$DEST"/*/Info.plist \
  "$DEST"/*/*/Info.plist \
  "$DEST"/*/*/*/Info.plist \
  "$DEST"/*/*/*/*/Info.plist \
  "$DEST"/*/*/*/*/*/Info.plist
do
  if [[ -f "$candidate" ]]; then
    found="$candidate"
    break
  fi
done

if [[ -z "$found" ]]; then
  echo "Info.plist not found under $DEST" >&2
  find "$DEST" -maxdepth 6 2>/dev/null | head -n 200 >&2 || true
  exit 1
fi

src="$(dirname "$found")"
tmp="$(mktemp -d)"
mv "$src" "$tmp/fw"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
mv "$tmp/fw" "$DEST"
[[ -f "$DEST/Info.plist" ]]
echo "xcframework placed at $DEST"
