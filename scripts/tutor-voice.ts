/**
 * Records the tutor's voice: every letter and every word of the Urdu, Hindi
 * and Arabic courses, said by the system's voices (macOS `say`: Lekha for
 * Hindi and Urdu, Majed for Arabic), into public/audio/tutor.
 *
 *   npx tsx scripts/tutor-voice.ts [text or ipa to match] [--course ur|hi|ar|ipa] [--keep] [--inspect folder]
 *
 * The system's voices say a single word very fast, and its long vowels as
 * short as its short ones (آم comes out as "am"). So each recording is
 * given the timing of a careful teacher: the sounds of the word are found in
 * it (align.ts), and each is stretched or shortened, without changing its
 * pitch, to the length the model gives that sound, a little slower than
 * speech. A long vowel is long, a final m is short. Where each sound then
 * starts and stops is known exactly, and written beside the file's name in
 * manifest.json: the mouth of the tutor follows those times.
 *
 * The files are made from Apple's system voices: check their licence before
 * publishing them.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import type { Lang } from '../src/dsp/speech/g2p';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { trajectory } from '../src/ui/tutor/motion';
import { fitTo, HOP, listen, onset } from '../src/ui/tutor/align';
import { ALPHABETS } from '../src/ui/tutor/letters';
import { speechText } from '../src/ui/tutor/speech';
import { IPA_SECTIONS } from '../src/ui/tutor/ipa';
import { RECORDED_VOICE } from '../src/ui/tutor/clips';

const FS = 22050;
/** how much slower than the model's own speech the teacher says a word */
const SLOW = 1.25;
const OUT = new URL('../public/audio/tutor/', import.meta.url).pathname;
const args = process.argv.slice(2);
/** --inspect <folder>: also writes each raw recording there, with where its sounds were found */
const inspect = args.includes('--inspect') ? args[args.indexOf('--inspect') + 1] : null;
/** --course ur|hi|ar|ipa: only that course's recordings */
const course = args.includes('--course') ? args[args.indexOf('--course') + 1] : null;
const only = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--inspect' && args[i - 1] !== '--course');
const done = new Set<string>();
if (inspect) mkdirSync(inspect, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'tutor-voice-'));

/** The samples of a WAV file of 32-bit floats. */
function readWav(path: string): Float32Array {
  const b = readFileSync(path);
  let at = 12;
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4), len = b.readUInt32LE(at + 4);
    if (id === 'data') {
      const n = Math.min(len, b.length - at - 8) >> 2;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readFloatLE(at + 8 + 4 * i);
      return out;
    }
    at += 8 + len + (len & 1);
  }
  return new Float32Array(0);
}

function writeWav(path: string, x: Float32Array): void {
  const b = Buffer.alloc(44 + 2 * x.length);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * x.length, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(FS, 24); b.writeUInt32LE(2 * FS, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(2 * x.length, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + 2 * i);
  writeFileSync(path, b);
}

/**
 * The recording with its time bent: `knots` pairs times of the output with
 * times of the input (samples, both rising). Short windows of the input are
 * laid one over the other at the output's own pace, each taken from where
 * the knots say, moved by at most half a pitch period to where it carries
 * on the wave of the one before it (WSOLA): longer or shorter, at the same
 * pitch.
 */
function bend(x: Float32Array, knots: [number, number][], length: number): Float32Array {
  const hop = Math.round(FS * 0.005), W = 4 * hop, reach = Math.round(FS * 0.006);
  const win = new Float32Array(W);
  for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / W);
  const y = new Float32Array(length + W), norm = new Float32Array(length + W);
  const at = (o: number): number => {
    let k = 0;
    while (k < knots.length - 2 && o >= knots[k + 1][0]) k++;
    const [o0, i0] = knots[k], [o1, i1] = knots[k + 1];
    return i0 + (o1 > o0 ? Math.max(0, Math.min(1, (o - o0) / (o1 - o0))) : 1) * (i1 - i0);
  };
  const get = (i: number) => (i >= 0 && i < x.length ? x[i] : 0);
  let last = -1; // where the window before this one was taken
  for (let o = 0; o < length; o += hop) {
    const ideal = Math.round(at(o)) - (W >> 1);
    let pos = ideal;
    if (last >= 0) {
      // the natural next window is the one a hop after the last: the nearest thing to it around the ideal place
      const follow = last + hop;
      if (Math.abs(follow - ideal) <= 1) pos = follow;
      else {
        let best = -Infinity;
        for (let d = -reach; d <= reach; d++) {
          let c = 0, e = 1e-9;
          for (let i = 0; i < W; i += 2) { const a = get(follow + i), b = get(ideal + d + i); c += a * b; e += b * b; }
          const v = c / Math.sqrt(e);
          if (v > best) { best = v; pos = ideal + d; }
        }
      }
    }
    for (let i = 0; i < W; i++) { y[o + i] += get(pos + i) * win[i]; norm[o + i] += win[i]; }
    last = pos;
  }
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = norm[i + (W >> 1)] > 1e-3 ? y[i + (W >> 1)] / norm[i + (W >> 1)] : 0;
  return out;
}

