#!/bin/bash
# 导出图层的完整动画数据：关键帧时间/数值/插值类型/时间缓动(速度+影响%)。
# 用法: ./dump_layer_anim.sh "<合成名>" "<图层名,逗号分隔> 或 *(全部)" [输出json] [AE应用名]
# 例:   ./dump_layer_anim.sh "Comp 1" "part01,part02,logo.png"
#
# 为什么要有：还原一个动效时，"手感"藏在缓动的 influence 里（图表编辑器手柄长度）。
# 只看数值还原不了节奏，必须连 KeyframeEase 一起读。
set -uo pipefail
COMP="${1:?用法: ./dump_layer_anim.sh <合成名> <图层名列表> [输出] [AE应用名]}"
LAYERS="${2:?需要图层名列表}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${3:-$DIR/layer_anim.json}"
APP="${4:-Adobe After Effects 2026}"
JSX="$DIR/_dump_anim_gen.jsx"

python3 - "$COMP" "$LAYERS" "$OUT" > "$JSX" << 'PYEOF'
import sys, json
comp, layers, out = sys.argv[1], sys.argv[2], sys.argv[3]
tpl = '''(function () {
  var OUT = %s, COMP = %s, WANT = %s;
  try {
    app.beginSuppressDialogs();
    function enc(s) {
      s = String(s === undefined || s === null ? "" : s); var r = "";
      for (var k = 0; k < s.length; k++) { var c = s.charAt(k), o = s.charCodeAt(k);
        if (c === '"') r += '\\\\"'; else if (c === "\\\\") r += "\\\\\\\\";
        else if (o < 32 || o > 126) { var h = o.toString(16); while (h.length<4) h="0"+h; r += "\\\\u"+h; }
        else r += c; }
      return '"' + r + '"';
    }
    function numArr(v) {
      if (v instanceof Array) { var a = []; for (var i=0;i<v.length;i++) a.push(Math.round(v[i]*1000)/1000); return "[" + a.join(",") + "]"; }
      return String(Math.round(v*1000)/1000);
    }
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === COMP) { comp = it; break; }
    }
    if (!comp) throw new Error("comp not found: " + COMP);
    var want = WANT.split(",");
    var out = [];
    for (var L = 1; L <= comp.numLayers; L++) {
      var ly = comp.layer(L);
      var hit = (WANT === "*");
      if (!hit) for (var w = 0; w < want.length; w++) if (ly.name === want[w]) { hit = true; break; }
      if (!hit) continue;
      var props = [];
      var tr = ly.property("ADBE Transform Group");
      var names = ["ADBE Anchor Point","ADBE Position","ADBE Scale","ADBE Orientation",
                   "ADBE Rotate X","ADBE Rotate Y","ADBE Rotate Z","ADBE Opacity"];
      for (var p = 0; p < names.length; p++) {
        var pr = null;
        try { pr = tr.property(names[p]); } catch (e) { continue; }
        if (!pr) continue;
        if (pr.numKeys === 0) {
          props.push('{"prop":' + enc(pr.name) + ',"static":' + numArr(pr.value) + '}');
          continue;
        }
        var keys = [];
        for (var k = 1; k <= pr.numKeys; k++) {
          var ie = "", oe = "";
          try {
            var i1 = pr.keyInTemporalEase(k), o1 = pr.keyOutTemporalEase(k);
            ie = Math.round(i1[0].influence*10)/10 + "/" + Math.round(i1[0].speed*100)/100;
            oe = Math.round(o1[0].influence*10)/10 + "/" + Math.round(o1[0].speed*100)/100;
          } catch (e2) {}
          keys.push('{"t":' + Math.round(pr.keyTime(k)*1000)/1000 +
                    ',"f":' + Math.round(pr.keyTime(k)*comp.frameRate) +
                    ',"v":' + numArr(pr.keyValue(k)) +
                    ',"in":' + enc(String(pr.keyInInterpolationType(k))) +
                    ',"out":' + enc(String(pr.keyOutInterpolationType(k))) +
                    ',"easeIn":' + enc(ie) + ',"easeOut":' + enc(oe) + '}');
        }
        props.push('{"prop":' + enc(pr.name) + ',"keys":[' + keys.join(",") + ']}');
      }
      // 源类型：文件素材 / 嵌套合成 / 文字 / 形状 / 固态
      var srcKind = "其他", srcName = "", srcDur = 0, srcW = 0, srcH = 0;
      try {
        if (ly.source) {
          srcName = ly.source.name;
          if (ly.source instanceof CompItem) { srcKind = "嵌套合成"; srcDur = ly.source.duration; }
          else if (ly.source instanceof FootageItem) {
            srcDur = ly.source.duration;
            srcW = ly.source.width; srcH = ly.source.height;
            if (ly.source.mainSource instanceof SolidSource) srcKind = "固态";
            else srcKind = (srcDur > 0) ? "视频" : "图片";
          }
        } else if (ly.matchName === "ADBE Text Layer") srcKind = "文字";
        else if (ly.matchName === "ADBE Vector Layer") srcKind = "形状";
      } catch (eS) {}

      // 遮罩(track matte)
      var tm = "无", tmSrc = "";
      try {
        if (ly.trackMatteType && ly.trackMatteType !== TrackMatteType.NO_TRACK_MATTE) {
          var tmv = ly.trackMatteType;
          if (tmv === TrackMatteType.ALPHA) tm = "Alpha";
          else if (tmv === TrackMatteType.ALPHA_INVERTED) tm = "Alpha反转";
          else if (tmv === TrackMatteType.LUMA) tm = "Luma";
          else if (tmv === TrackMatteType.LUMA_INVERTED) tm = "Luma反转";
          else tm = "有(" + tmv + ")";
          try { if (ly.trackMatteLayer) tmSrc = ly.trackMatteLayer.name; } catch (eT2) {}
        }
      } catch (eT) {}

      // 蒙版(mask)
      var masks = [];
      try {
        var mg = ly.property("ADBE Mask Parade");
        if (mg) {
          for (var mi = 1; mi <= mg.numProperties; mi++) {
            var mk = mg.property(mi);
            var mm = "";
            try { mm = String(mk.maskMode); } catch (eM2) {}
            var mAnim = 0;
            try { mAnim = mk.property("ADBE Mask Shape").numKeys; } catch (eM3) {}
            masks.push('{"name":' + enc(mk.name) + ',"mode":' + enc(mm) +
                       ',"shapeKeys":' + mAnim + '}');
          }
        }
      } catch (eM) {}

      // 效果清单
      var fxs = [];
      try {
        var pa = ly.property("ADBE Effect Parade");
        for (var fi = 1; fi <= pa.numProperties; fi++) fxs.push(enc(pa.property(fi).name));
      } catch (eF) {}

      out.push('{"layer":' + enc(ly.name) + ',"idx":' + L +
               ',"in":' + Math.round(ly.inPoint*1000)/1000 +
               ',"out":' + Math.round(ly.outPoint*1000)/1000 +
               ',"startTime":' + Math.round(ly.startTime*1000)/1000 +
               ',"stretch":' + (ly.stretch === undefined ? 100 : ly.stretch) +
               ',"srcKind":' + enc(srcKind) + ',"srcName":' + enc(srcName) +
               ',"srcDur":' + Math.round(srcDur*100)/100 +
               ',"srcW":' + srcW + ',"srcH":' + srcH +
               ',"3d":' + (ly.threeDLayer?1:0) +
               ',"mb":' + (ly.motionBlur?1:0) +
               ',"blend":' + enc(String(ly.blendingMode)) +
               ',"matte":' + enc(tm) + ',"matteSrc":' + enc(tmSrc) +
               ',"masks":[' + masks.join(",") + ']' +
               ',"effects":[' + fxs.join(",") + ']' +
               ',"parent":' + enc(ly.parent ? ly.parent.name : "") +
               ',"props":[' + props.join(",") + ']}');
    }
    var f = new File(OUT); f.encoding = "UTF-8"; f.open("w");
    f.write('{"comp":' + enc(COMP) + ',"fps":' + comp.frameRate + ',"layers":[' + out.join(",") + ']}');
    f.close();
    app.endSuppressDialogs(false);
  } catch (err) {
    var ef = new File(OUT + ".err"); ef.open("w"); ef.write(String(err)); ef.close();
    try { app.endSuppressDialogs(false); } catch (e) {}
  }
})();'''
print(tpl % (json.dumps(out), json.dumps(comp), json.dumps(layers)))
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
[ -f "$OUT" ] || { echo "无输出"; exit 1; }
python3 -c "
import json
d = json.load(open('$OUT'))
n = sum(len([p for p in l['props'] if 'keys' in p]) for l in d['layers'])
k = sum(len(p['keys']) for l in d['layers'] for p in l['props'] if 'keys' in p)
mt = sum(1 for l in d['layers'] if l.get('matte','无') != '无')
mk = sum(len(l.get('masks',[])) for l in d['layers'])
cp = sum(1 for l in d['layers'] if l.get('srcKind') == '嵌套合成')
print('✓ %d 层 / %d 条动画属性 / %d 关键帧 / %d 层带遮罩 / %d 个蒙版 / %d 层是嵌套合成' % (len(d['layers']), n, k, mt, mk, cp))
"
rm -f "$JSX"
