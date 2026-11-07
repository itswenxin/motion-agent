#!/usr/bin/env python3
"""Measure a reference video before rebuilding it in After Effects.

    python3 tools/analyze_reference.py refs/<slug>/reference.mp4 [--fps 24] [--width 480]

Writes next to the video:
  frames/            evenly spaced frames (macOS AVFoundation, no ffmpeg needed)
  contact_sheet.jpg  frames with timestamps, for the overall structure
  energy.png         motion energy per frame (mean pixel change), with holds and cuts marked
  analysis.json      size, fps, duration, holds, cuts, loop check, palette, beats
  ANALYSIS.md        the same, readable, plus what to measure next

Only Pillow is required. The numbers are what the rebuild is checked against, so measure
before building (see skill/SKILL.md, "复刻参考片：先逐帧量，再动手").
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat

TOOLS = Path(__file__).resolve().parent
HELPER_SRC = TOOLS / "extract_frames.swift"
HELPER_BIN = TOOLS / ".bin" / "extract_frames"


def ensure_helper() -> Path:
    if not HELPER_BIN.exists() or HELPER_BIN.stat().st_mtime < HELPER_SRC.stat().st_mtime:
        HELPER_BIN.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["swiftc", "-O", str(HELPER_SRC), "-o", str(HELPER_BIN)], check=True)
    return HELPER_BIN


def energy(a: Image.Image, b: Image.Image) -> float:
    diff = ImageChops.difference(a.convert("L"), b.convert("L"))
    return ImageStat.Stat(diff).mean[0]


def palette(frames: list[Path], n=6) -> list[str]:
    picks = [frames[i] for i in range(0, len(frames), max(1, len(frames) // 8))][:8]
    strip = Image.new("RGB", (64 * len(picks), 64))
    for i, f in enumerate(picks):
        strip.paste(Image.open(f).convert("RGB").resize((64, 64)), (64 * i, 0))
    q = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    counts = sorted(q.getcolors(), reverse=True)
    return ["#%02x%02x%02x" % tuple(pal[idx * 3: idx * 3 + 3]) for _, idx in counts]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--fps", type=float, default=24, help="sampling rate for analysis (default 24)")
    ap.add_argument("--width", type=int, default=480)
    ap.add_argument("--hold", type=float, default=0.35, help="energy below this = hold")
    ap.add_argument("--cut", type=float, default=6.0, help="a cut must also exceed this × half the median moving energy")
    args = ap.parse_args()

    video = Path(args.video).resolve()
    out = video.parent
    fdir = out / "frames"
    if fdir.exists():
        for f in fdir.glob("f_*.jpg"):
            f.unlink()
    res = subprocess.run([str(ensure_helper()), str(video), str(fdir), str(args.fps), str(args.width)],
                         capture_output=True, text=True, check=True)
    meta = json.loads(res.stdout.strip().splitlines()[-1])
    if "error" in meta:
        print(meta["error"], file=sys.stderr)
        return 1
    frames = sorted(fdir.glob("f_*.jpg"))
    times = [float(f.stem.split("_")[2]) for f in frames]
    imgs = [Image.open(f) for f in frames]

    e = [0.0] + [energy(imgs[i - 1], imgs[i]) for i in range(1, len(imgs))]
    moving = sorted(x for x in e[1:] if x >= args.hold) or [0.0]
    median = moving[len(moving) // 2]
    # A cut is a single-frame spike: much bigger than both neighbours, not just "fast motion".
    def nb(i):
        return max(e[i - 1] if i > 1 else 0.0, e[i + 1] if i + 1 < len(e) else 0.0)
    cuts = [round(times[i], 3) for i in range(1, len(e)) if e[i] > 8 and e[i] > 3 * max(nb(i), 0.5) and e[i] > args.cut * 0.5 * median]
    holds, start = [], None
    for i in range(1, len(e)):
        still = e[i] < args.hold
        if still and start is None:
            start = times[i - 1]
        if (not still or i == len(e) - 1) and start is not None:
            end = times[i] if not still else times[i]
            if end - start >= 0.15:
                holds.append([round(start, 3), round(end, 3)])
            start = None
    loop_gap = energy(imgs[-1], imgs[0])
    typical = median
    loop = {"lastToFirst": round(loop_gap, 2), "typicalStep": round(typical, 2),
            "seamless": bool(typical > 0 and loop_gap <= typical * 2.5)}
    # Beats: local energy peaks, the moments the motion is fastest.
    beats = [round(times[i], 3) for i in range(1, len(e) - 1) if e[i] > e[i - 1] and e[i] >= e[i + 1] and e[i] > median * 1.5]

    # Contact sheet (up to 24 frames).
    pick = list(range(0, len(imgs), max(1, len(imgs) // 24)))[:24]
    w = 320
    h = int(w * imgs[0].height / imgs[0].width)
    cols = 6
    rows = (len(pick) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + 6) + 6, rows * (h + 22) + 6), "white")
    d = ImageDraw.Draw(sheet)
    for k, i in enumerate(pick):
        x, y = 6 + (k % cols) * (w + 6), 6 + (k // cols) * (h + 22)
        sheet.paste(imgs[i].convert("RGB").resize((w, h)), (x, y))
        d.text((x, y + h + 4), f"{times[i]:.2f}s", fill="black")
    sheet.save(out / "contact_sheet.jpg", quality=85)

    # Energy plot.
    W, H = 1200, 260
    plot = Image.new("RGB", (W, H), "white")
    p = ImageDraw.Draw(plot)
    top = max(e) or 1
    dur = meta["duration"] or times[-1] or 1
    def X(t): return int(40 + (W - 60) * t / dur)
    def Y(v): return int(H - 30 - (H - 60) * v / top)
    for a, b in holds:
        p.rectangle([X(a), 20, X(b), H - 30], fill="#e8f3ff")
    for c in cuts:
        p.line([X(c), 20, X(c), H - 30], fill="#ff5a5a", width=2)
    p.line([(X(times[i]), Y(e[i])) for i in range(len(e))], fill="#3355ff", width=2)
    for s in range(int(dur) + 1):
        p.text((X(s) - 4, H - 22), f"{s}s", fill="black")
    p.text((44, 4), "motion energy · blue band = hold · red line = cut", fill="black")
    plot.save(out / "energy.png")

    analysis = {
        "video": str(video), "width": meta["width"], "height": meta["height"],
        "fps": meta["nominalFps"], "duration": round(meta["duration"], 3),
        "sampledFps": args.fps, "frames": len(frames),
        "holds": holds, "cuts": cuts, "beats": beats[:40], "loop": loop,
        "palette": palette(frames),
    }
    (out / "analysis.json").write_text(json.dumps(analysis, indent=2), encoding="utf-8")
    src = {}
    if (out / "meta.json").exists():
        src = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    md = f"""# Reference analysis

