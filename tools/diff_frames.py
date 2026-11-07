#!/usr/bin/env python3
"""两组截帧的差异分析：总差异率 + 方向性缺失 + 差异块定位。

用法:
  python3 diff_frames.py <原片帧目录> <复刻帧目录> [--sheet 输出.png] [--pos 图层坐标.txt]

为什么要有：只报一个"差异 27%"没法行动。这里回答三个问题：
  1. 差多少        —— 总差异率（阈值 25，480x270 采样），交付标准见 SKILL.md
  2. 差在哪        —— 连通域找差异块，中心换算回 1920x1080 坐标
  3. 是缺还是偏    —— 方向性：`原片有我没有` vs `我有原片没有`
     两个方向都有 ≈ 位移；只有一个方向 ≈ 缺失或多余

--pos 可选，接一个图层坐标文件，把差异块直接指认到图层名。格式（每行一个时间）：
    T1.0 CARD01:635,203 CARD02:1003,183 ...
生成方式：在 AE 里遍历图层读 valueAtTime(T, false)，见 SKILL.md「定位错误的标准手法」。
"""
import sys, os, glob
import numpy as np
from PIL import Image, ImageDraw

W, H = 480, 270          # 采样分辨率
SX, SY = 1920 / W, 1080 / H
THRESH = 25              # 像素差阈值
INK = 200                # 判定"有内容"的暗度阈值（低于此=有内容，白底为背景）


def blobs(mask, minpx=400):
    """连通域标记（不依赖 scipy）：逐行游程 + 并查集。"""
    h, w = mask.shape
    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    lab = np.zeros((h, w), dtype=np.int32)
    nxt = 1
    for y in range(h):
        row = mask[y]
        x = 0
        while x < w:
            if not row[x]:
                x += 1
                continue
            x0 = x
            while x < w and row[x]:
                x += 1
            seg = slice(x0, x)
            above = lab[y - 1, seg] if y > 0 else np.zeros(0, dtype=np.int32)
            ids = np.unique(above[above > 0])
            if len(ids) == 0:
                parent[nxt] = nxt
                lab[y, seg] = nxt
                nxt += 1
            else:
                lab[y, seg] = ids[0]
                for o in ids[1:]:
                    union(ids[0], o)
    groups = {}
    ys, xs = np.nonzero(lab)
    for y, x in zip(ys, xs):
        groups.setdefault(find(lab[y, x]), []).append((x, y))
    out = []
    for pts in groups.values():
        if len(pts) < minpx:
            continue
        p = np.array(pts)
        out.append((len(pts), p[:, 0].mean(), p[:, 1].mean()))
    out.sort(reverse=True)
    return out


def load_positions(path):
    """读图层坐标文件，返回 {时间: {图层名: (x, y)}}"""
    pos = {}
    if not path or not os.path.exists(path):
        return pos
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line.startswith("T"):
            continue
        parts = line.split(" ")
        try:
            t = float(parts[0][1:])
        except ValueError:
            continue
        d = {}
        for p in parts[1:]:
            if ":" not in p:
                continue
            nm, xy = p.rsplit(":", 1)
            if "," not in xy:
                continue
            x, y = xy.split(",")
            try:
                d[nm] = (float(x), float(y))
            except ValueError:
                pass
        pos[t] = d
    return pos


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit(__doc__)
    dir_a, dir_b = args[0], args[1]
    sheet_path = None
    pos_path = None
    for i, a in enumerate(sys.argv):
        if a == "--sheet" and i + 1 < len(sys.argv):
            sheet_path = sys.argv[i + 1]
        if a == "--pos" and i + 1 < len(sys.argv):
            pos_path = sys.argv[i + 1]

    A = sorted(glob.glob(os.path.join(dir_a, "f_*.png")))
    B = sorted(glob.glob(os.path.join(dir_b, "f_*.png")))
    if not A or not B:
        sys.exit("找不到帧（期望 <目录>/f_*.png）。原片 %d 张，复刻 %d 张" % (len(A), len(B)))
    if len(A) != len(B):
        print("注意：帧数不等（原片 %d / 复刻 %d），按较少的比" % (len(A), len(B)))

    POS = load_positions(pos_path)
    sheet = None
    total = 0.0
    n = min(len(A), len(B))
    sw = 620

    for i in range(n):
        try:
            t = int(A[i].split("_")[-1].split(".")[0]) / 100
        except ValueError:
            t = float(i)
        ia = Image.open(A[i]).convert("RGB")
        ib = Image.open(B[i]).convert("RGB")
        a = np.asarray(ia.resize((W, H)), dtype=np.float32)
        b = np.asarray(ib.resize((W, H)), dtype=np.float32)

        d = np.abs(a - b).max(axis=2) > THRESH
        pct = d.mean() * 100
        total += pct
        print("\n=== t=%.2fs  总差异 %.1f%% ===" % (t, pct))

        onlyA = (a.min(axis=2) < INK) & (b.min(axis=2) >= INK)
        onlyB = (b.min(axis=2) < INK) & (a.min(axis=2) >= INK)
        print("   原片有我没有 %.2f%%   我有原片没有 %.2f%%" % (onlyA.mean() * 100, onlyB.mean() * 100))

        if t in POS:
            rows = []
            for nm, (cx, cy) in POS[t].items():
                x, y = int(cx / SX), int(cy / SY)
                r = 22
                x0, x1 = max(0, x - r), min(W, x + r)
                y0, y1 = max(0, y - r), min(H, y + r)
                if x1 <= x0 or y1 <= y0:
                    continue
                oa = onlyA[y0:y1, x0:x1].mean() * 100
                ob = onlyB[y0:y1, x0:x1].mean() * 100
                if max(oa, ob) > 7:
                    rows.append((max(oa, ob), nm, oa, ob))
            rows.sort(reverse=True)
            if rows:
                for _, nm, oa, ob in rows[:6]:
                    kind = "位移" if min(oa, ob) > 4 else ("缺失" if oa > ob else "多余")
                    print("   %-20s %s  (缺%.0f%% 多%.0f%%)" % (nm, kind, oa, ob))
            else:
                print("   逐层检查：无明显缺失/多余 ✓")
        else:
            for area, cx, cy in blobs(d)[:5]:
                print("   差异块 面积%6d px  中心(%4d,%4d)"
                      % (int(area * SX * SY), int(cx * SX), int(cy * SY)))

        if sheet_path:
            if sheet is None:
                sh = int(ia.size[1] * sw / ia.size[0])
                sheet = Image.new("RGB", (sw * n, sh * 2 + 30), "#222")
                draw = ImageDraw.Draw(sheet)
            sheet.paste(ia.resize((sw, sh)), (i * sw, 30))
            sheet.paste(ib.resize((sw, sh)), (i * sw, sh + 30))
            draw.text((i * sw + 8, 8), "t=%.2fs  上原片 下复刻" % t, fill="yellow")

    print("\n平均差异 %.1f%%  (交付标准 ≤ 约 12%%，且逐层数值须全绿)" % (total / n))
    if sheet_path and sheet is not None:
        sheet.save(sheet_path)
        print("对比图已存：%s" % sheet_path)


if __name__ == "__main__":
    main()
