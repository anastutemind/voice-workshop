"""
Fits the photographs of the face to the anatomical plate.

    python3 scripts/skin-register.py [--check out.png]

The skin of the tutor's head is a set of photographs of one face in profile
(public/skin: the mouth at rest, wide open, rounded and open, rounded and
shut; the folder has more shapes, which are not used). The anatomy under it is a
painting (public/anatomy/head-real.jpg) that the model moves. They are two
different heads, and a photographed mouth is never just where the model puts
its own: laid over one another, the anatomy would stick out of the skin.

So the photographs are not shown as they are. A net is laid over the face
(src/ui/tutor/skinNet.ts); the model says where every knot of it is in each
posture; and here each photograph is told where those knots are *in it*:
the outline of its face is traced from the tip of the nose down the lips and
the chin, under the jaw and down the throat; the same places are marked on
the painting, moved to the posture the model takes for that photograph's
sound (scripts/skin-poses.ts); the edges of the lips and the corner of the
mouth, read off each photograph by eye, are set against the model's; and a
smooth bend (a thin-plate spline) carries every knot from the model's
posture into the photograph. The painter then stretches each photograph
over the net as the model has it at that instant: the face has the
painting's own profile in every posture, and the lips, the teeth and the
inside of the mouth are a photograph's.

Between parted lips the inside of the mouth is the wide-open photograph's.

Writes public/skin/face.webp (the photograph at rest, bent onto the painting:
the whole head), public/skin/mouth-<shape>.webp (the part of each other
photograph round the mouth) and public/skin/net.json (for every knot of the
net, where it is in each of those; and the mouth each one shows).
"""
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, K = 1536, 2304, 64.0          # the frame: 24 x 36 cm at 64 pixels a centimetre
X0, Y1 = -11.0, 29.0                # canonical centimetres of its left and top edges
O = (5.0, 8.0)                      # a point inside the cheek: the chin is traced on rays from it
STOMION, CORNER, LIPS_MEET = 8.32, 6.9, 8.06   # where the painted lips meet, and the corner of the mouth (skinNet.ts)
BELOW_ROWS = 20                     # how many rows of the net lie below the mouth (skinNet.ts): the lower lip's row
PATCH = (3.9, 1.4, 13.0, 11.2)      # the part of the face the mouth's pictures cover (skin.ts): x0, y0, x1, y1

px = lambda x: (x - X0) * K
py = lambda y: (Y1 - y) * K

