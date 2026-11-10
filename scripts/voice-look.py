"""
Pictures of the tutor's recordings with where their sounds were found, to
check the lip sync by eye.

    npx tsx scripts/tutor-voice.ts --inspect /tmp/voice [--dry]
    python3 scripts/voice-look.py /tmp/voice out.png [words to match | ?? | flags | all] [--made] [--lang ur] [--px 600] [--from N --count M]

For each recording: its spectrogram as the voice said it (time across, pitch
up to 8 kHz upward, dark = loud), a line at every place the aligner cut it,
and between the lines the kind of sound it took the stretch for (a stop's
hold, its burst, an open vowel, a hiss, a nasal...). A cut is right when it
lies where the picture changes: a hold is a blank column (with a dark foot
if the stop is voiced), a burst a thin dark line up the whole height, a hiss
dark at the top, a nasal dark only at the foot, a vowel dark bands. Where a
sound was cut out of a word, the rest of the word is greyed. A cut checked
by hand is drawn in green.

--made: under it, the recording as it was made (stretched to the tutor's
timing), with the times written for the player (blue): the same changes must
lie on the same lines.
"""
import json
import os
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# a font with the phonetic symbols and the scripts of the courses, where the system has one
FONT = None
for f in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/Library/Fonts/Arial Unicode.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
    if os.path.exists(f):
        FONT = ImageFont.truetype(f, 11)
        break


def spectrogram(x, fs, top=8000.0, hop=0.004, win=0.02, height=110):
    n, h = int(win * fs), int(hop * fs)
    w = np.hanning(n)
    frames = [x[i:i + n] * w for i in range(0, max(1, len(x) - n), h)]
    s = np.abs(np.fft.rfft(np.array(frames), n=512, axis=1))
    s = s[:, :int(512 * top / fs)]
    db = 20 * np.log10(s + 1e-6)
    db = np.clip((db - db.max() + 70) / 70, 0, 1)   # the loudest 70 dB
    img = Image.fromarray((255 - 255 * db.T[::-1]).astype(np.uint8))
    return img.resize((len(frames), height), Image.BILINEAR)


def read(path):
    w = wave.open(path)
    fs = w.getframerate()
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768, fs


def strip(x, fs, px, height):
    img = spectrogram(x, fs, height=height)
    return img.resize((max(1, int(len(x) / fs * px)), height), Image.BILINEAR).convert('RGB')


def picture(folder, name, px, made):
    info = json.load(open(os.path.join(folder, name + '.json')))
    x, fs = read(os.path.join(folder, name + '.wav'))
    top = strip(x, fs, px, 110)
    rows = [top]
    if made and os.path.exists(os.path.join(folder, name + '.made.wav')):
        y, fy = read(os.path.join(folder, name + '.made.wav'))
        rows.append(strip(y, fy, px, 80))
    width = max(r.size[0] for r in rows) + 4
    height = 14 + sum(r.size[1] + 12 for r in rows) + 4
    out = Image.new('RGB', (width, height), (255, 255, 255))
    d = ImageDraw.Draw(out)
    flag = ('  ?? ' + '; '.join(info.get('flags', []))) if info['strange'] else ('  (looked at: ' + '; '.join(info.get('flags', [])) + ')' if info.get('flags') else '')
    d.text((2, 0), f"{name[:4]} {info['lang']} {info['text']} /{info['ipa']}/" + (f" from /{info['from']}/" if info.get('from') else '') + flag, fill=(170, 0, 0) if info['strange'] else (0, 0, 0), font=FONT)
    y0 = 14
    # the raw take, with its cuts
    out.paste(top, (0, y0))
    cuts, kinds = info['cuts'], info['kinds']
    k0, k1 = info.get('keep', [0, len(kinds)])
    shade = Image.new('RGB', (1, 1), (255, 255, 255))
    for (a, b) in ((0, cuts[k0]), (cuts[k1], len(x) / fs)):
        if b - a > 0.001 and (a > 0 or k0 > 0) and not (a == 0 and k0 == 0):
            box = (int(a * px), y0, min(top.size[0], int(b * px)), y0 + top.size[1])
            if box[2] - box[0] < 1:
                continue
            region = out.crop(box)
            out.paste(Image.blend(region, shade.resize(region.size), 0.6), box)
    colour = (0, 150, 0) if info.get('byHand') else (220, 0, 0)
    for i, t in enumerate(cuts):
        p = t * px
        d.line([(p, y0), (p, y0 + top.size[1] + 10)], fill=colour, width=1)
        if i < len(kinds):
            mid = 0.5 * (t + cuts[i + 1]) * px
            d.text((max(p + 1, mid - 10), y0 + top.size[1] - 1), kinds[i][:5], fill=(0, 0, 200), font=FONT)
    y0 += top.size[1] + 12
    if len(rows) > 1:
        out.paste(rows[1], (0, y0))
        for t in info['marks']:
            p = (t + info['onset']) * px
            d.line([(p, y0), (p, y0 + rows[1].size[1])], fill=(0, 90, 255), width=1)
    # a tick every tenth of a second along the foot
    for k in range(int(width / px * 10) + 1):
        d.line([(k * px / 10, height - 4), (k * px / 10, height)], fill=(0, 0, 0))
    return out


def main():
    argv = sys.argv[1:]
    made = '--made' in argv
    px = 600
    start, count, lang = 0, None, None
    if '--lang' in argv:
        lang = argv[argv.index('--lang') + 1]
    if '--px' in argv:
        px = int(argv[argv.index('--px') + 1])
    if '--from' in argv:
        start = int(argv[argv.index('--from') + 1])
    if '--count' in argv:
        count = int(argv[argv.index('--count') + 1])
    skip = set()
    for flag in ('--px', '--from', '--count', '--lang'):
        if flag in argv:
            skip.add(argv.index(flag) + 1)
    plain = [a for i, a in enumerate(argv) if not a.startswith('--') and i not in skip]
    folder, target, want = plain[0], plain[1], plain[2:]
    names = sorted(f[:-5] for f in os.listdir(folder) if f.endswith('.json'))
    infos = {n: json.load(open(os.path.join(folder, n + '.json'))) for n in names}
    # in the order the courses list them
    names.sort(key=lambda n: (infos[n]['lang'], infos[n]['text']))
    chosen = []
    for n in names:
        info = infos[n]
        if lang and info['lang'] != lang:
            continue
        if not want or 'all' in want or n in want or any(q == info['text'] or q == info['ipa'] for q in want) or ('??' in want and info['strange']) or ('flags' in want and info.get('flags')):
            chosen.append(n)
    chosen = chosen[start:start + count if count else None]
    tiles = [picture(folder, n, px, made) for n in chosen]
    if not tiles:
        print('nothing matches')
        return
    # two columns, the narrow tiles side by side
    colw = max(t.size[0] for t in tiles)
    cols = 2 if colw < 900 else 1
    rowsh = []
    for i in range(0, len(tiles), cols):
        rowsh.append(max(t.size[1] for t in tiles[i:i + cols]) + 6)
    sheet = Image.new('RGB', (cols * (colw + 10), sum(rowsh)), (255, 255, 255))
    y = 0
    for r, i in enumerate(range(0, len(tiles), cols)):
        for c, t in enumerate(tiles[i:i + cols]):
            sheet.paste(t, (c * (colw + 10), y))
        y += rowsh[r]
    sheet.save(target)
    print(len(tiles), 'recordings,', sheet.size, 'of', len(names))


main()
