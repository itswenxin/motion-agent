#!/usr/bin/env python3
"""Generate a slider-driven elliptical ring rig as an ES3-safe .jsx.

The rig attaches to layers that already exist in the comp: you place them roughly in
frame 1, the expressions read each layer's own pre-expression `value` to recover its
starting angle and radius, and from then on a controller null drives everything.
Nothing is baked into keyframes, so the pen tool and the sliders both stay usable.

Usage
  python3 make_ring_rig.py --comp "part03" --layers "card1,card2,card3" --name Orbit
  python3 make_ring_rig.py --comp "MAIN" --layers-from-selection --name Coverflow \
      --rx 820 --ry 300 --z-depth 520 --out /tmp/rig.jsx

Then send it:  ae_scripts/tools/run_jsx.sh /tmp/rig.jsx

Sliders it creates on AI_<Name>_CTRL
  Master Speed   overall tempo, 100 = as authored
  Cruise Speed   steady-state angular speed (px/s along the ellipse)
  Start Boost    extra speed at t=0, decays over ~0.3s (gives the "launch" feel)
  Ring RX/RY     ellipse radii
  Ring CX/CY     ellipse centre
  Z Depth        how much depth the far side gets
  Master Size    overall scale, 100 = as authored
  Depth Scale    how strongly depth modulates scale (0 = flat, 100 = strong)
  Collapse       0-100, gathers every layer onto AI_<Name>_Target
"""
import argparse
import json
import os

# Equal-arc-length traversal. Constant angular speed on an ellipse visibly speeds up and
# slows down; normalising by the local arc-length derivative g(th) fixes it.
POS_EXPR = r'''var C = thisComp.layer("AI_@NAME@_CTRL");
var msp = C.effect("Master Speed")("Slider")/100;
var vEnd = C.effect("Cruise Speed")("Slider");
var boost = C.effect("Start Boost")("Slider");
var rx = Math.max(1, C.effect("Ring RX")("Slider"));
var ry = Math.max(1, C.effect("Ring RY")("Slider"));
var cx = C.effect("Ring CX")("Slider");
var cy = C.effect("Ring CY")("Slider");
var zAmp = C.effect("Z Depth")("Slider");
var col = Math.min(1, Math.max(0, C.effect("Collapse")("Slider")/100));
var tgt = thisComp.layer("AI_@NAME@_Target").transform.position;
var ux = (value[0] - cx)/rx;
var uy = (value[1] - cy)/ry;
var TH0 = Math.atan2(uy, ux);
var K = Math.sqrt(ux*ux + uy*uy);
var th = TH0;
var dt = 1/120;
var tW = Math.max(0, time*msp);
for (var tt = 0; tt < tW; tt += dt) {
  var step = Math.min(dt, tW - tt);
  var u = tt/0.30;
  var vv = vEnd + boost*Math.exp(-u*u/2);
  var g = Math.sqrt(Math.pow(rx*Math.sin(th), 2) + Math.pow(ry*Math.cos(th), 2));
  th += vv*step/Math.max(g, 1);
}
var sx = cx + K*rx*Math.cos(th);
var sy = cy + K*ry*Math.sin(th);
var z = -zAmp*Math.sin(th);
var ce = col*col*(3 - 2*col);
// Gathered state: a strip when Strip Width > 0 (cards line up by index, which is the
// "filmstrip that explodes into a wall" move), otherwise everything piles onto Target.
var sw = C.effect("Strip Width")("Slider");
var idx = @IDX@;
var n = @COUNT@;
var gx = tgt[0];
var gy = tgt[1];
if (sw > 0) { gx = cx + (n <= 1 ? 0 : (idx/(n - 1) - 0.5)*sw); gy = cy; }
sx = sx + (gx - sx)*ce;
sy = sy + (gy - sy)*ce;
z = z*(1 - ce) + @COLLAPSEZ@*ce;
// AE's default camera distance is comp_width / 0.72 (0.72 = 2*tan(half of the default
// ~39.6 deg horizontal FOV). Measured: 1920-wide comp -> 2666.67, 1080-wide -> 1500.
// Computing it at runtime means the rig survives being dropped into any aspect ratio;
// hardcoding 2666.67 silently breaks every vertical comp.
var zoom = thisComp.width/0.72;
var f = (zoom + z)/zoom;
var ccx = thisComp.width/2;
var ccy = thisComp.height/2;
[ccx + (sx - ccx)*f, ccy + (sy - ccy)*f, z]'''

