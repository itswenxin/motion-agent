#!/usr/bin/env python3
"""Whole-film coarse check against the reference: which shots are furthest off, and where.

Run it after every big change, not just before/after comparisons of our own comp: "before vs after"
only proves nothing broke; it cannot prove the film matches the reference.

Both folders hold one image per frame (f_0000.png / .jpg …, sorted order = frame order; every Nth
frame is fine). Frames are shrunk to 135 px wide and blurred, so small offsets and texture don't count:
what remains is misplaced or missing content, wrong colour, wrong cut timing.

  python3 tools/coarse_check.py ours/ refs/<slug>/frames30/ --step 3 \
      --shots "Intro:0-17,Logo:18-34,Lock:35-64,..." --json out/coarse.json

Prints per shot: mean and max difference (0–255) and the three worst frames to look at first.
"""
import argparse, glob, json, os, re
from PIL import Image, ImageChops, ImageFilter, ImageStat


def frames(folder):
    out = {}
    for p in glob.glob(os.path.join(folder, "*")):
        m = re.search(r"(\d+)\.(png|jpe?g)$", p, re.I)
        if m:
            out[int(m.group(1))] = p
    return out


def small(p, w):
    im = Image.open(p).convert("RGB")
    h = max(1, round(im.height * w / im.width))
    return im.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ours")
    ap.add_argument("ref")
    ap.add_argument("--step", type=int, default=3)
    ap.add_argument("--shots", default="", help="Name:first-last,… (default: one shot)")
    ap.add_argument("--width", type=int, default=135)
    ap.add_argument("--json")
    a = ap.parse_args()

    O, R = frames(a.ours), frames(a.ref)
    common = sorted(set(O) & set(R))
    if not common:
        raise SystemExit("no matching frame numbers in the two folders")
    res = {}
    picked = [k for k in common if (k - common[0]) % max(1, a.step) == 0]
    for k in picked:
        x, y = small(O[k], a.width), small(R[k], a.width)
        if x.size != y.size:
            y = y.resize(x.size, Image.BILINEAR)
        res[k] = sum(ImageStat.Stat(ImageChops.difference(x, y)).mean) / 3
    shots = []
    for part in [s for s in a.shots.split(",") if s]:
        name, rng = part.split(":")
        lo, hi = (int(v) for v in rng.split("-"))
        shots.append((name, lo, hi))
    if not shots:
        shots = [("All", common[0], common[-1])]
    summary = {}
    for name, lo, hi in shots:
        v = sorted((res[k], k) for k in res if lo <= k <= hi)
        if not v:
            continue
        summary[name] = {"mean": sum(d for d, _ in v) / len(v), "max": v[-1][0], "worst": [k for _, k in v[-3:]][::-1], "n": len(v)}
        s = summary[name]
        print("%-12s n%4d  mean %5.1f  max %5.1f  worst frames %s" % (name, s["n"], s["mean"], s["max"], s["worst"]))
    if a.json:
        json.dump({"frames": res, "shots": summary}, open(a.json, "w"), indent=1)


if __name__ == "__main__":
    main()
