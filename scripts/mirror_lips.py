"""
Reads the mouth of a photograph of the face seen from the front: the two
corners, and the four edges of the lips (the outer and the inner edge of
each), as heights at fixed places across the mouth.

A first outline of the lips comes from the computer's Vision framework
(scripts/mirror-landmarks.swift); each edge is then snapped to where the
picture itself changes (the red of the lips against the skin outside; the
lips against the teeth, the tongue or the dark inside); and where that is
still wrong, a hand corrects it (FIX in scripts/mirror-register.py), the
sheet this module draws being looked at until nothing is.
"""
import json
import math
import subprocess

import numpy as np

from mirror_align import blur, gray

# across the mouth, from the left corner (0) to the right one (1): denser toward the corners, where the lips curve
COLS = [0.5 - 0.5 * math.cos(math.pi * k / 12) for k in range(13)]
EDGES = ['ou', 'iu', 'il', 'ol']   # outer upper, inner upper, inner lower, outer lower


def vision(path, tool):
    return json.loads(subprocess.run([tool, path], capture_output=True, text=True, check=True).stdout)


def poly_y(pts, x):
    """The height of a line of points (sorted by x) at x."""
    pts = sorted(pts)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return float(np.interp(x, xs, ys))


def read(rgb, lm):
    """The mouth of a picture, from Vision's landmarks `lm`: {'corners': [[x, y], [x, y]], 'ou': [y per column], ...}."""
    o = lm['outerLips']
    left, right = o[13], o[7]
    upper = [left] + o[0:7] + [right]
    lower = [left] + o[8:13][::-1] + [right]
    g = gray(rgb)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    red = blur((R - G) / (R + G + B + 1), 1.2)
    lum = blur(g, 1.0)
    dred = np.gradient(red, axis=0)
    dlum = np.gradient(lum, axis=0)
    out = {'corners': [list(map(float, left)), list(map(float, right))]}
    for e in EDGES:
        out[e] = []
    for t in COLS:
        x = left[0] + t * (right[0] - left[0])
        yc = left[1] + t * (right[1] - left[1])
        xi = int(round(x))
        if t in (0.0, 1.0):
            for e in EDGES:
                out[e].append(float(yc))
            continue
        # how near the corner: the lips are thin there, and the search is narrower
        near = min(t, 1 - t) / 0.5
        pu, pl = poly_y(upper, x), poly_y(lower, x)
        r = max(2, int(7 * near ** 0.5))
        # the upper lip's top: the skin above turns red going down
        ys = np.arange(int(pu - r), int(pu + r) + 1)
        ou = float(ys[np.argmax(dred[ys, xi])])
        # the lower lip's bottom: red turns to skin (and to the shadow under the lip)
        ys = np.arange(int(pl - r), int(pl + r) + 1)
        ol = float(ys[np.argmin(dred[ys, xi] + 0.004 * dlum[ys, xi])])
        # the inner edges: going down from the upper lip and up from the lower one, the first strong change of
        # light (the lip against the teeth, the tongue's shadow or the dark), at least a lip's thickness in
        span = ol - ou
        thick_u, thick_l = max(1.0, 0.18 * span * near ** 0.3), max(1.0, 0.2 * span * near ** 0.3)
        col = lum[:, xi]
        a, b = int(ou + thick_u), int(ol - thick_l)
        if b - a < 3:
            m = float(a + np.argmin(col[a:max(a + 1, b + 1)])) if b >= a else 0.5 * (ou + ol)
            iu = il = m
        else:
            seg = col[a:b + 1]
            dark = int(np.argmin(seg))
            # (a mouth shut or nearly: the dark line where the lips meet)
            base = 0.5 * (np.median(col[int(ou) + 1:a + 1]) + np.median(col[b:int(ol)]))
            dif = np.abs(np.diff(seg))
            k = np.nonzero(dif > max(6.0, 0.35 * dif.max()))[0]
            if len(k) == 0 or seg.max() - seg.min() < 25:
                iu = il = float(a + dark)
            else:
                iu = float(a + k[0] + 0.5)
                il = float(a + k[-1] + 0.5)
        out['ou'].append(ou)
        out['iu'].append(iu)
        out['il'].append(il)
        out['ol'].append(ol)
    return out


def points(m):
    """The edges of a mouth as lists of (x, y) points, corner to corner."""
    (lx, ly), (rx, ry) = m['corners']
    xs = [lx + t * (rx - lx) for t in COLS]
    return {e: list(zip(xs, m[e])) for e in EDGES}
