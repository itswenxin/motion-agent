#!/usr/bin/env python3
"""Repo health check for Motion Agent.

Checks the facts that tend to drift:
- workspace sync state
- current headline counts
- stale public-facing numbers
- case-library completeness
- duplicated tool divergence
- JSX preflight status
"""
from __future__ import print_function

import argparse
import importlib.util
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def run(cmd):
    return subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True)


def rel(path):
    return str(Path(path).relative_to(ROOT))


class Report(object):
    def __init__(self):
        self.failures = []
        self.warnings = []

    def ok(self, msg):
        print("[ok]   " + msg)

    def warn(self, msg):
        self.warnings.append(msg)
        print("[warn] " + msg)

    def fail(self, msg):
        self.failures.append(msg)
        print("[fail] " + msg)


def check_sync(report):
    script = ROOT / "sync.sh"
    if not script.exists():
        report.warn("sync.sh missing; skipped workspace drift check")
        return
    result = run(["./sync.sh", "check"])
    out = (result.stdout or "").strip()
    if result.returncode != 0:
        report.fail("sync.sh check failed: " + (result.stderr or out).strip())
        return
    bad = [line for line in out.splitlines() if "differs" in line or " file(s) differ" in line and not line.endswith("0 file(s) differ")]
    if bad:
        report.fail("workspace drift detected: " + "; ".join(bad))
    else:
        report.ok("workspace sync check passed")


def check_counts(report):
    recipes = list(ROOT.glob("cases/*/*/RECIPE.md"))
    case_dirs = [p for p in ROOT.glob("cases/*/*") if p.is_dir()]
    bridge_jsx = list((ROOT / "bridge").glob("*.jsx"))
    skill = ROOT / "skill" / "SKILL.md"
    skill_lines = len(skill.read_text(encoding="utf-8").splitlines())
    skill_kb = round(skill.stat().st_size / 1024.0)
    tool_files = list((ROOT / "tools").glob("*.py")) + list((ROOT / "tools").glob("*.sh"))
    report.ok("counts: %d recipes, %d case dirs, %d bridge JSX, SKILL %dKB/%d lines, %d repo tools" %
              (len(recipes), len(case_dirs), len(bridge_jsx), skill_kb, skill_lines, len(tool_files)))


def check_stale_numbers(report):
    stale = [
        "387 JSX",
        "21 个案例目录，19 份",
        "约 42 KB / 559 行",
        "19 份已沉淀",
        "19 份正式配方",
        "19 份可复用配方",
        "25 份已沉淀",
        "25 份正式配方",
        "25 份可复用配方",
        "25 个配方",
        "25 documented",
        "27 个案例目录，25 份",
        "知识沉淀（19 份",
    ]
    hits = []
    for folder in ["README.md", "README.zh-CN.md", "docs", "LEARNING_MAP.md"]:
        base = ROOT / folder
        files = [base] if base.is_file() else list(base.glob("*.md"))
        for path in files:
            text = path.read_text(encoding="utf-8")
            for token in stale:
                if token in text:
                    hits.append("%s: %s" % (rel(path), token))
    if hits:
        report.fail("stale public numbers found: " + "; ".join(hits[:8]))
    else:
        report.ok("no stale headline numbers found")


def check_case_library(report):
    recipes = sorted(ROOT.glob("cases/*/*/RECIPE.md"))
    missing_prompt = []
    missing_artifact = []
    missing_evidence = []
    for recipe in recipes:
        folder = recipe.parent
        if not (folder / "PROMPT_TEMPLATE.md").exists():
            missing_prompt.append(rel(recipe))
        if not (list(folder.glob("*.jsx")) or list(folder.glob("*.json"))):
            missing_artifact.append(rel(recipe))
        if not (list(folder.glob("*.png")) or list(folder.glob("*.jpg")) or list(folder.glob("*.txt"))):
            missing_evidence.append(rel(recipe))
    report.ok("case library scanned: %d recipes" % len(recipes))
    if missing_prompt:
        report.warn("%d recipes missing PROMPT_TEMPLATE.md" % len(missing_prompt))
    if missing_artifact:
        report.warn("%d recipes missing reusable JSX/spec artifact" % len(missing_artifact))
    if missing_evidence:
        report.warn("%d recipes missing local visual/metric evidence" % len(missing_evidence))


def check_tool_divergence(report):
    canonical = ROOT / "ae_scripts" / "tools"
    compat = ROOT / "tools"
    checked = 0
    divergent = []
    for path in compat.iterdir():
        if not path.is_file() or path.name.startswith("."):
            continue
        peer = canonical / path.name
        if not peer.exists():
            continue
        if path.name in ("README.md", "preflight.py", "health_check.py"):
            continue
        checked += 1
        if path.read_bytes() != peer.read_bytes():
            divergent.append(path.name)
    if divergent:
        report.warn("duplicated tool implementations differ: " + ", ".join(divergent))
    else:
        report.ok("duplicated repo-level tools match canonical AE tools (%d checked)" % checked)


def check_tracked_junk(report):
    result = run(["git", "ls-files", ".DS_Store", "*/.DS_Store", "*.aep", "ae_scripts/out/*", "bridge/runtime/*"])
    tracked = [line for line in (result.stdout or "").splitlines() if line.strip()]
    if tracked:
        report.fail("tracked generated/system files: " + ", ".join(tracked[:8]))
    else:
        report.ok("no tracked generated/system files found")


def load_preflight():
    path = ROOT / "ae_scripts" / "tools" / "preflight.py"
    spec = importlib.util.spec_from_file_location("motion_preflight", str(path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_preflight(report, quick):
    preflight = load_preflight()
    files = sorted((ROOT / "bridge").glob("*.jsx"))
    if quick:
        files = files[:25]
    failed = []
    for path in files:
        issues = (preflight.check_syntax(str(path)) + preflight.check_reserved(str(path)) +
                  preflight.check_es5(str(path)) + preflight.check_expr_only(str(path)) +
                  preflight.check_error_handler(str(path)))
        if issues:
            failed.append((rel(path), issues[0]))
    if failed:
        report.fail("preflight failures: " + "; ".join("%s -> %s" % item for item in failed[:8]))
    else:
        scope = "quick sample" if quick else "all bridge JSX"
        report.ok("preflight passed for %s (%d files)" % (scope, len(files)))


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="sample JSX preflight instead of scanning every bridge script")
    args = parser.parse_args(argv)

    report = Report()
    check_sync(report)
    check_counts(report)
    check_stale_numbers(report)
    check_case_library(report)
    check_tool_divergence(report)
    check_tracked_junk(report)
    check_preflight(report, args.quick)

    print("")
    if report.failures:
        print("Health check failed: %d failure(s), %d warning(s)." % (len(report.failures), len(report.warnings)))
        return 1
    print("Health check passed with %d warning(s)." % len(report.warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
