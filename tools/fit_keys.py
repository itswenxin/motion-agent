#!/usr/bin/env python3
"""Fit a few smooth keyframes to per-frame measurements, ready for After Effects.

Measured samples (one value per frame, e.g. a phone pose solved from a reference clip) must never be
keyed frame by frame: that traces the reference's jitter. This tool keeps the fewest keys that stay
within a tolerance, using a monotone cubic spline (Fritsch–Carlson: C1, zero slope at turnarounds,
no overshoot). All channels of one layer share the same key times, so move, turn and scale stay in sync.

In AE a Bézier key with influence 33.333 % and speed = slope × fps is exactly a cubic Hermite segment,
so the spline fitted here plays back identically in AE (position must be separated into X/Y/Z).

  python3 tools/fit_keys.py samples.json --comp Main --layer Rig --fps 30 \
      --segment 35-47 --segment 48-64 --tol Position=2,Rotation=0.3,Scale=0.3 --out rig_keys.jsx
  ae_scripts/tools/run_jsx.sh rig_keys.jsx

samples.json: {"Position_X": {"35": 512.4, "36": 515.0, ...}, "Rotation_Y": {...}, "Scale": {...}}
Channels: Position_X/Y/Z, Rotation_X/Y/Z (Rotation = Z), Scale (uniform), Opacity.
Each --segment is fitted on its own; a HOLD is set on its last key so the cut jumps to the next segment
(the next segment starts at the cut frame). Without --segment, all frames are one segment.
The generated JSX holds the data as JSON written by this script (never hand-edited) and calls
ae_scripts/tools/apply_keys.jsx, which writes a report file and opens the comp at each channel.
"""
import argparse, json, os, sys

MATCH = {
    "Position_X": "ADBE Position_0", "Position_Y": "ADBE Position_1", "Position_Z": "ADBE Position_2",
    "Rotation_X": "ADBE Rotate X", "Rotation_Y": "ADBE Rotate Y", "Rotation_Z": "ADBE Rotate Z",
    "Rotation": "ADBE Rotate Z", "Scale": "ADBE Scale", "Opacity": "ADBE Opacity",
}


def fc_slopes(K, V):
    n = len(K)
    if n == 1:
        return [0.0]
    d = [(V[i + 1] - V[i]) / (K[i + 1] - K[i]) for i in range(n - 1)]
    if n == 2:
        return [d[0], d[0]]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            continue
        h0, h1 = K[i] - K[i - 1], K[i + 1] - K[i]
        w1, w2 = 2 * h1 + h0, h1 + 2 * h0
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    for i in (0, n - 1):  # one-sided three-point ends, kept monotone
        if i == 0:
            h0, h1, d0, d1 = K[1] - K[0], K[2] - K[1], d[0], d[1]
        else:
            h0, h1, d0, d1 = K[-1] - K[-2], K[-2] - K[-3], d[-1], d[-2]
        mm = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        if mm * d0 <= 0:
            mm = 0.0
        elif d0 * d1 < 0 and abs(mm) > 3 * abs(d0):
            mm = 3 * d0
        m[i] = mm
    return m


def herm(K, V, M, t):
    for i in range(len(K) - 1):
        if K[i] <= t <= K[i + 1]:
            h = K[i + 1] - K[i]
            u = (t - K[i]) / h
            return ((2 * u ** 3 - 3 * u ** 2 + 1) * V[i] + (u ** 3 - 2 * u ** 2 + u) * h * M[i]
                    + (-2 * u ** 3 + 3 * u ** 2) * V[i + 1] + (u ** 3 - u ** 2) * h * M[i + 1])
    return V[0] if t < K[0] else V[-1]


def fit_segment(chans, tols, frames, maxk, mingap):
    """Greedy: start with the two ends, insert a key at the worst frame until every channel is in tolerance."""
    K = [frames[0], frames[-1]] if len(frames) > 1 else [frames[0]]
    while True:
        res, worst, worst_f = {}, 0.0, None
        for name, S in chans.items():
            V = [S[k] for k in K]
            M = fc_slopes(K, V)
            res[name] = (V, M)
            for f in frames:
                if f in K:
                    continue
                e = abs(herm(K, V, M, f) - S[f]) / tols[name]
                if e > worst and all(abs(f - q) >= mingap for q in K):
                    worst, worst_f = e, f
        if worst <= 1 or worst_f is None or len(K) >= maxk:
            return K, res, worst
        K = sorted(K + [worst_f])


def tol_for(name, spec):
    for key in sorted(spec, key=len, reverse=True):
        if name.startswith(key):
            return spec[key]
    return spec.get("default", 1.0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("samples")
    ap.add_argument("--comp", required=True)
    ap.add_argument("--layer", required=True)
    ap.add_argument("--fps", type=float, required=True)
    ap.add_argument("--segment", action="append", default=[], help="first-last frame, e.g. 35-47")
    ap.add_argument("--tol", default="Position=2,Rotation=0.3,Scale=0.3,Opacity=1",
                    help="max error per channel prefix (comp units, degrees, percent)")
    ap.add_argument("--maxk", type=int, default=12, help="max keys per segment")
    ap.add_argument("--mingap", type=int, default=2, help="min frames between keys")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    raw = json.load(open(a.samples))
    chans = {}
    for name, d in raw.items():
        if name not in MATCH:
            sys.exit("unknown channel %s (use %s)" % (name, ", ".join(sorted(MATCH))))
        chans[name] = {int(k): float(v) for k, v in d.items()}
    tols = {}
    spec = dict((kv.split("=")[0], float(kv.split("=")[1])) for kv in a.tol.split(",") if kv)
    for name in chans:
        tols[name] = tol_for(name, spec)
    common = sorted(set.intersection(*[set(S) for S in chans.values()]))
    segs = []
    for s in a.segment or ["%d-%d" % (common[0], common[-1])]:
        lo, hi = (int(x) for x in s.split("-"))
        segs.append([f for f in common if lo <= f <= hi])

    out = {name: [] for name in chans}
    holds = []
    report = []
    for si, frames in enumerate(segs):
        if not frames:
            continue
        K, res, worst = fit_segment({n: chans[n] for n in chans}, tols, frames, a.maxk, a.mingap)
        for name, (V, M) in res.items():
            out[name] += [[k, round(v, 4), round(m, 5)] for k, v, m in zip(K, V, M)]
        if si < len(segs) - 1:
            holds.append(K[-1])
        report.append("segment %d-%d: %d keys, worst error %.2f × tolerance" % (frames[0], frames[-1], len(K), worst))

    data = {"comp": a.comp, "layer": a.layer, "fps": a.fps, "holds": holds,
            "channels": [{"name": n, "p": MATCH[n], "k": out[n]} for n in chans]}
    apply_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ae_scripts", "tools", "apply_keys.jsx")
    apply_path = os.path.normpath(apply_path)
    with open(a.out, "w") as f:
        f.write("// generated by tools/fit_keys.py: do not edit by hand, re-run the tool\n")
        f.write("var MA_KEYS = " + json.dumps(data, separators=(",", ":")) + ";\n")
        f.write("$.evalFile(new File(" + json.dumps(apply_path) + "));\n")
    print("\n".join(report))
    print("wrote %s (%d channels)" % (a.out, len(chans)))


if __name__ == "__main__":
    main()
