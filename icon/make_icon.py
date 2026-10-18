#!/usr/bin/env python3
# Draws Tokiscope's app icon: pixel art on a 32 x 32 grid inside the macOS icon shape, in the widget's colours.
#   python3 icon/make_icon.py [concept] [out.png]   (needs Pillow)
# build.sh uses the committed icon/AppIcon.icns; icon/make_icns.sh [concept] makes it again from here.
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 1024                      # canvas
BODY = 824                    # the icon shape, centred: Apple's grid for macOS app icons
CELL, GRID = 24, 32           # pixel-art cells, and how many fit across (768 px, centred)
O = (S - CELL * GRID) // 2
ORANGE, AMBER, BLUE, GREEN, PURPLE = (226, 80, 43), (240, 160, 48), (57, 135, 229), (86, 178, 98), (160, 110, 226)
INK = {'D': (143, 143, 143), 'd': (102, 102, 102), 'Y': (232, 232, 232), 'y': (20, 20, 20), 'B': (228, 228, 228),
       'W': (16, 18, 21), 'S': (76, 76, 76), 'K': (26, 26, 26), 'H': (196, 196, 196), 'L': (255, 255, 255), 'R': ORANGE}
TRUCK = ['.....................R..',
         '..DDDDDDDDDDDDDD.BBBBBB.',
         '..DdDDdDDdDDdDDD.BWWWBBB',
         '..DdDDdDDdDDdDDD.BWWWWBB',
         '..DdDDdDDdDDdDDD.BBBBBBB',
         '..YyYyYyYyYyYyYy.BBBBBBL',
         '.SSSSSSSSSSSSSSSSSSSSSS.',
         '...KKK..KKK.......KKK...',
         '..KKHKKKKHKK.....KKHKK..',
         '...KKK..KKK.......KKK...']


def squircle(size, n=5.0, ss=4):
    """The macOS icon shape as an anti-aliased mask: a superellipse, drawn 4x and scaled down."""
    big = size * ss
    m = Image.new('L', (big, big), 0)
    px = m.load()
    r = big / 2
    for y in range(big):
        dy = abs((y + 0.5 - r) / r) ** n
        if dy >= 1:
            continue
        w = int(r * (1 - dy) ** (1 / n))
        for x in range(int(r - w), int(r + w)):
            px[x, y] = 255
    return m.resize((size, size), Image.LANCZOS)


def base(top, bottom):
    """The shape with a vertical gradient, a soft shadow under it, and a faint light along the top edge."""
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    mask = squircle(BODY)
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 110), ((S - BODY) // 2, (S - BODY) // 2 + 12), mask)
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18)))
    grad = Image.new('RGBA', (BODY, BODY))
    g = ImageDraw.Draw(grad)
    for y in range(BODY):
        t = y / (BODY - 1)
        g.line([(0, y), (BODY, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,))
    rim = Image.new('L', (BODY, BODY), 0)
    ImageDraw.Draw(rim).ellipse((-BODY * 0.2, -BODY * 0.9, BODY * 1.2, BODY * 0.3), fill=16)
    rim = rim.filter(ImageFilter.GaussianBlur(60))
    grad = Image.composite(Image.new('RGBA', (BODY, BODY), (255, 255, 255, 255)), grad, rim)
    img.paste(grad, ((S - BODY) // 2, (S - BODY) // 2), mask)
    return img


class Pix:
    def __init__(self, img):
        self.img, self.d = img, ImageDraw.Draw(img)

    def px(self, x, y, c, w=1, h=1):
        self.d.rectangle((O + x * CELL, O + y * CELL, O + (x + w) * CELL - 1, O + (y + h) * CELL - 1), fill=c)

    def sprite(self, rows, x0, y0, ink):
        for y, row in enumerate(rows):
            for x, k in enumerate(row):
                if k in ink:
                    self.px(x0 + x, y0 + y, ink[k])


def shade(c, k):
    return tuple(min(255, round(v + (255 - v) * (k - 1))) if k > 1 else round(v * k) for v in c)


def truck():
    """The widget's dump truck, its bed piled with tokens in project colours, more falling in."""
    img = base((40, 46, 60), (14, 16, 22))
    p = Pix(img)
    x0, y0 = 4, 16
    p.sprite(TRUCK, x0, y0, INK)
    # The load: 2 x 2 squares stacked over the bed (bed columns 2..15).
    load = [(3, 13, ORANGE), (5, 13, BLUE), (7, 13, AMBER), (9, 13, ORANGE), (11, 13, GREEN), (13, 13, BLUE),
            (4, 11, AMBER), (6, 11, ORANGE), (8, 11, BLUE), (10, 11, ORANGE), (12, 11, AMBER),
            (6, 9, ORANGE), (8, 9, GREEN), (10, 9, BLUE)]
    for x, y, c in load:
        p.px(x0 + x - 1, y0 + y - 13 - 2, c, 2, 2)
    for x, y, c in [(11, 5, AMBER), (14, 3, ORANGE), (9, 2, BLUE)]:
        p.px(x0 + x, y, c, 2, 2)
    for x in range(1, 31):       # the ground
        p.px(x, y0 + 10, (90, 90, 90) if x % 4 == 0 else (58, 58, 58))
    return img


def scope(light=False):
    """A magnifying glass over the tokens: inside the lens, today's tokens stacked by project; outside, a few on
    their way."""
    img = base((244, 240, 230), (214, 206, 190)) if light else base((40, 46, 60), (14, 16, 22))
    p = Pix(img)
    cx, cy, r = 13.0, 13.0, 9.6
    glass = (230, 236, 244) if light else (22, 30, 44)
    ring, ring_dark = ((60, 64, 74), (30, 32, 38)) if light else ((236, 230, 214), (170, 164, 150))
    for y in range(GRID):
        for x in range(GRID):
            d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            if d <= r - 1.6:
                p.px(x, y, glass)
            elif d <= r + 0.4:
                p.px(x, y, ring_dark if (x - cx) + (y - cy) > 2 else ring)
    # The handle, from the ring out to the corner: three cells wide, with a darker grip.
    for i in range(9):
        x, y = 19 + i, 19 + i
        c = (40, 40, 44) if i >= 3 else (ring_dark if light else (143, 143, 143))
        for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (0, -1)]:
            if i >= 3 or (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)]:
                p.px(x + dx, y + dy, c)
    # In the lens: columns of 2 x 2 tokens, one per project.
    cols = [(7, 3, ORANGE), (10, 5, AMBER), (13, 2, BLUE), (16, 4, GREEN)]
    for x, h, c in cols:
        for k in range(h):
            p.px(x, 19 - 2 * k - 1, shade(c, 1.15 if k == h - 1 else 1), 2, 2)
    p.px(6, 19, (90, 98, 112) if not light else (170, 176, 186), 13, 1)       # their shelf
    # Glint on the glass.
    for x, y in [(8, 7), (9, 6), (10, 6), (8, 8)]:
        p.px(x, y, (255, 255, 255) if not light else (255, 255, 255))
    # Tokens on their way, outside the lens.
    for x, y, c in [(25, 4, AMBER), (28, 9, ORANGE), (24, 11, BLUE)]:
        p.px(x, y, c, 2, 2)
    return img


CONCEPTS = {'truck': truck, 'scope': scope, 'scope-light': lambda: scope(light=True)}

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'scope'
    out = sys.argv[2] if len(sys.argv) > 2 else f'build/icon-{name}.png'
    CONCEPTS[name]().save(out)
    print(out)
