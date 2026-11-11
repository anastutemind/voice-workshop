"""
Replaces the recordings whose sounds the aligner cannot find reliably.

    python3 scripts/tutor-voice-retake.py INSPECT_DIR... [--max-ms 60] [--variants 4]

The AI voice never says a word twice alike, and some takes do not suit the
aligner (a voice that says the bh of "bhasha" as a plain breathy b joined to
the vowel leaves no closure to find). For every recording in the inspect
folders of tutor-voice.ts that the aligner doubted (the closing or release of
a sound found more than --max-ms away when what was made is listened to again),
other takes of the same text are made (TAKE_VARIANT=k, a different setting of
the voice), the recording made from each, and the one whose closures and
releases are found most consistently is kept: it is made last, so that it is
the one written to public/audio/tutor.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda n, d: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
max_ms = float(opt('--max-ms', 60)) / 1000
variants = int(opt('--variants', 4))
first = int(opt('--from', 1))
# --texts a,b,c: only those texts; --from k: start at variant k (the ones before were tried already; their best is kept as the base to beat)
only_texts = set(opt('--texts', '').split(',')) - {''}
# --prev-log file: the log of an earlier pass: the variant it kept and how well it did are the ones to beat
prev = {}
if '--prev-log' in sys.argv:
    import re
    for line in open(opt('--prev-log', '')):
        m = re.match(r'^(\w+) (.+?): (\d+) ms -> (\d+) ms \(variant (\d+)\)$', line.strip())
        if m: prev[(m.group(1), m.group(2))] = (int(m.group(5)), int(m.group(4)) / 1000)
args = [a for a in args if a not in (opt('--max-ms', ''), opt('--variants', ''), opt('--from', ''), opt('--texts', ''), opt('--prev-log', ''))]

todo = {}
for d in args:
    course = os.path.basename(d.rstrip('/'))
    for jf in glob.glob(os.path.join(d, '*.json')):
        i = json.load(open(jf))
        if i.get('worstSharp', 0) > max_ms and (not only_texts or i['text'] in only_texts):
            todo[(course, i['key'])] = (i['text'], i['worstSharp'])

print(len(todo), 'recordings to try again', flush=True)
tmp = tempfile.mkdtemp(prefix='retake-')
summary = []
for (course, key), (text, base) in sorted(todo.items()):
    scores = {0: base}
    if (course, text) in prev:
        scores = {prev[(course, text)][0]: prev[(course, text)][1]}
    for k in range(first, variants):
        out = os.path.join(tmp, f'{abs(hash((course, key, k)))}')
        env = dict(os.environ, TAKE_VARIANT=str(k))
        # (the text of the key names the recording: it is matched against the keys of the course)
        r = subprocess.run(['npx', 'tsx', 'scripts/tutor-voice.ts', text, '--course', course, '--inspect', out], env=env, capture_output=True, text=True)
        js = [json.load(open(f)) for f in glob.glob(os.path.join(out, '*.json'))]
        js = [j for j in js if j['key'] == key]
        scores[k] = js[0].get('worstSharp', 9) if js else 9
        print(f'  {course} {text}: variant {k}: closures/releases found {1000 * scores[k]:.0f} ms away', flush=True)
        if scores[k] <= 0.03:
            break
    best = min(scores, key=lambda k: scores[k])
    # the best is made last: it is what stays in public/audio/tutor
    env = dict(os.environ, TAKE_VARIANT=str(best))
    subprocess.run(['npx', 'tsx', 'scripts/tutor-voice.ts', text, '--course', course], env=env, capture_output=True, text=True)
    summary.append((course, text, base, scores[best], best))
    print(f'{course} {text}: {1000 * base:.0f} ms -> {1000 * scores[best]:.0f} ms (variant {best})', flush=True)

fixed = [s for s in summary if s[3] <= max_ms]
print(f'\n{len(fixed)} of {len(summary)} now within {1000 * max_ms:.0f} ms')
for s in summary:
    if s[3] > max_ms:
        print(f'  still doubted: {s[0]} {s[1]} ({1000 * s[3]:.0f} ms)')
