#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_RUNTIME_DIR="$HOME/Library/Application Support/Motion Agent/runtime"
RUNTIME_DIR="${AE_AI_BRIDGE_RUNTIME_DIR:-$DEFAULT_RUNTIME_DIR}"

mkdir -p "$RUNTIME_DIR/commands" "$RUNTIME_DIR/results" "$RUNTIME_DIR/previews" "$RUNTIME_DIR/quarantine"

cd "$SCRIPT_DIR"

realpath_of() {
  python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

canonical_runtime="$(realpath_of "$RUNTIME_DIR")"
local_runtime=""
if [ -e runtime ]; then
  local_runtime="$(realpath_of runtime)"
fi

if [ -e runtime ] && [ "$local_runtime" = "$canonical_runtime" ] && [ ! -L runtime ]; then
  echo "runtime is already the canonical runtime directory; leaving it in place: $RUNTIME_DIR"
elif [ -L runtime ]; then
  current="$(readlink runtime)"
  if [ "$current" = "$RUNTIME_DIR" ]; then
    echo "runtime already points to: $RUNTIME_DIR"
  else
    backup="runtime_SYMLINK_BACKUP_$(date +%Y%m%d_%H%M%S)"
    mv runtime "$backup"
    ln -s "$RUNTIME_DIR" runtime
    echo "replaced old runtime symlink; backup: $SCRIPT_DIR/$backup"
  fi
elif [ -d runtime ]; then
  backup="runtime_LOCAL_BACKUP_$(date +%Y%m%d_%H%M%S)"
  mv runtime "$backup"
  ln -s "$RUNTIME_DIR" runtime
  echo "moved local runtime to backup: $SCRIPT_DIR/$backup"
else
  ln -s "$RUNTIME_DIR" runtime
  echo "created runtime symlink: $SCRIPT_DIR/runtime -> $RUNTIME_DIR"
fi

node "$SCRIPT_DIR/send-command.js" doctor fix=true
