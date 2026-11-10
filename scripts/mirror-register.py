"""
Registers the photographs of the mirror to one another, for the morph.

    python3 scripts/mirror-register.py [--check]

The mirror (src/ui/tutor/MirrorPhoto.tsx) morphs between photographs of one
face seen from the front, all in one frame (scripts/mirror-prep.py). To warp
any of them onto the shape of any other (or of a mouth in between), the
same places must be known on all of them. A net is laid over the face:
columns across it, rows down it; across the mouth its columns are fixed
fractions of the way from one corner of the mouth to the other, and its
rows there are the edges of the lips (the outer and the inner edge of each)
and lines inside the mouth. Where the net is on each photograph:

  - the lips and the corners of the mouth: read from the photograph (its
    outline found by the computer's Vision framework, the edges snapped to
    the picture, the inside edges of the lips and the corners of an open
    mouth read by eye: FIX below);
  - the chin (read by eye: CHIN) and the outline of the face against the
    dark (found on the picture);
  - everything else follows them smoothly (a thin-plate spline), and what is
    above the mouth (the eyes, the nose) does not move at all.

Each photograph also gets the measures of the mouth it shows (`mouthFeatures`
in src/ui/tutor/visemes.ts): those of the model's posture for its sound
(scripts/mirror-poses.ts), with how far apart its lips are measured on it.

Reads /private/tmp/claude-501/vw-faces/front/*.png (from mirror-prep.py) and
lm/*.json (Vision's landmarks: scripts/mirror-landmarks.swift); writes
public/mirror/<name>.jpg and public/mirror/morph.json. With --check, a sheet
of every photograph with its net drawn on it.
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from mirror_align import blur, gray, load, sample  # noqa: E402
from mirror_lips import COLS, read  # noqa: E402

ROOT = '/private/tmp/claude-501/vw-faces'
W, H = 672, 900
NAMES = ['rest', 'press', 'open1', 'mid', 'open2', 'open25', 'open3', 'open', 'e', 'ae', 'ee', 'spread', 's',
         'kiss', 'round', 'o', 'owide', 'sh', 'fv', 'th', 'th1', 'l']
CLOSED = {'rest', 'press', 'kiss'}
# the photographs made by the editing model (scripts/mirror-generate.ts); the others were photographed
EDITS = {'press', 'open1', 'open2', 'open25', 'open3', 'ae', 'ee', 'kiss', 'owide', 'fv', 'th1'}
# where the lines were drawn on the crops the inner edges were read from: fractions of the way from Vision's left
# corner to its right one (`lines`: those corners' x, when Vision's own outline was not used)
T = [0.08, 0.15, 0.3, 0.5, 0.7, 0.85, 0.92]
# read by eye: the corners of the mouth (where the lips meet), and the inner edge of each lip, as heights at T or
# as points (x, y) along it, corner to corner
FIX = {
    'open1': dict(iu=[364, 362, 361, 361, 361, 362, 363], il=[366, 368, 369, 371, 369, 367, 365]),
    'mid': dict(iu=[365, 363, 362, 362, 362, 363, 364], il=[367, 369, 374, 377, 375, 370, 367]),
    'open2': dict(iu=[368, 362, 357, 355, 356, 360, 364], il=[373, 380, 390, 397, 393, 384, 377]),
    'open25': dict(corners=[(222, 370), (466, 374)], iu=[368, 360, 343, 340, 342, 352, 362], il=[385, 395, 410, 415, 410, 400, 388]),
    'open3': dict(corners=[(226, 398), (468, 408)], iu=[390, 372, 352, 347, 349, 362, 375], il=[437, 453, 470, 484, 478, 465, 450]),
    'open': dict(corners=[(229, 401), (466, 410)], iu=[391, 373, 361, 359, 361, 370, 378], il=[445, 460, 491, 506, 497, 478, 463]),
    'e': dict(corners=[(221, 372), (466, 364)], iu=[372, 368, 362, 360, 361, 365, 368], il=[380, 392, 405, 412, 408, 398, 388]),
    'ae': dict(lines=(212.0, 471.2), corners=[(215, 400), (473, 407)], iu=[368, 352, 343, 342, 343, 352, 362], il=[470, 488, 503, 512, 505, 488, 470],
               ou=[345, 330, 315, 308, 312, 330, 345], ol=[505, 525, 540, 545, 540, 525, 505]),
    'ee': dict(iu=[350, 345, 342, 340, 341, 344, 347], il=[358, 364, 369, 371, 368, 362, 356]),
    'spread': dict(corners=[(194, 339), (488, 333)], iu=[340, 340, 342, 343, 341, 337, 336], il=[375, 383, 392, 394, 391, 380, 365]),
    's': dict(corners=[(220, 362), (472, 358)], iu=[362, 359, 352, 349, 350, 355, 358], il=[368, 380, 393, 404, 400, 388, 375]),
    'round': dict(corners=[(237, 381), (450, 384)],
                  iu=[(268, 382), (301, 381), (312, 375), (325, 372), (343, 371), (360, 372), (373, 375), (384, 381), (418, 383)],
                  il=[(268, 382), (301, 381), (312, 390), (325, 396), (343, 399), (360, 397), (373, 392), (384, 381), (418, 383)]),
    'o': dict(corners=[(233, 384), (447, 388)],
              iu=[(260, 387), (277, 391), (290, 380), (310, 373), (342, 370), (375, 371), (395, 378), (405, 390), (425, 389)],
              il=[(260, 387), (277, 391), (290, 402), (310, 410), (342, 415), (375, 414), (395, 405), (405, 392), (425, 389)]),
    'owide': dict(corners=[(233, 401), (451, 404)],
                  iu=[(253, 405), (264, 385), (298, 365), (342, 357), (386, 362), (420, 382), (433, 405)],
                  il=[(253, 405), (264, 445), (298, 465), (342, 478), (386, 467), (420, 440), (433, 405)]),
    'sh': dict(corners=[(228, 380), (451, 381)],
               iu=[(260, 378), (283, 375), (293, 370), (338, 366), (384, 367), (418, 374), (435, 379)],
               il=[(260, 378), (283, 377), (293, 386), (338, 400), (384, 392), (418, 377), (435, 379)]),
    'fv': dict(corners=[(215, 365), (469, 363)], iu=[364, 360, 357, 356, 355, 357, 361], il=[368, 372, 377, 378, 386, 378, 369]),
    'th': dict(corners=[(215, 372), (468, 373)], iu=[372, 368, 362, 360, 360, 365, 370], il=[395, 408, 420, 428, 425, 410, 395]),
    'th1': dict(corners=[(223, 367), (460, 367)], iu=[366, 364, 361, 360, 361, 364, 366], il=[369, 372, 384, 391, 387, 375, 370]),
    'l': dict(corners=[(215, 385), (473, 390)], iu=[375, 362, 352, 349, 350, 357, 364], il=[425, 440, 455, 462, 455, 440, 425]),
}
# the bottom of the chin in the middle, read by eye
CHIN = {'rest': 598, 'press': 597, 'open1': 599, 'mid': 603, 'open2': 609, 'open25': 620, 'open3': 665, 'open': 690, 'e': 628, 'ae': 690,
        'ee': 597, 'spread': 600, 's': 612, 'kiss': 615, 'round': 625, 'o': 645, 'owide': 667, 'sh': 614, 'fv': 600, 'th': 632, 'th1': 612, 'l': 660}
# measures of a photograph that its look says better than its sound's posture: the tongue that shows between the
# teeth of the half-way "th"
# ... and the opening of the photograph of "e", which is the model's "e" (more open, by the model's measure, than
# the photographs spread like it; less than the spread "a")
LOOK = {'th1': {'tongue': 0.6}, 'e': {'open': 1.3}}
# the chin's curve at rest: the bottom of the chin, either side of the middle
chin_rest = lambda x: 598 - 0.0025 * (x - 340) ** 2
# the model's centimetres in the photographs' pixels, for how far apart the lips are: the photograph of the open
# mouth is the model's "aa" (the widest the model opens), and the others are measured against it
PX_PER_CM = None

# the net: columns outside the mouth (pixels), the mouth's own (fractions COLS from corner to corner)
LEFT = [0, 45, 90, 135, 172, 198]
RIGHT = [484, 510, 540, 582, 627, 671]
NCOL = len(LEFT) + len(COLS) + len(RIGHT)
M0 = len(LEFT)                      # the first column of the mouth (its left corner)
# the rows, top to bottom: above the seam (still), between the nose and the lip, the lips and the inside, below
ROWS = ['top', 'eye', 'seam', 'a1', 'a2', 'ou', 'iu', 'm1', 'm2', 'm3', 'il', 'ol', 'b1', 'r470', 'r520', 'r560', 'chin', 'r625', 'r660', 'r720', 'r800', 'bottom']
LIP_ROWS = ['ou', 'iu', 'm1', 'm2', 'm3', 'il', 'ol']
R = {n: i for i, n in enumerate(ROWS)}


def poly_at(pts, x):
    pts = sorted(pts)
    return float(np.interp(x, [p[0] for p in pts], [p[1] for p in pts]))


def mouth(name, rgb, lm):
    """The four edges of the lips at the net's columns, and the corners: {'corners', 'xs', 'ou', 'iu', 'il', 'ol'}."""
    auto = read(rgb, lm)
    fx = FIX.get(name, {})
    (vlx, vly), (vrx, vry) = auto['corners']
    lx, rx = fx.get('lines', (vlx, vrx))
    (cx0, cy0), (cx1, cy1) = fx.get('corners', [(vlx, vly), (vrx, vry)])
    xs = [cx0 + t * (cx1 - cx0) for t in COLS]
    vxs = [vlx + t * (vrx - vlx) for t in COLS]
    out = {'corners': [[cx0, cy0], [cx1, cy1]], 'xs': xs}

    def edge(key, fallback):
        v = fx.get(key)
        if v is None:
            pts = [(x, y) for x, y in zip(vxs, fallback) if cx0 < x < cx1]
        elif isinstance(v[0], (tuple, list)):
            pts = [tuple(p) for p in v]
        else:
            pts = [(lx + t * (rx - lx), y) for t, y in zip(T, v)]
        pts = [(cx0, cy0)] + [p for p in pts if cx0 < p[0] < cx1] + [(cx1, cy1)]
        return [poly_at(pts, x) for x in xs]

    out['ou'] = edge('ou', auto['ou'])
    out['ol'] = edge('ol', auto['ol'])
    if name in CLOSED:
        # a shut mouth: the dark line where the lips meet, between their outer edges
        lum = blur(gray(rgb), 1.0)
        line = []
        for x, a, b in zip(xs, out['ou'], out['ol']):
            ys = np.arange(int(a + 0.3 * (b - a)), int(b - 0.3 * (b - a)) + 1)
            line.append(float(ys[np.argmin(lum[ys, int(round(x))])]) if len(ys) else 0.5 * (a + b))
        line[0], line[-1] = cy0, cy1
        out['iu'] = out['il'] = line
    else:
        out['iu'] = edge('iu', auto['iu'])
        out['il'] = edge('il', auto['il'])
    # (the edges in their order down the mouth)
    for k in range(len(xs)):
        out['iu'][k] = max(out['iu'][k], out['ou'][k])
        out['il'][k] = max(out['il'][k], out['iu'][k])
        out['ol'][k] = max(out['ol'][k], out['il'][k])
    return out


