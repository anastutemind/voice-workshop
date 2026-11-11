"""
Makes what the 3D head's skin shader reads besides its albedo (scripts/head3d-bake.py's skin.jpg, copied to public/head3d/skin.jpg):

  public/head3d/skin-detail.jpg   2048x2048, in the albedo's own layout:
                                    red    height (the bump): pores, the fine grain of the skin, stubble, the creases of the lips;
                                    green  roughness (shiny forehead, nose, lips; matte stubble, scalp, ears);
                                    blue   hair (the buzz cut of the scalp with its soft hairline and its taper at the nape, the
                                           brows, from the albedo's own darkness): where the hair shells grow and the scalp is dark;
  public/head3d/skin-ao.bin       two bytes per point of the head: its cavity (ambient occlusion: rays over the hemisphere
                                  against the head's own triangles) and its thinness (how little flesh lies behind it: the ears, the
                                  wings of the nose, the lids), for the light that comes through.

Both are made from the head's mesh at rest, exported from the page in dev (see EXPORT in scripts/head3d-bake.py:
canon.f32, uv.f32, index.u32, kind.f32, same.i32 into <mesh-dir>), and from the baked albedo. The point order of
skin-ao.bin is the mesh's: the page ignores it if the head has another number of points.

    venv/bin/python scripts/head3d-detail.py <mesh-dir> <the bake's skin.jpg> public/head3d

Needs numpy, pillow, opencv-python-headless.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

W = 2048


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def load(d):
    canon = np.fromfile(os.path.join(d, 'canon.f32'), np.float32).reshape(-1, 3).astype(np.float64)
    uv = np.fromfile(os.path.join(d, 'uv.f32'), np.float32).reshape(-1, 2).astype(np.float64)
    index = np.fromfile(os.path.join(d, 'index.u32'), np.uint32).reshape(-1, 3).astype(np.int64)
    kind = np.fromfile(os.path.join(d, 'kind.f32'), np.float32)
    same = np.fromfile(os.path.join(d, 'same.i32'), np.int32).astype(np.int64)
    return canon, uv, index, kind, same


def normals(canon, index, same):
    fn = np.cross(canon[index[:, 1]] - canon[index[:, 0]], canon[index[:, 2]] - canon[index[:, 0]])
    acc = np.zeros_like(canon)
    for k in range(3):
        np.add.at(acc, same[index[:, k]], fn)
    n = acc[same]
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def raster(uv, index, attr, size):
    """Each texel of the albedo's layout: the attribute of the head's point there (barycentric), and whether a triangle covers it."""
    out = np.zeros((size, size, attr.shape[1]), np.float64)
    have = np.zeros((size, size), bool)
    px = uv * size
    for t in index:
        p = px[t]
        x0, x1 = int(max(0, np.floor(p[:, 0].min()))), int(min(size - 1, np.ceil(p[:, 0].max())))
        y0, y1 = int(max(0, np.floor(p[:, 1].min()))), int(min(size - 1, np.ceil(p[:, 1].max())))
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (p[1, 1] - p[2, 1]) * (p[0, 0] - p[2, 0]) + (p[2, 0] - p[1, 0]) * (p[0, 1] - p[2, 1])
        if abs(d) < 1e-9:
            continue
        a = ((p[1, 1] - p[2, 1]) * (gx - p[2, 0]) + (p[2, 0] - p[1, 0]) * (gy - p[2, 1])) / d
        b = ((p[2, 1] - p[0, 1]) * (gx - p[2, 0]) + (p[0, 0] - p[2, 0]) * (gy - p[2, 1])) / d
        c = 1 - a - b
        m = (a >= -0.02) & (b >= -0.02) & (c >= -0.02)
        if not m.any():
            continue
        v = a[..., None] * attr[t[0]] + b[..., None] * attr[t[1]] + c[..., None] * attr[t[2]]
        sub = out[y0:y1 + 1, x0:x1 + 1]
        sub[m] = v[m]
        have[y0:y1 + 1, x0:x1 + 1] |= m
    return out, have


def fill(img, have, rounds=24):
    """Spreads what is known into the gutter round the islands, so that the mip levels do not take the gaps in."""
    img = img.copy()
    known = have.astype(np.float32)
    for _ in range(rounds):
        if known.min() > 0.99:
            break
        num = cv2.blur(img * known[..., None], (3, 3)) if img.ndim == 3 else cv2.blur(img * known, (3, 3))
        den = cv2.blur(known, (3, 3))
        grown = (den > 0.01) & (known < 0.5)
        val = num / np.maximum(den, 1e-6)[..., None] if img.ndim == 3 else num / np.maximum(den, 1e-6)
        img[grown] = val[grown]
        known = np.where(grown, 1.0, known).astype(np.float32)
    return img


def hair_mask(x, y, z, noise=None):
    """The buzz cut: where the hair is, by the elevation of a point over the middle of the head, round it (0 front, 90 the side, 180 the back)."""
    az = np.abs(z)
    vx, vy = x + 0.5, y - 15.5
    r = np.sqrt(vx * vx + vy * vy + az * az) + 1e-6
    phi = np.degrees(np.arcsin(np.clip(vy / r, -1, 1)))
    theta = np.degrees(np.arctan2(az, vx))
    th = [0, 30, 50, 66, 80, 88, 100, 115, 130, 150, 180]
    ph = [46, 43, 31, 21, 11, 5, 9, 8, -3, -24, -44]
    line = np.interp(theta, th, ph)
    soft = np.where(theta > 125, 12.0, 3.2)
    # (a lived-in hairline: it wanders by a few degrees, it is not a ruled line)
    wander = noise[..., 0] if noise is not None else 0
    m = smooth(line - soft + wander, line + soft + wander, phi)
    # the nape: a V that tapers down the neck, by height alone (the neck grows straight down from the skull's edge, and the angle jumps there)
    yb = 8.0 + 0.45 * np.minimum(az, 4.0)
    back = smooth(yb - 2.8 + 0.4 * wander, yb + 2.8 + 0.4 * wander, y)
    wb = smooth(-6.0, -8.4, x) * (theta > 112)
    m = m * (1 - wb) + back * wb
    # (a lived-in hairline: it is not a ruled line, the strands take over a little at a time)
    return m


def lum(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def detail(mesh, albedo_path, out):
    canon, uv, index, kind, same = mesh
    keep = index[(kind[index[:, 0]] == 0)]
    attr = canon
    pos, have = raster(uv, keep, attr, W)
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    az = np.abs(z)
    rgb = np.asarray(Image.open(albedo_path).convert('RGB').resize((W, W), Image.LANCZOS), np.float32) / 255.0
    L = lum(rgb)
    # ---- height: the albedo's own fine grain (its photographs' pores and stubble), and a pore pattern where there is skin
    hp1 = L - cv2.GaussianBlur(L, (0, 0), 1.6)
    hp2 = cv2.GaussianBlur(L, (0, 0), 0.8) - cv2.GaussianBlur(L, (0, 0), 3.5)
    grain = np.clip(0.5 + 3.2 * hp1 + 2.0 * hp2, 0, 1)
    rng = np.random.default_rng(7)
    # pores: pits on a loose grid (cells of about 5 texels), deeper and sparser on the nose and cheeks, none on the lips
    cell = 5.0
    gx, gy = np.meshgrid(np.arange(W), np.arange(W))
    cx, cy = np.floor(gx / cell), np.floor(gy / cell)
    jit = rng.random((int(W / cell) + 2, int(W / cell) + 2, 3))
    jx = (cx + 0.25 + 0.5 * jit[cy.astype(int), cx.astype(int), 0]) * cell
    jy = (cy + 0.25 + 0.5 * jit[cy.astype(int), cx.astype(int), 1]) * cell
    dist = np.hypot(gx + 0.5 - jx, gy + 0.5 - jy)
    present = jit[cy.astype(int), cx.astype(int), 2] < 0.7
    pits = (1 - smooth(0.4, 1.9, dist)) * present
    skinzone = smooth(5.5, 7.5, x) * (1 - smooth(4.5, 6.5, np.abs(z - 0))) + 0.5 * smooth(-1, 3, x) * smooth(4, 8, az) * smooth(12, 9, y)
    nose = smooth(8.0, 9.5, x) * smooth(10.0, 12.0, y) * smooth(17.0, 15.0, y)
    pore_amp = np.clip(0.55 + 0.6 * nose + 0.2 * smooth(3, 8, az), 0, 1.2)
    lips = smooth(9.9, 9.1, y) * smooth(6.3, 7.2, y) * smooth(4.2, 3.4, az) * smooth(7.0, 8.2, x)
    height = grain - 0.30 * pits * pore_amp * (1 - lips)
    # (the lips are creased across their length: fine lines running up and down)
    lines = 0.5 + 0.5 * np.sin(z * 9.0 * np.pi + 3.0 * np.sin(y * 3.1))
    height = height + 0.16 * (lines - 0.5) * lips
    height = np.clip(height, 0, 1)
    # ---- roughness
    rough = np.full((W, W), 0.56, np.float32)
    tzone = smooth(18.0, 20.5, y) * smooth(5.0, 3.0, az) * smooth(5.0, 7.0, x)        # the forehead
    rough -= 0.20 * tzone
    rough -= 0.2 * nose * smooth(2.8, 1.2, az)                                         # the bridge, the tip and the wings of the nose
    rough -= 0.06 * smooth(5.0, 7.0, az) * smooth(12.0, 15.5, y) * smooth(2.0, 5.0, x)  # the cheekbones
    rough -= 0.30 * lips                                                               # lips: wet
    beard = smooth(12.5, 10.0, y) * smooth(2.0, 5.0, x) * (1 - lips)
    rough += 0.14 * beard
    # pits and dark hairs are rougher, a little shiny where the albedo is smooth
    rough += 0.22 * pits * pore_amp * (1 - lips) - 0.12 * hp2 * 4.0
    rough += 0.04 * (cv2.GaussianBlur(rng.random((W, W)).astype(np.float32), (0, 0), 24) - 0.5) * 10
    # ---- hair
    wob = cv2.GaussianBlur(rng.standard_normal((W, W)).astype(np.float32), (0, 0), 14)
    wob = (wob / wob.std() * 1.0)[..., None]
    hair = hair_mask(x, y, z, wob)
    scalp = np.asarray(hair, np.float32)
    # the brows: where the albedo is dark enough over the brow's place (a box over each eye, up to where the lid begins)
    inbrow = smooth(17.4, 18.0, y) * smooth(21.0, 20.0, y) * smooth(0.4, 1.0, az) * smooth(8.2, 7.2, az) * smooth(4.0, 5.5, x)
    dark = np.clip((0.40 - L) / 0.18, 0, 1)
    dark = cv2.GaussianBlur(dark.astype(np.float32), (0, 0), 1.2)
    brow = np.clip(1.6 * dark, 0, 1) * inbrow
    hair_all = np.clip(scalp, 0, 1)
    rough = np.where(hair_all > 0.3, 0.7, rough)
    rough = np.clip(rough, 0.16, 0.95)
    img = np.dstack([height, rough, hair_all]).astype(np.float32)
    img = fill(img, have)
    # outside every island: flat defaults
    out_img = np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(out_img).save(os.path.join(out, 'skin-detail.jpg'), quality=90, subsampling=0)
    print('wrote skin-detail.jpg', os.path.getsize(os.path.join(out, 'skin-detail.jpg')) // 1024, 'kB')


def ao_bake(mesh, out, rays=72, reach=2.6):
    """Cavity and thickness at every point: rays over the cosine hemisphere (and one straight in) against the head's own triangles."""
    canon, uv, index, kind, same = mesh
    n = len(canon)
    nrm = normals(canon, index, same)
    A, B, C = canon[index[:, 0]], canon[index[:, 1]], canon[index[:, 2]]
    E1, E2 = B - A, C - A
    cen = (A + B + C) / 3
    rad = np.maximum.reduce([np.linalg.norm(A - cen, axis=1), np.linalg.norm(B - cen, axis=1), np.linalg.norm(C - cen, axis=1)])
    rng = np.random.default_rng(3)
    # (a fixed fan of directions on the hemisphere about +z: cosine-weighted, stratified)
    k = np.arange(rays)
    u1, u2 = (k + rng.random(rays)) / rays, (k * 0.61803398875) % 1.0
    r = np.sqrt(u1)
    fan = np.stack([r * np.cos(2 * np.pi * u2), r * np.sin(2 * np.pi * u2), np.sqrt(1 - u1)], 1)
    res = np.zeros((n, 2), np.float32)

    def cast(o, d, near):
        """The first hit along each direction d (m,3) from the point o, among the triangles `near`: the distance, or inf."""
        e1, e2, a = E1[near], E2[near], A[near]
        P = np.cross(d[:, None, :], e2[None, :, :])
        det = np.einsum('tk,mtk->mt', e1, P)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0)
        T = o[None, :] - a
        u = np.einsum('tk,mtk->mt', T, P) * inv
        Q = np.cross(T, e1)
        v = np.einsum('mk,tk->mt', d, Q) * inv
        t = np.einsum('tk,tk->t', e2, Q)[None, :] * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0.03)
        return np.where(hit, t, np.inf).min(axis=1)

    for i in range(n):
        nv = nrm[i]
        if kind[i] == 1 or not np.all(np.isfinite(nv)) or np.linalg.norm(nv) < 0.5:
            res[i] = (1.0, 0.0)
            continue
        o = canon[i] + nv * 0.02
        near = np.nonzero(np.linalg.norm(cen - canon[i], axis=1) < 6.0 + rad)[0]
        # tangent frame
        up = np.array([0.0, 1.0, 0.0]) if abs(nv[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
        tx = np.cross(up, nv); tx /= np.linalg.norm(tx)
        ty = np.cross(nv, tx)
        d = fan[:, 0:1] * tx + fan[:, 1:2] * ty + fan[:, 2:3] * nv
        dist = cast(o, d, near)
        occ = np.where(np.isfinite(dist) & (dist < reach), 1 - (dist / reach) ** 2, 0.0).mean()
        # thickness: straight in, the first thing behind the skin
        t_in = cast(canon[i] - nv * 0.02, -nv[None, :], near)[0]
        thin = 0.0 if not np.isfinite(t_in) else float(1 - smooth(0.5, 2.4, t_in))
        res[i] = (np.clip(1 - 1.25 * occ, 0.05, 1), thin)
    # (the points at one place share theirs: no seam)
    for c in range(2):
        s = np.zeros(n); cnt = np.zeros(n)
        np.add.at(s, same, res[:, c]); np.add.at(cnt, same, 1)
        res[:, c] = (s / np.maximum(cnt, 1))[same]
    data = np.clip(res * 255 + 0.5, 0, 255).astype(np.uint8).tobytes()
    open(os.path.join(out, 'skin-ao.bin'), 'wb').write(data)
    print('wrote skin-ao.bin', len(data), 'bytes; mean cavity', float(res[:, 0].mean()), 'mean thin', float(res[:, 1].mean()))


if __name__ == '__main__':
    mesh = load(sys.argv[1])
    only = sys.argv[4] if len(sys.argv) > 4 else 'all'
    if only in ('all', 'detail'):
        detail(mesh, sys.argv[2], sys.argv[3])
    if only in ('all', 'ao'):
        ao_bake(mesh, sys.argv[3])