Source: {src.get('source_url', video.name)} · creator: {src.get('creator') or 'unknown'}

| | |
|---|---|
| Size | {meta['width']} × {meta['height']} |
| Frame rate | {meta['nominalFps']} fps |
| Duration | {analysis['duration']} s |
| Holds (still) | {', '.join(f'{a}–{b} s' for a, b in holds) or 'none'} |
| Cuts | {', '.join(f'{c} s' for c in cuts) or 'none'} |
| Fastest moments | {', '.join(f'{b} s' for b in beats[:12]) or 'none'} |
| Loop | last→first change {loop['lastToFirst']} vs typical step {loop['typicalStep']} → {'seamless loop' if loop['seamless'] else 'not a seamless loop'} |
| Palette | {' '.join(analysis['palette'])} |

![contact sheet](contact_sheet.jpg)
![motion energy](energy.png)

## Measure next (before building)
1. Name every moving element and its parent/child relationships from the contact sheet.
2. For each element: start/end frame, start/end position/scale/rotation (read pixel coordinates
   from `frames/`; `tools/measure.py` helps), and whether speed eases in, out or both.
3. Turn each move into keyframes: time, value, and ease (speed, influence) that reproduce the
   measured speed curve. Keyframes with Bézier easing first; expressions only when necessary.
4. Rebuild at the reference's size and frame rate, render the same timestamps, and compare with
   `python3 tools/sheet.py <ours> <cmp.png> --pair "<ref frames>"`.
"""
    (out / "ANALYSIS.md").write_text(md, encoding="utf-8")
    print(json.dumps({k: analysis[k] for k in ("width", "height", "fps", "duration", "holds", "cuts", "loop", "palette")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