def outline(rgb):
    """The face's edge against the dark, left and right, at the rows of OUTLINE_Y: (x left, x right) per row."""
    lum = blur(gray(rgb), 1.5)
    out = []
    for y in OUTLINE_Y:
        row = lum[y]
        left = next((x for x in range(0, 300) if row[x] > 40), 0)
        right = next((x for x in range(W - 1, 372, -1) if row[x] > 40), W - 1)
        out.append((float(left), float(right)))
    return out


OUTLINE_Y = list(range(290, 641, 25))


def tps(src, dst, reg=1e-3):
    src, dst = np.asarray(src, float), np.asarray(dst, float)
    n = len(src)
    d = np.hypot(src[:, None, 0] - src[None, :, 0], src[:, None, 1] - src[None, :, 1]) / 100.0
    K = np.where(d > 0, d * d * np.log(d + 1e-12), 0)
    P = np.hstack([np.ones((n, 1)), src / 100.0])
    A = np.zeros((n + 3, n + 3))
    A[:n, :n] = K + reg * np.eye(n)
    A[:n, n:] = P
    A[n:, :n] = P.T
    b = np.zeros((n + 3, 2))
    b[:n] = dst - src
    w = np.linalg.solve(A, b)

    def at(q):
        q = np.asarray(q, float)
        dd = np.hypot(q[:, None, 0] - src[None, :, 0], q[:, None, 1] - src[None, :, 1]) / 100.0
        U = np.where(dd > 0, dd * dd * np.log(dd + 1e-12), 0)
        return q + U @ w[:n] + np.hstack([np.ones((len(q), 1)), q / 100.0]) @ w[n:]
    return at


