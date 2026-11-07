// Full project inventory for documentation: every comp, final-edit's layer roster
// grouped with in/out/source/parent, all controller sliders, and which layers carry
// which AI_* effect stacks / expression rigs.
// Writes runtime/project_inventory.txt
app.beginSuppressDialogs();
var OUT = "~/Library/Application Support/Motion Agent/runtime/project_inventory.txt";
var L = [];
function n2(v) { return String(Math.round(v * 100) / 100); }

try {
  var proj = app.project;
  L[L.length] = "PROJECT: " + (proj.file ? proj.file.fsName : "(unsaved)");
  L[L.length] = "items: " + proj.numItems;
  L[L.length] = "";

  // ---- comps ----
  L[L.length] = "===== COMPS =====";
  var i, j;
  var comps = [];
  for (i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (it instanceof CompItem) { comps[comps.length] = it; }
  }
  for (i = 0; i < comps.length; i++) {
    var c = comps[i];
    L[L.length] = "  " + c.name + "   " + c.width + "x" + c.height + "  " + n2(c.duration) + "s  " + n2(c.frameRate) + "fps  layers=" + c.numLayers;
  }
  L[L.length] = "";

  var fe = null;
  for (i = 0; i < comps.length; i++) { if (String(comps[i].name) === "final-edit") { fe = comps[i]; } }
  if (fe === null) { throw new Error("final-edit not found"); }

  // ---- controllers ----
  L[L.length] = "===== CONTROLLERS (sliders) =====";
  for (i = 1; i <= fe.numLayers; i++) {
    var CL = fe.layer(i);
    var nm = String(CL.name);
    if (nm.indexOf("CTRL") < 0 && nm.indexOf("TARGET") < 0) { continue; }
    var fxg = null;
    try { fxg = CL.property("ADBE Effect Parade"); } catch (e0) { fxg = null; }
    var cnt = 0;
    if (fxg) { try { cnt = fxg.numProperties; } catch (eC) { cnt = 0; } }
    L[L.length] = "  [" + CL.index + "] " + nm + "   in " + n2(CL.inPoint) + " out " + n2(CL.outPoint) + "   effects=" + cnt;
    if (fxg && cnt > 0) {
      for (j = 1; j <= cnt; j++) {
        var fx = fxg.property(j);
        var v = "?";
        try { v = n2(fx.property(1).value); } catch (eV) { v = "(not a slider)"; }
        L[L.length] = "        " + fx.name + " = " + v;
      }
    }
    // animated transform?
    try {
      var pp = CL.property("ADBE Transform Group").property("ADBE Position");
      if (pp.numKeys > 0) {
        var ks = "";
        for (j = 1; j <= pp.numKeys; j++) {
          if (ks !== "") { ks += "  "; }
          ks += n2(pp.keyTime(j)) + "s:" + n2(pp.keyValue(j)[2]) + "(z)";
        }
        L[L.length] = "        position keys: " + ks;
      }
    } catch (eP) {}
  }
  L[L.length] = "";

  // ---- final-edit layer roster ----
  L[L.length] = "===== final-edit LAYERS (" + fe.numLayers + ") =====";
  L[L.length] = "  idx | name | in-out | source | fx(AI_*) | posExpr?";
  for (i = 1; i <= fe.numLayers; i++) {
    var Ly = fe.layer(i);
    var src = "";
    var isPre = false;
    try {
      if (Ly.source) {
        src = String(Ly.source.name);
        if (Ly.source instanceof CompItem) { isPre = true; }
      }
    } catch (eS) {}
    var aifx = "";
    try {
      var g = Ly.property("ADBE Effect Parade");
      if (g) {
        for (j = 1; j <= g.numProperties; j++) {
          var en = String(g.property(j).name);
          if (en.indexOf("AI ") === 0 || en.indexOf("_") === 1 || en.indexOf("AI_") === 0) {
            if (aifx !== "") { aifx += ","; }
            aifx += en;
          }
        }
      }
    } catch (eF) {}
    var pex = "";
    try {
      var P = Ly.property("ADBE Transform Group").property("ADBE Position");
      if (P.expressionEnabled) { pex = "EXPR(" + String(P.expression).length + ")"; }
      else if (P.numKeys > 0) { pex = "keys:" + P.numKeys; }
    } catch (eE) {}
    var mk = 0;
    try { mk = Ly.property("ADBE Mask Parade").numProperties; } catch (eM) { mk = 0; }
    L[L.length] = "  " + Ly.index + " | " + Ly.name + " | " + n2(Ly.inPoint) + "-" + n2(Ly.outPoint) +
                  " | " + src + (isPre ? " [PRECOMP]" : "") + " | " + aifx + " | " + pex + (mk ? " | masks:" + mk : "");
  }
  L[L.length] = "";

  // ---- one full tour-card expression, for reference ----
  L[L.length] = "===== SAMPLE TOUR CARD EXPRESSION (position) =====";
  for (i = 1; i <= fe.numLayers; i++) {
    var TL = fe.layer(i);
    var pe = "";
    try {
      var TP = TL.property("ADBE Transform Group").property("ADBE Position");
      if (TP.expressionEnabled) { pe = String(TP.expression); }
    } catch (eX) {}
    if (pe.indexOf("Burst Time") >= 0) {
      L[L.length] = "  layer: " + TL.name + " (idx " + TL.index + ")";
      L[L.length] = pe;
      break;
    }
  }
} catch (err) {
  L[L.length] = "ERR " + String(err);
} finally {
  app.endSuppressDialogs(false);
  var f = new File(OUT);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(L.join("\n"));
  f.close();
}
