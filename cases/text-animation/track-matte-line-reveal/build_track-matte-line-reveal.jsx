// build_track-matte-line-reveal.jsx — Motion Agent recipe (ES3)
// Line-by-line text reveal: each line slides up out of its own rectangular track matte, holds, then slides out.
// Real Bezier keyframes on Position (editable in the Graph Editor). No expressions.
// Run in an open project; rebuilds the comp named COMP_NAME (removes the old one first).
(function () {
var COMP_NAME = "Reveal";
var W = 1920, H = 1080, FPS = 30, DUR = 4.5;
var BG = "#0E0F13";
var LINES = ["Motion that", "explains", "the product."];
var COLORS = ["#FFFFFF", "#7C9CFF", "#FFFFFF"];
var FONT = "Inter-Bold", FONT_SIZE = 140, TRACKING = -20;
var LINE_GAP = 165;          // baseline-to-baseline distance (px)
var PAD_X = 40, PAD_Y = 14;  // matte padding around the visible glyph box
var IN_START = 0.30, STAGGER = 0.12, IN_DUR = 0.70;   // seconds
var IN_OUT_INF = 60, IN_IN_INF = 85;                  // ease: key1 outgoing / key2 incoming influence (%)
var OUT_START = 3.20, OUT_DUR = 0.55;
var OUT_OUT_INF = 80, OUT_IN_INF = 30;                // exit: slow start, fast leave
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

app.beginUndoGroup("Build track matte line reveal");
try {
  removeOld(COMP_NAME);
  var comp = app.project.items.addComp(COMP_NAME, W, H, 1, DUR, FPS);
  comp.openInViewer();
  addRectLayer(comp, "Bg", [W, H], hexColor(BG), [W / 2, H / 2], 0);
  var n = LINES.length;
  var firstBase = H / 2 - (n - 1) * LINE_GAP / 2 + FONT_SIZE * 0.36; // optical centering of cap height
  var i, texts = [], mattes = [];
  for (i = 0; i < n; i++) {
    var base = firstBase + i * LINE_GAP;
    var t = addTextLayer(comp, "Line" + (i + 1), LINES[i], FONT, FONT_SIZE, hexColor(COLORS[i]), [W / 2, base], TRACKING);
    var r = t.sourceRectAtTime(0, false);
    var mw = r.width + 2 * PAD_X, mh = r.height + 2 * PAD_Y;
    var m = addRectLayer(comp, "Matte" + (i + 1), [mw, mh], [1, 1, 1], [W / 2 + r.left + r.width / 2, base + r.top + r.height / 2], 0);
    texts.push({ name: "Line" + (i + 1), base: base, drop: mh });
    mattes.push("Matte" + (i + 1));
    log("line " + (i + 1) + " base=" + base + " glyphBox=" + Math.round(r.width) + "x" + Math.round(r.height) + " matte=" + Math.round(mw) + "x" + Math.round(mh));
  }
  // structure done; resolve by name and bind mattes + keys
  for (i = 0; i < n; i++) {
    var tl = comp.layer(texts[i].name), ml = comp.layer(mattes[i]);
    tl.setTrackMatte(ml, TrackMatteType.ALPHA);
    ml.enabled = false;
    var p = tr(tl).property("ADBE Position");
    var b = texts[i].base, d = texts[i].drop;
    var t0 = IN_START + i * STAGGER, t1 = OUT_START + i * STAGGER;
    setKeys(p, [
      [t0, [W / 2, b + d], IN_IN_INF, IN_OUT_INF],
      [t0 + IN_DUR, [W / 2, b], IN_IN_INF, OUT_OUT_INF],
      [t1, [W / 2, b], OUT_OUT_INF, OUT_OUT_INF],
      [t1 + OUT_DUR, [W / 2, b - d], OUT_IN_INF, OUT_IN_INF]
    ]);
    tl.selected = true;
  }
  log("OK " + COMP_NAME + " layers=" + comp.numLayers);
} catch (e) { log("ERR " + String(e)); }
app.endUndoGroup();
flushLog();
})();
