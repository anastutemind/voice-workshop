"""
Bakes the skin of the 3D view's whole head (public/head3d/skin.jpg) in the scanned head's own texture space.

The head is the scan public/models/facecap.glb bent onto the painting (src/ui/three/fullHead.ts). Its points
at rest, their texture coordinates and its triangles are taken out of the page in dev (scripts/head3d-sink.py,
then in the page: see EXPORT below) into <mesh-dir>.

Every photograph of the man is registered to the head from where it was taken: the head is drawn from that
direction, the same landmarks are found on the drawing and on the photograph (MediaPipe's face mesh, where a face
can be seen; the outline and the ears from behind; the profile is the painting's own and needs nothing), and a
thin-plate spline takes each place of the drawing onto its place in the photograph. The landmarks the front
photograph puts on the head hold for every later one, so that no two photographs lay a feature twice. Then
every texel of the skin is a point of the head, and takes its colour from the photographs that see it, each by
how squarely it sees it, in two bands (the broad light blended softly, the detail sharply); the gaps are filled
from round them, and what no photograph sees squarely (the crown) borrows its grain from the best-seen hair.

    venv/bin/python scripts/head3d-bake.py <mesh-dir> <photo-dir> <out.jpg> [--views <json>] [--debug <dir>]

The views (scripts/head3d-views.json by default) name each photograph, from where it was taken and how it is
registered: "frame" (the painting's own frame: the side photograph public/skin/face.webp, and its mirror for the
other side), "face" (MediaPipe landmarks; "mirror" for the other side of a three-quarter view; "facing_y" and
"max_y" keep a view to the skin that faces up or down, or lies below a height), "back" (outline and ears).
Photographs other than public/... are read from <photo-dir>: front.png, three-quarter.png, back.png and below.png,
made with fal.ai (nano-banana/edit from the side photograph and a front view; qwen-image-edit multiple-angles for
the view from below).

Needs numpy, scipy, pillow, opencv-python-headless, mediapipe (0.10.x, with mp.solutions).

EXPORT (in the page's console, with scripts/head3d-sink.py listening on 5199):
    const h = tract3d.head, send = (n, a) => fetch('http://127.0.0.1:5199/' + n, { method: 'POST', body: a.slice().buffer });
    for (const [n, a] of [['canon.f32', h.canon], ['uv.f32', h.uv], ['index.u32', h.index], ['kind.f32', h.kind], ['same.i32', h.same]]) await send(n, a);
"""
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy.interpolate import RBFInterpolator

# ----------------------------------------------------------------------------- the head

class Mesh:
    def __init__(self, d):
        self.canon = np.fromfile(os.path.join(d, 'canon.f32'), np.float32).reshape(-1, 3).astype(np.float64)
        self.uv = np.fromfile(os.path.join(d, 'uv.f32'), np.float32).reshape(-1, 2).astype(np.float64)
        self.index = np.fromfile(os.path.join(d, 'index.u32'), np.uint32).reshape(-1, 3).astype(np.int64)
        self.kind = np.fromfile(os.path.join(d, 'kind.f32'), np.float32)
        self.same = np.fromfile(os.path.join(d, 'same.i32'), np.int32).astype(np.int64)
        n = len(self.canon)
        # which way the skin faces: the triangles' normals summed at each place (copies at one place share theirs)
        P, I = self.canon, self.index
        fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
        acc = np.zeros((n, 3))
        for k in range(3):
            np.add.at(acc, self.same[I[:, k]], fn)
        nrm = acc[self.same]
        self.normal = nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
        # skin triangles (the eyes and the cut end of the neck have no skin)
        k = self.kind[I]
        self.skin_tris = np.all(k < 0.5, axis=1)
        self.eye_tris = np.any(np.abs(k - 1) < 0.5, axis=1)


# ----------------------------------------------------------------------------- drawing

