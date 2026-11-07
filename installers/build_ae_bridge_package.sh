#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="Motion-Agent-AE-Bridge-macOS"
BUILD_DIR="$ROOT/.package-build"
PACKAGE_DIR="$BUILD_DIR/$PACKAGE_NAME"
DIST_DIR="$ROOT/dist"
ZIP_PATH="$DIST_DIR/$PACKAGE_NAME.zip"

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT/bridge/AE AI Bridge.jsx" "$PACKAGE_DIR/AE AI Bridge.jsx"
cp "$ROOT/bridge/install-macos.sh" "$PACKAGE_DIR/install-macos.sh"
cp "$ROOT/bridge/install.command" "$PACKAGE_DIR/install.command"
cp "$ROOT/bridge/send-command.js" "$PACKAGE_DIR/send-command.js"
cp "$ROOT/bridge/claude-bridge-client.js" "$PACKAGE_DIR/claude-bridge-client.js"
cp "$ROOT/bridge/bridge-client-lib.js" "$PACKAGE_DIR/bridge-client-lib.js"
cp "$ROOT/bridge/repair-runtime-link.sh" "$PACKAGE_DIR/repair-runtime-link.sh"
cp "$ROOT/bridge/README.md" "$PACKAGE_DIR/TECHNICAL_README.md"
cp "$ROOT/installers/ae_bridge_package_README.md" "$PACKAGE_DIR/README.md"

chmod +x "$PACKAGE_DIR/install-macos.sh" "$PACKAGE_DIR/install.command" "$PACKAGE_DIR/repair-runtime-link.sh"

rm -f "$ZIP_PATH"
(cd "$BUILD_DIR" && zip -qr "$ZIP_PATH" "$PACKAGE_NAME")

echo "Built: $ZIP_PATH"
