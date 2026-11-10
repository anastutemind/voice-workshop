"""
Puts every photograph of the mirror in one frame: the face at rest's.

    python3 scripts/mirror-prep.py [name ...]

The mirror (src/ui/tutor/MirrorPhoto.tsx) is the face of one man seen from
the front, in many mouth shapes. Twelve were photographed; more were made
from them by an editing model (scripts/mirror-generate.ts). Before they can
be morphed into one another, the head must be in the same place in all of
them, to the pixel: here each is moved onto the face at rest by its eyes,
nose and cheeks (scripts/mirror_align.py); it is rejected if anything of
those has moved within the face (the edit has redrawn the head); its
colours are matched to the face at rest's; and above the mouth (the eyes,
the nose) it is made the face at rest itself, so nothing there can ever
move or flicker while the mouth speaks.

Reads the originals from /private/tmp/claude-501/vw-faces/in/front (copies
of the twelve photographs as they were) and the chosen takes of the edits
from /private/tmp/claude-501/vw-faces/gen/front; writes
/private/tmp/claude-501/vw-faces/front/<name>.png and a sheet to look at.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from mirror_align import align, colour_match, drift, gray, load, prepare, refine, warp  # noqa: E402

ROOT = '/private/tmp/claude-501/vw-faces'
W, H = 672, 900
# the photographs as they were, and the takes of the edits chosen by eye (gen/front/<take>.png)
# (the photographed lip on the teeth is hardly that: an edit of it, below, takes its place)
ORIGINALS = ['rest', 'mid', 'open', 'e', 'o', 'round', 'spread', 'th', 'l', 's', 'sh']
TAKES = {'press': 'press-3-0', 'open1': 'open1-0-0', 'open2': 'open2-0-0', 'open25': 'open3-2-0', 'open3': 'open35-0-0', 'ae': 'ae-0-0', 'kiss': 'kiss-0-0',
         'owide': 'owide-2-0', 'fv': 'fv-3-0', 'th1': 'tongue-1-0', 'ee': 'ee-3-0'}
# what never moves: the eyes, the nose and the cheeks beside it (pixels of the face at rest)
STILL = (20, 0, 652, 250)
PLACES = {'left eye': (180, 18), 'right eye': (490, 18), 'nose tip': (330, 175), 'left nostril': (280, 215), 'right nostril': (392, 215), 'left cheek': (110, 160), 'right cheek': (560, 160)}
# above this line the picture is the face at rest's (blended over the band below it)
SEAM = (262, 300)
# where the lower face is held to the face at rest: the base of the nose, the top of the upper lip's skin
BAND = (150, 205, 522, 300)
MAX_DRIFT = 1.6


def source(name):
    if name in TAKES:
        return os.path.join(ROOT, 'gen', 'front', TAKES[name] + '.png')
    return os.path.join(ROOT, 'in', 'front', name + '.png')


def main():
    ref = load(os.path.join(ROOT, 'in', 'front', 'rest.png'))
    still = np.zeros((H, W), bool)
    still[STILL[1]:STILL[3], STILL[0]:STILL[2]] = True
    names = sys.argv[1:] or ORIGINALS + list(TAKES)
    os.makedirs(os.path.join(ROOT, 'front'), exist_ok=True)
    tiles = []
    for name in names:
        src = load(source(name))
        A = align(src, ref, still, src.shape[1] / W) if name != 'rest' else np.array([[1.0, 0, 0], [0, 1.0, 0]])
        d = drift(src, ref, A, PLACES) if name != 'rest' else {}
        # (the wings of the nose move with the upper lip: they are shown but not held against an edit; above the
        # mouth the picture is the face at rest's anyway)
        # (and the cheeks and the tip of the nose move a little with a smile or rounded lips: they are held to a
        # looser measure than the eyes)
        worst = max([np.hypot(*v) * (1 if 'eye' in k else 0.4) for k, v in d.items() if 'nostril' not in k] or [0])
        s = np.sqrt(abs(np.linalg.det(A[:, :2])))
        print(f"{name:8s} scale {s:.4f} shift ({A[0, 2]:7.2f}, {A[1, 2]:7.2f})  drift " + ' '.join(f"{k.split()[0][0]}{k.split()[-1][0]}({v[0]:+.1f},{v[1]:+.1f})" for k, v in d.items()) + f"  worst {worst:.2f}{'  REJECT' if worst > MAX_DRIFT else ''}")
        if name != 'rest':
            # the lower face is put where it meets the face at rest: by the base of the nose and the cheeks beside
            # the mouth (an edit that turned the head a hair moved the mouth with it)
            band = np.zeros((H, W), bool)
            band[BAND[1]:BAND[3], BAND[0]:BAND[2]] = True
            B = refine(prepare(gray(src), gray(ref)), band, A.copy(), iters=25)
            c = np.array([(BAND[0] + BAND[2]) / 2, (BAND[1] + BAND[3]) / 2, 1.0])
            dx, dy = np.linalg.solve(A[:, :2], (B @ c) - (A @ c))
            print(f"         lower face moved ({dx:+.2f}, {dy:+.2f}) px")
            A = A.copy()
            A[:, 2] += A[:, :2] @ np.array([dx, dy])
        img, ok = warp(src, A, (H, W))
        img[~ok] = ref[~ok]
        img = colour_match(img, ref, still & ok)
        # the face at rest above the mouth
        ys = np.arange(H)[:, None]
        k = np.clip((ys - SEAM[0]) / (SEAM[1] - SEAM[0]), 0, 1)
        k = k * k * (3 - 2 * k)
        out = ref * (1 - k[..., None]) + img * k[..., None]
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(ROOT, 'front', name + '.png'))
        t = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).crop((96, 150, 576, 640)).resize((240, 245))
        dr = ImageDraw.Draw(t)
        dr.text((4, 4), f"{name} {worst:.1f}px", fill=(255, 255, 0) if worst <= MAX_DRIFT else (255, 60, 60))
        tiles.append(t)
    cols = 6
    sheet = Image.new('RGB', (240 * cols, 245 * ((len(tiles) + cols - 1) // cols)))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 240, (i // cols) * 245))
    sheet.save(os.path.join(ROOT, 'look', 'front-prep.jpg'))


main()
