#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv-motion-analysis"
REQ_FILE="$SCRIPT_DIR/requirements.txt"

say() { printf '%s\n' "$*"; }

if ! command -v brew >/dev/null 2>&1; then
  say "Homebrew is required to install ffmpeg."
  say "Install Homebrew first:"
  say '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 2
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  say "Installing ffmpeg via Homebrew..."
  brew install ffmpeg
else
  say "ffmpeg/ffprobe already installed."
fi

if ! command -v python3 >/dev/null 2>&1; then
  say "Installing Python via Homebrew..."
  brew install python
fi

say "Creating Python virtual environment:"
say "$VENV_DIR"
python3 -m venv "$VENV_DIR"

say "Installing Python analysis packages..."
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install -r "$REQ_FILE"

say
say "Analysis tools installed."
say "Python:"
say "$VENV_DIR/bin/python"
say
say "Run ./verify.command to check the installation."
