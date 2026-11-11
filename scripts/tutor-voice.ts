/**
 * Records the tutor's voice: every letter and every word of the Urdu, Hindi,
 * Arabic and English courses, and the words of the course of sounds, said by
 * the system's voices (macOS `say`: Lekha for Hindi and Urdu, Majed for
 * Arabic, Samantha for English), into public/audio/tutor.
 *
 *   npx tsx scripts/tutor-voice.ts [text or ipa to match] [--course ur|hi|ar|en|ipa] [--keep] [--inspect folder] [--dry]
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
 * Some sounds a voice does not say alone (an English voice reads "i" as
 * "eye"): they are said in a word, and the recording keeps the sound alone,
 * cut out of the word where the aligner found it ("it" for the i of "igloo").
 *
 * Where the aligner is wrong for one recording, the right cuts, checked by
 * eye on its spectrogram (--inspect, then scripts/voice-look.py), are written
 * in scripts/tutor-voice-cuts.json, and used instead. A recording the
 * script's own check doubts is listed at the end, every time, unless it has
 * been looked at and found right: then the cuts that were looked at are
 * written there too, and if the voice or the aligner ever cuts it otherwise,
 * it is doubted again.
 *
 * --inspect writes, for each recording, the voice's raw take (.wav) with its
 * cuts, and the take as made (.made.wav) with the times written for it.
 * --dry writes nothing into public/audio/tutor. --prune records nothing: it only takes out of the
 * manifest, and deletes, the recordings that no course uses any more (after runs of single courses).
 *
 * The files are made from Apple's system voices: check their licence before
 * publishing them.
 */
import { execFileSync } from 'node:child_process';
import { fal } from './falClient';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import type { Lang } from '../src/dsp/speech/g2p';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import type { Score } from '../src/dsp/engine/params';
import { trajectory, Trajectory } from '../src/ui/tutor/motion';
import { fitTo, Frames, HOP, listen, planOf, RISE, rise } from '../src/ui/tutor/align';
import { ALPHABETS } from '../src/ui/tutor/letters';
import { speechText } from '../src/ui/tutor/speech';
import { IPA_SECTIONS } from '../src/ui/tutor/ipa';
import { RECORDED_VOICE } from '../src/ui/tutor/clips';

const FS = 22050;
/** the rate most computers' audio runs at: a recording is decoded at it to check its times as a browser will see them */
const PLAY_FS = 48000;
/** how much slower than the model's own speech the teacher says a word */
const SLOW = 1.25;
const OUT = new URL('../public/audio/tutor/', import.meta.url).pathname;
const CUTS = new URL('./tutor-voice-cuts.json', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
/** --inspect <folder>: also writes each raw recording there, with where its sounds were found */
const inspect = opt('--inspect');
/** --course ur|hi|ar|en|ipa: only that course's recordings */
const course = opt('--course');
const dry = args.includes('--dry');
/** --apple: the system's voices (macOS `say`) instead of the AI voice (the recordings of the app used to be made so) */
const apple = args.includes('--apple');
/** the AI voice: a model of fal.ai and its settings; the same text with the same settings is made once and kept in CACHE */
// (the checker of the service flags harmless words of the courses: the tomato, a letter's name; the texts are the app's own lists)
const TTS = { model: 'fal-ai/elevenlabs/tts/eleven-v3', stability: 0.6 };
/** TAKE_VARIANT=k: another take of the same texts (the voice never says a word twice alike: a take that does not suit the aligner is replaced by one that does, see tutor-voice-retake.py) */
const VARIANT = Number(process.env.TAKE_VARIANT ?? 0);
const STABILITY = [0.6, 0.45, 0.75, 0.9, 0.3, 0.55, 0.65, 0.8, 0.5, 0.7, 0.35, 0.85][VARIANT] ?? 0.6;
const CACHE = new URL('./.tts-cache/', import.meta.url).pathname;
/**
 * The voices of the app by the name the recordings carry (RECORDED_VOICE in clips.ts), as fal.ai's ElevenLabs is asked for them:
 * its own voices by name, the native speakers of the languages by the id of the voice in ElevenLabs' library
 * (Urdu: Naqsh, a middle-aged man of standard Urdu; Hindi: Niraj, a veteran Indian actor; Arabic: Hijazi, modern standard Arabic).
 */
const FAL_VOICE: Record<string, string> = { Naqsh: 'L1f58R08RFtEqY28c3BT', Niraj: 'zgqefOY5FPQ3bB7OZTVR', Hijazi: 'fkqevZRU7Xj52dY1CTkq' };
const falVoice = (label: string): string => FAL_VOICE[label.split(' ')[0]] ?? label.split(' ')[0];
/** the language code the voice is told to speak in */
const LANG_CODE: Record<string, string> = { ur: 'ur', hi: 'hi', ar: 'ar', en: 'en', 'en-GB': 'en' };
let collecting = false;
const wanted = new Map<string, { voice: string; lang: string; text: string }>();
const prune = args.includes('--prune');
const only = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--inspect' && args[i - 1] !== '--course');
const done = new Set<string>();
if (inspect) mkdirSync(inspect, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'tutor-voice-'));

