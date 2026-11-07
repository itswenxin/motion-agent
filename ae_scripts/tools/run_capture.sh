#!/bin/bash
# 参数化截帧：run_capture.sh "<合成名>" "<逗号分隔的秒数>" "<输出目录>" [AE应用名]
# 例:  ./run_capture.sh "ai 滑块" "0,1.1,2.5" /path/to/out/mycap
# 输出: <outdir>/f_<厘秒>.png + ok.txt / error.txt
set -euo pipefail
COMP="$1"; TIMES="$2"; OUT="$3"; APP="${4:-Adobe After Effects 2026}"
OUT="$(mkdir -p "$OUT" && cd "$OUT" && pwd)"
mkdir -p "$OUT"
rm -f "$OUT/ok.txt" "$OUT/error.txt"
JSX="$OUT/_capture_gen.jsx"
python3 - "$COMP" "$TIMES" "$OUT" > "$JSX" << 'PYEOF'
import sys, json
comp, times, out = sys.argv[1], sys.argv[2], sys.argv[3]
tlist = [float(t) for t in times.split(',')]
tpl = '''(function () {
  var OUT = %s;
  try {
    app.beginSuppressDialogs();
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === %s) { comp = it; break; }
    }
    if (!comp) throw new Error("comp not found: " + %s);
    var times = %s;
    for (var t = 0; t < times.length; t++) {
      var tt = Math.max(0, Math.min(comp.duration - 0.001, times[t]));
      var lb = String(Math.round(tt * 100));
      while (lb.length < 4) lb = "0" + lb;
      comp.saveFrameToPng(tt, new File(OUT + "/f_" + lb + ".png"));
    }
    var f = new File(OUT + "/ok.txt"); f.open("w"); f.write("captured " + times.length); f.close();
    app.endSuppressDialogs(false);
  } catch (err) {
    try { var ef = new File(OUT + "/error.txt"); ef.open("w"); ef.write(String(err) + " line: " + (err && err.line ? err.line : "?")); ef.close(); } catch (e2) {}
    try { app.endSuppressDialogs(false); } catch (e3) {}
  }
})();'''
print(tpl % (json.dumps(out), json.dumps(comp), json.dumps(comp), json.dumps(tlist)))
PYEOF
osascript -e "set jsxPath to \"$JSX\"
set jsxCode to read POSIX file jsxPath as «class utf8»
tell application \"$APP\"
	DoScript jsxCode
end tell"
sleep 3
if [ -f "$OUT/error.txt" ]; then echo "CAPTURE ERROR:"; cat "$OUT/error.txt"; exit 1; fi
cat "$OUT/ok.txt" 2>/dev/null || { echo "no ok.txt (AE busy? app name right?)"; exit 1; }
ls "$OUT"/f_*.png