def landmarks(m, chin, out):
    """
    The places the smooth bend is fitted to: the corners of the mouth and a few points of the lips' outer edges,
    the chin, the face's outline. (Few and far apart: a bend fitted through many close points that move
    differently, as the lips' do at the corners, swings far out between them. The lips themselves are not bent
    there but read off each photograph.)
    """
    pick = [0, 3, 6, 9, 12]
    pts = [(m['xs'][i], m['ou'][i]) for i in pick] + [(m['xs'][i], m['ol'][i]) for i in (3, 6, 9)]
    pts += [(x, chin_rest(x) + chin - CHIN['rest']) for x in (270, 340, 410)]
    for (l, r), y in list(zip(out, OUTLINE_Y))[1::2]:
        pts += [(l, y), (r, y)]
    return pts


# what does not move: the line under the nose, the frame's edges, the neck and the shoulders
STILL = [(x, 255.0) for x in range(0, W + 1, 48)] + [(0.0, y) for y in range(300, H, 60)] + [(W - 1.0, y) for y in range(300, H, 60)] + \
        [(x, H - 1.0) for x in range(0, W + 1, 96)] + [(x, 790.0) for x in range(150, 540, 60)]


def net_rest(m_rest):
    """Where every knot of the net is on the face at rest: [row][col] -> (x, y)."""
    cols = LEFT + m_rest['xs'] + RIGHT
    knots = np.zeros((len(ROWS), NCOL, 2))
    for c, x in enumerate(cols):
        k = c - M0
        inside = 0 <= k < len(COLS)
        corner_y = m_rest['corners'][0][1] if c < M0 else m_rest['corners'][1][1]
        lip = {r: (m_rest[r if r in ('ou', 'iu', 'il', 'ol') else 'iu'][k] if inside else corner_y) for r in LIP_ROWS}
        if inside:
            lip['m1'] = lip['m2'] = lip['m3'] = m_rest['iu'][k] + (m_rest['il'][k] - m_rest['iu'][k]) * 0.5
        ou, ol = lip['ou'], lip['ol']
        ys = {'top': 0.0, 'eye': 130.0, 'seam': 255.0, 'a2': ou - 12, 'b1': ol + 14, 'r470': 470.0, 'r520': 520.0, 'r560': 560.0,
              'chin': max(chin_rest(x), 578.0) if 220 < x < 460 else 578.0, 'r625': 625.0, 'r660': 660.0, 'r720': 720.0, 'r800': 800.0, 'bottom': H - 1.0}
        ys['a1'] = 0.5 * (255 + ys['a2'])
        ys.update(lip)
        for r in ROWS:
            knots[R[r], c] = (x, ys[r])
    return knots


