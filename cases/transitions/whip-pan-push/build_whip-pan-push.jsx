// build_whip-pan-push.jsx — Motion Agent recipe (ES3)
// Whip-pan / push between two full-screen color scenes. One PUSH RIG null carries the Position keys;
// scene A sits at rig-local 0, scene B one frame-width to the right, so the seam can never open.
// A Directional Blur adjustment layer has Blur Length keys that peak at the fastest frame.
(function () {
var COMP_NAME = "Whip";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var SCENES = [{ name: "A", bg: "#7C9CFF", ink: "#0E0F13", title: "Scene A" }, { name: "B", bg: "#FF7AC6", ink: "#0E0F13", title: "Scene B" }];
var PUSH_T0 = 1.60, PUSH_T1 = 2.10;              // 0.5 s push (15 frames)
var PUSH_OUT_INF = 85, PUSH_IN_INF = 85;          // steep S: slow-fast-slow, speed 0 at both ends
var BLUR_PEAK = 140, BLUR_DIR = 90;               // Directional Blur length (px) at mid-push, direction 90 = horizontal
var BLUR_OUT_INF = 70, BLUR_IN_INF = 70;
var OVERSCAN = 160;                               // scene plates are wider than the frame so the blur never samples empty edges
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

app.beginUndoGroup("Build whip pan push");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  var i;
  for (i = 0; i < SCENES.length; i++) {
    var cx = W / 2 + i * W;
    // overscan only on the outer side (A left, B right) and top/bottom; overlapping plates would move the seam
    var side = (i === 0) ? -1 : 1;
    addRectLayer(comp, "Bg" + SCENES[i].name, [W + OVERSCAN, H + 2 * OVERSCAN], hexColor(SCENES[i].bg), [cx + side * OVERSCAN / 2, H / 2], 0);
    addTextLayer(comp, "Title" + SCENES[i].name, SCENES[i].title, "Inter-Black", 180, hexColor(SCENES[i].ink), [cx, H / 2 + 64], -20);
  }
  var adj = comp.layers.addSolid([1, 1, 1], COMP_NAME + "Blur", W, H, 1, DUR);
  adj.name = "Blur"; adj.adjustmentLayer = true;
  comp.layer("Blur").property("ADBE Effect Parade").addProperty("ADBE Motion Blur");
  var rig = comp.layers.addNull(DUR); rig.name = "Rig"; rig.source.name = COMP_NAME + "Rig";
  // parent at t=0 while the rig is at frame center: children keep their world positions
  rig = comp.layer("Rig");
  tr(rig).property("ADBE Position").setValue([W / 2, H / 2]);
  for (i = 0; i < SCENES.length; i++) {
    comp.layer("Bg" + SCENES[i].name).parent = rig;
    comp.layer("Title" + SCENES[i].name).parent = rig;
  }
  setKeys(tr(rig).property("ADBE Position"), [[PUSH_T0, [W / 2, H / 2], PUSH_OUT_INF, PUSH_OUT_INF], [PUSH_T1, [W / 2 - W, H / 2], PUSH_IN_INF, PUSH_IN_INF]]);
  var db = comp.layer("Blur").property("ADBE Effect Parade").property("ADBE Motion Blur");
  db.property("ADBE Motion Blur-0001").setValue(BLUR_DIR);
  var mid = (PUSH_T0 + PUSH_T1) / 2;
  setKeys(db.property("ADBE Motion Blur-0002"), [[PUSH_T0, 0, BLUR_OUT_INF, BLUR_OUT_INF], [mid, BLUR_PEAK, BLUR_IN_INF, BLUR_OUT_INF], [PUSH_T1, 0, BLUR_IN_INF, BLUR_IN_INF]]);
  comp.layer("Rig").selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " blurDir=" + db.property("ADBE Motion Blur-0001").value);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
