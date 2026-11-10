"""
Puts a photograph of the face in the frame of another: the tools that
scripts/mirror-prep.py (the mirror, seen from the front) and
scripts/skin-prep.py (the side) share.

A picture made by an editing model is the same face, but rarely in exactly
the same place: a little bigger or smaller, a few pixels off. Here it is
moved onto the face at rest by what does not move when a mouth speaks (the
eyes, the nose, the forehead, the ear), measured by how well the fine detail
of the two lies on one another; then it is checked that nothing of that has
moved *within* the face (an eye a pixel higher, a nose a little turned: an
edit that has redrawn the head, which is rejected); then its colours are
matched to the face at rest's.
"""
import numpy as np
from PIL import Image


def gray(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def blur(img, sigma):
    """A gaussian blur (by the FFT: any size)."""
    if sigma <= 0:
        return img
    h, w = img.shape
    r = int(3 * sigma) + 1
    pad = np.pad(img, r, mode='edge')
    ph, pw = pad.shape
    fy = np.fft.fftfreq(ph)[:, None]
    fx = np.fft.fftfreq(pw)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(pad) * g))
    return out[r:r + h, r:r + w]


def detail(g, sigma=6.0):
    """The fine detail of a picture (its light taken out): what lies on the other picture's when they are in place."""
    d = g - blur(g, sigma)
    return d / (np.sqrt(blur(d * d, 3 * sigma)) + 2.0)


def sample(img, xs, ys):
    """Bilinear samples of a picture (H x W or H x W x C) at pixel places (centres at integers)."""
    h, w = img.shape[:2]
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    fx = xs - x0
    fy = ys - y0
    ok = (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)
    x0c = np.clip(x0, 0, w - 2)
    y0c = np.clip(y0, 0, h - 2)
    if img.ndim == 3:
        fx = fx[..., None]
        fy = fy[..., None]
    out = (img[y0c, x0c] * (1 - fx) + img[y0c, x0c + 1] * fx) * (1 - fy) + (img[y0c + 1, x0c] * (1 - fx) + img[y0c + 1, x0c + 1] * fx) * fy
    return out, ok


def warp(img, A, shape):
    """The picture `img` seen in a frame of `shape`: the pixel (x, y) of the frame is img's A @ (x, y, 1)."""
    h, w = shape
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    sx = A[0, 0] * xs + A[0, 1] * ys + A[0, 2]
    sy = A[1, 0] * xs + A[1, 1] * ys + A[1, 2]
    out, ok = sample(img, sx, sy)
    return out, ok


def phase(a, b, mask):
    """The shift that puts b on a (both detail pictures), by phase correlation over a mask."""
    fa = np.fft.fft2(a * mask)
    fb = np.fft.fft2(b * mask)
    r = fa * np.conj(fb)
    r /= np.abs(r) + 1e-9
    c = np.real(np.fft.ifft2(r))
    i, j = np.unravel_index(np.argmax(c), c.shape)
    h, w = c.shape
    dy = i if i <= h // 2 else i - h
    dx = j if j <= w // 2 else j - w
    return dx, dy, c.max()