SCL_EXPR = r'''var C = thisComp.layer("AI_@NAME@_CTRL");
var msize = C.effect("Master Size")("Slider")/100;
var ds = C.effect("Depth Scale")("Slider")/100;
var zAmp = Math.max(1, C.effect("Z Depth")("Slider"));
var col = Math.min(1, Math.max(0, C.effect("Collapse")("Slider")/100));
var z = transform.position[2];
// AE's default camera distance is comp_width / 0.72 (0.72 = 2*tan(half of the default
// ~39.6 deg horizontal FOV). Measured: 1920-wide comp -> 2666.67, 1080-wide -> 1500.
// Computing it at runtime means the rig survives being dropped into any aspect ratio;
// hardcoding 2666.67 silently breaks every vertical comp.
var zoom = thisComp.width/0.72;
var f = (zoom + z)/zoom;
var depth = 1 + ds*(-z/zAmp)*0.5;
var ce = col*col*(3 - 2*col);
var gs = C.effect("Gather Scale")("Slider")/100;
var s = value[0]*msize*f*depth*(1 + (gs - 1)*ce);
[s, s, s]'''


# ---- scatter layout -------------------------------------------------------
# Cards keep the position the artist gave them (their `value` IS the spread layout);
# Collapse gathers them onto a horizontal strip ordered left-to-right, which is the
# "filmstrip -> explode into a card wall" move. Stagger delays each card slightly so
# the explosion reads as a burst rather than one rigid block.
SCATTER_POS = r'''var C = thisComp.layer("AI_@NAME@_CTRL");
var col = Math.min(1, Math.max(0, C.effect("Collapse")("Slider")/100));
var stag = C.effect("Stagger")("Slider")/1000;
var idx = @IDX@;
var n = @COUNT@;
var sw = C.effect("Strip Width")("Slider");
var sh = C.effect("Strip Height")("Slider");
var cx = C.effect("Ring CX")("Slider");
var cy = C.effect("Ring CY")("Slider");
var spread = C.effect("Spread")("Slider")/100;
var zAmp = C.effect("Z Depth")("Slider");
// per-card collapse, delayed by index so the burst staggers
var lag = Math.max(0, Math.min(1, (col*(1 + stag*n) - idx*stag)));
var ce = lag*lag*(3 - 2*lag);
// gathered state: a thin strip, cards side by side in index order
var gx = cx + (n <= 1 ? 0 : (idx/(n - 1) - 0.5)*sw);
var gy = cy + (idx % 2 === 0 ? -sh/2 : sh/2);
// spread state: whatever the artist authored, pushed out from centre by Spread
var px = cx + (value[0] - cx)*spread;
var py = cy + (value[1] - cy)*spread;
// z comes from the layer's own authored depth: same rule as x/y, the artist's
// placement IS the layout. Uniform card size + per-card z is how UI rigs get their
// size variation — never bake different sizes into the sources.
var z = (value.length > 2 ? value[2] : 0) + zAmp*Math.sin(idx*2.399);
var sx = px + (gx - px)*ce;
var sy = py + (gy - py)*ce;
z = z*(1 - ce);
// AE's default camera distance is comp_width / 0.72 (0.72 = 2*tan(half of the default
// ~39.6 deg horizontal FOV). Measured: 1920-wide comp -> 2666.67, 1080-wide -> 1500.
// Computing it at runtime means the rig survives being dropped into any aspect ratio;
// hardcoding 2666.67 silently breaks every vertical comp.
var zoom = thisComp.width/0.72;
var f = (zoom + z)/zoom;
var ccx = thisComp.width/2;
var ccy = thisComp.height/2;
[ccx + (sx - ccx)*f, ccy + (sy - ccy)*f, z]'''

SCATTER_SCL = r'''var C = thisComp.layer("AI_@NAME@_CTRL");
var msize = C.effect("Master Size")("Slider")/100;
var col = Math.min(1, Math.max(0, C.effect("Collapse")("Slider")/100));
var stag = C.effect("Stagger")("Slider")/1000;
var gs = C.effect("Gather Scale")("Slider")/100;
var idx = @IDX@;
var n = @COUNT@;
var lag = Math.max(0, Math.min(1, (col*(1 + stag*n) - idx*stag)));
var ce = lag*lag*(3 - 2*lag);
// No depth compensation on scale, deliberately. The position expression multiplies by
// f so the card lands on its intended SCREEN coordinate; if scale did the same, the two
// would cancel AE's camera perspective and z would have no visual effect at all.
// Leaving scale uncompensated is what makes apparent size fall out of depth — which is
// how UI rigs are supposed to work: identical card sources, size differences from z.
var s = value[0]*msize*(1 + (gs - 1)*ce);
[s, s, s]'''

