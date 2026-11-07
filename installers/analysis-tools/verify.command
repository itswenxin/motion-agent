#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PY="$SCRIPT_DIR/.venv-motion-analysis/bin/python"

if [[ -x "$VENV_PY" ]]; then
  "$VENV_PY" "$SCRIPT_DIR/verify-analysis-tools.py"
else
  python3 "$SCRIPT_DIR/verify-analysis-tools.py"
fi

echo
read -r -p "Press Return to close..." _