def raster(xy, z, tris, W, H, zbuf=None):
    """Triangles at pixel positions xy (N,2) with depth z (N,) (smaller is nearer). Returns the triangle seen at
    each pixel (-1: none), its barycentric weights there, and the depth."""
    tid = np.full((H, W), -1, np.int64)
    bary = np.zeros((H, W, 3))
    if zbuf is None:
        zbuf = np.full((H, W), np.inf)
    for t, (a, b, c) in enumerate(tris):
        pa, pb, pc = xy[a], xy[b], xy[c]
        x0 = max(int(math.floor(min(pa[0], pb[0], pc[0]))), 0)
        x1 = min(int(math.ceil(max(pa[0], pb[0], pc[0]))), W - 1)
        y0 = max(int(math.floor(min(pa[1], pb[1], pc[1]))), 0)
        y1 = min(int(math.ceil(max(pa[1], pb[1], pc[1]))), H - 1)
        if x1 < x0 or y1 < y0:
            continue
        den = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
        if abs(den) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        l0 = ((pb[1] - pc[1]) * (gx - pc[0]) + (pc[0] - pb[0]) * (gy - pc[1])) / den
        l1 = ((pc[1] - pa[1]) * (gx - pc[0]) + (pa[0] - pc[0]) * (gy - pc[1])) / den
        l2 = 1 - l0 - l1
        e = -1e-4
        inside = (l0 >= e) & (l1 >= e) & (l2 >= e)
        if not inside.any():
            continue
        zz = l0 * z[a] + l1 * z[b] + l2 * z[c]
        sub = zbuf[y0:y1 + 1, x0:x1 + 1]
        win = inside & (zz < sub)
        if not win.any():
            continue
        sub[win] = zz[win]
        tid[y0:y1 + 1, x0:x1 + 1][win] = t
        bb = bary[y0:y1 + 1, x0:x1 + 1]
        bb[win] = np.stack([l0[win], l1[win], l2[win]], -1)
    return tid, bary, zbuf


def interp(attr, tris, tid, bary):
    """An attribute of the points (N,k), at every pixel a triangle covers (nan elsewhere)."""
    out = np.full(tid.shape + (attr.shape[1],), np.nan)
    m = tid >= 0
    t = tris[tid[m]]
    b = bary[m]
    out[m] = attr[t[:, 0]] * b[:, :1] + attr[t[:, 1]] * b[:, 1:2] + attr[t[:, 2]] * b[:, 2:3]
    return out


def view_basis(yaw, pitch=0.0, roll=0.0):
    """The axes of an eye looking at the head (rows: its right, its up, toward it): yaw 0 from the front (+x), 90°
    from the head's right (+z), pitch up from level."""
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    back = np.array([cy * cp, sp, sy * cp])
    right = np.array([sy, 0.0, -cy])
    up = np.cross(back, right)
    if roll:
        cr, sr = math.cos(roll), math.sin(roll)
        right, up = cr * right + sr * up, -sr * right + cr * up
    return np.stack([right, up, back])


class View:
    """An orthographic drawing of the head from a direction, over a square of the world `extent` cm wide."""

    def __init__(self, mesh, R, size=1024, centre=(0.0, 13.0), extent=34.0, tris=None):
        self.R, self.size, self.extent = R, size, extent
        self.k = size / extent
        self.c = np.array(centre)
        s = mesh.canon @ R.T
        self.screen = s  # right, up, toward the eye (cm)
        xy = np.stack([(s[:, 0] - self.c[0]) * self.k + size / 2, (self.c[1] - s[:, 1]) * self.k + size / 2], -1)
        self.tris = mesh.index if tris is None else tris
        self.tid, self.bary, self.zbuf = raster(xy, -s[:, 2], self.tris, size, size)
        self.xy = xy

    def to_px(self, s2):
        return np.stack([(s2[..., 0] - self.c[0]) * self.k + self.size / 2, (self.c[1] - s2[..., 1]) * self.k + self.size / 2], -1)

    def to_screen(self, px):
        return np.stack([(px[..., 0] - self.size / 2) / self.k + self.c[0], self.c[1] - (px[..., 1] - self.size / 2) / self.k], -1)

    def shaded(self, mesh, eye_centres=None):
        """A plain drawing of the head, lit from the eye, for finding a face on it."""
        N = interp(mesh.normal, self.tris, self.tid, self.bary)
        P = interp(mesh.canon, self.tris, self.tid, self.bary)
        m = self.tid >= 0
        L = np.array([-0.25, 0.35, 1.0]); L /= np.linalg.norm(L)
        n_eye = N @ self.R.T
        lam = np.clip((n_eye * L).sum(-1), 0, 1)
        skin = np.array([196, 150, 130.0])
        img = np.zeros(self.tid.shape + (3,))
        img[m] = skin * (0.25 + 0.75 * lam[m])[:, None]
        # the eyes: white, an iris and a pupil looking ahead
        eye = np.zeros(self.tid.shape, bool)
        eye[m] = np.abs(KIND[self.tris[self.tid[m]][:, 0]] - 1) < 0.5
        if eye_centres is not None and eye.any():
            for ec in eye_centres:
                d = P - ec
                r = np.linalg.norm(d, axis=-1)
                ang = np.arccos(np.clip(d[..., 0] / np.maximum(r, 1e-9), -1, 1))
                sel = eye & (np.abs(P[..., 2] - ec[2]) < 2.0)
                col = np.where(ang[..., None] < 0.22, np.array([20, 15, 12.0]), np.where(ang[..., None] < 0.48, np.array([90, 60, 40.0]), np.array([225, 222, 215.0])))
                img[sel] = col[sel] * (0.5 + 0.5 * lam[sel])[:, None]
        img[~m] = 0
        return np.clip(img, 0, 255).astype(np.uint8)


