// build_circle-expand-reveal.jsx — Motion Agent recipe (ES3)
// Shape-mask transition: a tap on a button in scene A, then scene B is revealed through a circle that
// grows from the button center until it covers the farthest frame corner. Ellipse Size and the button's
// Scale are real Bezier keyframes; scene B layers share one alpha track matte.
(function () {
var COMP_NAME = "Circle";
var W = 1920, H = 1080, FPS = 30, DUR = 3.5;
var A_BG = "#0E0F13", A_INK = "#FFFFFF", BUTTON = "#7C9CFF", B_BG = "#FF7AC6", B_INK = "#0E0F13";
var ORIGIN = [1380, 700], BUTTON_D = 140;
var PRESS_T0 = 0.70, PRESS_T1 = 0.85, PRESS_T2 = 1.05, PRESS_SCALE = 88;     // tap feedback on the button
var REVEAL_T0 = 1.00, REVEAL_T1 = 1.80;
var REVEAL_OUT_INF = 60, REVEAL_IN_INF = 85;
var MARGIN = 8;                                                              // px beyond the farthest corner
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

app.beginUndoGroup("Build circle reveal");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  // scene A (bottom)
  addRectLayer(comp, "BgA", [W, H], hexColor(A_BG), [W / 2, H / 2], 0);
  addTextLayer(comp, "TitleA", "Scene A", "Inter-Black", 160, hexColor(A_INK), [W / 2 - 300, H / 2 - 60], -20);
  var btn = addShapeLayer(comp, "Button");
  addPrimitive(btn, "dot", "ellipse", [BUTTON_D, BUTTON_D], hexColor(BUTTON), 0, null);
  tr(comp.layer("Button")).property("ADBE Position").setValue(ORIGIN);
  // scene B (above), revealed by the matte
  addRectLayer(comp, "BgB", [W, H], hexColor(B_BG), [W / 2, H / 2], 0);
  addTextLayer(comp, "TitleB", "Scene B", "Inter-Black", 160, hexColor(B_INK), [W / 2, H / 2 + 56], -20);
  var m = addShapeLayer(comp, "Matte");
  addPrimitive(m, "circle", "ellipse", [BUTTON_D, BUTTON_D], [1, 1, 1], 0, null);
  // farthest corner from the origin
  var corners = [[0, 0], [W, 0], [0, H], [W, H]], rmax = 0, i;
  for (i = 0; i < 4; i++) { var dx = corners[i][0] - ORIGIN[0], dy = corners[i][1] - ORIGIN[1]; rmax = Math.max(rmax, Math.sqrt(dx * dx + dy * dy)); }
  var endD = 2 * (rmax + MARGIN);
  m = comp.layer("Matte");
  tr(m).property("ADBE Position").setValue(ORIGIN);
  var sz = contentsOf(m).property("circle").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
  setKeys(sz, [[REVEAL_T0, [0, 0], REVEAL_OUT_INF, REVEAL_OUT_INF], [REVEAL_T1, [endD, endD], REVEAL_IN_INF, REVEAL_IN_INF]]);
  comp.layer("BgB").setTrackMatte(m, TrackMatteType.ALPHA);
  comp.layer("TitleB").setTrackMatte(comp.layer("Matte"), TrackMatteType.ALPHA);
  comp.layer("Matte").enabled = false;
  setKeys(tr(comp.layer("Button")).property("ADBE Scale"), [[PRESS_T0, [100, 100], 70, 70], [PRESS_T1, [PRESS_SCALE, PRESS_SCALE], 60, 60], [PRESS_T2, [100, 100], 85, 85]]);
  comp.layer("Matte").selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " rmax=" + rmax + " endD=" + endD);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
