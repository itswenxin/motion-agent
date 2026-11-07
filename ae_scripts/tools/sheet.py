#!/usr/bin/env python3
"""拼 contact sheet。
用法:
  python3 sheet.py <glob或目录> <输出.png> [--cols N] [--width W] [--pair <glob2>]
例:
  python3 sheet.py "out/mycap/f_*.png" out/sheet.png --cols 3
  python3 sheet.py "out/ours/f_*.png" out/cmp.png --pair "out/ref/f_*.png"   # 上排 ours 下排 ref 逐列对比
"""
import sys, glob, os, argparse
from PIL import Image, ImageDraw

def collect(pat):
    if os.path.isdir(pat):
        pat = os.path.join(pat, '*.png')
    fs = sorted(glob.glob(pat))
    if not fs:
        sys.exit('no files match: ' + pat)
    return fs

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--cols', type=int, default=3)
ap.add_argument('--width', type=int, default=640)
ap.add_argument('--pair', default=None)
a = ap.parse_args()

files = collect(a.src)
W = a.width
im0 = Image.open(files[0])
H = round(W * im0.height / im0.width)

if a.pair:
    files2 = collect(a.pair)
    n = min(len(files), len(files2))
    sheet = Image.new('RGB', (W * n, H * 2), 'black')
    d = ImageDraw.Draw(sheet)
    for i in range(n):
        for row, f in ((0, files[i]), (1, files2[i])):
            sheet.paste(Image.open(f).convert('RGB').resize((W, H)), (i * W, row * H))
            d.rectangle([i*W, row*H, i*W+150, row*H+20], fill='black')
            d.text((i*W+4, row*H+4), os.path.basename(f), fill='cyan')
else:
    cols = a.cols
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new('RGB', (W * cols, H * rows), 'black')
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        x, y = (i % cols) * W, (i // cols) * H
        sheet.paste(Image.open(f).convert('RGB').resize((W, H)), (x, y))
        d.rectangle([x, y, x+150, y+20], fill='black')
        d.text((x+4, y+4), os.path.basename(f), fill='cyan')

sheet.save(a.out)
print('saved', a.out, sheet.size)
