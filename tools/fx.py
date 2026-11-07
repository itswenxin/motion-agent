#!/usr/bin/env python3
"""效果 matchName 查询表。写 JSX 加效果前先查，别猜。

用法:
  python3 fx.py glass            # 模糊搜显示名/分类
  python3 fx.py "gaussian blur"  # 词组
  python3 fx.py --cat Distort    # 列出某分类全部
  python3 fx.py --cats           # 列出所有分类
  python3 fx.py --jsx glass      # 直接输出可粘贴的 JSX 片段
  python3 fx.py --params glass   # 列出该效果的全部参数名和默认值

为什么：addProperty() 要的是 matchName（"ADBE Gaussian Blur 2"），
面板上显示的是 displayName（"Gaussian Blur"），两者经常对不上，猜错静默失败。
字典由 dump_effects.sh 生成，换机器或装新插件后重跑一次即可。
"""
import json, os, sys

_HERE = os.path.dirname(os.path.abspath(__file__))
DICT = os.path.join(_HERE, "effects_dict.json")
PARAMS = os.path.join(_HERE, "effect_params.json")


def load():
    if not os.path.exists(DICT):
        sys.exit("找不到 effects_dict.json，先跑 ./dump_effects.sh")
    return json.load(open(DICT))


def search(data, q):
    q = q.lower()
    exact, partial = [], []
    for e in data:
        dn = (e.get("displayName") or "").lower()
        if dn == q:
            exact.append(e)
        elif q in dn or q in (e.get("category") or "").lower() or q in (e.get("matchName") or "").lower():
            partial.append(e)
    return exact + partial


def show(rows, as_jsx=False):
    if not rows:
        print("无匹配。试试更短的关键词，或 --cats 看分类列表。")
        return
    if as_jsx:
        e = rows[0]
        print('// %s  (%s)' % (e["displayName"], e["category"]))
        print('var fx = layer.property("ADBE Effect Parade").addProperty(%s);'
              % json.dumps(e["matchName"]))
        if len(rows) > 1:
            print('\n// 另有 %d 个匹配，用更精确的关键词或直接指定:' % (len(rows) - 1))
            for e in rows[1:6]:
                print('//   %-34s %s' % (e["displayName"], e["matchName"]))
        return
    print("%-36s %-34s %s" % ("显示名", "matchName（JSX 用这个）", "分类"))
    print("-" * 96)
    for e in rows[:40]:
        print("%-36s %-34s %s" % (e["displayName"][:35], e["matchName"][:33], e["category"]))
    if len(rows) > 40:
        print("... 另有 %d 个" % (len(rows) - 40))


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    data = load()
    if args[0] == "--params":
        q = " ".join(args[1:]).lower()
        if not os.path.exists(PARAMS):
            sys.exit("参数表不存在，先跑 ./dump_effect_params.sh")
        pd = json.load(open(PARAMS))
        hits = [e for e in pd if q in e["effect"].lower() or q in e["matchName"].lower()]
        if not hits:
            sys.exit("参数表里没有「%s」。参数表只覆盖配方常用效果，\n"
                     "需要别的效果就编辑 recipe_effects.txt 后重跑 dump_effect_params.sh" % q)
        for e in hits[:3]:
            print("── %s  (%s)  分类 %s" % (e["effect"], e["matchName"], e["category"]))
            for pm in e["params"]:
                dv = pm["default"][:30]
                print("   %-30s %s" % (pm["name"][:30], ("默认 " + dv) if dv and dv != "undefined" else ""))
            print()
    elif args[0] == "--cats":
        cats = {}
        for e in data:
            cats[e["category"] or "(无分类)"] = cats.get(e["category"] or "(无分类)", 0) + 1
        for c, n in sorted(cats.items(), key=lambda x: -x[1]):
            print("%-32s %d" % (c, n))
    elif args[0] == "--cat":
        cat = " ".join(args[1:]).lower()
        show([e for e in data if cat in (e.get("category") or "").lower()])
    elif args[0] == "--jsx":
        show(search(data, " ".join(args[1:])), as_jsx=True)
    else:
        show(search(data, " ".join(args)))
