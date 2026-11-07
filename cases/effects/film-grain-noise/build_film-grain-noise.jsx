// build_film-grain-noise.jsx — Motion Agent recipe (ES3)
// Film grain system: an Overlay "Texture" layer (Fractal Noise, fine scale, evolution keyed linearly so the
// grain re-rolls every frame) plus a Noise adjustment layer, both driven by ONE controller (Amount, Size).
// The scene underneath has a slow keyed push so the grain is judged on moving content.
(function () {
var COMP_NAME = "Grain";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var BG = "#4A4560", CARD = "#F2F0EA", INK = "#1A1824";
var AMOUNT = 40;               // 0..100 grain amount (one knob)
var TEX_PER_AMOUNT = 0.5;      // Texture opacity = Amount * 0.5  (Amount 40 -> 20 %, 100 -> 50 %)
var NOISE_PER_AMOUNT = 0.05;   // Noise amount   = Amount * 0.05 (Amount 40 -> 2 %, 100 -> 5 %)
var SIZE = 10;                 // Fractal Noise scale (%): smaller = finer grain (28 read as blotches at 1080p)
var CONTRAST = 160, COMPLEXITY = 2;
var EVO_PER_SEC = 360 * 15;    // evolution degrees per second (keyed LINEAR): 180 deg per frame at 30 fps
var PUSH_FROM = 100, PUSH_TO = 104, PUSH_INF = 60;
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

var CTRL = "Ctrl";
function ctrlRef(n) { return 'thisComp.layer("' + CTRL + '").effect("' + n + '")("Slider")'; }
app.beginUndoGroup("Build film grain");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  addRectLayer(comp, "Card", [1000, 520], hexColor(CARD), [1160, 540], 56);
  addTextLayer(comp, "Title", "Grain", "Inter-Black", 220, hexColor(INK), [1160, 620], -20);
  var noise = comp.layers.addSolid([1, 1, 1], COMP_NAME + "Noise", W, H, 1, DUR);
  noise.name = "Noise"; noise.adjustmentLayer = true;
  comp.layer("Noise").property("ADBE Effect Parade").addProperty("ADBE Noise2");
  var tex = comp.layers.addSolid([0.5, 0.5, 0.5], COMP_NAME + "Texture", W, H, 1, DUR);
  tex.name = "Texture";
  comp.layer("Texture").property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
  var ctrl = comp.layers.addNull(DUR); ctrl.name = CTRL; ctrl.source.name = COMP_NAME + "Ctrl";
  comp.layer(CTRL).property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Amount";
  comp.layer(CTRL).property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Size";
  // ---- values ----
  var cfx = comp.layer(CTRL).property("ADBE Effect Parade");
  cfx.property("Amount").property(1).setValue(AMOUNT);
  cfx.property("Size").property(1).setValue(SIZE);
  tex = comp.layer("Texture");
  tex.blendingMode = BlendingMode.OVERLAY;
  var fn = tex.property("ADBE Effect Parade").property("ADBE Fractal Noise");
  fn.property("ADBE Fractal Noise-0004").setValue(CONTRAST);
  fn.property("ADBE Fractal Noise-0015").setValue(COMPLEXITY);
  fn.property("ADBE Fractal Noise-0010").expression = '// one knob for grain size\n' + ctrlRef("Size") + ';';
  var evo = fn.property("ADBE Fractal Noise-0023");
  evo.setValueAtTime(0, 0); evo.setValueAtTime(DUR, EVO_PER_SEC * DUR);
  evo.setInterpolationTypeAtKey(1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
  evo.setInterpolationTypeAtKey(2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
  tr(tex).property("ADBE Opacity").expression = '// why an expression: one Amount slider drives two effects on two layers\nMath.max(0, Math.min(100, ' + ctrlRef("Amount") + ' * ' + TEX_PER_AMOUNT + '));';
  var nz = comp.layer("Noise").property("ADBE Effect Parade").property("ADBE Noise2");
  nz.property("ADBE Noise2-0001").expression = 'Math.max(0, ' + ctrlRef("Amount") + ' * ' + NOISE_PER_AMOUNT + ');';
  nz.property("ADBE Noise2-0002").setValue(1);   // color noise on (1 = checked)
  // slow push on the card + title (keyframes)
  setKeys(tr(comp.layer("Card")).property("ADBE Scale"), [[0, [PUSH_FROM, PUSH_FROM], PUSH_INF, PUSH_INF], [DUR, [PUSH_TO, PUSH_TO], PUSH_INF, PUSH_INF]]);
  setKeys(tr(comp.layer("Title")).property("ADBE Scale"), [[0, [PUSH_FROM, PUSH_FROM], PUSH_INF, PUSH_INF], [DUR, [PUSH_TO, PUSH_TO], PUSH_INF, PUSH_INF]]);
  comp.layer(CTRL).selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " blend=" + tex.blendingMode);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
