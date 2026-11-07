// build_micro-interactions-trio.jsx — Motion Agent recipe (ES3)
// Three UI micro-interactions in one comp, all on real Bezier keyframes:
//  row 1 loading spinner (Trim Start/End chase + held Offset jumps + linear Rotation),
//  row 2 progress bar (Trim End steps on a round-capped line, % label via Source Text expression),
//  row 3 toggle switch (knob Position + squash Scale, track Fill Color, off -> on -> off).
(function () {
var COMP_NAME = "Micro";
var W = 1920, H = 1080, FPS = 30, DUR = 4.5;
var BG = "#0E0F13", LABEL = "#9AA0AA", ACCENT = "#7C9CFF", TRACK = "#2A2E37", OFF = "#3A3F4B", ON = "#5EE0B5";
var ROW_Y = [300, 540, 780], LABEL_X = 620, COMP_X = 1180;
var LABELS = ["Loading", "Uploading", "Notifications"];
// spinner
var SPIN_D = 96, SPIN_STROKE = 12, SPIN_CYCLE = 1.5, SPIN_MIN = 3, SPIN_MAX = 78, SPIN_TURNS_PER_S = 0.75;
var SPIN_OUT_INF = 75, SPIN_IN_INF = 75;
// progress
var BAR_W = 640, BAR_STROKE = 16;
var BAR_KEYS = [[0.3, 0], [1.1, 38], [1.6, 38], [2.4, 74], [2.7, 74], [3.4, 100]];   // [t, %] holds between steps
var BAR_OUT_INF = 65, BAR_IN_INF = 85;
// toggle
var TRACK_W = 168, TRACK_H = 92, KNOB = 72, KNOB_TRAVEL = 38;
var ON_T = 1.0, OFF_T = 3.0, TOGGLE_DUR = 0.35, SQUASH = 118;
var TOG_OUT_INF = 70, TOG_IN_INF = 90;
// ---------- shared helpers (ES3) ----------
var LOG = [];
function log(s) { LOG.push(String(s)); }
function flushLog() {
  if ($.global.MA_LOG) { var f = new File($.global.MA_LOG); f.encoding = "UTF-8"; f.lineFeed = "Unix"; f.open("w"); f.write(LOG.join("\n") + "\n"); f.close(); }
}
// idempotent rebuild: removes the comp with this name and the solids this script created (solid names start with the comp name)
function removeOld(compName) {
  for (var i = app.project.numItems; i >= 1; i--) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name === compName) { it.remove(); }
    else if (it instanceof FootageItem && it.mainSource instanceof SolidSource && it.name.indexOf(compName) === 0) { it.remove(); }
  }
}
function tr(layer) { return layer.property("ADBE Transform Group"); }
function contentsOf(layer) { return layer.property("ADBE Root Vectors Group"); }
// Bezier ease on key k: speeds 0 unless given; influence in % (0.1..100)
function easeKey(prop, k, inInf, outInf, inSpd, outSpd) {
  var n = prop.keyInTemporalEase(k).length;
  var a = [], b = [];
  for (var j = 0; j < n; j++) { a.push(new KeyframeEase(inSpd ? inSpd : 0, inInf)); b.push(new KeyframeEase(outSpd ? outSpd : 0, outInf)); }
  prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setTemporalEaseAtKey(k, a, b);
}
// keys: array of [time, value, inInf, outInf]
function setKeys(prop, keys) {
  var i;
  for (i = 0; i < keys.length; i++) { prop.setValueAtTime(keys[i][0], keys[i][1]); }
  for (i = 0; i < keys.length; i++) { var k = prop.nearestKeyIndex(keys[i][0]); easeKey(prop, k, keys[i][2], keys[i][3]); }
}
function addShapeLayer(comp, name) { var L = comp.layers.addShape(); L.name = name; return L; }
// adds a group with one parametric primitive + fill (+ optional stroke); resolves refs again after every addProperty
function addPrimitive(layer, grpName, kind, size, color, roundness, stroke) {
  var g = contentsOf(layer).addProperty("ADBE Vector Group"); g.name = grpName;
  var primMN = (kind === "ellipse") ? "ADBE Vector Shape - Ellipse" : "ADBE Vector Shape - Rect";
  contentsOf(layer).property(grpName).property("ADBE Vectors Group").addProperty(primMN);
  if (color) { contentsOf(layer).property(grpName).property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill"); }
  if (stroke) { contentsOf(layer).property(grpName).property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke"); }
  var vg = contentsOf(layer).property(grpName).property("ADBE Vectors Group");
  var prim = vg.property(primMN);
  prim.property(kind === "ellipse" ? "ADBE Vector Ellipse Size" : "ADBE Vector Rect Size").setValue(size);
  if (kind !== "ellipse" && roundness) { prim.property("ADBE Vector Rect Roundness").setValue(roundness); }
  if (color) { vg.property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(color); }
  if (stroke) {
    var st = vg.property("ADBE Vector Graphic - Stroke");
    st.property("ADBE Vector Stroke Color").setValue(stroke.color);
    st.property("ADBE Vector Stroke Width").setValue(stroke.width);
    if (stroke.cap) { st.property("ADBE Vector Stroke Line Cap").setValue(stroke.cap); }
  }
  return contentsOf(layer).property(grpName);
}
function addRectLayer(comp, name, size, color, pos, roundness) {
  var L = addShapeLayer(comp, name);
  addPrimitive(L, "box", "rect", size, color, roundness, null);
  tr(L).property("ADBE Position").setValue(pos);
  return L;
}
function addTextLayer(comp, name, str, font, size, color, pos, tracking) {
  var L = comp.layers.addText(str); L.name = name;
  var sp = L.property("ADBE Text Properties").property("ADBE Text Document");
  var td = sp.value;
  td.resetCharStyle(); td.resetParagraphStyle();
  td.font = font; td.fontSize = size; td.applyFill = true; td.fillColor = color; td.applyStroke = false;
  td.justification = ParagraphJustification.CENTER_JUSTIFY;
  if (tracking) { td.tracking = tracking; }
  sp.setValue(td);
  tr(L).property("ADBE Position").setValue(pos);
  return L;
}
function hexColor(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
// ---------- end helpers ----------

app.beginUndoGroup("Build micro-interactions");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  var i;
  for (i = 0; i < 3; i++) { addTextLayer(comp, "Label" + (i + 1), LABELS[i], "Inter-Medium", 44, hexColor(LABEL), [LABEL_X, ROW_Y[i] + 16], 0); }
  // ---------- structure ----------
  var sp = addShapeLayer(comp, "SpinTrack");
  addPrimitive(sp, "ring", "ellipse", [SPIN_D, SPIN_D], null, 0, { color: hexColor(TRACK), width: SPIN_STROKE });
  var s2 = addShapeLayer(comp, "Spinner");
  addPrimitive(s2, "arc", "ellipse", [SPIN_D, SPIN_D], null, 0, { color: hexColor(ACCENT), width: SPIN_STROKE, cap: 2 });
  contentsOf(comp.layer("Spinner")).property("arc").property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim");
  var bt = addShapeLayer(comp, "BarTrack");
  contentsOf(bt).addProperty("ADBE Vector Group").name = "line";
  contentsOf(comp.layer("BarTrack")).property("line").property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
  contentsOf(comp.layer("BarTrack")).property("line").property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
  var bf = addShapeLayer(comp, "Bar");
  contentsOf(bf).addProperty("ADBE Vector Group").name = "line";
  contentsOf(comp.layer("Bar")).property("line").property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
  contentsOf(comp.layer("Bar")).property("line").property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
  contentsOf(comp.layer("Bar")).property("line").property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim");
  addTextLayer(comp, "Percent", "0%", "Inter-SemiBold", 40, [1, 1, 1], [COMP_X + BAR_W / 2 + 100, ROW_Y[1] + 14], 0);
  var tg = addShapeLayer(comp, "Toggle");
  addPrimitive(tg, "track", "rect", [TRACK_W, TRACK_H], hexColor(OFF), TRACK_H / 2, null);
  var kn = addShapeLayer(comp, "Knob");
  addPrimitive(kn, "knob", "ellipse", [KNOB, KNOB], [1, 1, 1], 0, null);
  // ---------- values + keys ----------
  // spinner
  tr(comp.layer("SpinTrack")).property("ADBE Position").setValue([COMP_X, ROW_Y[0]]);
  var spl = comp.layer("Spinner");
  tr(spl).property("ADBE Position").setValue([COMP_X, ROW_Y[0]]);
  var trim = contentsOf(spl).property("arc").property("ADBE Vectors Group").property("ADBE Vector Filter - Trim");
  var te = trim.property("ADBE Vector Trim End"), ts = trim.property("ADBE Vector Trim Start"), to = trim.property("ADBE Vector Trim Offset");
  var cycles = Math.ceil(DUR / SPIN_CYCLE), c, half = SPIN_CYCLE / 2;
  var last = SPIN_CYCLE - 1 / FPS, holdKeysE = [], holdKeysS = [];
  for (c = 0; c < cycles; c++) {
    var t0 = c * SPIN_CYCLE;
    // grow: End leads 0 -> half cycle; shrink: Start catches up half -> end of cycle.
    te.setValueAtTime(t0, SPIN_MIN); te.setValueAtTime(t0 + half, SPIN_MAX); te.setValueAtTime(t0 + last, SPIN_MAX);
    ts.setValueAtTime(t0, 0); ts.setValueAtTime(t0 + half, 0); ts.setValueAtTime(t0 + last, SPIN_MAX - SPIN_MIN);
    holdKeysE.push(t0 + last); holdKeysS.push(t0 + last);
    // next cycle restarts at Start 0 / End MIN; Offset jumps by the distance travelled (HOLD) so the arc does not move
    to.setValueAtTime(t0, c * (SPIN_MAX - SPIN_MIN) * 3.6);
  }
  for (c = 1; c <= te.numKeys; c++) { easeKey(te, c, SPIN_IN_INF, SPIN_OUT_INF); }
  for (c = 1; c <= ts.numKeys; c++) { easeKey(ts, c, SPIN_IN_INF, SPIN_OUT_INF); }
  for (c = 0; c < holdKeysE.length; c++) {
    te.setInterpolationTypeAtKey(te.nearestKeyIndex(holdKeysE[c]), KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.HOLD);
    ts.setInterpolationTypeAtKey(ts.nearestKeyIndex(holdKeysS[c]), KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.HOLD);
  }
  for (c = 1; c <= to.numKeys; c++) { to.setInterpolationTypeAtKey(c, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); }
  var rot = tr(spl).property("ADBE Rotate Z");
  rot.setValueAtTime(0, 0); rot.setValueAtTime(DUR, 360 * SPIN_TURNS_PER_S * DUR);
  rot.setInterpolationTypeAtKey(1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
  rot.setInterpolationTypeAtKey(2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
  // progress bar
  var names = ["BarTrack", "Bar"];
  for (i = 0; i < 2; i++) {
    var vg = contentsOf(comp.layer(names[i])).property("line").property("ADBE Vectors Group");
    var sh = new Shape(); sh.vertices = [[-BAR_W / 2, 0], [BAR_W / 2, 0]]; sh.closed = false;
    vg.property("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(sh);
    var st = vg.property("ADBE Vector Graphic - Stroke");
    st.property("ADBE Vector Stroke Color").setValue(hexColor(i === 0 ? TRACK : ACCENT));
    st.property("ADBE Vector Stroke Width").setValue(BAR_STROKE);
    st.property("ADBE Vector Stroke Line Cap").setValue(2);
    tr(comp.layer(names[i])).property("ADBE Position").setValue([COMP_X, ROW_Y[1]]);
  }
  var be = contentsOf(comp.layer("Bar")).property("line").property("ADBE Vectors Group").property("ADBE Vector Filter - Trim").property("ADBE Vector Trim End");
  var bk = [];
  for (i = 0; i < BAR_KEYS.length; i++) { bk.push([BAR_KEYS[i][0], BAR_KEYS[i][1], BAR_IN_INF, BAR_OUT_INF]); }
  setKeys(be, bk);
  comp.layer("Percent").property("ADBE Text Properties").property("ADBE Text Document").expression =
    '// why an expression: keyframes cannot turn a number into a label\n' +
    'Math.round(thisComp.layer("Bar").content("line").content("Trim Paths 1").end) + "%";';
  // toggle
  tr(comp.layer("Toggle")).property("ADBE Position").setValue([COMP_X, ROW_Y[2]]);
  var fill = contentsOf(comp.layer("Toggle")).property("track").property("ADBE Vectors Group").property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color");
  setKeys(fill, [[ON_T, hexColor(OFF), TOG_IN_INF, TOG_OUT_INF], [ON_T + TOGGLE_DUR, hexColor(ON), TOG_IN_INF, TOG_OUT_INF],
                 [OFF_T, hexColor(ON), TOG_IN_INF, TOG_OUT_INF], [OFF_T + TOGGLE_DUR, hexColor(OFF), TOG_IN_INF, TOG_OUT_INF]]);
  var kp = tr(comp.layer("Knob")).property("ADBE Position");
  var xo = COMP_X - KNOB_TRAVEL, xn = COMP_X + KNOB_TRAVEL, ky = ROW_Y[2];
  setKeys(kp, [[ON_T, [xo, ky], TOG_IN_INF, TOG_OUT_INF], [ON_T + TOGGLE_DUR, [xn, ky], TOG_IN_INF, TOG_OUT_INF],
               [OFF_T, [xn, ky], TOG_IN_INF, TOG_OUT_INF], [OFF_T + TOGGLE_DUR, [xo, ky], TOG_IN_INF, TOG_OUT_INF]]);
  var ks = tr(comp.layer("Knob")).property("ADBE Scale");
  var mid1 = ON_T + TOGGLE_DUR / 2, mid2 = OFF_T + TOGGLE_DUR / 2;
  setKeys(ks, [[ON_T, [100, 100], TOG_IN_INF, TOG_OUT_INF], [mid1, [SQUASH, 100 - (SQUASH - 100) / 2], 50, 50], [ON_T + TOGGLE_DUR, [100, 100], TOG_IN_INF, TOG_OUT_INF],
               [OFF_T, [100, 100], TOG_IN_INF, TOG_OUT_INF], [mid2, [SQUASH, 100 - (SQUASH - 100) / 2], 50, 50], [OFF_T + TOGGLE_DUR, [100, 100], TOG_IN_INF, TOG_OUT_INF]]);
  comp.layer("Knob").selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " spinnerEndKeys=" + te.numKeys + " offsetKeys=" + to.numKeys);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
