// build_throw-inertia-overshoot.jsx — Motion Agent recipe (ES3)
// A chip pops in (Scale) and is thrown along a curved Bezier path (Position). Both moves are real
// keyframes that ARRIVE WITH SPEED; an inertial-bounce expression continues that arrival velocity as a
// decaying oscillation after the last key (amplitude / frequency / decay on three sliders).
(function () {
var COMP_NAME = "Inertia";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var BG = "#0E0F13", CHIP = "#7C9CFF", ICON = "#FFFFFF", GUIDE = "#2A2E37";
var CHIP_SIZE = 220, CHIP_ROUND = 56;
var POP_T0 = 0.10, POP_T1 = 0.40, POP_OUT_INF = 60, POP_IN_INF = 40, POP_ARRIVE_SPEED = 250;   // Scale %/s at landing
var THROW_T0 = 0.60, THROW_T1 = 1.40, P0 = [380, 820], P1 = [1480, 500];
var OUT_TAN = [380, -520], IN_TAN = [-420, -160];           // spatial handles: arc up and over
var THROW_OUT_INF = 70, THROW_IN_INF = 40, THROW_ARRIVE_SPEED = 1400;  // px/s along the path at landing
var TILT = -14;                                             // rotation mid-throw (deg)
var FREQ = 2.2, DECAY = 5.0;                                // inertial bounce sliders (Hz, 1/s)
var AMP = 1 / (2 * Math.PI * FREQ);                         // 0.0723: makes the bounce start with exactly the arrival velocity (no speed jump at the last key)
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

app.beginUndoGroup("Build throw inertia");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  var target = addShapeLayer(comp, "Target");
  addPrimitive(target, "ring", "rect", [CHIP_SIZE + 40, CHIP_SIZE + 40], null, CHIP_ROUND + 16, { color: hexColor(GUIDE), width: 4 });
  tr(comp.layer("Target")).property("ADBE Position").setValue(P1);
  var chip = addShapeLayer(comp, "Chip");
  addPrimitive(chip, "icon", "rect", [90, 26], hexColor(ICON), 13, null);
  addPrimitive(comp.layer("Chip"), "body", "rect", [CHIP_SIZE, CHIP_SIZE], hexColor(CHIP), CHIP_ROUND, null);
  var fx = comp.layer("Chip").property("ADBE Effect Parade");
  fx.addProperty("ADBE Slider Control").name = "Amp";
  comp.layer("Chip").property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Freq";
  comp.layer("Chip").property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Decay";
  chip = comp.layer("Chip");
  fx = chip.property("ADBE Effect Parade");
  fx.property("Amp").property(1).setValue(AMP);
  fx.property("Freq").property(1).setValue(FREQ);
  fx.property("Decay").property(1).setValue(DECAY);
  // Scale pop: arrives at 100 % with speed
  var sc = tr(chip).property("ADBE Scale");
  sc.setValueAtTime(POP_T0, [0, 0]); sc.setValueAtTime(POP_T1, [100, 100]);
  easeKey(sc, 1, POP_OUT_INF, POP_OUT_INF, 0, 0);
  easeKey(sc, 2, POP_IN_INF, POP_IN_INF, POP_ARRIVE_SPEED, POP_ARRIVE_SPEED);
  // Position throw on a curved spatial path
  var pos = tr(chip).property("ADBE Position");
  pos.setValueAtTime(THROW_T0, P0); pos.setValueAtTime(THROW_T1, P1);
  var k1 = pos.nearestKeyIndex(THROW_T0), k2 = pos.nearestKeyIndex(THROW_T1);
  var dim = pos.keyInSpatialTangent(k1).length;
  function tan(a) { return dim === 3 ? [a[0], a[1], 0] : [a[0], a[1]]; }
  pos.setSpatialTangentsAtKey(k1, tan([0, 0]), tan(OUT_TAN));
  pos.setSpatialTangentsAtKey(k2, tan(IN_TAN), tan([0, 0]));
  easeKey(pos, k1, THROW_OUT_INF, THROW_OUT_INF, 0, 0);
  easeKey(pos, k2, THROW_IN_INF, THROW_IN_INF, THROW_ARRIVE_SPEED, THROW_ARRIVE_SPEED);
  // Rotation tilt, keyed (no bounce)
  setKeys(tr(chip).property("ADBE Rotate Z"), [[THROW_T0, 0, 60, 60], [(THROW_T0 + THROW_T1) / 2, TILT, 60, 60], [THROW_T1 + 0.25, 0, 80, 80]]);
  // inertial bounce: continues the velocity the last key arrives with (why: physics that re-derives itself when keys are retimed)
  var bounce =
    'var amp = effect("Amp")("Slider"), freq = effect("Freq")("Slider"), decay = effect("Decay")("Slider");\n' +
    'var out = value;\n' +
    'if (numKeys > 0 && time > key(numKeys).time) {\n' +
    '  var tk = key(numKeys).time, t = time - tk;\n' +
    '  var v = velocityAtTime(tk - thisComp.frameDuration / 10);\n' +
    '  out = value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);\n' +
    '}\nout;';
  tr(chip).property("ADBE Position").expression = bounce;
  tr(chip).property("ADBE Scale").expression = bounce;
  chip.motionBlur = true; comp.motionBlur = true;
  chip.selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " posKeys=" + tr(chip).property("ADBE Position").numKeys);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
