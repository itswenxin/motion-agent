// build_card-list-stagger.jsx — Motion Agent recipe (ES3)
// List entrance stagger system: CARD 01 carries the real Bezier keyframes (Position / Opacity / Scale,
// entrance + exit). Every other card replays CARD 01's curves delayed by index × "Stagger" from one
// controller null. Edit the master curve in the Graph Editor and the whole list follows.
(function () {
var COMP_NAME = "Stagger";
var W = 1920, H = 1080, FPS = 30, DUR = 4.5;
var BG = "#0E0F13", CARD = "#1A1D24", AVATAR = ["#7C9CFF", "#B97DF0", "#FF7AC6", "#FFB86B", "#5EE0B5"], BAR = "#3A3F4B", BAR2 = "#2A2E37";
var COUNT = 5, CARD_W = 900, CARD_H = 120, RADIUS = 28, SPACING = 150;
var STAGGER = 0.08;                                  // seconds between cards (slider on LIST CTRL)
var IN_T0 = 0.30, IN_DUR = 0.60, RISE = 80, SCALE_FROM = 94;
var IN_OUT_INF = 70, IN_IN_INF = 85;                 // entrance: key1 outgoing / key2 incoming influence
var OUT_T0 = 3.30, OUT_DUR = 0.45, LIFT = 40;
var OUT_OUT_INF = 85, OUT_IN_INF = 40;               // exit: slow start, quick leave
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
app.beginUndoGroup("Build card list stagger");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  var y0 = H / 2 - (COUNT - 1) * SPACING / 2, i;
  // structure: one shape layer per card (card + avatar + 2 text bars), bottom card first so CARD 01 is on top
  for (i = COUNT - 1; i >= 0; i--) {
    var nm = "Card" + (i + 1);
    var L = addShapeLayer(comp, nm);
    addPrimitive(L, "bar 2", "rect", [260, 18], hexColor(BAR2), 9, null);
    addPrimitive(comp.layer(nm), "bar 1", "rect", [420, 24], hexColor(BAR), 12, null);
    addPrimitive(comp.layer(nm), "avatar", "ellipse", [72, 72], hexColor(AVATAR[i % AVATAR.length]), 0, null);
    addPrimitive(comp.layer(nm), "card", "rect", [CARD_W, CARD_H], hexColor(CARD), RADIUS, null);
  }
  var ctrl = comp.layers.addNull(DUR); ctrl.name = CTRL; ctrl.source.name = COMP_NAME + "Ctrl";
  comp.layer(CTRL).property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Stagger";
  comp.layer(CTRL).property("ADBE Effect Parade").property("Stagger").property(1).setValue(STAGGER);
  // values: lay out the groups inside each card (group transform), position the card layers
  for (i = 0; i < COUNT; i++) {
    var nm2 = "Card" + (i + 1);
    var c = contentsOf(comp.layer(nm2));
    c.property("avatar").property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([-CARD_W / 2 + 70, 0]);
    c.property("bar 1").property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([-CARD_W / 2 + 130 + 210, -16]);
    c.property("bar 2").property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([-CARD_W / 2 + 130 + 130, 20]);
    tr(comp.layer(nm2)).property("ADBE Position").setValue([W / 2, y0 + i * SPACING]);
  }
  // master keys on CARD 01
  var m = comp.layer("Card1");
  setKeys(tr(m).property("ADBE Position"), [
    [IN_T0, [W / 2, y0 + RISE], IN_OUT_INF, IN_OUT_INF], [IN_T0 + IN_DUR, [W / 2, y0], IN_IN_INF, OUT_OUT_INF],
    [OUT_T0, [W / 2, y0], OUT_OUT_INF, OUT_OUT_INF], [OUT_T0 + OUT_DUR, [W / 2, y0 - LIFT], OUT_IN_INF, OUT_IN_INF]]);
  setKeys(tr(m).property("ADBE Opacity"), [
    [IN_T0, 0, IN_OUT_INF, IN_OUT_INF], [IN_T0 + IN_DUR * 0.7, 100, IN_IN_INF, OUT_OUT_INF],
    [OUT_T0, 100, OUT_OUT_INF, OUT_OUT_INF], [OUT_T0 + OUT_DUR, 0, OUT_IN_INF, OUT_IN_INF]]);
  setKeys(tr(m).property("ADBE Scale"), [
    [IN_T0, [SCALE_FROM, SCALE_FROM], IN_OUT_INF, IN_OUT_INF], [IN_T0 + IN_DUR, [100, 100], IN_IN_INF, IN_IN_INF]]);
  // followers: expression = master curve delayed by index × stagger (why: one curve, N copies, one knob)
  var head = 'var m = thisComp.layer("Card1");\nvar i = parseInt(thisLayer.name.replace(/[^0-9]/g, ""), 10) - 1;\nvar d = i * thisComp.layer("' + CTRL + '").effect("Stagger")("Slider");\n';
  for (i = 1; i < COUNT; i++) {
    var f = comp.layer("Card" + (i + 1));
    tr(f).property("ADBE Position").expression = head + 'm.transform.position.valueAtTime(time - d) + [0, i * ' + SPACING + '];';
    tr(f).property("ADBE Opacity").expression = head + 'm.transform.opacity.valueAtTime(time - d);';
    tr(f).property("ADBE Scale").expression = head + 'm.transform.scale.valueAtTime(time - d);';
  }
  comp.layer("Card1").selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
