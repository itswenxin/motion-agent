#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_FILE="$SCRIPT_DIR/AE AI Bridge.jsx"
DEFAULT_RUNTIME_DIR="$HOME/Library/Application Support/Motion Agent/runtime"
RUNTIME_DIR="${2:-$DEFAULT_RUNTIME_DIR}"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Missing: $SOURCE_FILE" >&2
  exit 1
fi

AE_APP="${1:-}"
if [[ -z "$AE_APP" ]]; then
  AE_APP="$(find /Applications -maxdepth 1 -type d -name 'Adobe After Effects*' | sort | tail -n 1 || true)"
fi

if [[ -z "$AE_APP" || ! -d "$AE_APP" ]]; then
  echo "Could not find After Effects. Pass the app folder path:" >&2
  echo "  ./install-macos.sh '/Applications/Adobe After Effects 2026'" >&2
  exit 2
fi

TARGET_DIR="$AE_APP/Scripts/ScriptUI Panels"
mkdir -p "$TARGET_DIR"
mkdir -p "$RUNTIME_DIR/commands" "$RUNTIME_DIR/results" "$RUNTIME_DIR/previews"

TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/ae-ai-bridge.XXXXXX")"
python3 - "$SOURCE_FILE" "$TMP_FILE" "$RUNTIME_DIR" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
runtime = sys.argv[3]
text = source.read_text(encoding="utf-8")
old = 'var DEFAULT_RUNTIME_DIR = Folder("~/Library/Application Support/Motion Agent/runtime").fsName;'
new = "var DEFAULT_RUNTIME_DIR = %s;" % json.dumps(runtime)
if old not in text:
    raise SystemExit("Could not find DEFAULT_RUNTIME_DIR in AE AI Bridge.jsx")
target.write_text(text.replace(old, new), encoding="utf-8")
PY

cp "$TMP_FILE" "$TARGET_DIR/Motion Agent.jsx"
rm -f "$TMP_FILE"

# Older installs copied the same source under extra filenames, which show up
# as duplicate, confusing Window-menu entries. Clean them up so there is only
# one panel installed.
if [[ -f "$TARGET_DIR/AE AI Bridge.jsx" ]]; then
  rm -f "$TARGET_DIR/AE AI Bridge.jsx"
  echo "Removed legacy duplicate: $TARGET_DIR/AE AI Bridge.jsx"
fi
if [[ -f "$TARGET_DIR/Codex AI Bridge.jsx" ]]; then
  rm -f "$TARGET_DIR/Codex AI Bridge.jsx"
  echo "Removed legacy duplicate: $TARGET_DIR/Codex AI Bridge.jsx"
fi

echo "Installed Motion Agent to:"
echo "$TARGET_DIR/Motion Agent.jsx"
echo "Runtime queue:"
echo "$RUNTIME_DIR"
echo
echo "Restart After Effects (or close + reopen the panel), then open: Window > Motion Agent.jsx"