const isVowel = (s: string) => PHONEMES[s]?.manner === 'vowel';
const manifest: Record<string, { f: string; k: number[] }> = {};
if ((only || course) && existsSync(OUT + 'manifest.json')) {
  // one item or one course made again: the others are kept (an old manifest names files only: those are made again in full)
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(OUT + 'manifest.json', 'utf8')) as Record<string, { f: string; k: number[] } | string>)) if (typeof v !== 'string') manifest[k] = v;
}
mkdirSync(OUT, { recursive: true });
let made = 0;
const odd: string[] = [];

/** Records one thing the teacher says: `text` read by `voice` at `rate`, whose sounds are `ipa` (compact form). */
function record(lang: string, voice: string, rate: number, text: string, ipa: string): void {
  const key = `${voice}|${rate}|${text}`;
  if (only && !key.includes(only) && ipa !== only) return;
  if (done.has(key)) return; // the same text for two letters: said once
  done.add(key);
  const ps = compactPhones(ipa);
  if (!ps.length) return;
  const vi = ps.findIndex((p) => isVowel(p.ipa));
  if (vi >= 0 && !ps.some((p) => p.stress)) ps[vi].stress = true;
  ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  // (English of any country is timed as English)
  const score = buildScore(ps, { lang: (lang.startsWith('en') ? 'en' : lang) as Lang, f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  const tr = trajectory(score);

  // ---- the voice says it
  const raw = join(tmp, 'raw.wav');
  execFileSync('say', ['-v', voice, '-o', raw, `--data-format=LEF32@${FS}`, text]);
  const x = readWav(raw);
  if (x.length < FS * 0.05) { console.log('!! nothing said for', key); return; }

  // ---- where its sounds are, and where they should be
  const fit = fitTo(listen(x, FS), score.phones, tr);
  const a = fit.knots.audio, m = fit.knots.model, kinds = fit.knots.kinds;
  const S = a.length - 1;
  const lead = 0.03;
  const outT = [lead];
  for (let s = 0; s < S; s++) {
    const have = a[s + 1] - a[s];
    let want = (m[s + 1] - m[s]) * SLOW;
    const kind = kinds[s];
    // (a burst is not stretched: it is over in an instant; hisses and puffs a little; what is held or sung, freely)
    const [lo, hi] = kind === 'burst' ? [0.9, 1.25] : kind === 'puff' ? [0.7, 1.6] : kind === 'hiss' || kind === 'breath' || kind === 'buzz' ? [0.6, 2.2] : kind === 'hold' || kind === 'silence' ? [0.5, 3] : [0.5, 3.2];
    if (have > 0) want = Math.max(lo * have, Math.min(hi * have, want));
    else if (kind !== 'hold' && kind !== 'silence') want = 0;
    outT.push(outT[s] + want);
  }
  const end = outT[S];
  // the rest of the recording after its last sound (its dying away), as it is
  const tailIn = Math.min(x.length / FS - a[S], 0.12);
  const length = Math.round((end + tailIn + 0.04) * FS);
  const knots: [number, number][] = [[0, (a[0] - lead) * FS]];
  for (let s = 0; s <= S; s++) knots.push([outT[s] * FS, a[s] * FS]);
  knots.push([(end + tailIn + 0.04) * FS, (a[S] + tailIn + 0.04) * FS]);
  const y = bend(x, knots, length);
  // silence where a stop holds that the voice did not hold (nothing of the recording belongs there)
  for (let s = 0; s < S; s++) {
    if (a[s + 1] - a[s] > 0 || outT[s + 1] <= outT[s]) continue;
    const i0 = Math.round(outT[s] * FS), i1 = Math.round(outT[s + 1] * FS), ramp = Math.round(0.004 * FS);
    for (let i = Math.max(0, i0 - ramp); i < Math.min(length, i1); i++) y[i] *= i < i0 ? (i0 - i) / ramp : i > i1 - ramp ? 1 - (i1 - i) / ramp : 0;
  }
  // as loud as the others, and no click at its two ends
  let peak = 1e-6;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(y[i]));
  const edge = Math.round(0.004 * FS);
  for (let i = 0; i < length; i++) y[i] *= (0.89 / peak) * Math.min(1, i / edge, (length - 1 - i) / edge);

  // ---- the times of its sounds, from the first moment something is heard (found again the same way when it is played)
  const heard = listen(y, FS);
  const t0 = onset(heard);
  const marks = outT.map((t) => Math.round((t - t0) * 1000) / 1000);
  // (a check: the sounds found again in what was made should be where they were put)
  const again = fitTo(heard, score.phones, tr).knots.audio;
  const worst = Math.max(...again.map((t, i) => (i === 0 || i === S ? 0 : Math.abs(t - outT[i]))));
  const factors = a.slice(1).map((v, i) => (v - a[i] > 0 ? (outT[i + 1] - outT[i]) / (v - a[i]) : 0));
  // (a voice that reads a letter by its name, or as a phrase, takes far longer than the letter's sounds do)
  const other = x.length / FS > 0.34 * score.phones.filter((q) => PHONEMES[q.ipa] && q.ipa !== '_').length + 0.25;
  const strange = other || worst > 0.06 || factors.some((f, i) => f > 0 && (f < 0.5 || f > 3.3) && kinds[i] !== 'hold');

  const file = createHash('sha1').update(key).digest('hex').slice(0, 12) + '.m4a';
  const wav = join(tmp, 'out.wav');
  writeWav(wav, y);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '72k', '-ar', String(FS), '-ac', '1', OUT + file]);
  manifest[key] = { f: file, k: marks };
  made++;
  if (inspect) {
    // the recording as the voice said it, with where its sounds were found: to look at (scripts/voice-look.py)
    const n = String(made).padStart(3, '0');
    writeWav(join(inspect, `${n}.wav`), x);
    writeFileSync(join(inspect, `${n}.json`), JSON.stringify({ lang, text, ipa, strange, cuts: a, kinds, made: outT, phones: score.phones.map((q) => [q.ipa, q.t0, q.t1]) }));
  }
  const line = `${other ? '!!' : strange ? '??' : '  '} ${lang} ${text} /${ipa}/ ${(x.length / FS).toFixed(2)}s → ${(length / FS).toFixed(2)}s | ${kinds.map((k, i) => `${k} ${(a[i + 1] - a[i]).toFixed(2)}→${(outT[i + 1] - outT[i]).toFixed(2)}`).join(', ')} | check ${worst.toFixed(3)}`;
  if (strange) odd.push(line);
  console.log(line);
}

