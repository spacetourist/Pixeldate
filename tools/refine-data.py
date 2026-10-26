#!/usr/bin/env python3
"""Refine reveal · build-time image prep for the 7 finding-screen images (SPEC §2 treeFromImage, §7 "precompute").

For each image: 512² box-average readback (4x4 px per finest cell), 128² cell means, the full quadtree pyramid
(depth 0..7, 21,845 nodes) and the per-node colour sd = sqrt(max(0, E[r²+g²+b²] − |E[rgb]|²) / 3).
Output public/refine/<id>.rr (71,001 bytes, ~57 KB gz):
  bytes 0..3     b'RR' 0x01 maxD
  next T²·3      finest-level RGB means (uint8, row-major, T = 2^maxD)
  next count     sd per node, uint8 = round(sd·2) clamped to 255 (0.5 resolution; sdStop 4.5 / sdRef 46 sit well inside)
Parent colours are not stored: the worker rebuilds them by averaging the 4 children (exactly the pyramid the SPEC uses).
The sharp images are copied as-is. Usage: python3 tools/refine-data.py   (needs Pillow; output is committed)"""
import os, shutil, struct
from PIL import Image

SRC = '/workspace/design/pixeldate/finding-set-options/date-night'  # GD's Date Night set (1024² webp q82)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'refine')
IDS = ['cinema-seats', 'diner-milkshake', 'shared-umbrella', 'dusk-picnic', 'ferris-wheel', 'coffee-cups', 'rooftop-bikes']
MAXD = 7

def build(path):
    T = 1 << MAXD; W = T * 4
    im = Image.open(path).convert('RGB').resize((W, W), Image.Resampling.BOX if hasattr(Image, 'Resampling') else Image.BOX)
    px = im.load()
    off = []; n = 0
    for d in range(MAXD + 1): off.append(n); n += 1 << (2 * d)
    r = [0.0] * n; g = [0.0] * n; b = [0.0] * n; sq = [0.0] * n
    o = off[MAXD]
    for y in range(T):
        for x in range(T):
            R = G = B = S2 = 0
            for j in range(4):
                for i in range(4):
                    pr, pg, pb = px[x * 4 + i, y * 4 + j]; R += pr; G += pg; B += pb; S2 += pr * pr + pg * pg + pb * pb
            k = o + y * T + x; r[k] = R / 16; g[k] = G / 16; b[k] = B / 16; sq[k] = S2 / 16
    for d in range(MAXD - 1, -1, -1):
        nn = 1 << d; cn = nn * 2
        for y in range(nn):
            for x in range(nn):
                k = off[d] + y * nn + x; c0 = off[d + 1] + 2 * y * cn + 2 * x; cs = (c0, c0 + 1, c0 + cn, c0 + cn + 1)
                r[k] = sum(r[c] for c in cs) / 4; g[k] = sum(g[c] for c in cs) / 4; b[k] = sum(b[c] for c in cs) / 4; sq[k] = sum(sq[c] for c in cs) / 4
    sd = bytearray(n)
    for k in range(n):
        v = sq[k] - (r[k] * r[k] + g[k] * g[k] + b[k] * b[k]); s = (max(0.0, v) / 3) ** .5
        sd[k] = min(255, round(s * 2))
    leaf = bytearray(T * T * 3)
    for i in range(T * T):
        k = o + i; leaf[i * 3] = round(r[k]); leaf[i * 3 + 1] = round(g[k]); leaf[i * 3 + 2] = round(b[k])
    return b'RR' + struct.pack('BB', 1, MAXD) + bytes(leaf) + bytes(sd)

os.makedirs(OUT, exist_ok=True)
for i in IDS:
    data = build(os.path.join(SRC, i + '.webp'))
    open(os.path.join(OUT, i + '.rr'), 'wb').write(data)
    shutil.copyfile(os.path.join(SRC, i + '.webp'), os.path.join(OUT, i + '.webp'))
    print(i, len(data), 'bytes')
