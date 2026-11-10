"""
Puts the photographs of the side view made by the editing model into the
frame of the others.

    python3 scripts/skin-prep.py [name ...]

The side photographs (public/skin/<shape>.webp) are cut-outs of one head in
profile in one frame (1536 x 2304 pixels: canonical x -11..13 cm, y
-7..29 cm). The edits made from them (scripts/mirror-generate.ts side ...)
come back smaller, on a dark ground, and not quite in place. Here each is
moved onto the head at rest by what does not move (the skull, the ear, the
eye, the nose: scripts/mirror_align.py), rejected if any of those has moved
within the head, cut out of its ground, and its colours matched; away from
the mouth and the jaw it is the head at rest itself.

Reads /private/tmp/claude-501/vw-faces/gen/side/<take>.png, writes
/private/tmp/claude-501/vw-faces/side/<name>.png (RGBA) and a sheet.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from mirror_align import align, blur, colour_match, drift, gray, prepare, refine, warp  # noqa: E402

ROOT = '/private/tmp/claude-501/vw-faces'
W, H, K, X0, Y1 = 1536, 2304, 64.0, -11.0, 29.0
px = lambda x: int(round((x - X0) * K))
py = lambda y: int(round((Y1 - y) * K))
TAKES = {'open1': 'open1-0-0', 'open2': 'open2-0-0', 'open3': 'open3-2-0', 'owide': 'owide-2-0', 'press': 'press-0-0'}
# (places inside the head, where both pictures have skin: one on the silhouette is measured against the ground)
PLACES = {'eye': (7.3, 15.6), 'ear': (-3.5, 13.0), 'cheek': (4.0, 13.5), 'nose': (9.4, 12.2)}
MAX_DRIFT = 4.5   # pixels of this frame (0.7 mm: two pixels of the edit's own)


def main():
    ref = np.asarray(Image.open('public/skin/rest.webp').convert('RGBA')).astype(float)
    ref_rgb = ref[..., :3]
    # what never moves and has detail of its own: the eye, the brow, the nose, the cheek under the eye, the ear
    # (not the hair: an edit draws it anew)
    still = np.zeros((H, W), bool)
    still[py(19.0):py(11.2), px(3.5):px(11.5)] = True
    still[py(16.5):py(9.0), px(-6.5):px(-0.5)] = True
    still &= ref[..., 3] > 250
    # (a take can be tried under a name of its own: name=take, written as <name>.png)
    for a in sys.argv[1:]:
        if '=' in a:
            TAKES[a.split('=')[0]] = a.split('=')[1]
    names = [a.split('=')[0] for a in sys.argv[1:]] or list(TAKES)
    os.makedirs(os.path.join(ROOT, 'side'), exist_ok=True)
    tiles = []
    for name in names:
        src = np.asarray(Image.open(os.path.join(ROOT, 'gen', 'side', TAKES[name] + '.png')).convert('RGB')).astype(float)
        A = align(src, ref_rgb, still, src.shape[1] / W * 1.0, search=0.08, steps=17)
        places = {k: (px(x), py(y)) for k, (x, y) in PLACES.items()}
        d = drift(src, ref_rgb, A, places, r=48)
        worst = max(np.hypot(*v) for v in d.values())
        # the lower face held to the head at rest where it meets it: the cheek, the base of the nose
        band = np.zeros((H, W), bool)
        band[py(12.0):py(9.5), px(1.0):px(9.5)] = True
        band &= ref[..., 3] > 200
        B = refine(prepare(gray(src), gray(ref_rgb)), band, A.copy(), iters=25)
        c = np.array([px(5.0), py(10.8), 1.0])
        dx, dy = np.linalg.solve(A[:, :2], (B @ c) - (A @ c))
        A = A.copy()
        A[:, 2] += A[:, :2] @ np.array([dx, dy])
        print(f"{name:6s} scale {np.sqrt(abs(np.linalg.det(A[:, :2]))):.4f}  drift " + ' '.join(f"{k}({v[0]:+.1f},{v[1]:+.1f})" for k, v in d.items()) + f"  worst {worst:.2f}{'  REJECT' if worst > MAX_DRIFT else ''}  lower face ({dx:+.2f}, {dy:+.2f})")
        img, ok = warp(src, A, (H, W))
        # the cut-out: what is far from the ground's colour (taken at the frame's corners of the edit)
        g = np.median(np.concatenate([src[:40, :40].reshape(-1, 3), src[:40, -40:].reshape(-1, 3), src[-40:, -40:].reshape(-1, 3)]), axis=0)
        dist = np.sqrt(((img - g) ** 2).sum(-1))
        a = np.clip((blur(dist, 0.8) - 14) / 22, 0, 1)
        a[~ok] = 0
        img = colour_match(img, ref_rgb, still & ok & (a > 0.99))
        # the head at rest away from the mouth and the jaw (blended over a band)
        ys, xs = np.mgrid[0:H, 0:W]
        cx = (xs / K + X0)
        cy = (Y1 - ys / K)
        # (only the part round the mouth is ever shown, and there the edit is whole: two silhouettes mixed would
        # leave a ghost of one beside the other)
        k = np.clip((12.6 - cy) / 0.8, 0, 1) * np.clip((cx - 0.5) / 1.5, 0, 1)
        k = k * k * (3 - 2 * k)
        rgb = ref_rgb * (1 - k[..., None]) + img * k[..., None]
        alpha = ref[..., 3] * (1 - k) + 255 * a * k
        out = np.dstack([rgb, alpha])
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(ROOT, 'side', name + '.png'))
        t = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').crop((px(3.0), py(14.0), px(12.0), py(3.0)))
        bg = Image.new('RGBA', t.size, (40, 46, 70, 255))
        bg.alpha_composite(t)
        t = bg.convert('RGB').resize((288, 352))
        ImageDraw.Draw(t).text((4, 4), f"{name} {worst:.1f}px", fill=(255, 255, 0) if worst <= MAX_DRIFT else (255, 60, 60))
        tiles.append(t)
    sheet = Image.new('RGB', (288 * len(tiles), 352))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * 288, 0))
    sheet.save(os.path.join(ROOT, 'look', 'side-prep.jpg'))


main()