def net_photo(knots0, m, chin, out, m_rest, out_rest):
    """Where the knots of the net are on a photograph."""
    src = landmarks(m_rest, CHIN['rest'], out_rest) + STILL
    dst = landmarks(m, chin, out) + STILL
    f = tps(src, dst, reg=0.05)
    k = f(knots0.reshape(-1, 2)).reshape(knots0.shape)
    # above the seam the photographs are the face at rest itself
    for r in ('top', 'eye', 'seam'):
        k[R[r]] = knots0[R[r]]
    # the lips: read off the photograph
    for i in range(len(COLS)):
        c = M0 + i
        iu, il = m['iu'][i], m['il'][i]
        vals = {'ou': m['ou'][i], 'iu': iu, 'm1': iu + 0.25 * (il - iu), 'm2': iu + 0.5 * (il - iu), 'm3': iu + 0.75 * (il - iu), 'il': il, 'ol': m['ol'][i]}
        for r, y in vals.items():
            k[R[r], c] = (m['xs'][i], y)
        # the skin just above and below the lips goes with them
        k[R['a2'], c] = (m['xs'][i], vals['ou'] - (knots0[R['ou'], c, 1] - knots0[R['a2'], c, 1]))
        k[R['b1'], c] = (m['xs'][i], vals['ol'] + (knots0[R['b1'], c, 1] - knots0[R['ol'], c, 1]))
    # beside the mouth the lips' rows are the corner, on every photograph
    for c in list(range(M0)) + list(range(M0 + len(COLS), NCOL)):
        for r in LIP_ROWS:
            k[R[r], c] = k[R['ou'], c]
    # nothing turns over: down every column the rows keep their order (a few pixels apart, the lips' own rows
    # apart or together), across every row the columns keep theirs
    for c in range(NCOL):
        for r in range(R['seam'] + 1, len(ROWS)):
            gap = 0.0 if (ROWS[r] in LIP_ROWS and ROWS[r - 1] in LIP_ROWS) else 3.0
            k[r, c, 1] = max(k[r, c, 1], k[r - 1, c, 1] + gap)
        for r in range(R['ou'] - 1, R['seam'], -1):
            k[r, c, 1] = min(k[r, c, 1], k[r + 1, c, 1] - 3.0)
    for r in range(R['seam'] + 1, len(ROWS)):
        for c in range(1, NCOL):
            k[r, c, 0] = max(k[r, c, 0], k[r, c - 1, 0] + (0.0 if ROWS[r] in LIP_ROWS and not (M0 < c < M0 + len(COLS)) else 1.5))
    return k