KIND = None

# ----------------------------------------------------------------------------- landmarks

_fm = None


def face_landmarks(img):
    """MediaPipe's 478 landmarks of the face in an RGB image (pixels), or None."""
    global _fm
    import mediapipe as mp
    if _fm is None:
        _fm = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.2)
    r = _fm.process(np.ascontiguousarray(img[..., :3]))
    if not r.multi_face_landmarks:
        return None
    h, w = img.shape[:2]
    return np.array([[p.x * w, p.y * h, p.z * w] for p in r.multi_face_landmarks[0].landmark])


def oval_ids():
    import mediapipe as mp
    return sorted({i for e in mp.solutions.face_mesh.FACEMESH_FACE_OVAL for i in e})


def lift(view, mesh, px):
    """The points of the head under pixels of its drawing (nan where there is none), and which way they face."""
    ix = np.clip(np.round(px[:, 0] - 0.5).astype(int), 0, view.size - 1)
    iy = np.clip(np.round(px[:, 1] - 0.5).astype(int), 0, view.size - 1)
    tid = view.tid[iy, ix]
    P = np.full((len(px), 3), np.nan)
    N = np.full((len(px), 3), np.nan)
    m = tid >= 0
    t = view.tris[tid[m]]
    b = view.bary[iy[m], ix[m]]
    P[m] = (mesh.canon[t] * b[..., None]).sum(1)
    N[m] = (mesh.normal[t] * b[..., None]).sum(1)
    return P, N


def fit_pose(X, q):
    """The scaled orthographic eye that sees the points X (k,3) at the pixels q (k,2) of a photograph: its axes
    (as view_basis gives them), its scale (pixels a cm) and its offset."""
    qy = np.stack([q[:, 0], -q[:, 1]], -1)
    A = np.c_[X, np.ones(len(X))]
    sol, *_ = np.linalg.lstsq(A, qy, rcond=None)
    M = sol[:3].T  # 2x3
    U, S, Vt = np.linalg.svd(M, full_matrices=False)
    R2 = U @ Vt
    s = S.mean()
    R = np.stack([R2[0], R2[1], np.cross(R2[0], R2[1])])
    t = (qy - s * (X @ R2.T)).mean(0)
    return R, s, t


class Affine:
    """A plain scale and offset from a drawing's screen (cm) to pixels of a photograph."""

    def __init__(self, kx, ox, ky, oy):
        self.a = (kx, ox, ky, oy)

    def __call__(self, s):
        kx, ox, ky, oy = self.a
        return np.stack([s[..., 0] * kx + ox, s[..., 1] * ky + oy], -1)


class Warp:
    """A thin-plate spline from places of a drawing (its screen, cm) to pixels of a photograph."""

    # (the spline is smooth: it is worked out on a fine grid of the screen once, and read off it after)
    BOX, STEP = (-18.0, 18.0, -12.0, 34.0), 0.05

    def __init__(self, src, dst, smoothing=2.0):
        self.f = RBFInterpolator(src, dst, kernel='thin_plate_spline', smoothing=smoothing, degree=1)
        x0, x1, y0, y1 = self.BOX
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1e-9, self.STEP), np.arange(y0, y1 + 1e-9, self.STEP))
        self.grid = self.f(np.stack([gx.ravel(), gy.ravel()], -1)).reshape(gx.shape + (2,)).astype(np.float32)

    def __call__(self, s):
        x0, x1, y0, y1 = self.BOX
        sh = s.shape
        flat = s.reshape(-1, 2).astype(np.float32)
        n = len(flat)
        # (cv2 wants maps no longer than 32767 a side: the points as rows of 1024)
        m = -(-n // 1024) * 1024
        mx = np.full(m, -1.0, np.float32); my = np.full(m, -1.0, np.float32)
        mx[:n] = (flat[:, 0] - x0) / self.STEP; my[:n] = (flat[:, 1] - y0) / self.STEP
        mx, my = mx.reshape(-1, 1024), my.reshape(-1, 1024)
        out = np.stack([cv2.remap(self.grid[..., k], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).ravel()[:n] for k in range(2)], -1)
        out[~np.all(np.isfinite(flat), 1)] = np.nan
        return out.reshape(sh[:-1] + (2,))


class Then:
    """A small bend of a drawing's screen (a spline of displacements), then another map."""

    def __init__(self, src, dst, after):
        self.f = RBFInterpolator(src, dst - src, kernel='thin_plate_spline', smoothing=0.0, degree=1)
        self.after = after

    def __call__(self, s):
        sh = s.shape
        flat = s.reshape(-1, 2)
        ok = np.all(np.isfinite(flat), 1)
        moved = flat.copy()
        if ok.any():
            moved[ok] = flat[ok] + self.f(flat[ok])
        return self.after(moved.reshape(sh))


MZ = np.diag([1.0, 1.0, -1.0])
GRID = dict(size=1024, centre=(0.0, 14.0), extent=30.0)


def eye_centres(mesh):
    e = mesh.canon[np.abs(mesh.kind - 1) < 0.5]
    return [e[e[:, 2] < 0].mean(0), e[e[:, 2] > 0].mean(0)]


def person_mask(photo):
    import mediapipe as mp
    with mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0) as seg:
        return seg.process(np.ascontiguousarray(photo)).segmentation_mask.astype(np.float32)