/**
 * Cuts checked by eye. `cuts`: the times (seconds of the voice's raw take) where each stretch of what it says
 * starts and stops, used instead of the aligner's; `ok`: the aligner's own cuts were looked at and are right
 * (a fingerprint of the take and of those cuts: when either changes, they are doubted again); `why`: what was
 * seen.
 */
interface Checked { cuts?: number[]; ok?: string; why: string }
const checked: Record<string, Checked> = existsSync(CUTS) ? JSON.parse(readFileSync(CUTS, 'utf8')) : {};

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
/** each recording's file, the times of its sounds, and what they are counted from: the instant it first gets loud (align.ts rise) */
const manifest: Record<string, { f: string; k: number[]; z?: 'rise' | number }> = {};
if ((only || course || prune) && existsSync(OUT + 'manifest.json')) {
  // one item or one course made again: the others are kept (an old manifest names files only: those are made again in full)
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(OUT + 'manifest.json', 'utf8')) as Record<string, { f: string; k: number[] } | string>)) if (typeof v !== 'string') manifest[k] = v;
}
mkdirSync(OUT, { recursive: true });
let made = 0;
const odd: string[] = [];
const fixedByHand: string[] = [];
const lookedAt: string[] = [];

/**
 * Courses may be made at the same time, one run each (--course): a recording two courses share is made by the
 * run that comes to it first (the others see its lock), and each run writes only its own recordings into the
 * manifest, as it finds it when it is done.
 */
const LOCKS = OUT + '.making/';
const locked: string[] = [];
function lock(id: string): boolean {
  mkdirSync(LOCKS, { recursive: true });
  try { writeFileSync(LOCKS + id, String(process.pid), { flag: 'wx' }); locked.push(id); return true; } catch { /* taken */ }
  // (a lock left by a run that is no longer running is taken over)
  const pid = Number(readFileSync(LOCKS + id, 'utf8'));
  try { process.kill(pid, 0); return false; } catch { writeFileSync(LOCKS + id, String(process.pid)); locked.push(id); return true; }
}

/** What the model says for a compact form, as the tutor builds it: one stressed word. */
function said(lang: string, ipa: string): { score: Score; tr: Trajectory } | null {
  const ps = compactPhones(ipa);
  if (!ps.length) return null;
  const vi = ps.findIndex((p) => isVowel(p.ipa));
  if (vi >= 0 && !ps.some((p) => p.stress)) ps[vi].stress = true;
  ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  // (English of any country is timed as English)
  const score = buildScore(ps, { lang: (lang.startsWith('en') ? 'en' : lang) as Lang, f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  return { score, tr: trajectory(score) };
}

/** A fingerprint of a raw take and the cuts made in it (to the millisecond). */
const fingerprint = (x: Float32Array, cuts: number[]): string =>
  createHash('sha1').update(Buffer.from(x.buffer, x.byteOffset, x.byteLength)).update(cuts.map((c) => c.toFixed(3)).join(',')).digest('hex').slice(0, 16);

/** What an m4a file sounds like decoded at a rate, as a browser decodes it (null: ffmpeg could not). */
function decoded(file: string, fs: number): Frames | null {
  try {
    const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(fs), '-'], { maxBuffer: 64 << 20 });
    return listen(new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2), fs);
  } catch { return null; }
}
/** the loudnesses a recording's times may count from (the rise through the first that decoding does not move) */
const LEVELS = [RISE, 0.7, 0.5, 0.8, 0.65, 0.55, 0.75, 0.85, 0.9];