def warp_by_net(src, k_src, k_dst, tris, shape):
    """The picture `src` (whose net is `k_src`) bent so that its net lies on `k_dst`: triangle by triangle, every
    pixel of the result taken from the same place of the same triangle of `src`. Also says where it has a value."""
    h, w = shape
    out = np.zeros((h, w, src.shape[2]), np.float32)
    have = np.zeros((h, w), bool)
    for a, b, c in tris:
        P = k_dst[[a, b, c]]
        Q = k_src[[a, b, c]]
        det = (P[1, 0] - P[0, 0]) * (P[2, 1] - P[0, 1]) - (P[2, 0] - P[0, 0]) * (P[1, 1] - P[0, 1])
        if abs(det) < 1e-6:
            continue
        x0, x1 = max(0, int(P[:, 0].min())), min(w - 1, int(np.ceil(P[:, 0].max())))
        y0, y1 = max(0, int(P[:, 1].min())), min(h - 1, int(np.ceil(P[:, 1].max())))
        if x1 < x0 or y1 < y0:
            continue
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
        l1 = ((xs - P[0, 0]) * (P[2, 1] - P[0, 1]) - (P[2, 0] - P[0, 0]) * (ys - P[0, 1])) / det
        l2 = ((P[1, 0] - P[0, 0]) * (ys - P[0, 1]) - (xs - P[0, 0]) * (P[1, 1] - P[0, 1])) / det
        l0 = 1 - l1 - l2
        inside = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
        if not inside.any():
            continue
        qx = l0 * Q[0, 0] + l1 * Q[1, 0] + l2 * Q[2, 0]
        qy = l0 * Q[0, 1] + l1 * Q[1, 1] + l2 * Q[2, 1]
        v, ok = sample(src, qx[inside], qy[inside])
        yy, xx = ys[inside].astype(int), xs[inside].astype(int)
        out[yy, xx] = v
        have[yy, xx] = ok
    return out, have


