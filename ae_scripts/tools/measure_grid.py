#!/usr/bin/env python3
"""从参考视频里量出网格布局：面板矩形、沟槽宽度、分割线位置、稳定状态窗口。

配套 cases/ui-animation/adaptive-grid-reflow/RECIPE.md。
只依赖 numpy + Pillow，不需要 scipy。

用法:
    # 第一步：看看整体长什么样，顺便确认外框位置
    python3 measure_grid.py ref.mp4 --sheet

    # 第二步：量。--frame 是外框包围盒，不给就自动找
    python3 measure_grid.py ref.mp4 --states

    # 第三步：某个时刻的精确矩形
    python3 measure_grid.py ref.mp4 --at 11.0 --at 3.0

这是量尺工具，不是判官。检测结果必须和 --sheet 的缩略图对着看：
面板数对不上就调 --gap（必须小于沟槽宽）、--inset、--inset-x。
和底色接近的深色面板会漏检，这属于正常，人眼补上即可。
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw


def extract(video, outdir, fps=30, width=720):
    os.makedirs(outdir, exist_ok=True)
    if len(os.listdir(outdir)) > 0:
        return sorted(os.listdir(outdir))
    subprocess.run(["ffmpeg", "-v", "error", "-i", video,
                    "-vf", f"fps={fps},scale={width}:-1",
                    "-start_number", "0", f"{outdir}/f%04d.png"], check=True)
    return sorted(os.listdir(outdir))


def find_frame_bbox(path, bg_tol=6):
    """找浏览器外框：逐行逐列统计不是页面背景色的像素"""
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    H, W, _ = a.shape
    corner = a[2, 2]                                  # 页面背景 = 角落的颜色
    notbg = np.abs(a - corner).max(axis=2) > bg_tol
    ys = np.flatnonzero(notbg[:, ::3].sum(axis=1) > 8)
    xs = np.flatnonzero(notbg[::3, :].sum(axis=0) > 8)
    if ys.size == 0 or xs.size == 0:
        return 0, 0, W - 1, H - 1
    return int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1])


def _closerow(m, gap):
    """按行合并间隔小于 gap 的游程。gap 必须小于沟槽宽，否则会把相邻面板连成一块。"""
    out = m.copy()
    for y in range(m.shape[0]):
        idx = np.flatnonzero(m[y])
        if idx.size < 2:
            continue
        d = np.diff(idx)
        for k in np.flatnonzero((d > 1) & (d < gap)):
            out[y, idx[k]:idx[k + 1]] = True
    return out


def _label(m):
    """游程编码 + 并查集的 4 连通标记，返回 [x0,y0,x1,y1,area]"""
    H, W = m.shape
    pad = np.zeros((H, W + 2), bool)
    pad[:, 1:-1] = m
    d = np.diff(pad.astype(np.int8), axis=1)
    parent = [0]

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    prev, boxes = [], {}
    for y in range(H):
        st = np.flatnonzero(d[y] == 1)
        en = np.flatnonzero(d[y] == -1) - 1
        cur = []
        for x0, x1 in zip(st, en):
            i = len(parent)
            parent.append(i)
            cur.append((int(x0), int(x1), i))
        for x0, x1, i in cur:
            for px0, px1, pj in prev:
                if x0 <= px1 and px0 <= x1:
                    union(pj, i)
        for x0, x1, i in cur:
            r = find(i)
            b = boxes.get(r)
            n = x1 - x0 + 1
            if b is None:
                boxes[r] = [x0, y, x1, y, n]
            else:
                b[0] = min(b[0], x0); b[1] = min(b[1], y)
                b[2] = max(b[2], x1); b[3] = max(b[3], y); b[4] += n
        prev = cur
    merged = {}
    for k, b in boxes.items():
        r = find(k)
        q = merged.get(r)
        if q is None:
            merged[r] = list(b)
        else:
            q[0] = min(q[0], b[0]); q[1] = min(q[1], b[1])
            q[2] = max(q[2], b[2]); q[3] = max(q[3], b[3]); q[4] += b[4]
    return list(merged.values())


def _mode_rgb(px):
    flat = px.reshape(-1, 3)
    key = (flat[:, 0].astype(np.int32) << 16) + (flat[:, 1].astype(np.int32) << 8) + flat[:, 2]
    vals, cnt = np.unique(key, return_counts=True)
    v = int(vals[cnt.argmax()])
    return np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255])


def chrome_bg(path, fbox, ring=5):
    """底色取外框内侧一圈的众数，不要取内容区的众数。
    满幅紫色面板会让内容区众数变成紫色，于是所有面板都被判成背景，一块都检测不到。"""
    x0, y0, x1, y1 = fbox
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    band = np.concatenate([
        a[y0:y0 + ring, x0:x1 + 1].reshape(-1, 3),
        a[y1 - ring:y1 + 1, x0:x1 + 1].reshape(-1, 3),
        a[y0:y1 + 1, x0:x0 + ring].reshape(-1, 3),
        a[y0:y1 + 1, x1 - ring:x1 + 1].reshape(-1, 3)])
    return _mode_rgb(band)


def rects(path, box, gap=14, minarea=3000, fillmin=0.85, bgc=None):
    """box = (x0,y0,x1,y1) 内容区。返回该帧的面板矩形，全图坐标。"""
    x0, y0, x1, y1 = box
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    sub = a[y0:y1 + 1, x0:x1 + 1]
    if bgc is None:
        bgc = _mode_rgb(sub)
    m = np.abs(sub - bgc).max(axis=2) > 10
    m = _closerow(m, gap)
    m = _closerow(m.T, gap).T
    out = []
    for b in _label(m):
        bx0, by0, bx1, by1, area = b
        w, h = bx1 - bx0 + 1, by1 - by0 + 1
        if w * h < minarea or area / (w * h) < fillmin:
            continue
        out.append([bx0 + x0, by0 + y0, bx1 + x0, by1 + y0])
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def settled(series, fps, thresh=1.2, minlen=8):
    """帧间边界变化小于 thresh px 且持续 minlen 帧 = 一个稳定布局状态"""
    prev, mo = None, []
    for r in series:
        s = [v for q in r for v in q]
        mo.append(float(np.mean(np.abs(np.array(s) - np.array(prev))))
                  if prev is not None and len(s) == len(prev) and s else float("nan"))
        prev = s
    runs, run = [], None
    for i, v in enumerate(mo):
        ok = (v == v) and v < thresh and len(series[i]) > 0
        if ok and run is None:
            run = i
        if not ok and run is not None:
            if i - run >= minlen:
                runs.append((run, i - 1))
            run = None
    if run is not None and len(mo) - run >= minlen:
        runs.append((run, len(mo) - 1))
    return runs


def report_gutters(rs, scale=1.0, origin=(0, 0)):
    """从一组矩形推沟槽宽和分割线位置。分割线同时给出容器内的局部坐标，
    因为表达式里的 _p 参数用的就是局部值。"""
    lines = []
    cols = sorted({(r[0], r[2]) for r in rs})
    for i in range(len(cols) - 1):
        g = cols[i + 1][0] - cols[i][1] - 1
        if 4 <= g <= 60:
            s = (cols[i][1] + cols[i + 1][0]) / 2 * scale
            lines.append(f"      列沟槽 {g * scale:.0f}px  分割线 x={s:.1f}  (容器内 {s - origin[0]:.1f})")
    rows = sorted({(r[1], r[3]) for r in rs})
    for i in range(len(rows) - 1):
        g = rows[i + 1][0] - rows[i][1] - 1
        if 4 <= g <= 60:
            s = (rows[i][1] + rows[i + 1][0]) / 2 * scale
            lines.append(f"      行沟槽 {g * scale:.0f}px  分割线 y={s:.1f}  (容器内 {s - origin[1]:.1f})")
    return lines


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--width", type=int, default=720)
    p.add_argument("--gap", type=int, default=14, help="闭运算间隔，必须小于沟槽宽")
    p.add_argument("--inset", type=int, default=66, help="外框到内容区的上下边距")
    p.add_argument("--inset-x", type=int, default=0, help="左右边距，默认 0（横向一般不用内缩）")
    p.add_argument("--sheet", action="store_true", help="出一张 5x4 的缩略图确认构图")
    p.add_argument("--states", action="store_true", help="列出所有稳定布局状态")
    p.add_argument("--at", type=float, action="append", default=[], help="某一时刻的精确矩形")
    p.add_argument("--scale", type=float, default=1.0, help="输出乘以这个系数（720->1080 填 1.5）")
    a = p.parse_args()

    work = os.path.join(tempfile.gettempdir(), "measure_grid_" +
                        os.path.splitext(os.path.basename(a.video))[0])
    files = extract(a.video, work, a.fps, a.width)
    n = len(files)
    print(f"{n} 帧 @ {a.fps}fps  ->  {work}")

    fx0, fy0, fx1, fy1 = find_frame_bbox(f"{work}/f{n // 2:04d}.png")
    print(f"外框 x{fx0}-{fx1}  y{fy0}-{fy1}   ({fx1 - fx0 + 1} x {fy1 - fy0 + 1})")
    ix = a.inset_x
    box = (fx0 + ix, fy0 + a.inset, fx1 - ix, fy1 - a.inset)
    print(f"内容区 x{box[0]}-{box[2]}  y{box[1]}-{box[3]}  (--inset {a.inset} 可调)")
    org = (box[0] * a.scale, box[1] * a.scale)   # 容器原点，分割线局部坐标要减掉它
    bgc = chrome_bg(f"{work}/f{n // 2:04d}.png", (fx0, fy0, fx1, fy1))
    print(f"底色 rgb{tuple(int(v) for v in bgc)} (取自外框内侧一圈)")

    if a.sheet:
        idx = [round(i * (n - 1) / 19) for i in range(20)]
        tw = 288
        sh = Image.new("RGB", (5 * tw, 4 * tw), (20, 20, 20))
        d = ImageDraw.Draw(sh)
        for i, fi in enumerate(idx):
            im = Image.open(f"{work}/f{fi:04d}.png").resize((tw, tw))
            x, y = (i % 5) * tw, (i // 5) * tw
            sh.paste(im, (x, y))
            d.text((x + 6, y + 6), f"{fi / a.fps:.2f}s", fill=(255, 60, 60))
        out = os.path.join(work, "sheet.png")
        sh.save(out)
        print("缩略图:", out)

    if a.states or a.at:
        series = [rects(f"{work}/f{i:04d}.png", box, a.gap, bgc=bgc) for i in range(n)]

    if a.states:
        print("\n稳定布局状态:")
        for s, e in settled(series, a.fps):
            mid = (s + e) // 2
            rs = series[mid]
            print(f"  t={s / a.fps:5.2f}-{e / a.fps:5.2f}s   {len(rs)} 块")
            for r in rs:
                q = [round(v * a.scale, 1) for v in r]
                print(f"      x{q[0]}-{q[2]}  y{q[1]}-{q[3]}   "
                      f"{round((r[2] - r[0] + 1) * a.scale, 1)} x {round((r[3] - r[1] + 1) * a.scale, 1)}")
            for line in report_gutters(rs, a.scale, org):
                print(line)

    for t in a.at:
        fi = min(n - 1, int(round(t * a.fps)))
        rs = series[fi] if a.at and a.states else rects(f"{work}/f{fi:04d}.png", box, a.gap, bgc=bgc)
        print(f"\nt={t}s  ({len(rs)} 块)")
        for r in rs:
            q = [round(v * a.scale, 1) for v in r]
            print(f"      x{q[0]}-{q[2]}  y{q[1]}-{q[3]}")
        for line in report_gutters(rs, a.scale, org):
            print(line)


if __name__ == "__main__":
    main()