# The mouth of each photograph, read off it by eye (canonical cm): where the upper lip ends and the lower one
# starts at the front (the two places that touch when the mouth shuts), the corner of the mouth, and points
# along the edge of each lip from the corner forward. One line for both lips where the mouth is shut.
MOUTHS = {
    'rest':  dict(u=(8.48, 8.36), l=(8.48, 8.36), corner=(6.5, 8.15), up=[(7.0, 8.20), (7.5, 8.28), (8.0, 8.33)], low=None),
    'open':  dict(u=(8.5, 8.65), l=(8.05, 6.36), corner=(6.08, 7.35), up=[(6.45, 7.92), (7.0, 8.2), (7.5, 8.43), (8.0, 8.57)], low=[(6.45, 6.78), (7.0, 6.54), (7.5, 6.34), (7.8, 6.25)]),
    'o':     dict(u=(8.85, 8.38), l=(8.5, 7.62), corner=(7.0, 7.65), up=[(7.6, 7.9), (8.1, 8.1), (8.5, 8.27)], low=[(7.5, 7.6), (8.0, 7.67)]),
    'round': dict(u=(9.05, 8.3), l=(9.05, 8.3), corner=(7.85, 8.08), up=[(8.2, 8.1), (8.5, 8.15), (8.8, 8.22)], low=None),
    'mid':   dict(u=(8.05, 8.45), l=(8.0, 8.03), corner=(6.46, 8.07), up=[(7.0, 8.21), (7.45, 8.29), (7.84, 8.40)], low=[(7.0, 8.05), (7.45, 8.02), (7.8, 8.02)]),
    'e':     dict(u=(8.1, 8.44), l=(8.05, 7.95), corner=(6.44, 8.07), up=[(7.0, 8.24), (7.45, 8.34), (7.9, 8.41)], low=[(7.0, 8.01), (7.45, 7.96), (7.85, 7.93)]),
    # ('spread', a broad smile, is left out: its corner, drawn far back, stretched the cheek into streaks where the
    # model's spread lips leave the corner; 's' and 'e' show the spread mouth)
    'fv':    dict(u=(8.07, 8.45), l=(8.04, 7.98), corner=(6.44, 8.07), up=[(7.0, 8.21), (7.45, 8.29), (7.9, 8.43)], low=[(7.0, 8.01), (7.45, 7.94), (7.8, 7.92)]),
    'th':    dict(u=(8.27, 8.45), l=(8.56, 7.14), corner=(6.01, 7.92), up=[(6.48, 8.21), (7.0, 8.31), (7.65, 8.41)], low=[(6.48, 7.75), (7.0, 7.42), (7.65, 7.3), (8.3, 7.18)]),
    'l':     dict(u=(8.17, 8.45), l=(8.0, 7.0), corner=(5.9, 7.6), up=[(6.48, 8.05), (7.0, 8.21), (7.65, 8.34)], low=[(6.48, 7.1), (7.0, 7.07), (7.65, 6.95)]),
    's':     dict(u=(8.07, 8.62), l=(7.97, 7.88), corner=(5.83, 8.11), up=[(6.15, 8.4), (7.0, 8.6), (7.65, 8.67)], low=[(6.15, 7.98), (7.0, 7.88), (7.65, 7.82)]),
    'sh':    dict(u=(9.45, 8.38), l=(9.4, 8.11), corner=(7.71, 8.01), up=[(8.23, 8.05), (8.76, 8.24), (9.15, 8.34)], low=[(8.23, 8.01), (8.76, 8.11), (9.15, 8.14)]),
    # made by the editing model from the photographs (scripts/mirror-generate.ts side, scripts/skin-prep.py)
    'open1': dict(u=(8.5, 8.35), l=(8.46, 8.29), corner=(6.54, 8.19), up=[(7.0, 8.26), (7.65, 8.37), (8.23, 8.39)], low=[(7.0, 8.18), (7.65, 8.24), (8.23, 8.29)]),
    'open2': dict(u=(7.97, 8.54), l=(7.57, 7.97), corner=(6.02, 7.92), up=[(6.48, 8.14), (7.0, 8.27), (7.65, 8.44)], low=[(6.48, 7.6), (7.0, 7.38), (7.35, 7.55)]),
    'open3': dict(u=(8.31, 8.72), l=(7.52, 7.45), corner=(6.17, 7.84), up=[(6.57, 8.16), (7.13, 8.37), (7.85, 8.58)], low=[(6.49, 7.62), (6.95, 7.2), (7.3, 7.3)]),
    'owide': dict(u=(8.89, 8.27), l=(7.65, 6.39), corner=(6.67, 6.81), up=[(7.0, 7.2), (7.45, 7.53), (7.97, 7.92), (8.43, 8.14)], low=[(6.8, 6.61), (7.13, 6.35), (7.4, 6.3)]),
    # (the edit of lips pressed together, 'press', is left out: its lips meet in a cleft the model's pressed lips
    # tear open; the face at rest shows them shut)
}
# where the edits are (put in this frame by scripts/skin-prep.py); the others are public/skin/<shape>.webp
MADE = '/private/tmp/claude-501/vw-faces/side'
# the painting's own places (canonical cm), read off its outline
PLATE = dict(tip=(10.70, 11.75), nose=(9.00, 10.75), top=(9.20, 9.10), meet=(8.31, 8.10), bottom=(8.78, 7.15), fold=(7.96, 5.85), chin=(8.27, 4.75), throat=(3.95, 2.65))
# and the photographs' throat, which no mouth shape moves
THROAT = (4.10, 3.90)


def inside(mask, x, y):
    i, j = int(round(py(y))), int(round(px(x)))
    return 0 <= i < H and 0 <= j < W and bool(mask[i, j])


def outline(mask, tip, pog, cer):
    """The front of a head as a line of points: from the nose's tip down to the chin (row by row, from the
    right), round the chin and under the jaw (on rays from O), then down the throat (row by row)."""
    pts = []
    y = tip[1]
    while y > pog[1]:
        x = 12.4
        while x > 2 and not (inside(mask, x, y) and inside(mask, x - 0.08, y)):
            x -= 0.01
        pts.append((x, y))
        y -= 0.03
    a0, a1 = math.atan2(pog[1] - O[1], pog[0] - O[0]), math.atan2(cer[1] - O[1], cer[0] - O[0])
    a = a0
    while a > a1:
        r = 12.0
        c, s = math.cos(a), math.sin(a)
        while r > 0.3 and not (inside(mask, O[0] + r * c, O[1] + r * s) and inside(mask, O[0] + (r - 0.08) * c, O[1] + (r - 0.08) * s)):
            r -= 0.01
        pts.append((O[0] + r * c, O[1] + r * s))
        a -= math.radians(0.4)
    y = pts[-1][1] - 0.03
    start = pts[-1][0] + 0.25
    while y > -3.45:
        x = start
        while x > -6 and not (inside(mask, x, y) and inside(mask, x - 0.08, y)):
            x -= 0.01
        pts.append((x, y))
        start = x + 0.25
        y -= 0.03
    return np.array(pts)