def transfer_detail(photo, rest, k_photo, k_rest, tris, m):
    """
    The fine detail of the skin (stubble, pores) of the face at rest, carried onto a photograph: the face at rest
    bent onto the photograph's net, its detail put in place of the photograph's own, on the skin below the nose
    (not on the lips or in the mouth, which are the photograph's own; not at the face's edge against the dark).
    The edits draw the stubble anew and softer: so every photograph has the same stubble, which moves with the
    face and does not flicker as one photograph gives way to another.
    """
    bent, have = warp_by_net(rest, k_rest, k_photo, tris, photo.shape[:2])
    hp = lambda img: np.stack([img[..., c] - blur(img[..., c], 2.0) for c in range(3)], -1)
    # where: below the seam, away from the lips (their outline in this photograph, widened), away from the dark
    H_, W_ = photo.shape[:2]
    mask = np.zeros((H_, W_), np.float32)
    mask[300:, :] = 1
    mask[270:300, :] = np.linspace(0, 1, 30)[:, None]
    lips = Image.new('L', (W_, H_), 0)
    poly = list(zip(m['xs'], m['ou'])) + list(zip(m['xs'][::-1], m['ol'][::-1]))
    ImageDraw.Draw(lips).polygon(poly, fill=255)
    lips = np.asarray(lips.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255
    dark = (gray(photo) < 45) | (gray(rest) < 45)
    dark = np.asarray(Image.fromarray((dark * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255
    mask *= (1 - lips) * (1 - dark) * have
    return np.clip(photo + (hp(bent) - hp(photo)) * mask[..., None], 0, 255)


def triangles():
    """The net's triangles: the skin's, and the inside of the mouth's (between the lips' inner edges)."""
    skin, inside = [], []
    idx = lambda r, c: r * NCOL + c
    for r in range(len(ROWS) - 1):
        for c in range(NCOL - 1):
            a, b, cc, d = idx(r, c), idx(r, c + 1), idx(r + 1, c + 1), idx(r + 1, c)
            mouth_cell = R['iu'] <= r < R['il'] and M0 <= c < M0 + len(COLS) - 1
            # (cells that have no size on any face are left out: beside the mouth, between its rows)
            if R['ou'] <= r < R['ol'] and not (M0 <= c < M0 + len(COLS) - 1):
                continue
            (inside if mouth_cell else skin).extend([a, b, cc, a, cc, d])
    return skin, inside


def main():
    global PX_PER_CM
    poses_path = os.path.join(ROOT, 'poses.json')
    subprocess.run(['npx', 'tsx', 'scripts/mirror-poses.ts', poses_path], check=True, stdout=subprocess.DEVNULL)
    poses = json.load(open(poses_path))
    photos, mouths, outs = {}, {}, {}
    for name in NAMES:
        rgb = load(os.path.join(ROOT, 'front', name + '.png'))
        lm = json.load(open(os.path.join(ROOT, 'lm', name + '.json')))
        mouths[name] = mouth(name, rgb, lm)
        outs[name] = outline(rgb)
        photos[name] = rgb
    mr = mouths['rest']
    mo = mouths['open']
    PX_PER_CM = (mo['il'][len(COLS) // 2] - mo['iu'][len(COLS) // 2]) / poses['open']['features']['open']
    knots0 = net_rest(mr)
    skin, inside = triangles()
    out = {'size': [W, H], 'cols': NCOL, 'rows': len(ROWS), 'skin': skin, 'inside': inside, 'pxPerCm': round(PX_PER_CM, 3), 'photos': {}}
    tris = np.array(skin + inside).reshape(-1, 3)
    k_rest = None
    for name in NAMES:
        m = mouths[name]
        k = net_photo(knots0, m, CHIN[name], outs[name], mr, outs['rest'])
        flat = k.reshape(-1, 2)
        if name == 'rest':
            k_rest = flat.copy()
        # no triangle may turn over (a fold in the picture)
        e1 = flat[tris[:, 1]] - flat[tris[:, 0]]
        e2 = flat[tris[:, 2]] - flat[tris[:, 0]]
        cross = e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]
        r1 = knots0.reshape(-1, 2)
        e1r = r1[tris[:, 1]] - r1[tris[:, 0]]
        e2r = r1[tris[:, 2]] - r1[tris[:, 0]]
        crossr = e1r[:, 0] * e2r[:, 1] - e1r[:, 1] * e2r[:, 0]
        flips = int(np.sum(cross * np.sign(np.where(np.abs(crossr) > 1e-6, crossr, 1)) < -1e-3))
        mid = len(COLS) // 2
        gap = m['il'][mid] - m['iu'][mid]
        feat = dict(poses[name]['features'])
        feat['open'] = round(gap / PX_PER_CM, 3)
        feat.update(LOOK.get(name, {}))
        out['photos'][name] = {'features': {kk: round(float(v), 3) for kk, v in feat.items()}, 'gap': round(gap, 1),
                               'at': [round(float(v), 1) for v in flat.ravel()]}
        print(f"{name:7s} gap {gap:5.1f} px = {feat['open']:.2f} cm (model {poses[name]['features']['open']:.2f})  width {m['corners'][1][0] - m['corners'][0][0]:.0f} px  chin {CHIN[name]}  folds {flips}")
        # (the photographs keep their own: only the edits, whose stubble is drawn anew and softer, take the face's)
        if name in EDITS:
            photos[name] = transfer_detail(photos[name], photos['rest'], flat, k_rest, tris, m)
        im = Image.fromarray(np.clip(photos[name], 0, 255).astype(np.uint8))
        im.save(os.path.join('public', 'mirror', name + '.jpg'), quality=86, optimize=True, progressive=True)
    with open(os.path.join('public', 'mirror', 'morph.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f"public/mirror/morph.json: {len(NAMES)} photographs, {NCOL}x{len(ROWS)} knots, {len(skin) // 3}+{len(inside) // 3} triangles; {PX_PER_CM:.1f} px a cm")

    if '--check' in sys.argv:
        tiles = []
        for name in NAMES:
            k = np.array(out['photos'][name]['at']).reshape(len(ROWS), NCOL, 2)
            im = Image.fromarray(np.clip(photos[name], 0, 255).astype(np.uint8)).convert('RGB')
            d = ImageDraw.Draw(im)
            for r in range(len(ROWS)):
                d.line([tuple(k[r, c]) for c in range(NCOL)], fill=(0, 200, 255) if ROWS[r] not in LIP_ROWS else (255, 255, 0), width=1)
            for c in range(NCOL):
                d.line([tuple(k[r, c]) for r in range(len(ROWS))], fill=(0, 140, 200), width=1)
            for e, col in (('ou', (0, 255, 255)), ('iu', (255, 255, 0)), ('il', (255, 128, 0)), ('ol', (255, 0, 255))):
                d.line(list(zip(mouths[name]['xs'], mouths[name][e])), fill=col, width=2)
            t = im.crop((150, 260, 520, 720)).resize((296, 368))
            ImageDraw.Draw(t).text((4, 4), name, fill=(255, 255, 255))
            tiles.append(t)
        cols = 7
        sheet = Image.new('RGB', (296 * cols, 368 * math.ceil(len(tiles) / cols)))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * 296, (i // cols) * 368))
        sheet.save(os.path.join(ROOT, 'look', 'front-net.jpg'), quality=90)


main()
