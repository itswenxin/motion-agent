// Audit how this film gets from one section to the next.
// For every layer in final-edit, dump the keyframe times/values of the properties that
// actually carry transitions (opacity, scale, position, rotation) plus any transition-ish
// effects, then cluster them so section boundaries become visible.
// Writes runtime/transitions_audit.txt
app.beginSuppressDialogs();
var OUT = "~/Library/Application Support/Motion Agent/runtime/transitions_audit.txt";
var L = [];
function n2(v) { return String(Math.round(v * 100) / 100); }
function vs(v) {
  if (v instanceof Array) {
    var a = [], i;
    for (i = 0; i < v.length && i < 3; i++) { a[a.length] = n2(v[i]); }
    return "[" + a.join(",") + "]";
  }
  return n2(v);
}
// interpolation type shorthand, so we can see hold vs ease vs linear
function itype(p, k) {
  try {
    var i = p.keyInInterpolationType(k), o = p.keyOutInterpolationType(k);
    function s(t) {
      if (t === KeyframeInterpolationType.HOLD) { return "H"; }
      if (t === KeyframeInterpolationType.BEZIER) { return "B"; }
      if (t === KeyframeInterpolationType.LINEAR) { return "L"; }
      return "?";
    }
    return s(i) + s(o);
  } catch (e) { return "?"; }
}
function dumpProp(tag, p) {
  var nk = 0;
  try { nk = p.numKeys; } catch (e) { return; }
  if (nk < 1) { return; }
  var parts = [], k;
  for (k = 1; k <= nk && k <= 12; k++) {
    parts[parts.length] = n2(p.keyTime(k)) + "s" + itype(p, k) + "=" + vs(p.keyValue(k));
  }
  L[L.length] = "      " + tag + ": " + parts.join("  ");
}
try {
  var proj = app.project, i, j, fe = null;
  for (i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (it instanceof CompItem && String(it.name) === "final-edit") { fe = it; break; }
  }
  if (fe === null) { throw new Error("final-edit not found"); }

  L[L.length] = "===== 有动画的图层（按 in 点排）=====";
  for (i = 1; i <= fe.numLayers; i++) {
    var Ly = fe.layer(i);
    var tg = null;
    try { tg = Ly.property("ADBE Transform Group"); } catch (e0) { continue; }
    if (tg === null) { continue; }
    var names = ["ADBE Opacity", "ADBE Scale", "ADBE Position", "ADBE Rotate Z", "ADBE Anchor Point"];
    var labels = ["opacity", "scale", "position", "rotation", "anchor"];
    var any = false;
    for (j = 0; j < names.length; j++) {
      var p = null;
      try { p = tg.property(names[j]); } catch (eP) { p = null; }
      if (p && p.numKeys > 0) { any = true; }
    }
    // transition-ish effects
    var fxline = "";
    try {
      var g = Ly.property("ADBE Effect Parade");
      if (g) {
        for (j = 1; j <= g.numProperties; j++) {
          var en = String(g.property(j).name);
          var mn = String(g.property(j).matchName);
          if (mn.indexOf("Wipe") >= 0 || mn.indexOf("Transition") >= 0 || mn.indexOf("Dissolve") >= 0 ||
              en.indexOf("消融") >= 0 || en.indexOf("擦除") >= 0 || mn.indexOf("ADBE Ramp") >= 0 ||
              mn.indexOf("Blur") >= 0 || mn.indexOf("Displacement") >= 0 || mn.indexOf("WRPMESH") >= 0) {
            if (fxline !== "") { fxline += ", "; }
            fxline += en + "(" + mn + ")";
          }
        }
      }
    } catch (eF) {}
    if (!any && fxline === "") { continue; }

    var src = "";
    try { if (Ly.source) { src = String(Ly.source.name); } } catch (eS) {}
    L[L.length] = "";
    L[L.length] = "  [" + Ly.index + "] " + Ly.name + "   in " + n2(Ly.inPoint) + " out " + n2(Ly.outPoint) +
                  (src !== "" ? "   src=" + src : "");
    if (fxline !== "") { L[L.length] = "      fx: " + fxline; }
    for (j = 0; j < names.length; j++) {
      var pp = null;
      try { pp = tg.property(names[j]); } catch (eQ) { pp = null; }
      if (pp) { dumpProp(labels[j], pp); }
    }
  }

  // camera moves
  L[L.length] = "";
  L[L.length] = "===== 摄像机 =====";
  for (i = 1; i <= fe.numLayers; i++) {
    var C = fe.layer(i);
    if (!(C instanceof CameraLayer)) { continue; }
    L[L.length] = "  [" + C.index + "] " + C.name + "  in " + n2(C.inPoint) + " out " + n2(C.outPoint) +
                  "  enabled=" + C.enabled;
    var ctg = C.property("ADBE Transform Group");
    dumpProp("pos", ctg.property("ADBE Position"));
    dumpProp("poi", ctg.property("ADBE Anchor Point"));
    try { dumpProp("zoom", C.property("ADBE Camera Options Group").property("ADBE Camera Zoom")); } catch (eZ) {}
  }
} catch (err) {
  L[L.length] = "ERR " + String(err);
} finally {
  app.endSuppressDialogs(false);
  var f = new File(OUT);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(L.join("\n"));
  f.close();
}
