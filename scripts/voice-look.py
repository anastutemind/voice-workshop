"""
Pictures of the tutor's recordings with where their sounds were found, to
check the lip sync by eye.

    npx tsx scripts/tutor-voice.ts --inspect /tmp/voice
    python3 scripts/voice-look.py /tmp/voice out.png [numbers or words to match...]

For each recording: its spectrogram as the voice said it (time across, pitch
up to 8 kHz upward, dark = loud), a line at every place the aligner cut it,
and between the lines the kind of sound it took the stretch for (a stop's
hold, its burst, an open vowel, a hiss, a nasal...). A cut is right when it
lies where the picture changes: a hold is a blank column (with a dark foot
if the stop is voiced), a burst a thin dark line up the whole height, a hiss
dark at the top, a nasal dark only at the foot, a vowel dark bands.
"""
import json
import os
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw


def spectrogram(x, fs, top=8000.0, hop=0.004, win=0.02, height=160):
    n, h = int(win * fs), int(hop * fs)
    w = np.hanning(n)
    frames = [x[i:i + n] * w for i in range(0, max(1, len(x) - n), h)]
    s = np.abs(np.fft.rfft(np.array(frames), n=512, axis=1))
    s = s[:, :int(512 * top / fs)]
    db = 20 * np.log10(s + 1e-6)
    db = np.clip((db - db.max() + 70) / 70, 0, 1)   # the loudest 70 dB
    img = Image.fromarray((255 - 255 * db.T[::-1]).astype(np.uint8))
    return img.resize((len(frames), height), Image.BILINEAR), hop


def picture(folder, name, px_per_s=900):
    info = json.load(open(os.path.join(folder, name + '.json')))
    w = wave.open(os.path.join(folder, name + '.wav'))
    fs = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    img, hop = spectrogram(x, fs)
    width = int(len(x) / fs * px_per_s)
    img = img.resize((width, img.size[1]), Image.BILINEAR).convert('RGB')
    out = Image.new('RGB', (width, img.size[1] + 46), (255, 255, 255))
    out.paste(img, (0, 30))
    d = ImageDraw.Draw(out)
    d.text((4, 2), f"{name} {info['lang']} {info['text']} /{info['ipa']}/" + ('  ??' if info['strange'] else ''), fill=(0, 0, 0))
    cuts = info['cuts']
    for i, t in enumerate(cuts):
        px = t * px_per_s
        d.line([(px, 16), (px, out.size[1] - 14)], fill=(220, 0, 0), width=1)
        if i < len(info['kinds']):
            mid = 0.5 * (t + cuts[i + 1]) * px_per_s
            d.text((max(px + 2, mid - 12), 17), info['kinds'][i], fill=(0, 0, 200))
    for k in range(int(len(x) / fs * 10) + 1):   # a tick every tenth of a second
        d.line([(k * px_per_s / 10, out.size[1] - 12), (k * px_per_s / 10, out.size[1] - 6)], fill=(0, 0, 0))
        if k % 5 == 0:
            d.text((k * px_per_s / 10 + 2, out.size[1] - 12), f'{k / 10:.1f}', fill=(0, 0, 0))
    return out


def main():
    folder, target, want = sys.argv[1], sys.argv[2], sys.argv[3:]
    names = sorted(f[:-5] for f in os.listdir(folder) if f.endswith('.json'))
    chosen = []
    for n in names:
        info = json.load(open(os.path.join(folder, n + '.json')))
        if not want or n in want or any(q in info['text'] or q == info['ipa'] for q in want) or ('??' in want and info['strange']):
            chosen.append(n)
    tiles = [picture(folder, n) for n in chosen]
    if not tiles:
        print('nothing matches')
        return
    sheet = Image.new('RGB', (max(t.size[0] for t in tiles), sum(t.size[1] + 6 for t in tiles)), (255, 255, 255))
    y = 0
    for t in tiles:
        sheet.paste(t, (0, y))
        y += t.size[1] + 6
    sheet.save(target)
    print(len(tiles), 'recordings,', sheet.size)


main()