def load_photo(path, mirror=False):
    im = Image.open(path)
    rgba = np.array(im.convert('RGBA'))
    photo, alpha = rgba[..., :3], rgba[..., 3].astype(np.float32) / 255
    if mirror:
        photo, alpha = photo[:, ::-1].copy(), alpha[:, ::-1].copy()
    return photo, alpha


def register_face(mesh, photo, yaw_deg, log, ears=None, anchor=None):
    """A photograph with a face in it: its eye, and the spline from the drawing seen by that eye to it.
    `anchor`: the points of the head where the landmarks are, as the first photograph (from the front) put them:
    every later photograph puts the same landmark on the same point (so that two photographs do not lay a brow,
    say, a few millimetres apart, and show it twice). Returns the eye, the spline, and the landmarks' points."""
    ecs = eye_centres(mesh)
    lp = face_landmarks(photo)
    if lp is None:
        raise RuntimeError('no face found in the photograph')
    V = View(mesh, view_basis(math.radians(yaw_deg)), **GRID)
    lr = face_landmarks(V.shaded(mesh, ecs))
    oval = np.isin(np.arange(len(lp)), oval_ids())
    for it in range(3):
        X, N = lift(V, mesh, lr[:, :2])
        ok = np.all(np.isfinite(X), 1) & ~oval & ((N @ V.R[2]) > 0.25)
        if anchor is not None:
            X = np.where(np.isfinite(anchor[0]), anchor[0], X)
            ok = np.all(np.isfinite(X), 1) & ~oval & ((np.nan_to_num(N) @ V.R[2]) > 0.25)
        R, s, t = fit_pose(X[ok], lp[ok, :2])
        V = View(mesh, R, **GRID)
        lr = face_landmarks(V.shaded(mesh, ecs))
        if lr is None:
            raise RuntimeError('no face found in the drawing')
    X, N = lift(V, mesh, lr[:, :2])
    vis = (np.all(np.isfinite(X), 1) & ((N @ V.R[2]) > 0.05)) | oval
    src, dst = V.to_screen(lr[vis, :2]), lp[vis, :2]
    if anchor is not None:
        # the landmarks the first photograph placed, where this eye sees them squarely enough: those points
        AX, AN = anchor
        k = np.nonzero(vis)[0]
        sa = AX[k] @ V.R.T
        px = V.to_px(sa[:, :2])
        ix = np.clip(np.round(px[:, 0] - 0.5).astype(int), 0, V.size - 1)
        iy = np.clip(np.round(px[:, 1] - 0.5).astype(int), 0, V.size - 1)
        seen = np.isfinite(sa[:, 0]) & (-sa[:, 2] <= V.zbuf[iy, ix] + 0.08) & ((np.nan_to_num(AN[k]) @ V.R[2]) > 0.3) & ~oval[k]
        src[seen] = sa[seen, :2]
        log(f'  {seen.sum()} landmarks held where the first photograph put them')
    Xall = np.full((len(lp), 3), np.nan); Nall = np.full((len(lp), 3), np.nan)
    good = vis & np.all(np.isfinite(X), 1) & ((np.nan_to_num(N) @ V.R[2]) > 0.5) & ~oval
    Xall[good] = X[good]; Nall[good] = N[good]
    if ears:
        # places the face mesh does not know (the ears): points of the head, and where the photograph has them
        for P3, q in ears:
            src = np.r_[src, (np.asarray(P3, float) @ V.R[:2].T)[None]]
            dst = np.r_[dst, np.asarray(q, float)[None]]
    yaw = math.degrees(math.atan2(V.R[2, 2], V.R[2, 0]))
    pitch = math.degrees(math.asin(np.clip(V.R[2, 1], -1, 1)))
    log(f'  face: {vis.sum()} landmarks, eye at yaw {yaw:.1f} pitch {pitch:.1f}, {s:.1f} px/cm')
    return V.R, Warp(src, dst, smoothing=2.0), (Xall, Nall)


def outline_rows(mask, top, ear, ts):
    """Left and right edges of a silhouette at heights given as fractions from its top (0) to its ear line (1)."""
    out = []
    for t in ts:
        y = int(round(top + t * (ear - top)))
        xs = np.nonzero(mask[y])[0]
        out.append((y, xs.min(), xs.max()) if len(xs) else None)
    return out