if (!course || course !== 'ipa') {
  for (const lang of ['ur', 'hi', 'ar'] as const) {
    if (course && course !== lang) continue;
    const A = ALPHABETS[lang];
    const via = lang === 'ur' ? 'hi' : lang;
    for (const l of A.letters) {
      const say = l.say ?? (l.sound === 'ã' || isVowel(l.sound) ? l.sound : l.sound + A.vowel);
      for (const [what, rate, ipa] of [['sound', 0.75, say], ['word', 0.82, l.word.ipa]] as const) record(lang, RECORDED_VOICE[lang], rate, speechText(l, lang, via, what, say), ipa);
    }
  }
}

// ---- the course of sounds (the IPA): the letters that carry a sound alone, and the words that have it, in the
// languages recordings are made in. The same sound may be carried by one letter in several places: said once.
if (!course || course === 'ipa') {
  for (const section of IPA_SECTIONS) for (const snd of section.sounds) {
    const items: [number, string, string, string][] = [];
    if (snd.carrier && snd.say && RECORDED_VOICE[snd.carrier.lang]) items.push([0.75, snd.carrier.lang, snd.carrier.text, snd.say]);
    // (Urdu words of this course are in Arabic letters, which the Hindi voice that reads Urdu cannot read)
    for (const e of snd.examples) if (e.ipa && RECORDED_VOICE[e.lang] && e.lang !== 'ur') items.push([0.82, e.lang, e.text, e.ipa]);
    for (const [rate, lang, text, ipa] of items) record(lang, RECORDED_VOICE[lang], rate, text, ipa);
  }
}

// files no longer named are removed
if (!only && !process.argv.includes('--keep')) {
  const named = new Set(Object.values(manifest).map((v) => v.f));
  for (const f of readdirSync(OUT)) if (f.endsWith('.m4a') && !named.has(f)) rmSync(OUT + f);
}
writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest, null, 0).replace(/},"/g, '},\n"') + '\n');
rmSync(tmp, { recursive: true, force: true });
console.log(`${made} recordings made, ${odd.length} to listen to with care (HOP ${HOP}s)`);
for (const l of odd) console.log(l);
