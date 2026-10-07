#!/bin/bash
# macos-14 images default to Xcode 15.4. Prefer the newest Xcode 16 that is
# actually installed so nm and ld can read the rebuilt static library.
set -euo pipefail

chosen=""
for candidate in \
  /Applications/Xcode_16.4.app \
  /Applications/Xcode_16.3.app \
  /Applications/Xcode_16.2.app \
  /Applications/Xcode_16.1.app \
  /Applications/Xcode_16.app \
  /Applications/Xcode.app
do
  if [[ -d "$candidate" ]]; then
    chosen="$candidate"
    break
  fi
done

if [[ -z "$chosen" ]]; then
  echo "No Xcode installation found." >&2
  exit 1
fi

sudo xcode-select -s "$chosen"
echo "Selected $chosen"
xcodebuild -version