def nearest(line, m):
    return int(np.argmin(np.hypot(line[:, 0] - m[0], line[:, 1] - m[1])))


def spaced(seg, fractions):
    """Points of a line at fractions of its length."""
    seg = np.asarray(seg, dtype=float)
    d = np.concatenate([[0], np.cumsum(np.hypot(np.diff(seg[:, 0]), np.diff(seg[:, 1])))])
    out = []
    for f in fractions:
        t = d[-1] * f
        i = min(int(np.searchsorted(d, t, side='right')) - 1, len(seg) - 2)
        u = 0 if d[i + 1] == d[i] else (t - d[i]) / (d[i + 1] - d[i])
        out.append(seg[i] + u * (seg[i + 1] - seg[i]))
    return out


def along(line, marks, per):
    """Points of an outline between its marks (given as places on it): `per[i]` to stretch i, evenly spaced by
    length, each stretch's first point included and its last left to the next."""
    idx = [nearest(line, m) for m in marks]
    out = []
    for (a, b), n in zip(zip(idx[:-1], idx[1:]), per):
        out += spaced(line[a:b + 1] if b > a else line[[a, a]], [k / n for k in range(n)])
    return out, line[idx[-1]]


def extreme(line, y0, y1, sign):
    """The point of an outline that reaches furthest forward (sign 1) or back (-1) between two heights."""
    sel = [(sign * p[0], i) for i, p in enumerate(line) if y0 <= p[1] <= y1]
    return line[max(sel)[1]]


def corner(line, a, b):
    """The corner of an outline between two of its places: the point furthest from the straight line that joins
    them. Under the nose it is where the nose ends and the lip begins."""
    i, j = sorted((nearest(line, a), nearest(line, b)))
    seg = line[i:j + 1]
    p, q = seg[0], seg[-1]
    d = np.abs((q[0] - p[0]) * (seg[:, 1] - p[1]) - (q[1] - p[1]) * (seg[:, 0] - p[0]))
    return seg[int(np.argmax(d))]


def face_points(line, m):
    """The same places on every face, along its outline: the upper lip's side down to where it ends, then the
    lower lip's from where it starts down the chin, under the jaw and down the throat."""
    up, end = along(line, [m['tip'], m['nose'], m['top'], m['u']], [5, 5, 4])
    up.append(end)
    low, end = along(line, [m['l'], m['bottom'], m['fold'], m['chin'], m['throat'], line[-1]], [4, 5, 5, 10, 5])
    low.append(end)
    return up, low


LIP_LINE = [0.0, 0.2, 0.4, 0.6, 0.8]   # along each lip's edge, from the corner of the mouth to the front


def tps(src, dst):
    """A thin-plate spline taking the points `src` to `dst`: returns a function of points."""
    src, dst = np.asarray(src, dtype=float), np.asarray(dst, dtype=float)
    n = len(src)
    d = np.hypot(src[:, None, 0] - src[None, :, 0], src[:, None, 1] - src[None, :, 1])
    Kmat = np.where(d > 0, d * d * np.log(d + 1e-12), 0)
    P = np.hstack([np.ones((n, 1)), src])
    A = np.zeros((n + 3, n + 3))
    A[:n, :n] = Kmat + 1e-4 * np.eye(n)   # a little slack: a smooth bend rather than an exact one through every point
    A[:n, n:] = P
    A[n:, :n] = P.T
    b = np.zeros((n + 3, 2))
    b[:n] = dst
    w = np.linalg.solve(A, b)

    def at(q):
        q = np.asarray(q, dtype=float)
        dd = np.hypot(q[:, None, 0] - src[None, :, 0], q[:, None, 1] - src[None, :, 1])
        U = np.where(dd > 0, dd * dd * np.log(dd + 1e-12), 0)
        return U @ w[:n] + np.hstack([np.ones((len(q), 1)), q]) @ w[n:]
    return at


