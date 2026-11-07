#!/bin/bash
# 逐层数值比对两个合成（复刻验收第 1 条硬指标）。
# 用法: ./compare_comps.sh "<原片合成>" "<复刻合成>" "<时间,逗号分隔>" [AE应用名]
# 例:   ./compare_comps.sh "part02" "MA_S02_卡片散布" "0.3,1.0,1.7,2.05"
#
# 为什么要有：肉眼看渲染图判断不了"摆位对不对"——卡片互相遮挡、内部帧不同都会干扰。
# 直接读 AE 里的求值结果（含表达式）逐项比，才是摆位和轨迹的真验收。
# 只有这一条全绿，像素差才有意义（见 SKILL.md「交付质量标准」）。
#
# 图层配对规则：先按名字精确匹配，再按归一化名匹配
# （去掉 CARD/ELEM_/MA_U/SRC_ 前缀与 .png/.mp4 后缀）。配不上的会明确报出来。
set -uo pipefail
SRC="${1:?用法: ./compare_comps.sh <原片合成> <复刻合成> <时间列表> [AE应用名]}"
DST="${2:?需要复刻合成名}"
TIMES="${3:?需要时间列表，如 0.3,1.0,1.7}"
APP="${4:-Adobe After Effects 2026}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/compare_comps.txt"
JSX="$DIR/_compare_gen.jsx"

python3 - "$SRC" "$DST" "$TIMES" "$OUT" > "$JSX" << 'PYEOF'
import sys, json
src, dst, times, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
tpl = '''(function () {
  var OUT = %s, SRC = %s, DST = %s, TIMES = %s;
  var lines = [];
  function put(s) { lines.push(String(s)); }
  function flush() {
    var f = new File(OUT); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\\n")); f.close();
  }
  try {
    app.beginSuppressDialogs();
    function comp(nm) {
      for (var i = 1; i <= app.project.numItems; i++) {
        var t = app.project.item(i);
        if (t instanceof CompItem && t.name === nm) return t;
      }
      return null;
    }
    function norm(s) {
      s = String(s);
      var pre = ["CARD", "ELEM_", "MA_U", "SRC_", "MASK_"];
      for (var i = 0; i < pre.length; i++)
        if (s.indexOf(pre[i]) === 0) s = s.substring(pre[i].length);
      s = s.replace(".png", "").replace(".mp4", "").replace(".mov", "");
      return s;
    }
    var a = comp(SRC), b = comp(DST);
    if (!a) throw new Error("找不到合成: " + SRC);
    if (!b) throw new Error("找不到合成: " + DST);
    // 建立 DST 的查找表
    var byName = {}, byNorm = {};
    for (var j = 1; j <= b.numLayers; j++) {
      var bl = b.layer(j);
      byName[bl.name] = bl;
      var nk = norm(bl.name);
      if (!byNorm[nk]) byNorm[nk] = bl;
    }
    var TL = TIMES.split(",");
    var unmatched = [];
    for (var ti = 0; ti < TL.length; ti++) {
      var T = parseFloat(TL[ti]), bad = 0, tot = 0, msgs = [];
      for (var L = 1; L <= a.numLayers; L++) {
        var al = a.layer(L);
        if (al instanceof CameraLayer || al instanceof LightLayer) continue;
        var m = byName[al.name];
        if (!m) m = byNorm[norm(al.name)];
        if (!m) {
          if (ti === 0) unmatched.push(al.name);
          continue;
        }
        tot++;
        var at = al.property("ADBE Transform Group");
        var mt = m.property("ADBE Transform Group");
        var msg = "";
        function pv(tr, mn) { try { return tr.property(mn).valueAtTime(T, false); } catch (e) { return null; } }
        var ap = pv(at, "ADBE Position"), mp = pv(mt, "ADBE Position");
        if (ap && mp) {
          var dx = mp[0] - ap[0], dy = mp[1] - ap[1];
          var dz = (mp.length > 2 ? mp[2] : 0) - (ap.length > 2 ? ap[2] : 0);
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || Math.abs(dz) > 2)
            msg += " 位移(" + Math.round(dx) + "," + Math.round(dy) + "," + Math.round(dz) + ")";
        }
        var as2 = pv(at, "ADBE Scale"), ms2 = pv(mt, "ADBE Scale");
        if (as2 && ms2 && Math.abs(ms2[0] - as2[0]) > 1)
          msg += " 缩放" + Math.round(ms2[0]) + "vs" + Math.round(as2[0]);
        var ao = pv(at, "ADBE Opacity"), mo = pv(mt, "ADBE Opacity");
        if (ao !== null && mo !== null && Math.abs(mo - ao) > 2)
          msg += " 透明" + Math.round(mo) + "vs" + Math.round(ao);
        var aAct = (al.inPoint <= T && al.outPoint >= T && al.enabled);
        var mAct = (m.inPoint <= T && m.outPoint >= T && m.enabled);
        if (aAct !== mAct) msg += " 在场" + (mAct ? "是" : "否") + "vs" + (aAct ? "是" : "否");
        if (msg) { bad++; msgs.push(al.name + msg); }
      }
      put("t=" + T + "s  比对 " + tot + " 层，异常 " + bad +
          (bad ? "\\n    " + msgs.join("\\n    ") : "  ✓ 全部一致"));
    }
    if (unmatched.length) put("\\n配不上的图层（可能是空物体或命名不同）: " + unmatched.join(", "));
    flush();
    app.endSuppressDialogs(false);
  } catch (err) {
    put("ERR " + err ); flush();
    try { app.endSuppressDialogs(false); } catch (e) {}
  }
})();'''
print(tpl % (json.dumps(out), json.dumps(src), json.dumps(dst), json.dumps(times)))
PYEOF

python3 "$DIR/preflight.py" "$JSX" || exit 1
rm -f "$OUT"
osascript -e "set jsxPath to \"$JSX\"
set jsxCode to read POSIX file jsxPath as «class utf8»
with timeout of 120 seconds
	tell application \"$APP\"
		DoScript jsxCode
	end tell
end timeout" >/dev/null
sleep 2
[ -f "$OUT" ] || { echo "无输出（AE 可能有模态框挡着）"; exit 1; }
cat "$OUT"
rm -f "$JSX"
