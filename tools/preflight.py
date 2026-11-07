#!/usr/bin/env python3
"""Compatibility wrapper for the canonical AE JSX preflight.

The maintained implementation lives in `ae_scripts/tools/preflight.py` because
that directory is the canonical location. Keep this wrapper so
older docs and scripts that call `tools/preflight.py` still work.
"""
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
runpy.run_path(str(ROOT / "ae_scripts" / "tools" / "preflight.py"), run_name="__main__")