/**
 * A take of the AI voice without what is not speech: the silence round it, and the clicks or breaths that stand
 * alone a quarter of a second or more from the rest (an encoder leaves one at the end of some takes, and the
 * aligner would take it for the last sound). Pauses inside the word (a stop holding) are kept.
 */
function trimTake(x: Float32Array): Float32Array | null {
  const f = listen(x, FS);
  const on = (i: number) => f.loud[i] >= 0.12;
  const runs: [number, number][] = [];
  for (let i = 0; i < f.n; i++) if (on(i)) { let j = i; while (j < f.n && on(j)) j++; runs.push([i, j]); i = j; }
  // joined where the gap is short
  const joined: [number, number][] = [];
  for (const r of runs) {
    const last = joined[joined.length - 1];
    if (last && r[0] - last[1] < 0.25 / HOP) last[1] = r[1]; else joined.push([r[0], r[1]]);
  }
  const body = joined.filter((r) => r[1] - r[0] >= 0.06 / HOP);
  if (!body.length) return x;
  // a word with a quarter of a second of silence inside it is a bad take (the voice stopped and went on): said again, it comes out whole
  if (body.length > 1) return null;
  const from = Math.max(0, Math.round((body[0][0] * HOP - 0.05) * FS)), to = Math.min(x.length, Math.round((body[body.length - 1][1] * HOP + 0.08) * FS));
  const y = x.slice(from, to);
  const ramp = Math.round(0.01 * FS);
  for (let i = 0; i < ramp && i < y.length; i++) { y[i] *= i / ramp; y[y.length - 1 - i] *= i / ramp; }
  return y;
}

/** the name of a made voice take: its voice, language, text and settings */
const ttsId = (voice: string, lang: string, text: string): string => createHash('sha1').update(`${TTS.model}|${TTS.stability}${VARIANT ? '|v' + VARIANT : ''}|${voice.split(' ')[0]}|${LANG_CODE[lang]}|${text}`).digest('hex').slice(0, 16);

