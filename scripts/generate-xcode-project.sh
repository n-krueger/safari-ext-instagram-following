#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Some Macs select Command Line Tools even when the full Xcode app is installed.
if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

if [[ -e "$ROOT/safari/Instagram Following" ]]; then
  echo "The Xcode project already exists in safari/Instagram Following. Open it in Xcode."
  echo "To regenerate, first move that directory aside so your signing/settings aren't overwritten."
  exit 1
fi

xcrun safari-web-extension-converter "$ROOT/extension" \
  --project-location "$ROOT/safari" \
  --app-name "Instagram Following" \
  --bundle-identifier "com.example.InstagramFollowing" \
  --swift --no-open --no-prompt
