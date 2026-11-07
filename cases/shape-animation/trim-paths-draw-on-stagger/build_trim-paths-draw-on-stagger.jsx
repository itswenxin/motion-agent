// build_trim-paths-draw-on-stagger.jsx — Motion Agent recipe (ES3)
// Five open Bezier paths draw on with Trim Paths End, staggered, round caps; then draw off with Trim Start.
// Every path has its own Trim Paths inside its group; all timing is real Bezier keyframes.
(function () {
var COMP_NAME = "DrawOn";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var BG = "#0E0F13";
var COLORS = ["#7C9CFF", "#9A8CFF", "#B97DF0", "#DE7BD9", "#FF7AC6"];
var LINE_SPACING = 90, HALF_W = 620, WAVE = 95, HANDLE = 140;  // path geometry (px)
var STROKE_W = 22, CAP = 2, JOIN = 2;                          // 2 = round cap / round join
var DRAW_START = 0.30, STAGGER = 0.10, DRAW_DUR = 1.00;        // draw-on (Trim End 0 -> 100)
var DRAW_OUT_INF = 70, DRAW_IN_INF = 85;                       // key1 outgoing / key2 incoming influence
var OFF_START = 2.60, OFF_DUR = 0.80;                          // draw-off (Trim Start 0 -> 100)
var OFF_OUT_INF = 80, OFF_IN_INF = 60;
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

app.beginUndoGroup("Build trim paths draw-on");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  var L = addShapeLayer(comp, "Strokes");
  tr(L).property("ADBE Position").setValue([W / 2, H / 2]);
  var n = COLORS.length, i;
  // phase 1: structure (groups, path, stroke, trim)
  for (i = 0; i < n; i++) {
    var gname = "Line" + (i + 1);
    contentsOf(L).addProperty("ADBE Vector Group").name = gname;
    contentsOf(L).property(gname).property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
    contentsOf(L).property(gname).property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
    contentsOf(L).property(gname).property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim");
  }
  // phase 2: resolve by name, set values and keys
  for (i = 0; i < n; i++) {
    var vg = contentsOf(comp.layer("Strokes")).property("Line" + (i + 1)).property("ADBE Vectors Group");
    var y = (i - (n - 1) / 2) * LINE_SPACING;
    var sh = new Shape();
    sh.vertices = [[-HALF_W, y], [-HALF_W / 3, y - WAVE], [HALF_W / 3, y + WAVE], [HALF_W, y]];
    sh.inTangents = [[0, 0], [-HANDLE, 0], [-HANDLE, 0], [-HANDLE, 0]];
    sh.outTangents = [[HANDLE, 0], [HANDLE, 0], [HANDLE, 0], [0, 0]];
    sh.closed = false;
    vg.property("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(sh);
    var st = vg.property("ADBE Vector Graphic - Stroke");
    st.property("ADBE Vector Stroke Color").setValue(hexColor(COLORS[i]));
    st.property("ADBE Vector Stroke Width").setValue(STROKE_W);
    st.property("ADBE Vector Stroke Line Cap").setValue(CAP);
    st.property("ADBE Vector Stroke Line Join").setValue(JOIN);
    var trim = vg.property("ADBE Vector Filter - Trim");
    var t0 = DRAW_START + i * STAGGER, t1 = OFF_START + i * STAGGER;
    setKeys(trim.property("ADBE Vector Trim End"), [[t0, 0, DRAW_OUT_INF, DRAW_OUT_INF], [t0 + DRAW_DUR, 100, DRAW_IN_INF, DRAW_IN_INF]]);
    setKeys(trim.property("ADBE Vector Trim Start"), [[t1, 0, OFF_OUT_INF, OFF_OUT_INF], [t1 + OFF_DUR, 100, OFF_IN_INF, OFF_IN_INF]]);
  }
  comp.layer("Strokes").selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
