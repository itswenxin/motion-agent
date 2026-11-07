#!/bin/bash
# 一次读全：导出重建一个合成所需的**全部**精确参数（含嵌套一层）。
# 用法: ./dump_rebuild_spec.sh "<合成名>" [输出json] [AE应用名]
# 例:   ./dump_rebuild_spec.sh "part02" spec.json
#
# 为什么要有（2026-07-30 教训）：
# "先按粗测值建，回头再校准" 是最贵的顺序 —— 校准往返本身耗时，而且会引入自己的 bug
# （只拷了两级变换里的一级 → 全部遮罩失效）。一次把精确值读全、直接照抄，
# 既更快也绕开整类问题。目标：一个镜头 5 分钟。
#
# 覆盖今天踩过的每一个坑：
#   - 形状层**两级**变换（图层 Transform + 组内 Vector Transform Group）
#   - 时间**四维**（inPoint / outPoint / startTime 含符号 / stretch）
#   - 遮罩绑定（类型 + 源图层 index）
#   - 矩形参数（Size / Position / Roundness）与 Fill/Stroke 的启用状态
#   - 变换属性上的表达式原文
# 数值一律输出原始浮点，不取整（取整过的 12 vs 12.415 会在遮罩上放大成可见错位）。
set -uo pipefail
COMP="${1:?用法: ./dump_rebuild_spec.sh <合成名> [输出json] [AE应用名]}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${2:-$DIR/rebuild_spec.json}"
APP="${3:-Adobe After Effects 2026}"
JSX="$DIR/_spec_gen.jsx"

