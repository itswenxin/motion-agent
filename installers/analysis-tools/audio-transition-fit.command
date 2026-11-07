#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$SCRIPT_DIR/.venv-motion-analysis/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "Motion Agent analysis tools are not installed yet."
  echo "Run ./install.command first."
  exit 2
fi

exec "$PYTHON" "$SCRIPT_DIR/audio_transition_fit.py" "$@"
