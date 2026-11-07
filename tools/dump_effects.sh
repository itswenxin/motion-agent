#!/bin/bash
# 导出本机 AE 已安装的全部效果（显示名 / matchName / 分类）到查询表。
# 用法: ./dump_effects.sh [AE应用名]
# 输出: tools/effects_dict.json  （之后用 fx.py 查询）
#
# 为什么需要：写 JSX 加效果时 addProperty() 要的是 matchName（如 "ADBE Gaussian Blur 2"），
# 不是面板上看到的显示名（"Gaussian Blur"）。猜错会静默失败，查表则永远正确。
set -euo pipefail
APP="${1:-Adobe After Effects 2026}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/effects_dict.json"
JSX="$DIR/_dump_effects_gen.jsx"

python3 - "$OUT" > "$JSX" << 'PYEOF'
import sys, json
out = sys.argv[1]
tpl = '''(function () {
  var OUT = %s;
  try {
    app.beginSuppressDialogs();
    var list = [];
    for (var i = 0; i < app.effects.length; i++) {
      var e = app.effects[i];
      list.push('{"displayName":' + enc(e.displayName) +
                ',"matchName":' + enc(e.matchName) +
                ',"category":' + enc(e.category) + '}');
    }
    function enc(s) {
      s = String(s === undefined ? "" : s);
      var r = "";
      for (var k = 0; k < s.length; k++) {
        var c = s.charAt(k), o = s.charCodeAt(k);
        if (c === '"') r += '\\\\"';
        else if (c === "\\\\") r += "\\\\\\\\";
        else if (o < 32 || o > 126) { var h = o.toString(16); while (h.length < 4) h = "0" + h; r += "\\\\u" + h; }
        else r += c;
      }
      return '"' + r + '"';
    }
    var f = new File(OUT);
    f.encoding = "UTF-8";
    f.open("w");
    f.write("[\\n" + list.join(",\\n") + "\\n]");
    f.close();
    app.endSuppressDialogs(false);
  } catch (err) {
    try {
      var ef = new File(OUT + ".error.txt");
      ef.open("w"); ef.write(String(err) + " line:" + (err && err.line ? err.line : "?")); ef.close();
    } catch (e2) {}
    try { app.endSuppressDialogs(false); } catch (e3) {}
  }
})();'''
print(tpl % json.dumps(out))
PYEOF

# 发送前预检：语法 + ES3 保留字（挡住 AE 弹窗）
python3 "$DIR/preflight.py" "$JSX" || exit 1

rm -f "$OUT" "$OUT.error.txt"
osascript -e "set jsxPath to \"$JSX\"
set jsxCode to read POSIX file jsxPath as «class utf8»
with timeout of 900 seconds
	tell application \"$APP\"
		DoScript jsxCode
	end tell
end timeout" >/dev/null
sleep 2

if [ -f "$OUT.error.txt" ]; then echo "导出失败:"; cat "$OUT.error.txt"; exit 1; fi
[ -f "$OUT" ] || { echo "无输出（AE 没开？应用名对不对？）"; exit 1; }
python3 -c "
import json
d = json.load(open('$OUT'))
print('✓ 导出 %d 个效果 → effects_dict.json' % len(d))
cats = {}
for e in d: cats[e['category']] = cats.get(e['category'], 0) + 1
print('  分类 %d 个，最大的几个:' % len(cats))
for c, n in sorted(cats.items(), key=lambda x: -x[1])[:6]:
    print('    %-28s %d' % (c, n))
"
rm -f "$JSX"