python3 - "$COMP" "$OUT" > "$JSX" << 'PYEOF'
import sys, json
comp, out = sys.argv[1], sys.argv[2]
tpl = '''(function () {
  var OUT = %s, COMP = %s;
  try {
    app.beginSuppressDialogs();
    function enc(s) {
      s = String(s === undefined || s === null ? "" : s);
      var r = "";
      for (var k = 0; k < s.length; k++) {
        var c = s.charAt(k), o = s.charCodeAt(k);
        if (c === '"') r += '\\\\"';
        else if (c === "\\\\") r += "\\\\\\\\";
        else if (o === 10) r += "\\\\n";
        else if (o < 32 || o > 126) { var h = o.toString(16); while (h.length < 4) h = "0" + h; r += "\\\\u" + h; }
        else r += c;
      }
      return '"' + r + '"';
    }
    // 原始浮点，不取整
    function J(v) {
      if (v === undefined || v === null) return "null";
      if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(v[i]); return "[" + a.join(",") + "]"; }
      if (typeof v === "number") return String(v);
      if (typeof v === "boolean") return v ? "true" : "false";
      return enc(v);
    }
    function safeVal(pr, mn) {
      try { var p = pr.property(mn); if (!p) return null; return p.value; } catch (e) { return null; }
    }
    function propSpec(tr, mn) {
      var p = null;
      try { p = tr.property(mn); } catch (e) { return null; }
      if (!p) return null;
      var o = ['"name":' + enc(p.name)];
      try { if (p.expressionEnabled && p.expression) o.push('"expression":' + enc(p.expression)); } catch (e2) {}
      if (p.numKeys === 0) {
        o.push('"static":' + J(p.value));
      } else {
        var ks = [];
        for (var k = 1; k <= p.numKeys; k++) {
          var ie = "null", oe = "null";
          try {
            var i1 = p.keyInTemporalEase(k), o1 = p.keyOutTemporalEase(k);
            ie = "{" + '"influence":' + i1[0].influence + ',"speed":' + i1[0].speed + "}";
            oe = "{" + '"influence":' + o1[0].influence + ',"speed":' + o1[0].speed + "}";
          } catch (e3) {}
          ks.push("{" + '"t":' + p.keyTime(k) + ',"v":' + J(p.keyValue(k)) +
                  ',"inType":' + p.keyInInterpolationType(k) + ',"outType":' + p.keyOutInterpolationType(k) +
                  ',"easeIn":' + ie + ',"easeOut":' + oe + "}");
        }
        o.push('"keys":[' + ks.join(",") + "]");
      }
      return "{" + o.join(",") + "}";
    }
    // 形状层：组内变换 + 矩形 + 填充/描边
    function shapeSpec(ly) {
      var root = null;
      try { root = ly.property("ADBE Root Vectors Group"); } catch (e) { return "null"; }
      if (!root) return "null";
      var grpTr = "null", rect = "null", fill = "null", stroke = "null";
      var found = null;
      function dig(pr, d) {
        if (d > 5) return;
        var N = 0; try { N = pr.numProperties; } catch (e) { return; }
        for (var i = 1; i <= N; i++) {
          var c = null; try { c = pr.property(i); } catch (e2) { continue; }
          if (!c) continue;
          var mn = ""; try { mn = c.matchName; } catch (e3) {}
          if (mn === "ADBE Vector Shape - Rect" && rect === "null") {
            rect = "{" + '"size":' + J(safeVal(c, "ADBE Vector Rect Size")) +
                   ',"position":' + J(safeVal(c, "ADBE Vector Rect Position")) +
                   ',"roundness":' + J(safeVal(c, "ADBE Vector Rect Roundness")) + "}";
          } else if (mn === "ADBE Vector Graphic - Fill" && fill === "null") {
            fill = "{" + '"enabled":' + (c.enabled ? "true" : "false") +
                   ',"color":' + J(safeVal(c, "ADBE Vector Fill Color")) +
                   ',"opacity":' + J(safeVal(c, "ADBE Vector Fill Opacity")) + "}";
          } else if (mn === "ADBE Vector Graphic - Stroke" && stroke === "null") {
            stroke = "{" + '"enabled":' + (c.enabled ? "true" : "false") +
                     ',"color":' + J(safeVal(c, "ADBE Vector Stroke Color")) +
                     ',"width":' + J(safeVal(c, "ADBE Vector Stroke Width")) +
                     ',"opacity":' + J(safeVal(c, "ADBE Vector Stroke Opacity")) + "}";
          } else if (mn === "ADBE Vector Transform Group" && grpTr === "null") {
            grpTr = "{" + '"anchor":' + J(safeVal(c, "ADBE Vector Anchor")) +
                    ',"position":' + J(safeVal(c, "ADBE Vector Position")) +
                    ',"scale":' + J(safeVal(c, "ADBE Vector Scale")) +
                    ',"rotation":' + J(safeVal(c, "ADBE Vector Rotation")) +
                    ',"opacity":' + J(safeVal(c, "ADBE Vector Group Opacity")) + "}";
          }
          try { if (c.numProperties > 0) dig(c, d + 1); } catch (e4) {}
        }
      }
      dig(root, 0);
      return "{" + '"groupTransform":' + grpTr + ',"rect":' + rect +
             ',"fill":' + fill + ',"stroke":' + stroke + "}";
    }
    function layerSpec(ly) {
      var o = ['"name":' + enc(ly.name), '"index":' + ly.index];
      // 源
      var sk = "其他", sn = "", sd = 0, sw = 0, sh = 0;
      try {
        if (ly.source) {
          sn = ly.source.name;
          if (ly.source instanceof CompItem) { sk = "嵌套合成"; sd = ly.source.duration; }
          else if (ly.source instanceof FootageItem) {
            sd = ly.source.duration; sw = ly.source.width; sh = ly.source.height;
            if (ly.source.mainSource instanceof SolidSource) sk = "固态";
            else sk = (sd > 0) ? "视频" : "图片";
          }
        } else if (ly.matchName === "ADBE Text Layer") sk = "文字";
        else if (ly.matchName === "ADBE Vector Layer") sk = "形状";
      } catch (e) {}
      o.push('"srcKind":' + enc(sk), '"srcName":' + enc(sn));
      o.push('"srcDuration":' + sd, '"srcW":' + sw, '"srcH":' + sh);
      // 时间四维（startTime 含符号，别丢）
      o.push('"inPoint":' + J(ly.inPoint), '"outPoint":' + J(ly.outPoint));
      o.push('"startTime":' + J(ly.startTime));
      o.push('"stretch":' + (ly.stretch === undefined ? 100 : ly.stretch));
      o.push('"enabled":' + (ly.enabled ? "true" : "false"));
      o.push('"threeD":' + (ly.threeDLayer ? "true" : "false"));
      o.push('"motionBlur":' + (ly.motionBlur ? "true" : "false"));
      // 相机层没有 blendingMode，直接拼会写出裸 undefined 把 JSON 弄坏
      o.push('"blendingMode":' + J(ly.blendingMode));
      try { o.push('"collapse":' + (ly.collapseTransformation ? "true" : "false")); } catch (e5) {}
      try { o.push('"parent":' + enc(ly.parent ? ly.parent.name : "")); } catch (e6) {}
      // 遮罩绑定
      var mt = 0, ms = -1;
      try {
        if (ly.trackMatteType && ly.trackMatteType !== TrackMatteType.NO_TRACK_MATTE) {
          mt = ly.trackMatteType;
          try { if (ly.trackMatteLayer) ms = ly.trackMatteLayer.index; } catch (e7) {}
        }
      } catch (e8) {}
      o.push('"trackMatteType":' + mt, '"trackMatteLayerIndex":' + ms);
      try { o.push('"isTrackMatte":' + (ly.isTrackMatte ? "true" : "false")); } catch (e9) {}
      // 图层 Transform（第一级）
      var tr = ly.property("ADBE Transform Group");
      var names = ["ADBE Anchor Point","ADBE Position","ADBE Scale","ADBE Orientation",
                   "ADBE Rotate X","ADBE Rotate Y","ADBE Rotate Z","ADBE Opacity"];
      var ps = [];
      for (var n = 0; n < names.length; n++) {
        var s = propSpec(tr, names[n]);
        if (s) ps.push(s);
      }
      o.push('"transform":[' + ps.join(",") + "]");
      // 形状层第二级变换
      if (sk === "形状") o.push('"shape":' + shapeSpec(ly));
      // 效果名单
      var fx = [];
      try {
        var pa = ly.property("ADBE Effect Parade");
        for (var f = 1; f <= pa.numProperties; f++) fx.push(enc(pa.property(f).name));
      } catch (eA) {}
      o.push('"effects":[' + fx.join(",") + "]");
      return "{" + o.join(",") + "}";
    }
    function compSpec(c, withLayers) {
      var o = ['"name":' + enc(c.name), '"width":' + c.width, '"height":' + c.height,
               '"duration":' + c.duration, '"frameRate":' + c.frameRate,
               '"bgColor":' + J(c.bgColor), '"motionBlur":' + (c.motionBlur ? "true" : "false")];
      if (withLayers) {
        var ls = [];
        for (var L = 1; L <= c.numLayers; L++) ls.push(layerSpec(c.layer(L)));
        o.push('"layers":[' + ls.join(",") + "]");
      }
      return "{" + o.join(",") + "}";
    }
    var target = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === COMP) { target = it; break; }
    }
    if (!target) throw new Error("找不到合成: " + COMP);
    // 嵌套一层：把用到的子合成也整份导出
    var nested = [], seen = "";
    for (var L2 = 1; L2 <= target.numLayers; L2++) {
      var sl = target.layer(L2);
      try {
        if (sl.source && sl.source instanceof CompItem) {
          if (seen.indexOf("|" + sl.source.name + "|") !== -1) continue;
          seen += "|" + sl.source.name + "|";
          nested.push(compSpec(sl.source, true));
        }
      } catch (eB) {}
    }
    var json = "{" + '"root":' + compSpec(target, true) +
               ',"nested":[' + nested.join(",") + "]}";
    var f = new File(OUT); f.encoding = "UTF-8"; f.open("w"); f.write(json); f.close();
    app.endSuppressDialogs(false);
  } catch (err) {
    var ef = new File(OUT + ".err"); ef.open("w");
    ef.write(String(err)); ef.close();
    try { app.endSuppressDialogs(false); } catch (e) {}
  }
})();'''
print(tpl % (json.dumps(out), json.dumps(comp)))
PYEOF

