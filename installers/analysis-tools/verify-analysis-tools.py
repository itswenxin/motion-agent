#!/usr/bin/env python3
import importlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def command_version(command):
    path = shutil.which(command)
    if not path:
        return {"ok": False, "path": None, "version": None}
    try:
        result = subprocess.run([command, "-version"], text=True, capture_output=True, timeout=10)
        first = (result.stdout or result.stderr or "").splitlines()[0] if (result.stdout or result.stderr) else ""
    except Exception as err:
        return {"ok": False, "path": path, "version": str(err)}
    return {"ok": True, "path": path, "version": first}


def module_status(import_name, display_name=None):
    try:
        module = importlib.import_module(import_name)
        return {
            "ok": True,
            "name": display_name or import_name,
            "version": getattr(module, "__version__", "unknown"),
        }
    except Exception as err:
        return {
            "ok": False,
            "name": display_name or import_name,
            "error": str(err),
        }


def main():
    script_dir = Path(__file__).resolve().parent
    commands = {
        "ffmpeg": command_version("ffmpeg"),
        "ffprobe": command_version("ffprobe"),
    }
    modules = [
        module_status("numpy"),
        module_status("PIL", "pillow"),
        module_status("cv2", "opencv-python"),
        module_status("librosa"),
        module_status("soundfile"),
        module_status("scipy"),
    ]
    ok = all(item["ok"] for item in commands.values()) and all(item["ok"] for item in modules)
    tools = {
        "audio_transition_fit.py": (script_dir / "audio_transition_fit.py").exists(),
        "audio-transition-fit.command": (script_dir / "audio-transition-fit.command").exists(),
    }
    ok = ok and all(tools.values())
    report = {
        "ok": ok,
        "python": sys.executable,
        "commands": commands,
        "python_packages": modules,
        "motion_agent_tools": tools,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if ok:
        print("Analysis toolchain OK")
        return 0
    print("Analysis toolchain is incomplete")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
