#!/bin/bash
# 把一个效果（含脚本改不了的自定义数据）从源图层克隆到多个目标图层。
# 用法: ./clone_effect.sh "<合成名>" "<源图层名>" "<效果名>" "<目标图层名前缀>" [AE应用名]
# 例:   ./clone_effect.sh "part01" "MA_彩_1" "Colorama" "MA_彩_"
#
# 为什么要有（2026-07-30 查明）：
# AE 的自定义数据类型属性 —— Colorama 的 Output Cycle、Curves 的曲线、
# Gradient Ramp 编辑器、Apply Color LUT 的文件路径 —— propertyValueType 是
# NO_VALUE(6412) 或 CUSTOM(6419)，**脚本完全无法读写**。
#
# 但效果整体的复制粘贴会把这些数据一起带走。实测路径：
#   effect.selected = true
#   app.executeCommand(app.findMenuCommandId("Copy"))    // = 19
#   targetLayer.selected = true
#   app.executeCommand(app.findMenuCommandId("Paste"))   // = 20
# 验证过 Colorama：PhaseShift / Cycle Repetitions / Use Preset Palette 全部一致带过去。
#
# 工作流：人手配一个 -> 脚本复制到 N 个。
# 注意：走的是系统剪贴板，会覆盖你剪贴板里原有的内容。
set -uo pipefail
COMP="${1:?用法: ./clone_effect.sh <合成名> <源图层名> <效果名> <目标图层名前缀> [AE应用名]}"
SRCLAYER="${2:?需要源图层名}"
FXNAME="${3:?需要效果名}"
PREFIX="${4:?需要目标图层名前缀}"
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="${5:-Adobe After Effects 2026}"
JSX="$DIR/_clone_gen.jsx"
OUT="$DIR/_clone_out.txt"

python3 - "$COMP" "$SRCLAYER" "$FXNAME" "$PREFIX" "$OUT" > "$JSX" << 'PYEOF'
import sys, json
comp, srclayer, fxname, prefix, out = sys.argv[1:6]
tpl = '''(function () {
  var COMP = %s, SRCL = %s, FXN = %s, PREFIX = %s, OUT = %s;
  var lines = [];
  function w(s) { lines.push(String(s)); }
  try {
    app.beginSuppressDialogs();
    app.beginUndoGroup("clone effect");
    var P = app.project, C = null;
    for (var i = 1; i <= P.numItems; i++) {
      var it = P.item(i);
      if (it instanceof CompItem && it.name === COMP) { C = it; break; }
    }
    if (!C) throw new Error("找不到合成 " + COMP);
    var src = null;
    for (var L = 1; L <= C.numLayers; L++) if (C.layer(L).name === SRCL) src = C.layer(L);
    if (!src) throw new Error("找不到源图层 " + SRCL);
    var fx = null, spa = src.property("ADBE Effect Parade");
    for (var e = 1; e <= spa.numProperties; e++)
      if (spa.property(e).name === FXN) fx = spa.property(e);
    if (!fx) throw new Error("源图层上找不到效果 " + FXN);

    C.openInViewer();
    var copyId = app.findMenuCommandId("Copy");
    var pasteId = app.findMenuCommandId("Paste");

    // 选中源效果并复制（自定义数据随之进剪贴板）
    for (var a = 1; a <= C.numLayers; a++) C.layer(a).selected = false;
    src.selected = true;
    fx.selected = true;
    app.executeCommand(copyId);

    var done = 0, skipped = 0;
    for (var t = 1; t <= C.numLayers; t++) {
      var ly = C.layer(t);
      if (ly.name.indexOf(PREFIX) !== 0) continue;
      if (ly.name === SRCL) continue;
      // 目标层上若已有同名效果，先删掉，保证幂等
      var tpa = ly.property("ADBE Effect Parade");
      for (var k = tpa.numProperties; k >= 1; k--)
        if (tpa.property(k).name === FXN) tpa.property(k).remove();
      for (var b = 1; b <= C.numLayers; b++) C.layer(b).selected = false;
      ly.selected = true;
      app.executeCommand(pasteId);
      // 校验
      var ok = false;
      for (var m = 1; m <= tpa.numProperties; m++)
        if (tpa.property(m).name === FXN) ok = true;
      if (ok) { done++; } else { skipped++; w("  粘贴失败: " + ly.name); }
    }
    w("源 " + SRCL + " 的「" + FXN + "」-> 克隆成功 " + done + " 层，失败 " + skipped);
    app.endUndoGroup();
    app.endSuppressDialogs(false);
  } catch (err) {
    try { app.endUndoGroup(); } catch (e0) {}
    w("ERR " + String(err));
    try { app.endSuppressDialogs(false); } catch (e1) {}
  }
  var fo = new File(OUT); fo.encoding = "UTF-8"; fo.open("w"); fo.write(lines.join("\\n")); fo.close();
})();'''
print(tpl % (json.dumps(comp), json.dumps(srclayer), json.dumps(fxname),
             json.dumps(prefix), json.dumps(out)))
PYEOF

python3 "$DIR/preflight.py" "$JSX" || exit 1
rm -f "$OUT"
osascript -e "set jsxPath to \"$JSX\"
set jsxCode to read POSIX file jsxPath as «class utf8»
with timeout of 180 seconds
	tell application \"$APP\"
		DoScript jsxCode
	end tell
end timeout" >/dev/null
sleep 2
[ -f "$OUT" ] && cat "$OUT" || echo "无输出（AE 可能有模态框挡着）"
rm -f "$JSX"
