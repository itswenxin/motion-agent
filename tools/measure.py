#!/usr/bin/env python3
"""定量测量工具。
用法:
  diff 两帧一致性(验证重建前后首帧不变):
    python3 measure.py diff a.png b.png
  多尺度模板匹配(测某元素从帧A到帧B的缩放与位移):
    python3 measure.py track src.png x0 y0 x1 y1 dst.png [cx cy] [search]
    # (x0,y0,x1,y1)=src 里模板框; (cx,cy)=dst 搜索中心(默认同位置); search=搜索半径默认300
输出: track 打印按相关度排序的 (scale, score, (x,y)) 前三名。
"""
import sys
import numpy as np
from PIL import Image

def load(f):
    return np.asarray(Image.open(f).convert('L'), dtype=np.float32)

def cmd_diff(a, b):
    A, B = load(a), load(b)
    if A.shape != B.shape:
        print('size mismatch:', A.shape, B.shape); return
    d = np.abs(A - B)
    print('mean diff=%.3f  pixels>10: %.2f%%  max=%.0f' % (d.mean(), (d > 10).mean() * 100, d.max()))

def cmd_track(src, x0, y0, x1, y1, dst, cx=None, cy=None, search=300):
    S, D = load(src), load(dst)
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    tpl0 = S[y0:y1, x0:x1]
    if cx is None: cx = (x0 + x1) // 2
    if cy is None: cy = (y0 + y1) // 2
    cx, cy, search = int(cx), int(cy), int(search)
    results = []
    for s in [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5, 1.7]:
        w, h = int((x1 - x0) * s), int((y1 - y0) * s)
        if w < 8 or h < 8: continue
        tpl = np.asarray(Image.fromarray(tpl0.astype(np.uint8)).resize((w, h)), dtype=np.float32)
        tn = (tpl - tpl.mean()) / (tpl.std() + 1e-6)
        hx, hy = w // 2, h // 2
        best, bxy = -2, None
        xa, xb = max(hx, cx - search), min(D.shape[1] - hx, cx + search)
        ya, yb = max(hy, cy - search), min(D.shape[0] - hy, cy + search)
        for yy in range(ya, yb, 5):
            for xx in range(xa, xb, 5):
                win = D[yy - hy:yy - hy + h, xx - hx:xx - hx + w]
                if win.shape != tpl.shape: continue
                sd = win.std()
                if sd < 1: continue
                sc = float((((win - win.mean()) / sd) * tn).mean())
                if sc > best: best, bxy = sc, (xx, yy)
        results.append((s, round(best, 3), bxy))
    results.sort(key=lambda r: -r[1])
    for r in results[:3]:
        print('scale=%.2f score=%.3f center=%s' % r)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    if cmd == 'diff':
        cmd_diff(sys.argv[2], sys.argv[3])
    elif cmd == 'track':
        args = sys.argv[2:]
        cmd_track(*args)
    else:
        print(__doc__); sys.exit(1)