def align(src, ref, mask, scale, search=0.06, steps=13):
    """
    The affine map A (2 x 3) for which src's pixel A @ (x, y, 1) is ref's pixel (x, y), over the pixels of
    `mask` (the parts of the face that do not move). `scale` is a first guess of how many of src's pixels make
    one of ref's. Found coarsely (scales tried, the shift of each by phase correlation, at a quarter size),
    then refined to a fraction of a pixel (Gauss-Newton on the detail of both).
    """
    gs, gr = gray(src.astype(float)), gray(ref.astype(float))
    h, w = gr.shape
    q = 4
    small = lambda g: g[: g.shape[0] // q * q, : g.shape[1] // q * q].reshape(g.shape[0] // q, q, g.shape[1] // q, q).mean(axis=(1, 3))
    rs = detail(small(gr), 2.0)
    ms = small(mask.astype(float)) > 0.5
    best = None
    for s in np.linspace(scale * (1 - search), scale * (1 + search), steps):
        A = np.array([[s, 0, 0], [0, s, 0]], dtype=float)
        A[:, :2] *= 1.0
        # src seen at this scale in ref's frame (quarter size), its top left on ref's
        As = np.array([[s, 0, 0], [0, s, 0]], dtype=float)
        Aq = As.copy()
        Aq[:, 2] = (q - 1) / 2 * s - (q - 1) / 2  # (pixel centres of the quarter-size frame)
        ys, xs = np.mgrid[0:rs.shape[0], 0:rs.shape[1]].astype(float)
        sx = s * (xs * q + (q - 1) / 2)
        sy = s * (ys * q + (q - 1) / 2)
        v, ok = sample(gs, sx, sy)
        v = detail(v, 2.0)
        dx, dy, score = phase(rs, v, ms)
        if best is None or score > best[0]:
            best = (score, s, dx, dy)
    _, s, dx, dy = best
    # src at (x, y) of ref: s * (x - dx * q, y - dy * q)
    A = np.array([[s, 0, -s * dx * q], [0, s, -s * dy * q]], dtype=float)
    return refine(prepare(gs, gr), mask, A)


def prepare(gs, gr):
    """What `refine` works on: the detail of both pictures and the slope of src's."""
    ds = detail(gs)
    gy, gx = np.gradient(ds)
    return detail(gr), ds, gx, gy


def refine(pre, mask, A, iters=30):
    """Gauss-Newton on the six numbers of A, at full size, over the mask."""
    dr, ds, gx, gy = pre
    ys, xs = np.nonzero(mask)
    # (a few thousand pixels are plenty, and quick)
    pick = np.linspace(0, len(xs) - 1, min(len(xs), 60000)).astype(int)
    xs, ys = xs[pick].astype(float), ys[pick].astype(float)
    target = dr[ys.astype(int), xs.astype(int)]
    for _ in range(iters):
        sx = A[0, 0] * xs + A[0, 1] * ys + A[0, 2]
        sy = A[1, 0] * xs + A[1, 1] * ys + A[1, 2]
        v, ok = sample(ds, sx, sy)
        ix, _ = sample(gx, sx, sy)
        iy, _ = sample(gy, sx, sy)
        e = (v - target)[ok]
        J = np.stack([ix * xs, ix * ys, ix, iy * xs, iy * ys, iy], axis=1)[ok]
        H = J.T @ J + 1e-3 * np.eye(6)
        d = np.linalg.solve(H, -J.T @ e)
        A = A + d.reshape(2, 3)
        if np.abs(d[[2, 5]]).max() < 0.002 and np.abs(d[[0, 1, 3, 4]]).max() < 1e-6:
            break
    return A


def drift(src, ref, A, places, r=28):
    """
    How far each of a few places of the face (eyes, nose, ...) is from where the whole puts it: (dx, dy) in
    pixels of ref, found by aligning a small square round each place on its own. An edit that has not
    redrawn the head leaves them all within a pixel or so of zero.
    """
    gs, gr = gray(src.astype(float)), gray(ref.astype(float))
    h, w = gr.shape
    pre = prepare(gs, gr)
    out = {}
    for name, (cx, cy) in places.items():
        m = np.zeros((h, w), bool)
        m[max(0, cy - r):cy + r, max(0, cx - r):cx + r] = True
        B = refine(pre, m, A.copy(), iters=20)
        # where the place's centre is in src by its own fit, and by the whole's, in ref's pixels
        p = np.array([cx, cy, 1.0])
        d = np.linalg.solve(A[:, :2], (B @ p) - (A @ p))
        out[name] = (float(d[0]), float(d[1]))
    return out


def colour_match(img, ref, mask):
    """img's colours made like ref's over a mask: a gain and an offset for each channel."""
    out = img.astype(float).copy()
    for c in range(3):
        a = img[..., c][mask].astype(float)
        b = ref[..., c][mask].astype(float)
        g = np.cov(a, b)[0, 1] / max(1e-6, a.var())
        g = float(np.clip(g, 0.85, 1.15))
        o = b.mean() - g * a.mean()
        out[..., c] = out[..., c] * g + o
    return np.clip(out, 0, 255)


def load(path, mode='RGB'):
    return np.asarray(Image.open(path).convert(mode)).astype(float)
