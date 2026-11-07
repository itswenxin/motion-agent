#!/bin/bash
# 导出效果的「参数表」：每个效果实例化一次，遍历其属性，记录参数名/matchName/类型/默认值。
# 用法: ./dump_effect_params.sh [分类过滤词]   例: ./dump_effect_params.sh Blur
#       不带参数 = 导出全部原生效果（ADBE/CC 前缀），跳过第三方以控制耗时
# 输出: tools/effect_params.json
#
# 为什么需要：addProperty 之后设参数要用参数名或索引，猜错同样静默失败。
# 文档不覆盖第三方插件，本机实测最准。
set -euo pipefail
APP="${2:-Adobe After Effects 2026}"
FILTER="${1:-}"
# 默认只导配方用到的效果（快且安全）。传 --all 跑全部原生效果
if [ "${1:-}" = "--all" ]; then FILTER=""; WHITELIST=""; else
  WHITELIST="$(cat "$(dirname "$0")/recipe_effects.txt" 2>/dev/null | grep -v '^#' | grep -v '^$' | paste -sd, -)"
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/effect_params.json"
JSX="$DIR/_dump_params_gen.jsx"

python3 - "$OUT" "$FILTER" "$WHITELIST" > "$JSX" << 'PYEOF'
import sys, json
out, filt, wl = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else '')
tpl = '''(function () {
  var OUT = %s;
  var FILTER = %s;
  var WHITELIST_RAW = %s;
  try {
    app.beginSuppressDialogs();
    app.beginUndoGroup("AI dump effect params");
    var comp = app.project.items.addComp("__AI_TMP_PARAMS__", 100, 100, 1, 1, 24);
    var solid = comp.layers.addSolid([0,0,0], "probe", 100, 100, 1);
    var parade = solid.property("ADBE Effect Parade");
    var out = [];
    var BLACKLIST = ["ADBE Basic Text2", "ADBE Basic Text", "ADBE Path Text",
                     "ADBE Basic 3D", "ADBE Lightning", "APC CardDanceCam"];
    // 白名单：配方里真正用到的效果。留空则跑全部原生效果（慢且有风险，不推荐）
    var WHITELIST = WHITELIST_RAW === "" ? [] : WHITELIST_RAW.split(",");

    function enc(s) {
      s = String(s === undefined || s === null ? "" : s);
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

    for (var i = 0; i < app.effects.length; i++) {
      var meta = app.effects[i];
      var mn = meta.matchName;
      // 只取原生效果（ADBE / CC 前缀），第三方跳过以控制耗时
      var isNative = (mn.indexOf("ADBE") === 0 || mn.indexOf("CC ") === 0 || mn.indexOf("CS ") === 0);
      if (!isNative) continue;
      var cat = String(meta.category);
      if (cat === "_Obsolete" || cat === "Obsolete") continue;
      // 黑名单：这些老效果被脚本应用时会强弹配置对话框，卡死 AE
      // （beginSuppressDialogs 挡不住它们。2026-07-30 实测被 Basic Text 卡过）
      if (BLACKLIST.join("|").indexOf(mn) !== -1) continue;
      if (WHITELIST.length > 0 && WHITELIST.join("|").indexOf(mn) === -1) continue;
      if (FILTER !== "" && cat.toLowerCase().indexOf(FILTER.toLowerCase()) === -1
          && String(meta.displayName).toLowerCase().indexOf(FILTER.toLowerCase()) === -1) continue;

      var fx = null;
      try { fx = parade.addProperty(mn); } catch (eAdd) { continue; }
      var params = [];
      try {
        for (var p = 1; p <= fx.numProperties; p++) {
          var prop = fx.property(p);
          var t = "";
          try { t = String(prop.propertyValueType); } catch (eT) {}
          var dv = "";
          try {
            if (prop.propertyValueType !== PropertyValueType.NO_VALUE &&
                prop.propertyValueType !== PropertyValueType.CUSTOM_VALUE) {
              dv = String(prop.value);
              if (dv.length > 60) dv = dv.substring(0, 60);
            }
          } catch (eV) {}
          params.push('{"name":' + enc(prop.name) + ',"matchName":' + enc(prop.matchName) +
                      ',"type":' + enc(t) + ',"default":' + enc(dv) + '}');
        }
      } catch (eWalk) {}
      out.push('{"effect":' + enc(meta.displayName) + ',"matchName":' + enc(mn) +
               ',"category":' + enc(meta.category) + ',"params":[' + params.join(",") + ']}');
      try { fx.remove(); } catch (eRm) {}
    }

    comp.remove();
    app.endUndoGroup();
    var f = new File(OUT);
    f.encoding = "UTF-8";
    f.open("w");
    f.write("[\\n" + out.join(",\\n") + "\\n]");
    f.close();
    app.endSuppressDialogs(false);
  } catch (err) {
    try { app.endUndoGroup(); } catch (e0) {}
    try {
      var ef = new File(OUT + ".error.txt");
      ef.open("w"); ef.write(String(err) + " line:" + (err && err.line ? err.line : "?")); ef.close();
    } catch (e2) {}
    try { app.endSuppressDialogs(false); } catch (e3) {}
  }
})();'''
print(tpl % (json.dumps(out), json.dumps(filt), json.dumps(wl)))
PYEOF

# 发送前预检：语法 + ES3 保留字（挡住 AE 弹窗）
python3 "$DIR/preflight.py" "$JSX" || exit 1

rm -f "$OUT" "$OUT.error.txt"
echo "导出中（会在 AE 里建临时合成探测，完成后自动清理）..."
osascript -e "set jsxPath to \"$JSX\"
set jsxCode to read POSIX file jsxPath as «class utf8»
with timeout of 900 seconds
	tell application \"$APP\"
		DoScript jsxCode
	end tell
end timeout" >/dev/null
sleep 3

if [ -f "$OUT.error.txt" ]; then echo "失败:"; cat "$OUT.error.txt"; exit 1; fi
[ -f "$OUT" ] || { echo "无输出（AE 没开？）"; exit 1; }
python3 -c "
import json
d = json.load(open('$OUT'))
tot = sum(len(e['params']) for e in d)
print('✓ %d 个效果 / %d 个参数 → effect_params.json' % (len(d), tot))
"
rm -f "$JSX"