/** Makes every voice take `wanted` names that is not in CACHE yet, a few at a time (the voice is a model on fal.ai). */
async function fetchTakes(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  const todo = [...wanted.entries()].filter(([id]) => !existsSync(CACHE + id + '.mp3'));
  console.log(`${wanted.size} takes wanted, ${todo.length} to make`);
  let next = 0, failed = 0;
  const work = async () => {
    for (;;) {
      const i = next++;
      if (i >= todo.length) return;
      const [id, w] = todo[i];
      // A text the voice refuses (it flags a few harmless words, and returns nothing for some single letters) is
      // tried again the way it may accept: with a trailing mark, then on the service's other model.
      const tries: [string, Record<string, unknown>][] = [
        [TTS.model, { text: w.text, voice: falVoice(w.voice), language_code: LANG_CODE[w.lang], stability: STABILITY, enable_safety_checker: false }],
        [TTS.model, { text: w.text + (w.lang === 'hi' ? ' ।' : w.lang === 'ar' || w.lang === 'ur' ? ' ۔' : ' .'), voice: falVoice(w.voice), language_code: LANG_CODE[w.lang], stability: STABILITY, enable_safety_checker: false }],
        [TTS.model, { text: '… ' + w.text + ' …', voice: falVoice(w.voice), language_code: LANG_CODE[w.lang], stability: 0.8, enable_safety_checker: false }],
        ['fal-ai/elevenlabs/tts/multilingual-v2', { text: w.text, voice: falVoice(w.voice), language_code: LANG_CODE[w.lang], stability: 0.7, speed: 0.85, enable_safety_checker: false }],
      ];
      let last = '';
      for (const [model, input] of tries) {
        try {
          const out = await fal(model, input);
          const file = out.files.find((f) => /\.(mp3|wav)$/i.test(f.name));
          if (!file) throw new Error('no audio in the answer');
          writeFileSync(CACHE + id + '.mp3', file.bytes);
          writeFileSync(CACHE + id + '.txt', `${w.voice} ${w.lang} ${w.text} (${model})\n`);
          last = '';
          break;
        } catch (e) { last = (e as Error).message.slice(0, 160); }
      }
      if (last) {
        failed++;
        console.log(`!! no take for ${w.lang} ${w.text}: ${last}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, work));
  if (failed) console.log(`${failed} takes could not be made (they are left out)`);
}

/**
 * Records one thing the teacher says: `text` read by `voice` at `rate`, whose sounds are `ipa` (compact form).
 * `from`: the sounds of what the voice says when that is more than `ipa` (a word `ipa` is cut out of).
 */
function record(lang: string, voice: string, rate: number, text: string, ipa: string, from?: string, spoken: string = text): void {
  const key = `${voice}|${rate}|${text}`;
  if (only && !key.includes(only) && ipa !== only) return;
  if (done.has(key)) return; // the same text for two letters: said once
  done.add(key);
  if (prune) return;
  if (collecting) { if (!apple && LANG_CODE[lang]) wanted.set(ttsId(voice, lang, spoken), { voice, lang, text: spoken }); return; }
  // (made by a run of another course at the same time: that run writes it)
  if (!dry && !lock(createHash('sha1').update(key).digest('hex').slice(0, 12))) { console.log(`   ${key}: made by another run`); return; }
  const own = said(lang, ipa);
  const whole = from ? said(lang, from) : own;
  if (!own || !whole) return;

  // ---- the voice says it
  const raw = join(tmp, 'raw.wav');
  if (!apple && !existsSync(CACHE + ttsId(voice, lang, spoken) + '.mp3')) { console.log(`!! no take for ${lang} ${spoken}: left out`); return; }
  if (apple) execFileSync('say', ['-v', voice, '-o', raw, `--data-format=LEF32@${FS}`, text]);
  else execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', CACHE + ttsId(voice, lang, spoken) + '.mp3', '-ac', '1', '-ar', String(FS), '-c:a', 'pcm_f32le', raw]);
  const taken = apple ? readWav(raw) : trimTake(readWav(raw));
  if (!taken) {
    // (kept aside, so that the next run makes the take again)
    renameSync(CACHE + ttsId(voice, lang, spoken) + '.mp3', CACHE + ttsId(voice, lang, spoken) + '.bad.mp3');
    console.log(`!! bad take for ${lang} ${spoken}: a pause inside it; left out until it is made again`);
    return;
  }
  const x = taken;
  if (x.length < FS * 0.05) { console.log('!! nothing said for', key); return; }

  // ---- where its sounds are
  const fitRaw = fitTo(listen(x, FS), whole.score.phones, whole.tr);
  let cuts = fitRaw.knots.audio;
  const allKinds = fitRaw.knots.kinds;
  const aligner = fingerprint(x, cuts);
  const check = checked[key];
  let byHand = false;
  if (check?.cuts) {
    if (check.cuts.length !== cuts.length || check.cuts.some((c, i) => i > 0 && c < check.cuts![i - 1])) {
      console.log(`!! ${key}: the cuts checked by hand are ${check.cuts.length - 1} stretches, the word has ${cuts.length - 1}: not used`);
    } else { cuts = check.cuts; byHand = true; fixedByHand.push(key); }
  }
  // ---- the part of it that is kept: all of it, or the sound cut out of a word
  let s0 = 0, s1 = allKinds.length;
  const mine = planOf(own.score.phones, own.tr);
  if (from) {
    // the stretches of the word that belong to the sounds kept: the kept sounds are a run of the word's sounds
    const wp = whole.score.phones.filter((p) => PHONEMES[p.ipa] && p.ipa !== '_' && p.t1 > p.t0);
    const op = own.score.phones.filter((p) => PHONEMES[p.ipa] && p.ipa !== '_' && p.t1 > p.t0).map((p) => p.ipa);
    const at = wp.findIndex((_, i) => op.every((q, j) => wp[i + j]?.ipa === q));
    if (at < 0) { console.log(`!! ${key}: /${ipa}/ is not in /${from}/`); return; }
    const t0 = wp[at].t0, t1 = wp[at + op.length - 1].t1;
    const m = fitRaw.knots.model;
    const inside = allKinds.map((_, s) => { const mid = (m[s] + m[s + 1]) / 2; return mid >= t0 && mid < t1; });
    s0 = inside.indexOf(true); s1 = inside.lastIndexOf(true) + 1;
    const kept = allKinds.slice(s0, s1);
    if (s0 < 0 || kept.join() !== mine.kinds.join()) { console.log(`!! ${key}: the sounds kept (${kept.join(' ')}) are not those of /${ipa}/ (${mine.kinds.join(' ')})`); return; }
  }
  const a = cuts.slice(s0, s1 + 1), kinds = allKinds.slice(s0, s1);
  const m = mine.model;
  const S = kinds.length;

  // ---- each sound as long as the model makes it, a little slower
  const lead = 0.03;
  const outT = [lead];
  for (let s = 0; s < S; s++) {
    const have = a[s + 1] - a[s];
    let want = (m[s + 1] - m[s]) * SLOW;
    const kind = kinds[s];
    // (a burst is not stretched: it is over in an instant; hisses and puffs a little; what is held or sung, freely)
    const [lo, hi] = kind === 'burst' ? [0.9, 1.25] : kind === 'puff' ? [0.7, 1.6] : kind === 'hiss' || kind === 'breath' || kind === 'buzz' ? [0.6, 3.2] : kind === 'hold' || kind === 'silence' ? [0.5, 3] : [0.5, 3.2];
    // (a stop that starts the word and was not heard holding, voiced or not, holds in silence: its time is kept)
    if (have > 0) want = Math.max(lo * have, Math.min(hi * have, want));
    else if (kind !== 'hold' && kind !== 'silence' && !(kind === 'hum' && s === 0)) want = 0;
    outT.push(outT[s] + want);
  }
  const end = outT[S];
  // the rest of the recording after its last sound (its dying away), as it is; none after a sound cut out of a word
  const cutBefore = s0 > 0, cutAfter = s1 < allKinds.length;
  const tailIn = cutAfter ? 0 : Math.min(x.length / FS - a[S], 0.12);
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
  // a sound cut out of a word: nothing of the word before or after it, the edges faded in a few milliseconds
  if (cutBefore || cutAfter) {
    const inA = (outT[0] - 0.002) * FS, inB = (outT[0] + 0.004) * FS, outA = (end - 0.012) * FS, outB = (end + 0.003) * FS;
    for (let i = 0; i < length; i++) {
      if (cutBefore) y[i] *= i <= inA ? 0 : i < inB ? (i - inA) / (inB - inA) : 1;
      if (cutAfter) y[i] *= i >= outB ? 0 : i > outA ? (outB - i) / (outB - outA) : 1;
    }
  }
  // as loud as the others, and no click at its two ends
  let peak = 1e-6;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(y[i]));
  const edge = Math.round(0.004 * FS);
  for (let i = 0; i < length; i++) y[i] *= (0.89 / peak) * Math.min(1, i / edge, (length - 1 - i) / edge);

  const heard = listen(y, FS);
  // (a check: the sounds found again in what was made should be where they were put)
  const again = fitTo(heard, own.score.phones, own.tr).knots.audio;
  // (how far each boundary lies when the recording made is listened to again. Where a vowel turns into an l or a w there is no
  // sharp place for it, and a lip is not moving there either: what counts is where the mouth closes and lets go, the
  // boundaries beside a hold, a hum, a burst, a puff of air or a nasal)
  const SHARP = new Set(['hold', 'hum', 'burst', 'puff', 'nasal']);
  const away = (i: number) => (again.length === outT.length ? Math.abs(again[i] - outT[i]) : Infinity);
  const worstAll = again.length === outT.length ? Math.max(0, ...again.map((_, i) => (i === 0 || i === S ? 0 : away(i)))) : Infinity;
  const worst = again.length === outT.length ? Math.max(0, ...again.map((_, i) => (i === 0 || i === S || !(SHARP.has(kinds[i - 1]) || SHARP.has(kinds[i])) ? 0 : away(i)))) : Infinity;
  const factors = a.slice(1).map((v, i) => (v - a[i] > 0 ? (outT[i + 1] - outT[i]) / (v - a[i]) : 0));
  // (a voice that reads a letter by its name, or as a phrase, takes far longer than the letter's sounds do)
  // (what is heard of the take, not the silence round it: a neural voice leaves a good deal)
  const other = a[a.length - 1] - a[0] > 0.42 * whole.score.phones.filter((q) => PHONEMES[q.ipa] && q.ipa !== '_').length + 0.3;
  const flags: string[] = [];
  if (other) flags.push('long take');
  if (worst > 0.06) flags.push(`closing or release found again ${(1000 * worst).toFixed(0)} ms away`);
  if (factors.some((f, i) => f > 0 && (f < 0.35 || f > 3.3) && kinds[i] !== 'hold')) flags.push('stretched far');

  const file = createHash('sha1').update(key).digest('hex').slice(0, 12) + '.m4a';
  const wav = join(tmp, 'out.wav');
  writeWav(wav, y);
  const m4a = dry ? join(tmp, file) : OUT + file;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '72k', '-ar', String(FS), '-ac', '1', m4a]);
  // ---- the times of its sounds, from the instant it first gets loud: as a browser will decode it, at two rates,
  // that instant must be where it is here. It is where the recording rises through 18 dB under its loudest, unless
  // it lingers near that loudness (the puff of a k can, for 50 ms): then through another, where it rises steeply
  const plays = [PLAY_FS, 44100].map((fs) => decoded(m4a, fs)).filter((f): f is Frames => f !== null);
  const shiftAt = (level: number) => plays.map((f) => rise(f, level) - rise(heard, level)).reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0);
  const best = LEVELS.reduce((b, l) => (Math.abs(shiftAt(l)) < Math.abs(shiftAt(b)) - 0.002 ? l : b), RISE);
  const shift = shiftAt(best);
  const t0 = rise(heard, best);
  const marks = outT.map((t) => Math.round((t - t0) * 1000) / 1000);
  if (Math.abs(shift) > 0.005) flags.push(`${(1000 * shift).toFixed(0)} ms off when decoded`);
  if (!dry) manifest[key] = { f: file, k: marks, z: best === RISE ? 'rise' : best };
  made++;
  // a doubt that was looked at, with these very cuts, is settled
  const settled = !!check && (byHand || check.ok === aligner);
  if (check?.ok && !byHand && check.ok !== aligner) flags.push('its checked cuts have changed');
  if (flags.length && settled) lookedAt.push(key);
  const strange = flags.length > 0 && !settled;
  if (inspect) {
    // the recording as the voice said it, with where its sounds were found, and as it was made, with its times: to look at (scripts/voice-look.py)
    const n = file.slice(0, 12);
    writeWav(join(inspect, `${n}.wav`), x);
    writeWav(join(inspect, `${n}.made.wav`), y);
    writeFileSync(join(inspect, `${n}.json`), JSON.stringify({
      key, lang, text, ipa, from: from ?? null, strange, flags, byHand, worstAll, worstSharp: worst, fingerprint: aligner, cuts, kinds: allKinds, keep: [s0, s1],
      made: outT, onset: t0, level: best, shift, marks, phones: whole.score.phones.map((q) => [q.ipa, q.t0, q.t1]),
    }));
  }
  const line = `${other ? '!!' : strange ? '??' : byHand ? 'hh' : '  '} ${lang} ${text} /${ipa}/${from ? ` (from /${from}/)` : ''} ${(x.length / FS).toFixed(2)}s → ${(length / FS).toFixed(2)}s | ${kinds.map((k, i) => `${k} ${(a[i + 1] - a[i]).toFixed(2)}→${(outT[i + 1] - outT[i]).toFixed(2)}`).join(', ')} | check ${worst.toFixed(3)}${flags.length ? ' | ' + flags.join(', ') : ''}`;
  if (strange) odd.push(line);
  console.log(line);
}

function pass(): void {
  for (const lang of ['ur', 'hi', 'ar', 'en'] as const) {
    if (course && course !== lang) continue;
    const A = ALPHABETS[lang];
    const via = lang === 'ur' ? 'hi' : lang;
    for (const l of A.letters) {
      const say = l.say ?? (l.sound === 'ã' || isVowel(l.sound) ? l.sound : l.sound + A.vowel);
      // (Urdu is said from its own script by the AI voice; the system's voice, which has none, read it in Devanagari)
      const spoke = (what: 'sound' | 'word') => (lang === 'ur' && !apple ? speechText(l, lang, lang, what, say) : undefined);
      record(lang, RECORDED_VOICE[lang], 0.75, speechText(l, lang, via, 'sound', say), say, l.read?.from, spoke('sound'));
      record(lang, RECORDED_VOICE[lang], 0.82, speechText(l, lang, via, 'word', say), l.word.ipa, undefined, spoke('word'));
    }
  }

  // ---- the course of sounds (the IPA): the letters that carry a sound alone, and the words that have it, in the
  // languages recordings are made in. The same sound may be carried by one letter in several places: said once.
  if (!course || course === 'ipa') {
    for (const section of IPA_SECTIONS) for (const snd of section.sounds) {
      const items: [number, string, string, string][] = [];
      if (snd.carrier && snd.say && RECORDED_VOICE[snd.carrier.lang]) items.push([0.75, snd.carrier.lang, snd.carrier.text, snd.say]);
      // (Urdu words of this course are in Arabic letters, which the system's Hindi voice that read Urdu cannot read)
      for (const e of snd.examples) if (e.ipa && RECORDED_VOICE[e.lang] && (e.lang !== 'ur' || !apple)) items.push([0.82, e.lang, e.text, e.ipa]);
      for (const [rate, lang, text, ipa] of items) record(lang, RECORDED_VOICE[lang], rate, text, ipa);
    }
  }
}

// the first pass lists what is to be said; the takes are made; the second pass finds the sounds in them
if (!apple && !prune) {
  collecting = true;
  pass();
  collecting = false;
  done.clear();
  if (!dry) await fetchTakes();
}
pass();

// files no longer named are removed (by a run of everything: a run of one course may run beside others)
if (prune) {
  // what no course says any more goes
  for (const k of Object.keys(manifest)) if (!done.has(k)) { console.log('  no longer used:', k); delete manifest[k]; }
}
if (!only && !course && !dry && !process.argv.includes('--keep')) {
  const named = new Set(Object.values(manifest).map((v) => v.f));
  for (const f of readdirSync(OUT)) if (f.endsWith('.m4a') && !named.has(f)) rmSync(OUT + f);
}
if (!dry) {
  // (a run of one course writes its own recordings over the manifest as it is now: other runs may have written theirs meanwhile)
  const now: Record<string, { f: string; k: number[]; z?: 'rise' | number }> = (only || course) && existsSync(OUT + 'manifest.json') ? JSON.parse(readFileSync(OUT + 'manifest.json', 'utf8')) : {};
  for (const k of done) if (manifest[k] && locked.includes(manifest[k].f.slice(0, 12))) now[k] = manifest[k];
  writeFileSync(OUT + 'manifest.json', JSON.stringify(only || course ? now : manifest, null, 0).replace(/},"/g, '},\n"') + '\n');
  for (const id of locked) rmSync(LOCKS + id, { force: true });
  if (existsSync(LOCKS) && !readdirSync(LOCKS).length) rmSync(LOCKS, { recursive: true, force: true });
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${made} recordings made${dry ? ' (dry: none written)' : ''}; ${fixedByHand.length} cut by hand, ${lookedAt.length} doubted but checked by eye, ${odd.length} doubted and not yet checked (HOP ${HOP}s)`);
for (const l of odd) console.log(l);
