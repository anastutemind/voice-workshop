"""
Replaces the recordings whose sounds the aligner cannot find reliably, many at once.

    python3 scripts/tutor-voice-retake-batch.py INSPECT_ROOT [--courses ur,hi,ar,ipa] [--max-ms 60] [--variants 8] [--work DIR]

INSPECT_ROOT holds one folder per course, made by `tutor-voice.ts --course C --inspect INSPECT_ROOT/C`. The AI voice
never says a word twice alike, and some takes do not suit the aligner (see tutor-voice-retake.py, which does the same
one word at a time: slowly). Here every course is made again with each other setting of the voice (TAKE_VARIANT=k) as
a whole, the courses side by side; what the voice says for the words that were doubted is scored in each (the closing
and release of its sounds found within --max-ms of where they were put, as tutor-voice.ts checks them), the recordings
as they were are put back, and each doubted word is made last with the take that scored best.
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda n, d: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
root = args[0]
courses = opt('--courses', 'ur,hi,ar,ipa').split(',')
max_ms = float(opt('--max-ms', 60)) / 1000
variants = int(opt('--variants', 8))
work = opt('--work', tempfile.mkdtemp(prefix='retake-batch-'))
OUT = 'public/audio/tutor'


def score(info):
    w = info.get('worstSharp')
    return 9.0 if w is None else float(w)


# what was doubted
todo = {}
for c in courses:
    for jf in glob.glob(os.path.join(root, c, '*.json')):
        i = json.load(open(jf))
        if score(i) > max_ms:
            todo[(c, i['key'])] = {'text': i['text'], 'scores': {0: score(i)}}
print(len(todo), 'doubted recordings:', {c: sum(1 for k in todo if k[0] == c) for c in courses}, flush=True)
if not todo:
    sys.exit(0)

# the recordings as they are now
backup = os.path.join(work, 'backup')
shutil.copytree(OUT, backup, dirs_exist_ok=True)

try:
    for k in range(1, variants):
        procs = []
        for c in courses:
            if not any(t[0] == c for t in todo):
                continue
            out = os.path.join(work, f'v{k}', c)
            env = dict(os.environ, TAKE_VARIANT=str(k))
            log = open(os.path.join(work, f'v{k}-{c}.log'), 'w')
            procs.append((c, subprocess.Popen(['npx', 'tsx', 'scripts/tutor-voice.ts', '--course', c, '--inspect', out], env=env, stdout=log, stderr=subprocess.STDOUT)))
        for c, p in procs:
            p.wait()
            seen = {}
            for jf in glob.glob(os.path.join(work, f'v{k}', c, '*.json')):
                i = json.load(open(jf))
                seen[i['key']] = score(i)
            for (cc, key), d in todo.items():
                if cc == c:
                    d['scores'][k] = seen.get(key, 9.0)
        better = sum(1 for d in todo.values() if min(d['scores'].values()) <= max_ms)
        print(f'variant {k} done: {better} of {len(todo)} now have a take within {1000 * max_ms:.0f} ms', flush=True)
        if better == len(todo):
            break
finally:
    # the recordings as they were
    shutil.rmtree(OUT)
    shutil.copytree(backup, OUT)

# each doubted word, made last with its best take (the full key picks it alone)
fixed = 0
for (c, key), d in sorted(todo.items()):
    best = min(d['scores'], key=lambda k: (d['scores'][k], k))
    if best != 0:
        env = dict(os.environ, TAKE_VARIANT=str(best))
        subprocess.run(['npx', 'tsx', 'scripts/tutor-voice.ts', key, '--course', c], env=env, capture_output=True, text=True)
    ok = d['scores'][best] <= max_ms
    fixed += ok
    print(f'{c} {d["text"]}: {1000 * d["scores"][0]:.0f} ms -> {1000 * d["scores"][best]:.0f} ms (variant {best}){"" if ok else "  still doubted"}', flush=True)
print(f'{fixed} of {len(todo)} within {1000 * max_ms:.0f} ms')