def register_back(mesh, photo, mask, ears_px, log, cut=None):
    """A photograph from behind: its silhouette laid on the head's from behind, the ears on the ears.
    ears_px: pairs (drawing pixel, photograph pixel) on the drawing GRID from behind."""
    R = view_basis(math.pi)
    V = View(mesh, R, **GRID)
    mr = V.tid >= 0
    mp_ = mask > 0.5
    if cut is not None:
        mp_[int(cut):] = False
    ry = np.nonzero(mr.any(1))[0].min()
    py = np.nonzero(mp_.any(1))[0].min()
    e = np.array(ears_px, float)
    rear = e[[0, 4], 0, 1].mean() if len(e) >= 8 else e[:, 0, 1].min()
    pear = e[[0, 4], 1, 1].mean() if len(e) >= 8 else e[:, 1, 1].min()
    ts = [0.06, 0.12, 0.25, 0.45, 0.65, 0.85, 1.9, 2.2]
    src, dst = [], []
    rx = np.nonzero(mr[ry])[0].mean(); px_ = np.nonzero(mp_[py])[0].mean()
    src.append((rx, ry)); dst.append((px_, py))
    for a, b in zip(outline_rows(mr, ry, rear, ts), outline_rows(mp_, py, pear, ts)):
        if a is None or b is None:
            continue
        src += [(a[1], a[0]), (a[2], a[0])]
        dst += [(b[1], b[0]), (b[2], b[0])]
    for a, b in ears_px:
        src.append(a); dst.append(b)
    src = V.to_screen(np.array(src, float))
    log(f'  back: {len(src)} landmarks')
    return R, Warp(src, np.array(dst, float), smoothing=0.5)


# ----------------------------------------------------------------------------- the bake

def gauss_masked(img, w, sigma, islands):
    """A blur that keeps to its own island of the texture and to where `w` says there is something."""
    out = np.zeros_like(img)
    for m in islands:
        wm = (w * m).astype(np.float32)
        num = cv2.GaussianBlur(img * wm[..., None] if img.ndim == 3 else img * wm, (0, 0), sigma)
        den = cv2.GaussianBlur(wm, (0, 0), sigma)
        r = num / np.maximum(den, 1e-6)[..., None] if img.ndim == 3 else num / np.maximum(den, 1e-6)
        out[m] = r[m]
    return out