SCATTER_SLIDERS = [
    ("Collapse", 0), ("Spread", 100), ("Stagger", 18), ("Strip Width", 700),
    ("Strip Height", 0), ("Gather Scale", 42), ("Ring CX", 960), ("Ring CY", 540),
    ("Z Depth", 0), ("Master Size", 100),
]

SLIDERS = [
    ("Master Speed", 100), ("Cruise Speed", 260), ("Start Boost", 900),
    ("Ring RX", 700), ("Ring RY", 260), ("Ring CX", 960), ("Ring CY", 540),
    ("Z Depth", 420), ("Master Size", 100), ("Depth Scale", 55), ("Collapse", 0),
    ("Strip Width", 0), ("Gather Scale", 45),
]

JSX = r'''// Generated by make_ring_rig.py — slider-driven elliptical ring rig
// comp: @COMP@   layers: @NLAYERS@   controller: AI_@NAME@_CTRL
app.beginSuppressDialogs();
var REPORT = "@REPORT@";
var log = [];
var undoOpen = false;
try {
  var proj = app.project;
  var comp = null;
  var i;
  for (i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (it instanceof CompItem && String(it.name) === "@COMP@") { comp = it; break; }
  }
  if (comp === null) { throw new Error("comp not found: @COMP@"); }

  var TARGETS = @LAYERS_JSON@;
  var SLIDERS = @SLIDERS_JSON@;

  app.beginUndoGroup("AI ring rig @NAME@");
  undoOpen = true;

  // controller + collapse target, rebuilt idempotently but preserving slider values
  function findLayer(nm) {
    var k;
    for (k = 1; k <= comp.numLayers; k++) { if (String(comp.layer(k).name) === nm) { return comp.layer(k); } }
    return null;
  }
  var ctrlName = "AI_@NAME@_CTRL";
  var tgtName = "AI_@NAME@_Target";

  // Never rebuild an existing controller. An earlier version deleted and recreated it,
  // which preserved slider VALUES but silently destroyed every keyframe the artist had
  // animated on them — re-running the generator wiped the animation. Reuse it instead
  // and only append sliders that are genuinely missing.
  var ctrl = findLayer(ctrlName);
  var cfx, s, q, existing = {}, added = 0;
  if (ctrl === null) {
    ctrl = comp.layers.addNull();
    ctrl.name = ctrlName;
    ctrl.enabled = false;
    ctrl.moveToBeginning();
    cfx = ctrl.property("ADBE Effect Parade");
    log[log.length] = "created controller " + ctrlName;
  } else {
    cfx = ctrl.property("ADBE Effect Parade");
    for (q = 1; q <= cfx.numProperties; q++) { existing[String(cfx.property(q).name)] = true; }
    log[log.length] = "reused existing controller (values + keyframes untouched)";
  }
  for (s = 0; s < SLIDERS.length; s++) {
    if (existing[SLIDERS[s][0]]) { continue; }
    var sl = cfx.addProperty("ADBE Slider Control");
    sl.name = SLIDERS[s][0];
    sl.property(1).setValue(SLIDERS[s][1]);
    added++;
  }
  log[log.length] = "sliders: " + SLIDERS.length + " expected, " + added + " newly added";

  if (findLayer(tgtName) === null) {
    var tg = comp.layers.addNull();
    tg.name = tgtName;
    tg.property("ADBE Transform Group").property("ADBE Position").setValue([960, 540, 0]);
    tg.moveToBeginning();
    log[log.length] = "collapse target " + tgtName + " created at centre";
  }

  var POS = @POS_JSON@;
  var SCL = @SCL_JSON@;
  var ok = 0;
  for (i = 0; i < TARGETS.length; i++) {
    var L = findLayer(TARGETS[i]);
    if (L === null) { log[log.length] = "MISSING layer: " + TARGETS[i]; continue; }
    if (!L.threeDLayer) { L.threeDLayer = true; }
    var tr = L.property("ADBE Transform Group");
    tr.property("ADBE Position").expression = POS[i];
    tr.property("ADBE Scale").expression = SCL[i];
    var err = "";
    try { err = String(tr.property("ADBE Position").expressionError); } catch (ee) { err = ""; }
    if (err !== "") { log[log.length] = "EXPR ERROR on " + TARGETS[i] + ": " + err; }
    else { ok++; }
  }
  log[log.length] = "rigged " + ok + "/" + TARGETS.length + " layers";
  log[log.length] = "DONE";
} catch (err) {
  log[log.length] = "ERR " + String(err);
} finally {
  if (undoOpen) { app.endUndoGroup(); }
  app.endSuppressDialogs(false);
  var f = new File(REPORT);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(log.join("\n"));
  f.close();
}
'''


