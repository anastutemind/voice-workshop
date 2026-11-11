"""
Replaces recordings whose p or b is released like a t.

    python3 scripts/tutor-voice-burst.py INSPECT_DIR... [--limit 1500] [--variants 12] [--texts a,b] [--dry]

A bilabial stop lets go with a weak, dull burst: its energy lies low (the lips
make a small front cavity). The AI voice sometimes lets a p go with a hiss that
lies as high as a t's, and the ear then hears "shipt" for "ship". For every
recording in the inspect folders of tutor-voice.ts that begins or ends in a
p or b, the brightness of its release (the centre of gravity of the spectrum
over the 70 ms from the burst, above 250 Hz) is measured in the recording as
it was made. Where it is above --limit Hz, other takes of the same text are
made (TAKE_VARIANT=k), the dullest release is kept (a take whose closures and
releases are found more than 60 ms off is not kept), and made last so that it
is the one written to public/audio/tutor.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda n, d: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
limit = float(opt('--limit', 1500))
variants = int(opt('--variants', 12))
only = set(opt('--texts', '').split(',')) - {''}
dry = '--dry' in sys.argv
args = [a for a in args if a not in (opt('--limit', ''), opt('--variants', ''), opt('--texts', ''))]
BILABIAL = {'p', 'b', 'pʰ', 'bʱ', 'pʱ', 'bʰ'}


def read(path):
    w = wave.open(path)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768, w.getframerate()


def bright(info, folder, name):
    """Brightness of the release of the word's first or last stop, if it is a p or b (else None)."""
    kinds, keep = info['kinds'], info['keep']
    if info.get('from') or not kinds:
        return None
    ph = [p[0].replace('ː', '') for p in info['phones'] if p[0] != '_']
    if not ph:
        return None
    s = None
    if ph[-1] in BILABIAL and kinds[keep[1] - 1] in ('burst', 'puff'):
        s = keep[1] - 1
    elif ph[0] in BILABIAL and 'burst' in kinds[keep[0]:keep[1]]:
        s = keep[0] + kinds[keep[0]:keep[1]].index('burst')
    if s is None:
        return None
    x, fs = read(os.path.join(folder, name + '.made.wav'))
    a = int(info['made'][s] * fs)
    seg = x[a:a + int(0.07 * fs)]
    if len(seg) < 64:
        return None
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    f = np.fft.rfftfreq(len(seg), 1 / fs)
    m = f > 250
    return float((S[m] * f[m]).sum() / S[m].sum())


todo = {}
for d in args:
    course = os.path.basename(d.rstrip('/'))
    for jf in glob.glob(os.path.join(d, '*.json')):
        info = json.load(open(jf))
        if only and info['text'] not in only:
            continue
        b = bright(info, d, os.path.basename(jf)[:-5])
        if b is not None and b > limit:
            todo[(course, info['key'])] = (info['text'], b, info.get('worstSharp', 0))

print(len(todo), 'recordings with a bright p/b release', flush=True)
for (course, key), (text, b, w) in sorted(todo.items()):
    print(f'  {course} {text}: {b:.0f} Hz')
if dry:
    sys.exit(0)

tmp = tempfile.mkdtemp(prefix='burst-')
for (course, key), (text, base, w0) in sorted(todo.items()):
    best, score = 0, base if w0 <= 0.06 else 1e9
    for k in range(1, variants):
        out = os.path.join(tmp, f'{abs(hash((course, key, k)))}')
        env = dict(os.environ, TAKE_VARIANT=str(k))
        subprocess.run(['npx', 'tsx', 'scripts/tutor-voice.ts', text, '--course', course, '--inspect', out], env=env, capture_output=True, text=True)
        got = None
        for jf in glob.glob(os.path.join(out, '*.json')):
            info = json.load(open(jf))
            if info['key'] == key:
                b = bright(info, out, os.path.basename(jf)[:-5])
                got = (b, info.get('worstSharp', 9))
        if got is None or got[0] is None:
            print(f'  {course} {text}: variant {k}: no take', flush=True)
            continue
        ok = got[1] <= 0.06
        print(f'  {course} {text}: variant {k}: release {got[0]:.0f} Hz, closures {1000 * got[1]:.0f} ms away{"" if ok else " (not kept)"}', flush=True)
        if ok and got[0] < score:
            best, score = k, got[0]
    env = dict(os.environ, TAKE_VARIANT=str(best))
    subprocess.run(['npx', 'tsx', 'scripts/tutor-voice.ts', text, '--course', course], env=env, capture_output=True, text=True)
    print(f'{course} {text}: {base:.0f} Hz -> {score:.0f} Hz (variant {best})', flush=True)