def push_pull(img, w):
    """Fills where `w` is 0 from what is round it, nearer first (a pyramid down and up again)."""
    levels = []
    c, ww = img * w[..., None], w.copy()
    while min(ww.shape) > 1:
        levels.append((c, ww))
        h, wd = ww.shape
        c = cv2.resize(c, (max(1, wd // 2), max(1, h // 2)), interpolation=cv2.INTER_AREA) * 4
        ww = cv2.resize(ww, (max(1, wd // 2), max(1, h // 2)), interpolation=cv2.INTER_AREA) * 4
        k = np.minimum(ww, 1.0)
        c = c / np.maximum(ww, 1e-6)[..., None] * k[..., None]
        ww = k
    fill = c / np.maximum(ww, 1e-6)[..., None]
    for c, ww in reversed(levels):
        h, wd = ww.shape
        up = cv2.resize(fill, (wd, h), interpolation=cv2.INTER_LINEAR)
        a = np.minimum(ww, 1.0)[..., None]
        fill = c / np.maximum(ww, 1e-6)[..., None] * a + up * (1 - a)
    return fill


def bake(mesh, views, S, log, debug=None):
    from scipy import ndimage
    tris = mesh.index[mesh.skin_tris]
    tid, bary, _ = raster(mesh.uv * S, np.zeros(len(mesh.uv)), tris, S, S)
    cover = tid >= 0
    P = interp(mesh.canon, tris, tid, bary)
    N = interp(mesh.normal, tris, tid, bary)
    N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-9)
    lab, n = ndimage.label(cover)
    islands = [lab == i for i in range(1, n + 1) if (lab == i).sum() > 50]
    log(f'texture {S}: {cover.mean() * 100:.0f}% covered, {len(islands)} islands')
    Pc = np.where(cover[..., None], P, 0.0)
    cols, ws = [], []
    for v in views:
        R = v['R']
        V = View(mesh, R, size=1536, centre=(0.0, 12.0), extent=40.0)
        s = Pc @ R.T
        px = V.to_px(s[..., :2])
        zb = ndimage.maximum_filter(np.where(np.isfinite(V.zbuf), V.zbuf, 1e9), 3)
        ix = np.clip(np.round(px[..., 0] - 0.5).astype(int), 0, V.size - 1)
        iy = np.clip(np.round(px[..., 1] - 0.5).astype(int), 0, V.size - 1)
        vis = cover & (-s[..., 2] <= zb[iy, ix] + 0.08)
        # (not visible near where it stops being visible: a feather, not an edge)
        dist = cv2.distanceTransform((vis | ~cover).astype(np.uint8), cv2.DIST_L2, 5)
        vis_soft = np.clip(dist / (S / 256), 0, 1) * vis
        cos = (N * R[2]).sum(-1)
        q = v['warp'](s[..., :2]).astype(np.float32)
        q[~cover] = -10
        photo = v['photo'].astype(np.float32) / 255
        col = cv2.remap(photo, q[..., 0], q[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        msk = cv2.remap(v['mask'], q[..., 0], q[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        msk = np.clip((msk - 0.5) / 0.4, 0, 1)
        face = np.clip((cos - v.get('min_cos', 0.08)) / (1 - v.get('min_cos', 0.08)), 0, 1)
        w = vis_soft * msk * face * v.get('trust', 1.0)
        # (a view may be kept to the skin that faces up, or down: [from, to] of the normal's height, ramped)
        if v.get('facing_y'):
            a, b_ = v['facing_y']
            t = np.clip((N[..., 1] - a) / (b_ - a), 0, 1)
            w = w * t * t * (3 - 2 * t)
        # (or to what lies below a height: a view from below has the eyes looking up, and is kept to the chin)
        # (or give way on the top of the head to the views that have hair there: the side photograph's hairline
        # recedes further than the others', and the head's hair should be one all round)
        if v.get('yield_top'):
            w = w * (1 - v['yield_top'] * np.clip((N[..., 1] - 0.3) / 0.4, 0, 1))
        if v.get('max_y') is not None:
            w = w * np.clip((v['max_y'] - P[..., 1]) / 0.6, 0, 1)
        w[~cover] = 0
        cols.append(col); ws.append(w)
        log(f"  {v['name']}: sees {np.mean(w[cover] > 0.05) * 100:.0f}% of the skin")
        if debug:
            Image.fromarray((np.clip(col * (w[..., None] > 0.02), 0, 1) * 255).astype(np.uint8)).resize((1024, 1024)).save(os.path.join(debug, f"view-{v['name']}.jpg"), quality=85)
    # two bands: the light broad and softly mixed, the detail sharp and from the view that sees it best
    sig = S / 85
    num_lo = np.zeros((S, S, 3)); den_lo = np.zeros((S, S))
    num_hi = np.zeros((S, S, 3)); den_hi = np.zeros((S, S))
    for col, w in zip(cols, ws):
        seen = (w > 0.01).astype(np.float32)
        lo = gauss_masked(col, seen, sig, islands)
        wl = gauss_masked(w ** 1.5, cover.astype(np.float32), sig, islands) * seen
        wh = w ** 10
        num_lo += lo * wl[..., None]; den_lo += wl
        num_hi += (col - lo) * wh[..., None]; den_hi += wh
    lo = num_lo / np.maximum(den_lo, 1e-9)[..., None]
    hi = num_hi / np.maximum(den_hi, 1e-9)[..., None]
    have = cover & (den_lo > 1e-6)
    out = np.where(have[..., None], lo + np.where((den_hi > 1e-12)[..., None], hi, 0), 0)
    conf = np.clip(den_lo / max(np.percentile(den_lo[have], 20), 1e-9), 0, 1)
    log(f'  seen by none: {np.mean(~have[cover]) * 100:.1f}% of the skin')
    wmax = np.max(np.stack(ws), 0)
    return dict(color=out, have=have, conf=conf, wmax=wmax, cover=cover, islands=islands, P=P, N=N, tid=tid)


def borrow_detail(out, wmax, islands, cover, S, log, seen=0.22, size=None):
    """Where no photograph sees the skin squarely (the crown, deep under the jaw), its colour is the soft mix of
    what is round it, without the grain of hair or skin: that grain (the fine detail only) is borrowed from a part
    of the same island that is well seen and of the same colour, laid on in mirrored tiles. A region with no such
    part keeps its soft colour."""
    from scipy import ndimage
    size = size or S // 10
    cov = cover.astype(np.float32)
    lo = gauss_masked(out, cov, S / 400, islands)
    hi = out - lo
    broad = gauss_masked(out, cov, S / 60, islands)
    res = out.copy()
    for m in islands:
        lab, n = ndimage.label(m & (wmax < seen))
        good = (m & (wmax > 0.45)).astype(np.float64)
        ii = np.pad(good.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        for r in range(1, n + 1):
            need = lab == r
            if need.sum() < S * S / 4000:
                continue
            want = broad[need].mean(0)
            best, at = None, None
            for y in range(0, S - size, size // 4):
                for x in range(0, S - size, size // 4):
                    full = ii[y + size, x + size] - ii[y, x + size] - ii[y + size, x] + ii[y, x]
                    if full < 0.98 * size * size:
                        continue
                    patch = broad[y:y + size, x:x + size].reshape(-1, 3)
                    d = np.linalg.norm(patch.mean(0) - want) + 0.5 * patch.std(0).mean()
                    if best is None or d < best:
                        best, at = d, (y, x)
            if at is None or best > 0.09:
                log(f'  no grain for {need.sum()} texels (nearest {best})')
                continue
            y, x = at
            patch = hi[y:y + size, x:x + size]
            tile = np.concatenate([patch, patch[:, ::-1]], 1)
            tile = np.concatenate([tile, tile[::-1]], 0)
            donor = np.tile(tile, (S // tile.shape[0] + 1, S // tile.shape[1] + 1, 1))[:S, :S]
            a = np.clip((seen - wmax) / seen, 0, 1) * ndimage.binary_dilation(need, iterations=S // 200)
            a = cv2.GaussianBlur(a.astype(np.float32), (0, 0), S / 400)[..., None] * m[..., None]
            # (the soft colour stays; the grain is the borrowed one where nothing sees, the own one where it does)
            res = res + a * (donor - hi)
            log(f'  grain borrowed for {need.sum()} texels from ({x}, {y}), colour off by {best:.3f}')
    return res

def match_seam(out, mesh, cover, islands, S, log, reach=0.06):
    """The neck is grown from the scan's edge under the jaw, and has its own island in the texture: along that
    edge the two islands meet, each with the colour its own photographs gave it. The neck's colour is brought to
    the jaw's along the edge, less and less down the neck."""
    lo = gauss_masked(out, cover.astype(np.float32), S / 150, islands)
    uv, same = mesh.uv, mesh.same
    neck = (uv[:, 0] < 0.475) & (uv[:, 1] < 0.26) & (mesh.kind < 0.5)
    pairs = [(i, same[i]) for i in np.nonzero(neck & (uv[:, 1] < 0.0125 + 1e-4))[0] if same[i] != i and not neck[same[i]]]
    if len(pairs) < 8:
        return out
    def at(p):
        x, y = p[0] * S - 0.5, p[1] * S - 0.5
        return cv2.getRectSubPix(lo.astype(np.float32), (1, 1), (float(x), float(y)))[0, 0]
    us = np.array([uv[i, 0] for i, _ in pairs])
    d = np.array([at(uv[r]) - at(uv[i]) for i, r in pairs])
    o = np.argsort(us); us, d = us[o], d[o]
    # (a little smoothing along the edge)
    k = np.ones(5) / 5
    d = np.stack([np.convolve(np.pad(d[:, c], 2, mode='edge'), k, mode='valid') for c in range(3)], -1)
    ys, xs = np.nonzero(cover)
    sel = (xs / S < 0.475) & (ys / S < 0.26)
    ys, xs = ys[sel], xs[sel]
    u, v = (xs + 0.5) / S, (ys + 0.5) / S
    corr = np.stack([np.interp(u, us, d[:, c]) for c in range(3)], -1)
    fall = np.clip(1 - (v - 0.0125) / reach, 0, 1) ** 1.5
    out = out.copy()
    out[ys, xs] += corr * fall[:, None]
    log(f'  neck matched to the jaw along {len(pairs)} points (mean shift {np.abs(d).mean():.3f})')
    return out


def finish(b, S, log=print, mesh=None):
    """Fills what no photograph saw (from round it, in its own island), makes the inside of the mouth dark and
    wet, and runs every island's colours on past its edge (so that no seam shows when the picture is filtered)."""
    out, have, cover = b['color'].copy(), b['have'], b['cover']
    P = b['P']
    for m in b['islands']:
        w = (have & m).astype(np.float32)
        if w.sum() == 0:
            continue
        f = push_pull(np.where(m[..., None], out, 0), w)
        hole = m & ~have
        out[hole] = f[hole]
    if mesh is not None:
        out = match_seam(out, mesh, cover, b['islands'], S, log)
    out = borrow_detail(out, np.where(have, b['wmax'], 0), b['islands'], cover, S, log)
    # the inside of the mouth: the pocket behind the lips is dark, the lips' own inner side darkening into it
    x = np.where(cover, P[..., 0], 99)
    inner = np.array([0.32, 0.12, 0.11])
    deep = np.clip((7.2 - x) / 1.6, 0, 1)
    mouth = np.zeros_like(cover)
    for m in b['islands']:
        if np.nanmax(np.where(m, P[..., 0], -99)) < 7.0 and np.nanmean(np.where(m, P[..., 1], np.nan)) > 6 and np.nanmean(np.where(m, P[..., 1], np.nan)) < 12:
            mouth |= m
    out[mouth] = inner * (1 - 0.65 * deep[mouth])[:, None]
    # past the edges
    w = cover.astype(np.float32)
    f = push_pull(out, w)
    out[~cover] = f[~cover]
    return np.clip(out, 0, 1)


def preview(mesh, tex, R, size=768, light=True):
    """The head drawn in its skin, from an eye (for checking the bake without the page)."""
    V = View(mesh, R, size=size, centre=(0.0, 12.5), extent=34.0)
    uv = interp(mesh.uv, V.tris, V.tid, V.bary)
    m = V.tid >= 0
    S = tex.shape[0]
    q = (np.nan_to_num(uv) * S).astype(np.float32)
    col = cv2.remap(tex.astype(np.float32), q[..., 0] - 0.5, q[..., 1] - 0.5, cv2.INTER_LINEAR)
    N = interp(mesh.normal, V.tris, V.tid, V.bary)
    lit = np.clip((np.nan_to_num(N) @ R.T)[..., 2], 0, 1) if light else np.ones(m.shape)
    img = col * (0.72 + 0.28 * lit)[..., None]
    kind = np.zeros(m.shape)
    kind[m] = mesh.kind[V.tris[V.tid[m]][:, 0]]
    img[np.abs(kind - 1) < 0.5] = [0.85, 0.83, 0.8]
    img[~m] = [0.06, 0.07, 0.1]
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)


def main():
    args = sys.argv[1:]
    debug = views_path = None
    if '--debug' in args:
        i = args.index('--debug'); debug = args[i + 1]; del args[i:i + 2]
        os.makedirs(debug, exist_ok=True)
    if '--views' in args:
        i = args.index('--views'); views_path = args[i + 1]; del args[i:i + 2]
    mesh_dir, photo_dir, out_path = args[:3]
    S = 2048
    global KIND
    mesh = Mesh(mesh_dir)
    KIND = mesh.kind
    def log(*a):
        print(*a, flush=True)
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = json.load(open(views_path or os.path.join(here, 'head3d-views.json')))
    views = []
    anchor = None
    for c in cfg['views']:
        log(c['name'])
        p = c['photo']
        path = p if os.path.isabs(p) else os.path.join(os.path.dirname(here), p) if p.startswith('public/') else os.path.join(photo_dir, p)
        photo, alpha = load_photo(path, c.get('mirror', False))
        if c['kind'] == 'frame':
            # the painting's own frame: a centimetre is k pixels, its corner at (x0, y1)
            k, x0, y1 = c['frame']
            R = view_basis(math.pi / 2)
            warp = Affine(k, -x0 * k, -k, y1 * k)
            if c.get('mirror'):
                R = R @ MZ
                warp = Affine(-k, photo.shape[1] + x0 * k, -k, y1 * k)
            # (the ear the bend has not laid quite on the photographed one; and the two halves of the scan are not
            # quite one another's mirror: the far eye and ear are laid on the near ones)
            fix = c.get('fix', [])
            if fix:
                src = np.array([a for a, _ in fix], float)
                dst = np.array([b for _, b in fix], float)
                warp = Then(src, dst, warp)
            mask = alpha
        elif c['kind'] == 'face':
            # (the first face is the one the others are held to: the photograph from the front)
            R, warp, marks = register_face(mesh, photo, c['yaw'], log, c.get('ears'), anchor)
            if anchor is None:
                anchor = marks
            mask = person_mask(photo)
        elif c['kind'] == 'back':
            mask = person_mask(photo)
            R, warp = register_back(mesh, photo, mask, c['ears'], log, c.get('cut'))
            if c.get('cut'):
                mask[int(c['cut']):] = 0
        else:
            raise ValueError(c['kind'])
        if c.get('crop'):
            y0, y1 = c['crop']
            mask[:y0] = 0; mask[y1:] = 0
        views.append(dict(name=c['name'], R=R, warp=warp, photo=photo, mask=mask.astype(np.float32), trust=c.get('trust', 1.0), min_cos=c.get('min_cos', 0.08), facing_y=c.get('facing_y'), max_y=c.get('max_y'), yield_top=c.get('yield_top')))
    b = bake(mesh, views, S, log, debug)
    tex = finish(b, S, log, mesh)
    Image.fromarray((tex * 255 + 0.5).astype(np.uint8)).save(out_path, quality=90, optimize=True, progressive=True)
    log(f'wrote {out_path} ({os.path.getsize(out_path) / 1e6:.2f} MB)')
    if debug:
        for name, yaw, pitch in [('front', 0, 0), ('left34', -45, 0), ('left', -90, 0), ('right34', 45, 0), ('back', 180, 0), ('top', -60, 55), ('below', 20, -35)]:
            Image.fromarray(preview(mesh, tex, view_basis(math.radians(yaw), math.radians(pitch)))).save(os.path.join(debug, f'preview-{name}.jpg'), quality=88)


if __name__ == '__main__':
    main()
