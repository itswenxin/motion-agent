// build_blur-zoom-punch.jsx — Motion Agent recipe (ES3)
// Blur/zoom transition: scene A punches in (Scale accelerates into the cut), hard cut, scene B lands
// from the same over-scale (decelerates out of the cut). Both scale curves meet the cut with the same
// keyed speed; a Fast Box Blur adjustment peaks exactly on the cut frame.
(function () {
var COMP_NAME = "Zoom";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var A = { bg: "#0E0F13", ink: "#FFFFFF", dot: "#7C9CFF", title: "Zoom" }, B = { bg: "#F2F0EA", ink: "#0E0F13", dot: "#FF7AC6", title: "Punch" };
var CUT = 2.0, PUNCH_IN = 0.40, LAND = 0.50;          // A zooms CUT-0.4 -> CUT, B lands CUT -> CUT+0.5
var ZOOM = 180;                                       // % at the cut (both sides)
// A = cubic ease-in 100 -> ZOOM: Bezier handles at 1/3 with value 0 => out/in influence 33.33 %, arrival speed 3*(ZOOM-100)/PUNCH_IN.
// This is the fastest point of A, so speed rises monotonically into the cut (no mid-move speed bump).
var A_OUT_INF = 33.33, A_IN_INF = 33.33, CUT_SPEED = 3 * (ZOOM - 100) / PUNCH_IN;   // 600 %/s
// B leaves the cut with -CUT_SPEED; its out-handle may not undershoot 100 %: influence <= (ZOOM-100)/(CUT_SPEED*LAND) (=26.67 %).
var B_OUT_INF = 100 * (ZOOM - 100) / (CUT_SPEED * LAND), B_IN_INF = 75;
var BLUR_PEAK = 70, BLUR_RAMP = 0.25, BLUR_INF = 60;  // Fast Box Blur radius, ramp each side of the cut
var DOTS = 10, RING_R = 340, DOT_D = 34;
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

function buildScene(comp, key, sc, rootName) {
  addRectLayer(comp, "Bg" + key, [W + 400, H + 400], hexColor(sc.bg), [W / 2, H / 2], 0);
  var ring = addShapeLayer(comp, "Dots" + key);
  for (var i = 0; i < DOTS; i++) { addPrimitive(comp.layer("Dots" + key), "dot " + i, "ellipse", [DOT_D, DOT_D], hexColor(sc.dot), 0, null); }
  for (i = 0; i < DOTS; i++) {
    var a = 2 * Math.PI * i / DOTS;
    contentsOf(comp.layer("Dots" + key)).property("dot " + i).property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([Math.cos(a) * RING_R, Math.sin(a) * RING_R]);
  }
  tr(comp.layer("Dots" + key)).property("ADBE Position").setValue([W / 2, H / 2]);
  addTextLayer(comp, "Title" + key, sc.title, "Inter-Black", 170, hexColor(sc.ink), [W / 2, H / 2 + 60], -20);
  var n = comp.layers.addNull(DUR); n.name = rootName; n.source.name = COMP_NAME + rootName;
  tr(comp.layer(rootName)).property("ADBE Position").setValue([W / 2, H / 2]);
  var names = ["Bg" + key, "Dots" + key, "Title" + key];
  for (i = 0; i < names.length; i++) { comp.layer(names[i]).parent = comp.layer(rootName); }
  return names;
}
function setSpan(layer, tin, tout) { layer.inPoint = tin; layer.outPoint = tout; }   // in first, then out (SKILL.md pitfall)
app.beginUndoGroup("Build blur zoom punch");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  var aNames = buildScene(comp, "A", A, "RootA");
  var bNames = buildScene(comp, "B", B, "RootB");
  var adj = comp.layers.addSolid([1, 1, 1], COMP_NAME + "Blur", W, H, 1, DUR);
  adj.name = "Blur"; adj.adjustmentLayer = true;
  comp.layer("Blur").property("ADBE Effect Parade").addProperty("ADBE Box Blur2");
  var i;
  for (i = 0; i < 3; i++) { setSpan(comp.layer(aNames[i]), 0, CUT); setSpan(comp.layer(bNames[i]), CUT, DUR); }
  setSpan(comp.layer("RootA"), 0, CUT); setSpan(comp.layer("RootB"), CUT, DUR);
  // A punch-in: arrives at the cut with +CUT_SPEED %/s
  var sa = tr(comp.layer("RootA")).property("ADBE Scale");
  sa.setValueAtTime(CUT - PUNCH_IN, [100, 100]); sa.setValueAtTime(CUT, [ZOOM, ZOOM]);
  easeKey(sa, 1, A_OUT_INF, A_OUT_INF, 0, 0);
  easeKey(sa, 2, A_IN_INF, A_IN_INF, CUT_SPEED, CUT_SPEED);
  // B land: leaves the cut with -CUT_SPEED %/s (same magnitude, shrinking)
  var sb = tr(comp.layer("RootB")).property("ADBE Scale");
  sb.setValueAtTime(CUT, [ZOOM, ZOOM]); sb.setValueAtTime(CUT + LAND, [100, 100]);
  easeKey(sb, 1, B_OUT_INF, B_OUT_INF, -CUT_SPEED, -CUT_SPEED);
  easeKey(sb, 2, B_IN_INF, B_IN_INF, 0, 0);
  var bb = comp.layer("Blur").property("ADBE Effect Parade").property("ADBE Box Blur2");
  bb.property("ADBE Box Blur2-0002").setValue(2);           // iterations
  bb.property("ADBE Box Blur2-0004").setValue(1);           // repeat edge pixels on
  setKeys(bb.property("ADBE Box Blur2-0001"), [[CUT - BLUR_RAMP, 0, BLUR_INF, BLUR_INF], [CUT, BLUR_PEAK, BLUR_INF, BLUR_INF], [CUT + BLUR_RAMP, 0, BLUR_INF, BLUR_INF]]);
  comp.layer("RootA").selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " A span " + comp.layer("TitleA").inPoint + "-" + comp.layer("TitleA").outPoint + " B span " + comp.layer("TitleB").inPoint + "-" + comp.layer("TitleB").outPoint);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
