"""
The silhouette of the painted head (public/anatomy/head-real.jpg) as a mask
(public/anatomy/head-mask.png, white on the head, black on the background,
soft at the edge), so that the plate can be warped without carrying its dark
background along.

Far inside the head's outline the mask is white whatever the painting has
there (the air in the mouth and the nose is dark too); far outside it, black.
In a band round the outline it follows the painting itself: the background is
nearly black, the skin bright, and the mask goes from one to the other.

    python3 scripts/anatomy-mask.py <outline.json>

outline.json holds {"outline": [x0, y0, x1, y1, ...]}: the head's outline at
rest in canonical centimetres (guideHead().outline in src/ui/head/scene.ts).
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = __file__.rsplit('/scripts/', 1)[0]
SRC = f'{ROOT}/public/anatomy/head-real.jpg'
OUT = f'{ROOT}/public/anatomy/head-mask.png'
# the painting's frame (src/ui/head/frame.ts)
X0, X1, Y0, Y1 = -11.0, 13.0, -7.0, 29.0

im = Image.open(SRC).convert('RGB')
W, H = im.size
K = W / (X1 - X0)
outline = json.load(open(sys.argv[1]))['outline']
poly = [((outline[i] - X0) * K, (Y1 - outline[i + 1]) * K) for i in range(0, len(outline), 2)]
# the outline runs down the neck to the bottom of the painting: close it along the bottom
poly = poly + [(poly[-1][0], H + 10), (poly[0][0], H + 10)]

inside = Image.new('L', (W, H), 0)
ImageDraw.Draw(inside).polygon(poly, fill=255)
band = int(0.45 * K)
# (a box blur of the inside: whole where every point within `band` is inside, nothing where none is)
spread = inside.filter(ImageFilter.BoxBlur(band))
core = spread.point(lambda v: 255 if v >= 254 else 0)    # eroded: surely the head
reach = spread.point(lambda v: 255 if v > 0 else 0)      # dilated: as far as the head may reach

# The painting's own edge: the background is under ~20 in every channel, the skin far brighter. A pixel on the
# edge is part skin, part background, and as bright as it is skin: its share of the skin nearby is how much of
# it the head covers. (So the painting's pixel can be laid on as it is, as a colour already multiplied by its
# cover: no dark fringe of background is carried along.)
r, g, b = im.split()
bright = ImageChops.lighter(ImageChops.lighter(r, g), b)
near = bright.filter(ImageFilter.MaxFilter(7))
BG = 18
edge = Image.new('L', (W, H))
bp, npx, ep = bright.load(), near.load(), edge.load()
for y in range(H):
    for x in range(W):
        v = bp[x, y]
        if v <= BG:
            continue
        top = max(60, npx[x, y])
        ep[x, y] = 255 if v >= top else int(255 * (v - BG) / (top - BG))

# In front of the lips the outline runs straight from the nose to the chin, well in front of the painted lips:
# there the painting's profile (traced: FACE_UPPER and FACE_LOWER in scene.ts) bounds what is surely the head.
data = json.load(open(sys.argv[1]))
profile = data.get('FACE_UPPER', []) + data.get('FACE_LOWER', [])
if profile:
    front = [((profile[i] - 0.06 - X0) * K, (Y1 - profile[i + 1]) * K) for i in range(0, len(profile), 2)]
    front += [((X1 - X0) * K, (Y1 - profile[-1]) * K), ((X1 - X0) * K, (Y1 - profile[1]) * K)]
    ahead = Image.new('L', (W, H), 255)
    ImageDraw.Draw(ahead).polygon(front, fill=0)
    core = ImageChops.multiply(core, ahead)

mask = ImageChops.lighter(core, ImageChops.multiply(edge, reach))
mask.save(OUT, optimize=True)
print(OUT, mask.size)
