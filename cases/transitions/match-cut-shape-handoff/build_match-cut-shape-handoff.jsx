// build_match-cut-shape-handoff.jsx — Motion Agent recipe (ES3)
// Match cut: an orange disc rises along an arc in scene A; at the cut, scene B's shape takes over with
// identical position, size, roundness and color AND the same velocity, then morphs into a blue rounded
// app tile. Two separate shape layers, all real Bezier keyframes (spatial + temporal).
(function () {
var COMP_NAME = "MatchCut";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var A_BG = "#0E0F13", B_BG = "#F2F0EA", ORANGE = "#FF8A3D", BLUE = "#3D5AFE", B_INK = "#0E0F13";
var CUT = 2.0, SIZE = 300;
// scene A: arc rise
var A_T0 = 0.5, A_P0 = [420, 980], A_P1 = [960, 540], A_OUT_TAN = [300, 0], A_IN_TAN = [0, 260];
var A_SCALE0 = 45;
var A_OUT_INF = 70, A_IN_INF = 45;
var CUT_SPEED = 320;                       // px/s, upward, at the cut (both sides)
var CUT_SCALE_SPEED = 30;                  // %/s at the cut (both sides)
// scene B: continue up, settle; morph circle -> rounded tile, orange -> blue
var B_T1 = 2.6, B_P1 = [960, 470], B_SCALE1 = 112;
var B_OUT_INF = 35, B_IN_INF = 85;
var MORPH_T0 = 2.15, MORPH_T1 = 2.75, TILE_ROUND = 72, MORPH_OUT_INF = 70, MORPH_IN_INF = 85;
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

function setSpan(layer, tin, tout) { layer.inPoint = tin; layer.outPoint = tout; }
function tan2(prop, k, a) { return prop.keyInSpatialTangent(k).length === 3 ? [a[0], a[1], 0] : [a[0], a[1]]; }
app.beginUndoGroup("Build match cut");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "BgA", [W, H], hexColor(A_BG), [W / 2, H / 2], 0);
  var a = addShapeLayer(comp, "Disc");
  addPrimitive(a, "shape", "rect", [SIZE, SIZE], hexColor(ORANGE), SIZE / 2, null);
  addRectLayer(comp, "BgB", [W, H], hexColor(B_BG), [W / 2, H / 2], 0);
  addTextLayer(comp, "TitleB", "Now in your pocket", "Inter-Bold", 72, hexColor(B_INK), [W / 2, 820], -10);
  var b = addShapeLayer(comp, "Tile");
  addPrimitive(b, "shape", "rect", [SIZE, SIZE], hexColor(ORANGE), SIZE / 2, null);
  // spans
  setSpan(comp.layer("BgA"), 0, CUT); setSpan(comp.layer("Disc"), 0, CUT);
  setSpan(comp.layer("BgB"), CUT, DUR); setSpan(comp.layer("Tile"), CUT, DUR); setSpan(comp.layer("TitleB"), CUT, DUR);
  // ---- A: arc rise, arrives at the cut moving up at CUT_SPEED ----
  var ap = tr(comp.layer("Disc")).property("ADBE Position");
  ap.setValueAtTime(A_T0, A_P0); ap.setValueAtTime(CUT, A_P1);
  ap.setSpatialTangentsAtKey(1, tan2(ap, 1, [0, 0]), tan2(ap, 1, A_OUT_TAN));
  ap.setSpatialTangentsAtKey(2, tan2(ap, 2, A_IN_TAN), tan2(ap, 2, [0, 0]));
  easeKey(ap, 1, A_OUT_INF, A_OUT_INF, 0, 0);
  easeKey(ap, 2, A_IN_INF, A_IN_INF, CUT_SPEED, CUT_SPEED);
  var as = tr(comp.layer("Disc")).property("ADBE Scale");
  as.setValueAtTime(A_T0, [A_SCALE0, A_SCALE0]); as.setValueAtTime(CUT, [100, 100]);
  easeKey(as, 1, A_OUT_INF, A_OUT_INF, 0, 0);
  easeKey(as, 2, A_IN_INF, A_IN_INF, CUT_SCALE_SPEED, CUT_SCALE_SPEED);
  // ---- B: starts with A's end state and velocity ----
  var bl = comp.layer("Tile");
  var bp = tr(bl).property("ADBE Position");
  bp.setValueAtTime(CUT, A_P1); bp.setValueAtTime(B_T1, B_P1);
  var up = (B_P1[1] - A_P1[1]) / 3;   // straight up: handles along the motion
  bp.setSpatialTangentsAtKey(1, tan2(bp, 1, [0, 0]), tan2(bp, 1, [0, up]));
  bp.setSpatialTangentsAtKey(2, tan2(bp, 2, [0, -up]), tan2(bp, 2, [0, 0]));
  easeKey(bp, 1, B_OUT_INF, B_OUT_INF, CUT_SPEED, CUT_SPEED);
  easeKey(bp, 2, B_IN_INF, B_IN_INF, 0, 0);
  var bs = tr(bl).property("ADBE Scale");
  bs.setValueAtTime(CUT, [100, 100]); bs.setValueAtTime(B_T1, [B_SCALE1, B_SCALE1]);
  easeKey(bs, 1, B_OUT_INF, B_OUT_INF, CUT_SCALE_SPEED, CUT_SCALE_SPEED);
  easeKey(bs, 2, B_IN_INF, B_IN_INF, 0, 0);
  var vg = contentsOf(bl).property("shape").property("ADBE Vectors Group");
  setKeys(vg.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Roundness"), [[MORPH_T0, SIZE / 2, MORPH_IN_INF, MORPH_OUT_INF], [MORPH_T1, TILE_ROUND, MORPH_IN_INF, MORPH_OUT_INF]]);
  setKeys(vg.property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color"), [[MORPH_T0, hexColor(ORANGE), MORPH_IN_INF, MORPH_OUT_INF], [MORPH_T1, hexColor(BLUE), MORPH_IN_INF, MORPH_OUT_INF]]);
  // title fades up after the morph
  var tl = comp.layer("TitleB");
  setKeys(tr(tl).property("ADBE Opacity"), [[2.5, 0, 70, 70], [2.9, 100, 85, 85]]);
  setKeys(tr(tl).property("ADBE Position"), [[2.5, [W / 2, 850], 70, 70], [2.9, [W / 2, 820], 85, 85]]);
  bl.selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
