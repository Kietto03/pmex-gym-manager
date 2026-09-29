"""Hand-built pixel sprite sheets for the header mascots (Pikachu, Bulbasaur, Eevee).

Output follows the page-mascot format (github.com/nilbuild/page-mascot): two 3x3 sheets per
character, drawn on one fixed body so nothing jumps when the sheets swap.
  <name>-directions.png  up-left, up, up-right / left, center, right / down-left, down, down-right
  <name>-reactions.png   blink, heart, sparkle / surprised, wink(starstruck), bashful / sleepy, dizzy, delighted

    python3 tools/draw_mascots.py            # writes assets/mascots/*.png

Each cell is drawn on a 48x48 pixel grid and scaled up 4x with nearest-neighbour, so the
pixels stay crisp. Shapes are filled masks; every part gets a dark outline on its own edge
and a darker band on its lower-right side, which is what makes it read as a sprite.
"""
import math
import os
from PIL import Image

N = 48          # cell size in art pixels
SCALE = 4       # output pixels per art pixel
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'mascots')

DIRS = [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
REACTIONS = ['blink', 'heart', 'sparkle', 'surprised', 'starstruck', 'bashful', 'sleepy', 'dizzy', 'delighted']

INK = (43, 30, 22, 255)
WHITE = (255, 255, 255, 255)
BLUSH = (255, 120, 140, 255)
HEART = (236, 58, 86, 255)
STAR = (255, 214, 64, 255)
ZZZ = (96, 150, 235, 255)
MOUTH_IN = (190, 60, 70, 255)


class Canvas:
    def __init__(self):
        self.px = {}

    def put(self, x, y, c):
        if 0 <= x < N and 0 <= y < N:
            self.px[(round(x), round(y))] = c

    def image(self):
        img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            img.putpixel((x, y), c)
        return img.resize((N * SCALE, N * SCALE), Image.NEAREST)


def ellipse(cx, cy, rx, ry):
    return {(x, y) for x in range(N) for y in range(N) if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1}


def polygon(pts):
    def inside(x, y):
        c = False
        for i in range(len(pts)):
            (x1, y1), (x2, y2) = pts[i], pts[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                c = not c
        return c
    return {(x, y) for x in range(N) for y in range(N) if inside(x + .5, y + .5)}


def paint(cv, mask, base, shade, light=None, cx=None, cy=None, clip=None):
    """Fill a part with a base colour, a darker lower-right band and an inner outline."""
    if clip is not None:
        mask = mask & clip
    xs = [p[0] for p in mask] or [0]
    ys = [p[1] for p in mask] or [0]
    cx = (min(xs) + max(xs)) / 2 if cx is None else cx
    cy = (min(ys) + max(ys)) / 2 if cy is None else cy
    w, h = max(1, max(xs) - min(xs)), max(1, max(ys) - min(ys))
    for (x, y) in mask:
        edge = any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        side = (x - cx) / w + (y - cy) / h
        if edge:
            c = INK
        elif side > .42:
            c = shade
        elif light and side < -.5:
            c = light
        else:
            c = base
        cv.put(x, y, c)
    return mask


def dot(cv, pts, c):
    for x, y in pts:
        cv.put(x, y, c)


# ─── Faces ───
def eyes_open(cv, x, y, big=False, iris=INK, gap=12):
    for ex in (x - gap // 2, x + gap // 2):
        h = 5 if big else 4
        for yy in range(h):
            for xx in range(3):
                cv.put(ex - 1 + xx, y - 2 + yy, iris)
        cv.put(ex - 1, y - 2, WHITE)
        if big:
            cv.put(ex, y - 1, WHITE)


def eyes_arc(cv, x, y, gap=12):
    for ex in (x - gap // 2, x + gap // 2):
        dot(cv, [(ex - 2, y), (ex - 1, y - 1), (ex, y - 1), (ex + 1, y - 1), (ex + 2, y)], INK)


def eyes_flat(cv, x, y, gap=12):
    for ex in (x - gap // 2, x + gap // 2):
        dot(cv, [(ex - 2, y), (ex - 1, y + 1), (ex, y + 1), (ex + 1, y + 1), (ex + 2, y)], INK)


def eyes_star(cv, x, y, gap=12, star=STAR):
    for ex in (x - gap // 2, x + gap // 2):
        dot(cv, [(ex, y - 3), (ex, y - 2), (ex - 1, y - 1), (ex, y - 1), (ex + 1, y - 1),
                 (ex - 3, y), (ex - 2, y), (ex - 1, y), (ex, y), (ex + 1, y), (ex + 2, y), (ex + 3, y),
                 (ex - 2, y + 1), (ex - 1, y + 1), (ex, y + 1), (ex + 1, y + 1), (ex + 2, y + 1),
                 (ex - 2, y + 2), (ex + 2, y + 2)], star)
        dot(cv, [(ex, y - 4), (ex - 4, y), (ex + 4, y), (ex - 3, y + 3), (ex + 3, y + 3)], INK)


def eyes_spiral(cv, x, y, gap=12):
    for ex in (x - gap // 2, x + gap // 2):
        ring = [(ex - 1, y - 2), (ex, y - 2), (ex + 1, y - 2), (ex + 2, y - 1), (ex + 2, y), (ex + 2, y + 1),
                (ex + 1, y + 2), (ex, y + 2), (ex - 1, y + 2), (ex - 2, y + 1), (ex - 2, y), (ex - 2, y - 1),
                (ex - 1, y - 1), (ex, y), (ex - 1, y)]
        dot(cv, ring, INK)


def mouth(cv, x, y, kind='smile'):
    if kind == 'smile':
        dot(cv, [(x - 2, y), (x - 1, y + 1), (x, y), (x + 1, y + 1), (x + 2, y)], INK)
    elif kind == 'o':
        dot(cv, [(x - 1, y), (x, y), (x + 1, y), (x - 2, y + 1), (x + 2, y + 1), (x - 1, y + 2), (x, y + 2), (x + 1, y + 2)], INK)
        dot(cv, [(x - 1, y + 1), (x, y + 1), (x + 1, y + 1)], MOUTH_IN)
    elif kind == 'grin':
        for xx in range(x - 3, x + 4):
            cv.put(xx, y, INK)
        dot(cv, [(x - 3, y + 1), (x + 3, y + 1), (x - 2, y + 2), (x + 2, y + 2), (x - 1, y + 3), (x, y + 3), (x + 1, y + 3)], INK)
        dot(cv, [(x - 2, y + 1), (x - 1, y + 1), (x, y + 1), (x + 1, y + 1), (x + 2, y + 1), (x - 1, y + 2), (x, y + 2), (x + 1, y + 2)], MOUTH_IN)
    elif kind == 'wave':
        dot(cv, [(x - 3, y + 1), (x - 2, y), (x - 1, y + 1), (x, y), (x + 1, y + 1), (x + 2, y), (x + 3, y + 1)], INK)


def symbols(cv, kind, top=4):
    if kind == 'heart':
        hx, hy = 38, top
        dot(cv, [(hx - 2, hy), (hx - 1, hy), (hx + 1, hy), (hx + 2, hy)], HEART)
        for yy, w in ((1, 3), (2, 3), (3, 2), (4, 1), (5, 0)):
            for xx in range(-w, w + 1):
                cv.put(hx + xx, hy + yy, HEART)
        cv.put(hx - 2, hy + 1, WHITE)
    elif kind == 'sparkle':
        for sx, sy in ((9, top + 3), (39, top + 1), (42, top + 8)):
            dot(cv, [(sx, sy - 2), (sx, sy - 1), (sx - 2, sy), (sx - 1, sy), (sx, sy), (sx + 1, sy), (sx + 2, sy), (sx, sy + 1), (sx, sy + 2)], STAR)
    elif kind == 'zzz':
        for zx, zy, s in ((34, top + 7, 3), (39, top + 2, 4)):
            for xx in range(s):
                cv.put(zx + xx, zy, ZZZ)
                cv.put(zx + xx, zy + s - 1, ZZZ)
            for i in range(s):
                cv.put(zx + s - 1 - i, zy + i, ZZZ)


def face(cv, kind, fx, fy, spec):
    ex, ey, my = spec['eyes_x'] + fx, spec['eyes_y'] + fy, spec['mouth_y'] + fy
    gap = spec.get('gap', 12)
    blush = spec.get('blush')
    if blush:
        c = BLUSH if kind == 'bashful' else blush
        for bx in (ex - gap // 2 - 4, ex + gap // 2 + 4):
            r = 3 if kind == 'bashful' else 2
            for (x, y) in ellipse(bx + .5, ey + 4.5, r, 1.8):
                if (x, y) in spec['head']:
                    cv.put(x, y, c)
    if spec.get('nose'):
        cv.put(ex, ey + 3, INK)
    iris = spec.get('iris', INK)
    if kind in ('look', 'surprised'):
        eyes_open(cv, ex, ey, big=kind == 'surprised' or spec.get('big_eyes'), iris=iris, gap=gap)
    elif kind == 'sleepy':
        eyes_flat(cv, ex, ey, gap)
    elif kind == 'starstruck':
        eyes_star(cv, ex, ey, gap, spec.get('star', STAR))
    elif kind == 'dizzy':
        eyes_spiral(cv, ex, ey, gap)
    else:
        eyes_arc(cv, ex, ey, gap)
    mouth(cv, ex, my, {'surprised': 'o', 'starstruck': 'grin', 'delighted': 'grin', 'dizzy': 'wave'}.get(kind, 'smile'))
    symbols(cv, {'heart': 'heart', 'sparkle': 'sparkle', 'sleepy': 'zzz'}.get(kind, ''))


# ─── Characters ───
def pikachu(cv, dx, dy, kind):
    Y, YS, YL = (250, 214, 52, 255), (222, 170, 30, 255), (255, 236, 120, 255)
    hx, hy = dx, dy
    # ears: long, tipped black, lean away from where the head turns
    for side in (-1, 1):
        base = 24 + side * 8 + hx
        tipx = 24 + side * 19 + hx * 2 - dx * (1 if side == dx else 0)
        ear = polygon([(base - 4, 22 + hy), (tipx, 3 + hy + (1 if side == -dx else 0)), (base + 4, 18 + hy)])
        paint(cv, ear, Y, YS)
        for (x, y) in ear:
            if y < 11 + hy:
                cv.put(x, y, INK)
    body = paint(cv, ellipse(24, 45, 10, 7) - {(x, y) for x in range(N) for y in range(45, N)}, Y, YS)
    head = paint(cv, ellipse(24 + hx, 28 + hy, 14, 11.5), Y, YS, YL)
    face(cv, kind, dx * 2 + hx, dy * 2 + hy, {'eyes_x': 24, 'eyes_y': 27, 'mouth_y': 32, 'blush': (232, 64, 52, 255), 'nose': True, 'head': head, 'star': (255, 110, 40, 255)})


def bulbasaur(cv, dx, dy, kind):
    T, TS, TL = (112, 196, 168, 255), (70, 150, 128, 255), (156, 222, 196, 255)
    G, GS = (96, 176, 84, 255), (60, 128, 60, 255)
    hx, hy = dx, dy
    # the bulb sits on its back and peeks over the head; it stays with the body
    bulb = paint(cv, ellipse(24 - dx, 15, 11, 9), G, GS, (140, 206, 110, 255))
    for (x, y) in bulb:
        if abs(x - (24 - dx)) in (0,) and 8 < y < 20:
            cv.put(x, y, GS)
    dot(cv, [(18 - dx, 12), (19 - dx, 11), (29 - dx, 12), (30 - dx, 11)], GS)
    body = paint(cv, ellipse(24, 45, 11, 7) - {(x, y) for x in range(N) for y in range(45, N)}, T, TS)
    for side in (-1, 1):
        ear = polygon([(24 + side * 7 + hx, 20 + hy), (24 + side * 13 + hx, 13 + hy), (24 + side * 13 + hx, 22 + hy)])
        paint(cv, ear, T, TS)
    head = paint(cv, ellipse(24 + hx, 29 + hy, 15, 10.5), T, TS, TL)
    for sx, sy in ((14, 25), (33, 24), (30, 21), (17, 33)):
        for (x, y) in ellipse(sx + hx + dx + .5, sy + hy + .5, 1.6, 1.2):
            if (x, y) in head and cv.px.get((x, y)) not in (INK,):
                cv.put(x, y, TS)
    face(cv, kind, dx * 2 + hx, dy * 2 + hy, {'eyes_x': 24, 'eyes_y': 28, 'mouth_y': 33, 'gap': 14, 'iris': (200, 40, 50, 255),
                                             'big_eyes': True, 'head': head, 'blush': (236, 150, 150, 255)})


def eevee(cv, dx, dy, kind):
    B, BS, BL = (190, 126, 70, 255), (146, 90, 48, 255), (214, 156, 96, 255)
    C, CS = (246, 228, 182, 255), (220, 194, 140, 255)
    hx, hy = dx, dy
    for side in (-1, 1):
        ear = polygon([(24 + side * 5 + hx, 22 + hy), (24 + side * 19 + hx * 2, 5 + hy), (24 + side * 13 + hx, 24 + hy)])
        paint(cv, ear, B, BS)
        inner = polygon([(24 + side * 8 + hx, 20 + hy), (24 + side * 17 + hx * 2, 9 + hy), (24 + side * 13 + hx, 21 + hy)])
        for (x, y) in inner:
            if cv.px.get((x, y)) != INK:
                cv.put(x, y, (110, 66, 36, 255))
    # the fluffy cream ruff is the body
    ruff = ellipse(24, 44, 13, 7) | polygon([(11, 44), (14, 36), (18, 41), (21, 35), (24, 40), (27, 35), (30, 41), (34, 36), (37, 44)])
    paint(cv, ruff - {(x, y) for x in range(N) for y in range(46, N)}, C, CS)
    head = paint(cv, ellipse(24 + hx, 28 + hy, 12.5, 11), B, BS, BL)
    face(cv, kind, dx * 2 + hx, dy * 2 + hy, {'eyes_x': 24, 'eyes_y': 27, 'mouth_y': 32, 'gap': 11, 'iris': (58, 34, 22, 255),
                                             'big_eyes': True, 'nose': True, 'head': head, 'blush': (236, 140, 120, 255)})


def sheet(draw, cells):
    out = Image.new('RGBA', (N * SCALE * 3, N * SCALE * 3), (0, 0, 0, 0))
    for i, (dx, dy, kind) in enumerate(cells):
        cv = Canvas()
        draw(cv, dx, dy, kind)
        out.alpha_composite(cv.image(), ((i % 3) * N * SCALE, (i // 3) * N * SCALE))
    return out


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, draw in (('pikachu', pikachu), ('bulbasaur', bulbasaur), ('eevee', eevee)):
        sheet(draw, [(dx, dy, 'look') for dx, dy in DIRS]).save(os.path.join(OUT, f'{name}-directions.png'), optimize=True)
        sheet(draw, [(0, 0, k) for k in REACTIONS]).save(os.path.join(OUT, f'{name}-reactions.png'), optimize=True)
        print(name, 'ok')