python3 "$DIR/preflight.py" "$JSX" || exit 1
rm -f "$OUT" "$OUT.err"
osascript -e "set jsxPath to \"$JSX\"
set jsxCode to read POSIX file jsxPath as «class utf8»
with timeout of 300 seconds
	tell application \"$APP\"
		DoScript jsxCode
	end tell
end timeout" >/dev/null
sleep 2
if [ -f "$OUT.err" ]; then echo "失败:"; cat "$OUT.err"; exit 1; fi
[ -f "$OUT" ] || { echo "无输出（AE 可能有模态框挡着）"; exit 1; }
python3 -c "
import json
d = json.load(open('$OUT'))
r = d['root']
print('✓ %s  %dx%d  %.2fs @%gfps  %d 层' % (r['name'], r['width'], r['height'], r['duration'], r['frameRate'], len(r['layers'])))
print('  嵌套合成 %d 个，共 %d 层' % (len(d['nested']), sum(len(c['layers']) for c in d['nested'])))
sh = [l for c in [r]+d['nested'] for l in c['layers'] if l.get('shape')]
mt = [l for c in [r]+d['nested'] for l in c['layers'] if l.get('trackMatteType')]
ex = [p for c in [r]+d['nested'] for l in c['layers'] for p in l['transform'] if 'expression' in p]
st = [l for c in [r]+d['nested'] for l in c['layers'] if abs(l.get('startTime',0)) > 0.001]
print('  形状层 %d（含两级变换）/ 带遮罩 %d / 表达式 %d / startTime 非零 %d' % (len(sh), len(mt), len(ex), len(st)))
print('  → %s' % '$OUT')
"
rm -f "$JSX"
