#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="Motion-Agent-Analysis-Tools-macOS"
BUILD_DIR="$ROOT/.package-build"
PACKAGE_DIR="$BUILD_DIR/$PACKAGE_NAME"
DIST_DIR="$ROOT/dist"
ZIP_PATH="$DIST_DIR/$PACKAGE_NAME.zip"

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT/installers/analysis_tools_README.md" "$PACKAGE_DIR/README.md"
cp "$ROOT/installers/analysis_tools_requirements.txt" "$PACKAGE_DIR/requirements.txt"
cp "$ROOT/installers/analysis-tools/install-macos.sh" "$PACKAGE_DIR/install-macos.sh"
cp "$ROOT/installers/analysis-tools/install.command" "$PACKAGE_DIR/install.command"
cp "$ROOT/installers/analysis-tools/verify-analysis-tools.py" "$PACKAGE_DIR/verify-analysis-tools.py"
cp "$ROOT/installers/analysis-tools/verify.command" "$PACKAGE_DIR/verify.command"
cp "$ROOT/tools/audio_transition_fit.py" "$PACKAGE_DIR/audio_transition_fit.py"
cp "$ROOT/installers/analysis-tools/audio-transition-fit.command" "$PACKAGE_DIR/audio-transition-fit.command"

chmod +x "$PACKAGE_DIR/install-macos.sh" "$PACKAGE_DIR/install.command" "$PACKAGE_DIR/verify-analysis-tools.py" "$PACKAGE_DIR/verify.command" "$PACKAGE_DIR/audio_transition_fit.py" "$PACKAGE_DIR/audio-transition-fit.command"

rm -f "$ZIP_PATH"
(cd "$BUILD_DIR" && zip -qr "$ZIP_PATH" "$PACKAGE_NAME")

echo "Built: $ZIP_PATH"