def smooth_outline(rgba, r=4):
    """The outline of a cut-out without notches or spikes narrower than about 2r pixels (its alpha closed, then
    opened), the colour carried into what it gains from the skin beside it."""
    a = rgba[..., 3].astype(np.uint8)
    f = lambda img, flt: np.asarray(Image.fromarray(img).filter(flt))
    k = 2 * r + 1
    closed = f(f(a, ImageFilter.MaxFilter(k)), ImageFilter.MinFilter(k))
    opened = f(f(closed, ImageFilter.MinFilter(k)), ImageFilter.MaxFilter(k))
    na = np.asarray(Image.fromarray(opened).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
    out = rgba.copy()
    gain = na > rgba[..., 3] + 1
    if gain.any():
        w = rgba[..., 3:4] / 255.0
        blur = lambda v: np.asarray(Image.fromarray(np.clip(v, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)
        num = np.stack([blur(rgba[..., c] * w[..., 0]) for c in range(3)], -1)
        den = blur(255 * w[..., 0])[..., None] / 255.0
        fill = num / np.maximum(den, 1e-3)
        out[..., :3] = np.where(gain[..., None], fill, rgba[..., :3])
    out[..., 3] = na
    return out


def bake(photo, bend, path):
    """The photograph bent onto the painting, as a picture of the whole frame."""
    out = np.zeros((H, W, 4), dtype=np.float32)
    xs = X0 + (np.arange(W) + 0.5) / K
    for r0 in range(0, H, 64):
        rows = np.arange(r0, min(H, r0 + 64))
        ys = Y1 - (rows + 0.5) / K
        s = bend(np.stack(np.meshgrid(xs, ys), axis=-1).reshape(-1, 2))
        u, v = (s[:, 0] - X0) * K - 0.5, (Y1 - s[:, 1]) * K - 0.5
        u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
        fu, fv = (u - u0)[:, None], (v - v0)[:, None]
        ok = (u0 >= 0) & (u0 < W - 1) & (v0 >= 0) & (v0 < H - 1)
        u0c, v0c = np.clip(u0, 0, W - 2), np.clip(v0, 0, H - 2)
        # (colour weighted by its alpha: the cut-out's edge does not bleed the dark around it into the skin)
        def tap(dv, du):
            p = photo[v0c + dv, u0c + du]
            return np.concatenate([p[:, :3] * p[:, 3:4], p[:, 3:4]], axis=1)
        mix = (tap(0, 0) * (1 - fu) + tap(0, 1) * fu) * (1 - fv) + (tap(1, 0) * (1 - fu) + tap(1, 1) * fu) * fv
        a = mix[:, 3:4]
        px_ = np.concatenate([np.where(a > 1e-3, mix[:, :3] / np.maximum(a, 1e-3), 0), a], axis=1)
        px_[~ok] = 0
        out[rows[0]:rows[-1] + 1] = px_.reshape(len(rows), W, 4)
    Image.fromarray(np.clip(smooth_outline(out), 0, 255).astype(np.uint8), 'RGBA').save(path)


def defringe(photo):
    """A cut-out photograph without the dark rim its background left on it: dark pixels at its edge, reached
    from outside through dark pixels only (six deep at most), are made clear. Dark spots inside the skin stay."""
    rgb, a = photo[..., :3], photo[..., 3]
    lum = 0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]
    blur = lambda v: np.asarray(Image.fromarray(np.clip(v, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(12))).astype(np.float32)
    near = 255 * blur(lum * a / 255) / np.maximum(blur(a), 1)   # the brightness of the skin around
    dark = (lum < 0.62 * near) & (a > 0)
    clear = a < 128
    # (only in the cut-out's own soft edge: a dark crease of the skin that reaches the outline, under the lower lip
    # or where the lips meet, is skin, and clearing it cut a notch into the profile)
    edge = a < 250
    for _ in range(6):
        grown = np.asarray(Image.fromarray((clear * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
        clear = clear | (grown & dark & edge)
    soft = np.asarray(Image.fromarray(((~clear) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9))).astype(np.float32)
    out = photo.copy()
    out[..., 3] = np.minimum(a, np.where(clear, 0, soft))
    return out


# what stays where it is: the back and the top of the head, the ear, the eye, the bridge of the nose
STILL = [(-9, -3.5), (-9, 4), (-9.5, 12), (-10, 19), (-6, 25.5), (0, 27), (6, 25), (9, 20), (9.3, 17.5), (9.0, 15.8), (9.4, 14.2), (10.2, 12.8),
         (7.2, 15.5), (5, 14), (0.4, 13.5), (-2, 9), (-4, 3), (-5, -3.5), (-1.5, -3.5), (-1, 2), (1.5, 9.5), (4, 11.5)]


def main():
    plate = np.asarray(Image.open('public/anatomy/head-real.jpg').convert('RGB').resize((W, H), Image.LANCZOS)).astype(np.float32)
    pm = (0.3 * plate[..., 0] + 0.59 * plate[..., 1] + 0.11 * plate[..., 2]) > 46
    lp = outline(pm, PLATE['tip'], PLATE['chin'], PLATE['throat'])
    found = corner(lp, PLATE['tip'], PLATE['top'])
    print(f"painting: under the nose ({found[0]:.2f}, {found[1]:.2f})")
    pu, pl = face_points(lp, dict(PLATE, nose=found, u=PLATE['meet'], l=PLATE['meet']))
    # the painting's lips meet on a straight line, from the corner of the mouth to the front
    lips = [(CORNER + f * (STOMION - CORNER), LIPS_MEET) for f in LIP_LINE]
    rest = [(p, 1) for p in pu] + [(p, 0) for p in pl] + [(p, 1) for p in lips] + [(p, 0) for p in lips]

    # ---- where the model puts those places, and the knots of its net, in each photograph's posture
    tmp = tempfile.mkdtemp()
    with open(os.path.join(tmp, 'points.json'), 'w') as f:
        json.dump({'points': [[float(p[0]), float(p[1]), s] for p, s in rest]}, f)
    subprocess.run(['npx', 'tsx', 'scripts/skin-poses.ts', os.path.join(tmp, 'points.json'), os.path.join(tmp, 'poses.json'), ','.join(n for n in MOUTHS if n != 'rest')], check=True, stdout=subprocess.DEVNULL)
    poses = json.load(open(os.path.join(tmp, 'poses.json')))
    knots_rest = np.array(poses['rest']).reshape(-1, 2)
    assert poses['rowLower'] == BELOW_ROWS, 'the net has other rows than this script thinks'
    shapes = {'rest': dict(points=[[float(p[0]), float(p[1])] for p, _ in rest], knots=poses['rest'])}
    shapes.update(poses['shapes'])

    uv, photos, bends = {}, {}, {}
    for name, mouth in MOUTHS.items():
        src = os.path.join(MADE, f'{name}.png') if os.path.exists(os.path.join(MADE, f'{name}.png')) and not os.path.exists(f'public/skin/{name}.webp') else f'public/skin/{name}.webp'
        photo = smooth_outline(defringe(np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)))
        sm = photo[..., 3] > 128
        # the photograph's own places: found on a first outline, which is then traced from its own chin
        first = outline(sm, (10.82, 11.90), (8.57, 5.60), THROAT)
        u, l = np.array(mouth['u']), np.array(mouth['l'])
        m = dict(tip=extreme(first, 11.0, 12.6, 1), u=u, l=l, throat=THROAT)
        m['top'] = extreme(first, u[1] + 0.15, u[1] + 1.3, 1)
        m['nose'] = corner(first, m['tip'], m['top'])
        m['bottom'] = extreme(first, l[1] - 1.1, l[1] - 0.1, 1)
        m['fold'] = extreme(first, m['bottom'][1] - 1.6, m['bottom'][1] - 0.35, -1)
        m['chin'] = extreme(first, m['fold'][1] - 1.9, m['fold'][1] - 0.4, 1)
        line = outline(sm, m['tip'], m['chin'], THROAT)
        su, sl = face_points(line, m)
        up = spaced([mouth['corner']] + mouth['up'] + [mouth['u']], LIP_LINE)
        low = spaced([mouth['corner']] + (mouth['low'] if mouth['low'] else mouth['up']) + [mouth['l']], LIP_LINE)
        here = np.array(su + sl + up + low)
        model = np.array(shapes[name]['points'])
        f = tps(np.vstack([model, STILL]), np.vstack([here, STILL]))
        knots = np.array(shapes[name]['knots']).reshape(-1, 2)
        uv[name] = f(knots)
        photos[name], bends[name] = photo, f
        print(f"{name:7s} under the nose ({m['nose'][0]:.2f}, {m['nose'][1]:.2f})  top lip ({m['top'][0]:.2f}, {m['top'][1]:.2f})  bottom lip ({m['bottom'][0]:.2f}, {m['bottom'][1]:.2f})  fold ({m['fold'][0]:.2f}, {m['fold'][1]:.2f})  chin ({m['chin'][0]:.2f}, {m['chin'][1]:.2f})")

    # ---- the pictures of the mouth: one box of the frame holds the mouth's part of every photograph
    part = (knots_rest[:, 0] >= PATCH[0]) & (knots_rest[:, 1] >= PATCH[1]) & (knots_rest[:, 0] <= PATCH[2]) & (knots_rest[:, 1] <= PATCH[3])
    allp = np.vstack([uv[n][part] for n in MOUTHS if n != 'rest'])
    bx0 = max(0, int(px(allp[:, 0].min())) - 8)
    bx1 = min(W, int(px(min(13.0, allp[:, 0].max()))) + 8)
    by0 = max(0, int(py(allp[:, 1].max())) - 8)
    by1 = min(H, int(py(allp[:, 1].min())) + 8)
    out = {'frame': [W, H], 'box': [bx0, by0, bx1 - bx0, by1 - by0], 'shapes': {}}
    r4 = lambda a: [round(float(v), 4) for v in a]
    for name in MOUTHS:
        q = uv[name]
        if name == 'rest':
            bake(photos[name], bends[name], os.path.join(tmp, 'face.png'))
            subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '95', os.path.join(tmp, 'face.png'), '-o', 'public/skin/face.webp'], check=True)
            continue
        kn = np.array(shapes[name]['knots']).reshape(poses['ny'], poses['nx'], 2)
        low, up = BELOW_ROWS, BELOW_ROWS + 2
        apart = np.hypot(kn[up, :, 0] - kn[low, :, 0], kn[up, :, 1] - kn[low, :, 1])
        to_uv = lambda q: r4(np.stack([(px(q[:, 0]) - bx0) / (bx1 - bx0), (py(q[:, 1]) - by0) / (by1 - by0)], axis=1).ravel())
        ins = {k: to_uv(bends[name](np.array(poses['shapes'][name][k]).reshape(-1, 2))) for k in ('insideUpper', 'insideLower')}
        out['shapes'][name] = {'at': poses['shapes'][name]['at'], 'features': poses['shapes'][name]['features'], 'apart': r4(apart), 'uv': to_uv(q), **ins}
        im = Image.fromarray(photos[name][by0:by1, bx0:bx1].astype(np.uint8), 'RGBA')
        png = os.path.join(tmp, f'{name}.png')
        im.save(png)
        subprocess.run(['cwebp', '-quiet', '-q', '88', '-alpha_q', '95', png, '-o', f'public/skin/mouth-{name}.webp'], check=True)
    with open('public/skin/net.json', 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f"public/skin/face.webp, net.json and {len(out['shapes'])} pictures of the mouth written; box {out['box']}")

    if '--check' in sys.argv:
        # every photograph bent into the model's posture for it, with the model's lips drawn over it: to look at
        cx0, cx1, cy0, cy1, Z = 4.5, 11.0, 3.0, 12.0, 40
        tiles = []
        for name in MOUTHS:
            xs = cx0 + (np.arange(int((cx1 - cx0) * Z)) + 0.5) / Z
            ys = cy1 - (np.arange(int((cy1 - cy0) * Z)) + 0.5) / Z
            q = np.stack(np.meshgrid(xs, ys), axis=-1).reshape(-1, 2)
            s = bends[name](q)
            u = np.clip(np.round(px(s[:, 0])).astype(int), 0, W - 1)
            v = np.clip(np.round(py(s[:, 1])).astype(int), 0, H - 1)
            p = photos[name][v, u]
            a = p[:, 3:4] / 255
            img = (p[:, :3] * a + np.array([40, 46, 70]) * (1 - a)).reshape(len(ys), len(xs), 3)
            tile = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
            d = ImageDraw.Draw(tile)
            sh = shapes[name]
            for key, col in (('upperFace', (0, 255, 255)), ('lowerFace', (255, 255, 0))):
                if key in sh:
                    pts = np.array(sh[key]).reshape(-1, 2)
                    d.line([((x - cx0) * Z, (cy1 - y) * Z) for x, y in pts] + [((pts[0][0] - cx0) * Z, (cy1 - pts[0][1]) * Z)], fill=col, width=1)
            d.text((4, 4), name, fill=(255, 255, 255))
            tiles.append(tile)
        tw, th = tiles[0].size
        sheet = Image.new('RGB', (tw * len(tiles), th))
        for i, t in enumerate(tiles):
            sheet.paste(t, (i * tw, 0))
        sheet.save(sys.argv[sys.argv.index('--check') + 1])


main()
