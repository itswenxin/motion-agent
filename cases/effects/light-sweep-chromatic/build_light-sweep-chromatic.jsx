// build_light-sweep-chromatic.jsx — Motion Agent recipe (ES3)
// Light sweep + chromatic shimmer on a title. Three copies of the title (R, G, B) each get
// CC Light Sweep then Shift Channels (keep one channel), stacked with Add, so at rest they sum to white.
// While the sweep passes, R and B split sideways (Position keys) for a chromatic fringe.
(function () {
var COMP_NAME = "Sweep";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var BG = "#0E0F13", INK = "#9AA3BD";                    // title must NOT be pure white, or the sweep has nothing to brighten
var TITLE = "Aurora", FONT = "Inter-Black", SIZE = 280, TRACKING = -10, BASE_Y = 640;
var SWEEP_T0 = 0.8, SWEEP_T1 = 2.0, SWEEP_PAD = 260;        // sweep center travels from left-PAD to right+PAD (comp px)
var SWEEP_OUT_INF = 55, SWEEP_IN_INF = 55;
var SWEEP_DIR = -25, SWEEP_WIDTH = 70, SWEEP_INT = 80, EDGE_INT = 100, EDGE_THICK = 3, SWEEP_SHAPE = 3;
var SPLIT = 14, SPLIT_OUT_INF = 60, SPLIT_IN_INF = 80;     // px each side at mid-sweep
var FULL_OFF = 10;                                          // Shift Channels menu: 1 Alpha 2 Red 3 Green 4 Blue 5 Luminance 6 Hue 7 Lightness 8 Saturation 9 Full On 10 Full Off
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

app.beginUndoGroup("Build light sweep");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  var names = ["TitleR", "TitleG", "TitleB"], i;
  for (i = 0; i < 3; i++) {
    addTextLayer(comp, names[i], TITLE, FONT, SIZE, hexColor(INK), [W / 2, BASE_Y], TRACKING);
    comp.layer(names[i]).property("ADBE Effect Parade").addProperty("CC Light Sweep");
    comp.layer(names[i]).property("ADBE Effect Parade").addProperty("ADBE Shift Channels");
  }
  var r = comp.layer("TitleG").sourceRectAtTime(0, false);
  var left = W / 2 + r.left, right = left + r.width, cy = BASE_Y + r.top + r.height / 2;
  var keep = { TitleR: 2, TitleG: 3, TitleB: 4 };   // which "Take X From" stays on its own channel
  for (i = 0; i < 3; i++) {
    var L = comp.layer(names[i]);
    if (i > 0) { L.blendingMode = BlendingMode.ADD; }
    var fx = L.property("ADBE Effect Parade");
    var ls = fx.property("CC Light Sweep");
    ls.property("CC Light Sweep-0002").setValue(SWEEP_DIR);
    ls.property("CC Light Sweep-0003").setValue(SWEEP_SHAPE);
    ls.property("CC Light Sweep-0004").setValue(SWEEP_WIDTH);
    ls.property("CC Light Sweep-0005").setValue(SWEEP_INT);
    ls.property("CC Light Sweep-0006").setValue(EDGE_INT);
    ls.property("CC Light Sweep-0007").setValue(EDGE_THICK);
    var sc = fx.property("ADBE Shift Channels");
    sc.property("ADBE Shift Channels-0002").setValue(names[i] === "TitleR" ? 2 : FULL_OFF);
    sc.property("ADBE Shift Channels-0003").setValue(names[i] === "TitleG" ? 3 : FULL_OFF);
    sc.property("ADBE Shift Channels-0004").setValue(names[i] === "TitleB" ? 4 : FULL_OFF);
    var cen = ls.property("CC Light Sweep-0001");
    if (names[i] === "TitleG") {
      // text is continuously rasterized: the sweep center is in comp pixels
      setKeys(cen, [[SWEEP_T0, [left - SWEEP_PAD, cy], SWEEP_OUT_INF, SWEEP_OUT_INF], [SWEEP_T1, [right + SWEEP_PAD, cy], SWEEP_IN_INF, SWEEP_IN_INF]]);
    } else {
      // why an expression: R and B must follow the one keyed sweep on TitleG exactly
      cen.expression = 'thisComp.layer("TitleG").effect("CC Light Sweep")("Center");';
    }
  }
  var mid = (SWEEP_T0 + SWEEP_T1) / 2;
  setKeys(tr(comp.layer("TitleR")).property("ADBE Position"), [[SWEEP_T0, [W / 2, BASE_Y], SPLIT_OUT_INF, SPLIT_OUT_INF], [mid, [W / 2 - SPLIT, BASE_Y], SPLIT_IN_INF, SPLIT_OUT_INF], [SWEEP_T1, [W / 2, BASE_Y], SPLIT_IN_INF, SPLIT_IN_INF]]);
  setKeys(tr(comp.layer("TitleB")).property("ADBE Position"), [[SWEEP_T0, [W / 2, BASE_Y], SPLIT_OUT_INF, SPLIT_OUT_INF], [mid, [W / 2 + SPLIT, BASE_Y], SPLIT_IN_INF, SPLIT_OUT_INF], [SWEEP_T1, [W / 2, BASE_Y], SPLIT_IN_INF, SPLIT_IN_INF]]);
  comp.layer("TitleG").selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " textBox left=" + Math.round(left) + " right=" + Math.round(right) + " cy=" + Math.round(cy));
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
