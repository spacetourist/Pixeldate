#!/usr/bin/env python3
"""Builds the Games Lounge runtime art from GD's pack (read-only: /workspace/design/pixeldate/world/games-lounge/src).
Out: src/world/art/games-map.png (the room, no people, empty tables: no cards dealt until Start), cards/ (all 52 faces
in GD's card style + back), chips/ (1 5 25 100), door-plaque.png. Run: python3 tools/games-lounge-art.py"""
import os, sys
sys.dont_write_bytecode = True
GD = '/workspace/design/pixeldate/world/games-lounge/src'
sys.path.insert(0, GD)
import art
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'world', 'art')
_gt = art.game_table
art.game_table = lambda lamp=True, cards=False, chips=False, kind='snap': _gt(lamp=lamp, cards=False, chips=False, kind=kind)
im = art.render_lounge(art.build_lounge(people=False)); assert im.size == (640, 384)
im.save(os.path.join(OUT, 'games-map.png'))
os.makedirs(os.path.join(OUT, 'cards'), exist_ok=True); os.makedirs(os.path.join(OUT, 'chips'), exist_ok=True)
# GD drew A K Q J 10; the same card_face draws 2-9 (all digits are in the pixel font)
RANKS = {1: 'A', 11: 'J', 12: 'Q', 13: 'K', **{n: str(n) for n in range(2, 11)}}
# 3x5 digits GD's font extension doesn't have yet (same style as his 0 1 2 5)
for d, g in {'3': ['111','001','111','001','111'], '4': ['101','101','111','001','001'], '6': ['111','100','111','101','111'],
             '7': ['111','001','010','010','010'], '8': ['111','101','111','101','111'], '9': ['111','101','111','001','111']}.items():
    art.FONT.setdefault(d, g)
missing = [d for d in '0123456789' if d not in art.FONT]
assert not missing, 'pixel font lacks ' + ''.join(missing)
for code, col, kind in art.SUITS:
    for n, r in RANKS.items():
        art.card_face(r, code, col, kind).save(os.path.join(OUT, 'cards', f'{n}{code.lower()}.png'))
art.card_back().save(os.path.join(OUT, 'cards', 'back.png'))
for v, c in [(1, art.CHIP_CREAM), (5, art.CHIP_CORAL), (25, art.CHIP_BUTTER), (100, art.CHIP_MINT)]:
    art.chip_token(v, c, 18).save(os.path.join(OUT, 'chips', f'{v}.png'))
import shutil; shutil.copy(os.path.join(GD, '..', 'door-plaque.png'), os.path.join(OUT, 'door-plaque.png'))
print('ok')