def build(comp, layers, name, rx, ry, cx, cy, zdepth, zoom, collapse_z, report, layout="ellipse"):
    n = len(layers)
    if layout == "scatter":
        sl = [list(x) for x in SCATTER_SLIDERS]
        for row in sl:
            if row[0] == "Ring CX": row[1] = cx
            elif row[0] == "Ring CY": row[1] = cy
            elif row[0] == "Z Depth": row[1] = zdepth
        # scatter needs a per-layer index, so emit one expression pair per layer
        pos = [SCATTER_POS.replace("@NAME@", name).replace("@ZOOM@", repr(zoom))
                          .replace("@IDX@", str(i)).replace("@COUNT@", str(n))
               for i in range(n)]
        scl = [SCATTER_SCL.replace("@NAME@", name).replace("@ZOOM@", repr(zoom))
                          .replace("@IDX@", str(i)).replace("@COUNT@", str(n))
               for i in range(n)]
    else:
        sl = [list(x) for x in SLIDERS]
        for row in sl:
            if row[0] == "Ring RX": row[1] = rx
            elif row[0] == "Ring RY": row[1] = ry
            elif row[0] == "Ring CX": row[1] = cx
            elif row[0] == "Ring CY": row[1] = cy
            elif row[0] == "Z Depth": row[1] = zdepth
        pos = [POS_EXPR.replace("@NAME@", name).replace("@ZOOM@", repr(zoom))
                       .replace("@COLLAPSEZ@", repr(collapse_z))
                       .replace("@IDX@", str(i)).replace("@COUNT@", str(n))
               for i in range(n)]
        scl = [SCL_EXPR.replace("@NAME@", name).replace("@ZOOM@", repr(zoom))
               for i in range(n)]
    return (JSX
            .replace("@COMP@", comp)
            .replace("@NAME@", name)
            .replace("@NLAYERS@", str(n))
            .replace("@LAYERS_JSON@", json.dumps(layers, ensure_ascii=False))
            .replace("@SLIDERS_JSON@", json.dumps(sl, ensure_ascii=False))
            .replace("@POS_JSON@", json.dumps(pos))
            .replace("@SCL_JSON@", json.dumps(scl))
            .replace("@REPORT@", report))


def main():
    ap = argparse.ArgumentParser(description="Generate a slider-driven ring rig JSX")
    ap.add_argument("--comp", required=True)
    ap.add_argument("--layers", required=True, help="comma-separated layer names already in the comp")
    ap.add_argument("--name", default="Ring", help="rig name; controller becomes AI_<name>_CTRL")
    ap.add_argument("--rx", type=float, default=700)
    ap.add_argument("--ry", type=float, default=260)
    ap.add_argument("--cx", type=float, default=960)
    ap.add_argument("--cy", type=float, default=540)
    ap.add_argument("--z-depth", type=float, default=420, dest="zdepth")
    ap.add_argument("--zoom", type=float, default=2666.6667, help="match the comp camera; 2666.6667 is AE's default for 1080p")
    ap.add_argument("--collapse-z", type=float, default=-260, dest="collapse_z")
    ap.add_argument("--layout", default="ellipse", choices=["ellipse", "scatter"],
                help="ellipse = orbiting ring; scatter = keep authored positions, Collapse gathers to a strip")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    layers = [x.strip() for x in a.layers.split(",") if x.strip()]
    out = a.out or os.path.join("/tmp", "ring_rig_%s.jsx" % a.name)
    report = out.replace(".jsx", "_report.txt")
    src = build(a.comp, layers, a.name, a.rx, a.ry, a.cx, a.cy, a.zdepth, a.zoom, a.collapse_z, report, a.layout)
    with open(out, "w", encoding="utf-8") as f:
        f.write(src)
    print("wrote %s  (%s layout, %d layers, controller AI_%s_CTRL)" % (out, a.layout, len(layers), a.name))
    print("report will land at %s" % report)
    print("send it:  ae_scripts/tools/run_jsx.sh '%s'" % out)


if __name__ == "__main__":
    main()
