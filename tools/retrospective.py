#!/usr/bin/env python3
"""Collect every bridge operation behind a finished After Effects piece into a case draft.

Run this as soon as the user confirms a render is final. It reads the bridge runtime
(processed commands + results), keeps the commands that belong to the piece, and writes
a draft case folder the agent then turns into a reusable recipe:

    cases/_inbox/<date>-<slug>/
      TIMELINE.md        every command: time, type, duration, ok, first comment / summary
      FAILURES.md        every failed command and its error (pitfall candidates)
      scripts/NNN_*.jsx  the code of each successful command, de-duplicated, in order
      stats.json         counts, time span, saved .aep paths, renders
      RECIPE.md          skeleton to fill in (see agent-skills/motion-retrospective)

Examples:
    python3 tools/retrospective.py --slug sync-launch-film --since 6h
    python3 tools/retrospective.py --slug hero-logo --since 2026-11-06T09:00 --match "Hero"
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_RUNTIME = Path(os.environ.get(
    "AE_AI_BRIDGE_RUNTIME_DIR",
    Path.home() / "Library" / "Application Support" / "Motion Agent" / "runtime",
))
READ_ONLY_TYPES = {"ping", "health", "inspectProject", "inspectActiveComp", "inspectCompByName",
                   "getActiveComp", "inspectSelectedLayers", "dumpLayerProperties", "listProjectAssets",
                   "diagnose", "purgeCache"}


def parse_time(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    m = re.fullmatch(r"(\d+)([hmd])", value)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        delta = {"h": dt.timedelta(hours=n), "m": dt.timedelta(minutes=n), "d": dt.timedelta(days=n)}[unit]
        return dt.datetime.now(dt.timezone.utc) - delta
    t = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    return t if t.tzinfo else t.astimezone()


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def command_code(cmd: dict, runtime: Path | None = None) -> tuple[str, str]:
    """Return (code, source) for a command: inline JSX, or the contents of the JSX file it ran."""
    payload = cmd.get("payload") or {}
    if runtime is not None:
        archived = runtime / "scripts-archive" / f"{cmd.get('id')}.jsx"
        if archived.exists():
            return archived.read_text(encoding="utf-8", errors="replace"), str((payload or {}).get("path") or archived) if isinstance(payload, dict) else str(archived)
    if isinstance(payload, str):
        payload = load_json_text(payload) or {}
    if payload.get("code"):
        return payload["code"], "inline"
    p = payload.get("path")
    if p and str(p).endswith((".jsx", ".js")):
        f = Path(p)
        if f.exists():
            return f.read_text(encoding="utf-8", errors="replace"), str(f)
        return f"// file no longer exists: {p}\n", str(f)
    return json.dumps(payload, ensure_ascii=False, indent=2), "payload"


def load_json_text(text: str):
    try:
        return json.loads(text)
    except Exception:
        return None


def first_comment(code: str) -> str:
    for line in code.splitlines():
        s = line.strip()
        if s.startswith("//"):
            return s.lstrip("/ ").strip()[:120]
        if s.startswith("/*"):
            return s.strip("/* ").strip()[:120]
    return ""


def summarize(value, limit=160) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = re.sub(r"\s+", " ", text or "")
    return text[:limit] + ("…" if len(text) > limit else "")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slug", required=True, help="kebab-case name for the case draft")
    ap.add_argument("--since", help="ISO time or relative like 6h / 90m / 2d (default 12h)", default="12h")
    ap.add_argument("--until", help="ISO time (default now)")
    ap.add_argument("--match", help="only keep commands whose code, payload or result mentions this text")
    ap.add_argument("--runtime", default=str(DEFAULT_RUNTIME))
    ap.add_argument("--out", help="output folder (default cases/_inbox/<date>-<slug>)")
    args = ap.parse_args()

    runtime = Path(args.runtime)
    processed = runtime / "commands" / ".processed"
    results = runtime / "results"
    if not processed.exists():
        print(f"No processed commands in {processed}", file=sys.stderr)
        return 1
    since, until = parse_time(args.since), parse_time(args.until)

    rows = []
    for f in processed.glob("*.json"):
        cmd = load_json(f)
        if not cmd or not cmd.get("id"):
            continue
        created = parse_time(cmd.get("createdAt")) if cmd.get("createdAt") else None
        if created is None:
            created = dt.datetime.fromtimestamp(f.stat().st_mtime, dt.timezone.utc)
        if since and created < since or until and created > until:
            continue
        res = load_json(results / f"{cmd['id']}.json") or {}
        code, source = command_code(cmd, runtime)
        blob = code + json.dumps(res.get("data"), ensure_ascii=False)
        if args.match and args.match.lower() not in blob.lower():
            continue
        rows.append({"cmd": cmd, "res": res, "created": created, "code": code, "source": source})
    rows.sort(key=lambda r: r["created"])
    if not rows:
        print("No matching commands. Widen --since or drop --match.", file=sys.stderr)
        return 1

    date = rows[-1]["created"].astimezone().strftime("%Y-%m-%d")
    out = Path(args.out) if args.out else REPO / "cases" / "_inbox" / f"{date}-{args.slug}"
    (out / "scripts").mkdir(parents=True, exist_ok=True)

    seen, timeline, failures, saved, renders = set(), [], [], [], []
    n_script = 0
    for i, r in enumerate(rows, 1):
        cmd, res = r["cmd"], r["res"]
        ok = res.get("ok")
        typ = cmd.get("type", "?")
        t0 = parse_time(res.get("startedAt")) if res.get("startedAt") else None
        t1 = parse_time(res.get("finishedAt")) if res.get("finishedAt") else None
        secs = f"{(t1 - t0).total_seconds():.1f}" if t0 and t1 else ""
        note = first_comment(r["code"]) or summarize(res.get("data") or res.get("error") or "", 90)
        timeline.append(f"| {i} | {r['created'].astimezone().strftime('%H:%M:%S')} | `{typ}` | {secs} | {'✓' if ok else '✗'} | {note.replace('|', '/')} |")
        data_text = json.dumps(res.get("data"), ensure_ascii=False)
        saved += re.findall(r'[^"\s]+\.aep', data_text)
        if typ == "enqueueRender" or "renderQueue.render" in r["code"]:
            renders.append({"index": i, "time": r["created"].isoformat(), "data": res.get("data")})
        if ok is False or res.get("error"):
            failures.append(f"### {i}. `{typ}` at {r['created'].astimezone().strftime('%H:%M:%S')}\n\n"
                            f"**Error:** {summarize(res.get('error'), 600)}\n\n"
                            f"```js\n{r['code'][:1500]}\n```\n")
            continue
        if typ in READ_ONLY_TYPES:
            continue
        digest = hashlib.sha1(r["code"].encode("utf-8")).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        n_script += 1
        name = re.sub(r"[^a-z0-9]+", "-", (Path(r["source"]).stem if r["source"] not in ("inline", "payload") else note or typ).lower()).strip("-")[:48] or typ
        (out / "scripts" / f"{n_script:03d}_{name}.jsx").write_text(
            f"// step {i} · {typ} · {r['created'].astimezone().isoformat(timespec='seconds')} · source: {r['source']}\n{r['code']}",
            encoding="utf-8")

    span = rows[-1]["created"] - rows[0]["created"]
    stats = {
        "slug": args.slug,
        "from": rows[0]["created"].astimezone().isoformat(timespec="seconds"),
        "to": rows[-1]["created"].astimezone().isoformat(timespec="seconds"),
        "hours": round(span.total_seconds() / 3600, 2),
        "commands": len(rows),
        "failed": len(failures),
        "uniqueScripts": n_script,
        "savedProjects": sorted(set(saved)),
        "renders": renders,
    }
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "TIMELINE.md").write_text(
        f"# Timeline — {args.slug}\n\n{stats['commands']} commands, {stats['failed']} failed, "
        f"{stats['uniqueScripts']} unique scripts, {stats['hours']} h.\n\n"
        "| # | Time | Type | Sec | OK | Note |\n|---|---|---|---|---|---|\n" + "\n".join(timeline) + "\n",
        encoding="utf-8")
    (out / "FAILURES.md").write_text(
        f"# Failures — {args.slug}\n\nEach one is a pitfall candidate for skill/SKILL.md.\n\n" +
        ("\n".join(failures) if failures else "None.\n"), encoding="utf-8")
    recipe = out / "RECIPE.md"
    if not recipe.exists():
        recipe.write_text(RECIPE_TEMPLATE.format(**stats), encoding="utf-8")
    print(json.dumps({"draft": str(out), **{k: stats[k] for k in ("commands", "failed", "uniqueScripts", "hours")}}, ensure_ascii=False))
    return 0


RECIPE_TEMPLATE = """# {slug}

**Level:** Draft → fill in, then move to `cases/<category>/{slug}/` · **Built:** {from} → {to} ({hours} h)

<!-- Fill every section from TIMELINE.md, FAILURES.md and scripts/. Delete this comment when done. -->

## What the motion does

## Numbers

| | |
|---|---|
| Commands | {commands} ({failed} failed) |
| Unique scripts | {uniqueScripts} |
| Time | {hours} h |

## How it is built (transferable method)

1.

## Key parameters

| Parameter | Value | Why |
|---|---|---|

## Iterations (what the user asked → what changed)

| Step | Request | Change | Script |
|---|---|---|---|

## Pitfalls hit

-

## Evidence

- `evidence/`: final-render frames or a contact sheet

## Promotion notes

What to copy into `skill/SKILL.md` (pitfall table, feedback table, recipe index):
"""

if __name__ == "__main__":
    sys.exit(main())
