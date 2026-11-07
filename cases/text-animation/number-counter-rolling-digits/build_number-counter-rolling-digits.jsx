// build_number-counter-rolling-digits.jsx — Motion Agent recipe (ES3)
// One keyframed Slider ("Value") drives (a) a formatted Source Text counter with thousands separators
// and (b) an odometer row of rolling digit columns with true carry. The motion curve lives on the
// slider's Bezier keyframes (edit it in the Graph Editor); expressions only format / distribute it.
(function () {
var COMP_NAME = "Counter";
var W = 1920, H = 1080, FPS = 30, DUR = 4.0;
var BG = "#0E0F13", PANEL = "#1A1D24", ACCENT = "#7C9CFF";
var START_VAL = 0, END_VAL = 1284500;     // Slider Control is limited to ±1,000,000 (see recipe); SCALE handles larger numbers
var SCALE = 10;                           // slider stores END_VAL / SCALE, expressions multiply back
var T0 = 0.4, T1 = 2.8;                   // count window (s)
var EASE_OUT_INF = 40, EASE_IN_INF = 90;  // key1 outgoing / key2 incoming influence (%)
var DECIMALS = 0, PREFIX = "$", SUFFIX = "";
var BIG_FONT = "Inter-Bold", BIG_SIZE = 210, BIG_Y = 480;
var ODO_FONT = "Inter-SemiBold", ODO_SIZE = 110, ODO_LEAD = 130, ODO_Y = 790, ODO_PITCH = 74, ODO_DIGITS = 7, COMMA_W = 34;
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
app.beginUndoGroup("Build number counter");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  // odometer geometry: digits right-to-left with a comma slot every 3 digits
  var groups = Math.floor((ODO_DIGITS - 1) / 3);
  var rowW = ODO_DIGITS * ODO_PITCH + groups * COMMA_W;
  var xRight = W / 2 + rowW / 2;
  addRectLayer(comp, "Panel", [rowW + 80, ODO_LEAD + 40], hexColor(PANEL), [W / 2, ODO_Y - ODO_SIZE * 0.36], 28);
  var colX = [], commaX = [], x = xRight, k;
  for (k = 0; k < ODO_DIGITS; k++) {
    if (k > 0 && k % 3 === 0) { x -= COMMA_W; commaX.push(x + COMMA_W / 2); }
    x -= ODO_PITCH; colX.push(x + ODO_PITCH / 2);
  }
  for (k = 0; k < ODO_DIGITS; k++) {
    var col = addTextLayer(comp, "Digit" + k, "0\r1\r2\r3\r4\r5\r6\r7\r8\r9\r0", ODO_FONT, ODO_SIZE, [1, 1, 1], [colX[k], ODO_Y], 0);
    var sp = col.property("ADBE Text Properties").property("ADBE Text Document");
    var td = sp.value; td.autoLeading = false; td.leading = ODO_LEAD; sp.setValue(td);
  }
  for (k = 0; k < commaX.length; k++) { addTextLayer(comp, "Comma" + (k + 1), ",", ODO_FONT, ODO_SIZE, hexColor(ACCENT), [commaX[k], ODO_Y], 0); }
  var capH = ODO_SIZE * 0.73;
  addRectLayer(comp, "Matte", [rowW + 20, ODO_LEAD], [1, 1, 1], [W / 2, ODO_Y - capH / 2], 0);
  addTextLayer(comp, "Number", PREFIX + "0" + SUFFIX, BIG_FONT, BIG_SIZE, [1, 1, 1], [W / 2, BIG_Y], -10);
  var ctrl = comp.layers.addNull(DUR); ctrl.name = CTRL; ctrl.source.name = COMP_NAME + "Ctrl";
  ctrl.property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Value";
  ctrl = comp.layer(CTRL);
  ctrl.property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Decimals";
  // ---- resolve again, then set values / keys / expressions ----
  ctrl = comp.layer(CTRL);
  var fx = ctrl.property("ADBE Effect Parade");
  fx.property("Decimals").property(1).setValue(DECIMALS);
  var val = fx.property("Value").property(1);
  setKeys(val, [[T0, START_VAL / SCALE, EASE_OUT_INF, EASE_OUT_INF], [T1, END_VAL / SCALE, EASE_IN_INF, EASE_IN_INF]]);
  var V = "(" + ctrlRef("Value") + "*" + SCALE + ")";
  var big = comp.layer("Number").property("ADBE Text Properties").property("ADBE Text Document");
  big.expression =
    'var v = ' + V + ';\n' +
    'var d = Math.max(0, Math.round(' + ctrlRef("Decimals") + '));\n' +
    'var s = Math.abs(v).toFixed(d).split(".");\n' +
    'var ip = s[0], out = "";\n' +
    'while (ip.length > 3) { out = "," + ip.substr(ip.length - 3) + out; ip = ip.substr(0, ip.length - 3); }\n' +
    'out = ip + out + (d > 0 ? "." + s[1] : "");\n' +
    '(v < 0 ? "-" : "") + "' + PREFIX + '" + out + "' + SUFFIX + '";';
  for (k = 0; k < ODO_DIGITS; k++) {
    var cl = comp.layer("Digit" + k);
    cl.setTrackMatte(comp.layer("Matte"), TrackMatteType.ALPHA);
    tr(cl).property("ADBE Position").expression =
      '// odometer with carry: column k only turns while all lower digits roll 9 -> 0\n' +
      'var v = Math.max(0, ' + V + ');\n' +
      'var p = Math.pow(10, ' + k + ');\n' +
      'var digit = Math.floor(v / p) % 10;\n' +
      'var frac = Math.max(0, (v % p) - (p - 1));\n' +
      '[value[0], ' + ODO_Y + ' - (digit + frac) * ' + ODO_LEAD + '];';
  }
  comp.layer("Matte").enabled = false;
  comp.layer(CTRL).selected = true;
  log("OK " + COMP_NAME + " layers=" + comp.numLayers + " sliderEnd=" + val.keyValue(2));
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
