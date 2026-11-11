"""
Takes the dark of the plate's painted air out of the plate (public/anatomy/head-real.jpg).

The plate was painted with the mouth's air dark (a deep maroon). The app takes the air of every instant out of the
plate and draws it as a cavity of its own (src/ui/head/gl.ts), so the plate's painted air is never wanted: and where
it is seen all the same (a sliver of it left between the tongue and the roof of the mouth where they touch, a speck of
it at the root of the velum or on the wall of the throat) it shows as a dark mark on tissue. Here it is filled with
the tissue round it: every dark pixel in and just round the guide's air at rest takes the colour that the reddish
tissue beside it would give it (a membrane stretched between its edge, as the sheet does: Laplace's equation).

    npx tsx scripts/anatomy-guide.ts > /tmp/guide.json
    python3 scripts/anatomy-air.py /tmp/guide.json [--check out.png] [--out plate.jpg]

It writes the plate in place, or to --out (a JPEG; run it on the painting once: a second run changes nothing
that matters). With --check it writes a picture of what it changed.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = __file__.rsplit('/scripts/', 1)[0]
SRC = f'{ROOT}/public/anatomy/head-real.jpg'
# the painting's frame (src/ui/head/frame.ts)
X0, Y1, K = -11.0, 29.0, 64.0
REACH = 0.15       # how far round the guide's air the dark is looked for, cm
DARK = 62          # luminance (0..255) below which a pixel of the painting is the painted air's dark

guide = json.load(open(sys.argv[1]))['air']
check = sys.argv[sys.argv.index('--check') + 1] if '--check' in sys.argv else None
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else SRC
im = Image.open(SRC).convert('RGB')
W, H = im.size
pts = [((guide[i] - X0) * K, (Y1 - guide[i + 1]) * K) for i in range(0, len(guide), 2)]
roi = Image.new('L', (W, H), 0)
ImageDraw.Draw(roi).polygon(pts, fill=255)
roi = roi.filter(ImageFilter.MaxFilter(2 * int(REACH * K) + 1))
roi = np.array(roi) > 0
# (the mouth and the upper throat: not the narrow column of the throat beside the spine, where the painting's dark is a crease
# of the wall, nor the face in front of the teeth)
yy, xx = np.mgrid[0:H, 0:W]
cx, cy = xx / K + X0, Y1 - yy / K
roi &= (cx < 6.2) & ((cx > -0.3) | (cy > 8.2))

a = np.array(im).astype(np.float32)
lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
dark = roi & (lum < DARK)
# a pixel or two round the dark: the soft edge of it
dark_img = Image.fromarray((dark * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
dark = np.array(dark_img) > 0
dark &= roi

# the tissue that gives the colour: reddish, not the dark, not the bone (cream) or the teeth (white)
reddish = (a[..., 0] > 1.3 * a[..., 1]) & (a[..., 0] > 80) & (a[..., 0] < 235) & (lum > 62) & (lum < 150)
src = roi & ~dark & reddish
ys, xs = np.where(dark)
y0, y1, x0, x1 = ys.min() - 3, ys.max() + 4, xs.min() - 3, xs.max() + 4
sub = a[y0:y1, x0:x1].copy()
d = dark[y0:y1, x0:x1]
s = src[y0:y1, x0:x1]
# coarse to fine: a membrane between its edges, the sources held
def relax(img, free, held, iters):
    out = img.copy()
    for _ in range(iters):
        p = np.pad(out, ((1, 1), (1, 1), (0, 0)), mode='edge')
        avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
        out = np.where(free[..., None], avg, out)
    return out

def pyramid(img, free, held, level):
    if level == 0 or min(img.shape[:2]) < 16:
        start = img.copy()
        mean = img[held].mean(axis=0) if held.any() else np.array([120, 50, 50], dtype=np.float32)
        start[free] = mean
        return relax(start, free, held, 400)
    h2, w2 = img.shape[0] // 2, img.shape[1] // 2
    def down(m): return m[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).any(axis=(1, 3))
    imc = img[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, 3).mean(axis=(1, 3))
    heldc = down(held)
    freec = down(free) & ~heldc
    coarse = pyramid(imc, freec, heldc, level - 1)
    up = np.repeat(np.repeat(coarse, 2, axis=0), 2, axis=1)
    out = img.copy()
    hh, ww = up.shape[:2]
    out[:hh, :ww] = np.where(free[:hh, :ww, None], up, out[:hh, :ww])
    return relax(out, free, held, 60)

filled = pyramid(sub, d, s, 4) * 0.86
rng = np.random.default_rng(3)
filled = filled + rng.normal(0, 1.6, filled.shape)
# the fill goes in softly at its edge
soft = np.array(Image.fromarray((d * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.4))).astype(np.float32)[..., None] / 255
out = a.copy()
out[y0:y1, x0:x1] = sub * (1 - soft) + filled * soft
res = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
if check:
    c = np.array(im).copy()
    c[dark] = (0.5 * c[dark] + 0.5 * np.array([0, 255, 255])).astype(np.uint8)
    Image.fromarray(c).save(check)
res.save(OUT, quality=92, subsampling=1)
print('filled', int(dark.sum()), 'pixels')

# where the painting is still dark afterwards (a coarse map for tests/head-overlay.test.ts: a cell of 0.05 cm is dark if
# any pixel of it is): the painted air that nothing fills (and that the app must therefore cut out wherever it shows)
back = np.array(Image.open(OUT).convert('RGB')).astype(np.float32)
l2 = 0.299 * back[..., 0] + 0.587 * back[..., 1] + 0.114 * back[..., 2]
MAP = dict(x0=-2.5, x1=7.0, y0=2.5, y1=12.0, step=0.05)
rows = []
for j in range(int(round((MAP['y1'] - MAP['y0']) / MAP['step']))):
    yt = MAP['y1'] - j * MAP['step']
    row = ''
    for i in range(int(round((MAP['x1'] - MAP['x0']) / MAP['step']))):
        xl = MAP['x0'] + i * MAP['step']
        u0, v0 = int((xl - X0) * K), int((Y1 - yt) * K)
        u1, v1 = int((xl + MAP['step'] - X0) * K) + 1, int((Y1 - yt + MAP['step']) * K) + 1
        row += '1' if (l2[v0:v1, u0:u1] < DARK).any() else '0'
    rows.append(row)
json.dump({**MAP, 'rows': rows}, open(f'{ROOT}/tests/fixtures/plate-dark.json', 'w'))
