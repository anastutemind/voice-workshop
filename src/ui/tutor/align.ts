/**
 * Fits the mouth's movement to a recording of the voice. The model says a
 * word with its own timing, the recorded voice with another: the picture
 * must follow the recording, sound by sound. The sounds of the word are
 * known (the model says the same ones, in the same order); what is not
 * known is when each one starts in the recording. So each is looked for
 * there by what it sounds like: a vowel is loud and full, a nasal (m, n) a
 * hum with nothing above it, a hiss (s, sh, f) is high and has no hum, the
 * closure of a stop is silent or nearly, and it lets go in a burst. The
 * recording is cut into as many stretches as the word has sounds, the cut
 * that fits those descriptions best while keeping each sound near the share
 * of the word the model gives it. The time of the picture is then the
 * model's own time for the sound the recording is in, as far through it as
 * the recording is: the lips close when the m is heard, not after it.
 */
import { computeGeometry } from '../../dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_TEETH } from '../../dsp/tract/types';
import { PHONEMES } from '../../dsp/speech/phonemes';
import type { ScorePhone } from '../../dsp/engine/params';
import { poseAt, Trajectory } from './motion';
import { CLOSED_AREA, narrowest } from './readout';
import type { VoiceClip } from './clips';

/** seconds between two looks at the recording */
export const HOP = 0.005;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ------------------------------------------------------ what a moment sounds like

/** A second-order filter (low-pass or high-pass at `fc`), run over the samples. */
function biquad(x: ArrayLike<number>, fs: number, type: 'lp' | 'hp', fc: number): Float32Array {
  const w = (2 * Math.PI * Math.min(fc, fs * 0.45)) / fs, cs = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + al;
  const b1 = (type === 'lp' ? 1 - cs : -(1 + cs)) / a0, b0 = (type === 'lp' ? (1 - cs) / 2 : (1 + cs) / 2) / a0;
  const a1 = (-2 * cs) / a0, a2 = (1 - al) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

export interface Frames {
  /** how many looks, HOP seconds apart, the first at time zero of the recording */
  n: number;
  /** loudness, 0 (45 dB under the loudest moment, or less) to 1 (the loudest) */
  loud: Float32Array;
  /** the share of the sound that rings above the hum of the voice (between 700 and 3000 Hz, or between 400 and 1200 Hz, whichever is more), 0 (none) to 1 (all of it): an open mouth rings there, i high up and u low down, and a mouth closed for m or n does not */
  mid: Float32Array;
  /** the share above 3500 Hz, on the same scale: hiss */
  high: Float32Array;
}

const share = (part: number, all: number, peak: number): number => clamp01((10 * Math.log10(part / (all + peak * 1e-5) + 1e-6) + 30) / 30);

/** What the recording sounds like every HOP seconds. */
export function listen(x: ArrayLike<number>, fs: number): Frames {
  const twice = (v: ArrayLike<number>, type: 'lp' | 'hp', fc: number) => biquad(biquad(v, fs, type, fc), fs, type, fc);
  const all = twice(x, 'hp', 70);
  // (cut off steeply below: the hum of a deep voice is thirty times stronger than its ring, and what leaked of
  // it through a gentler filter made an m look like a vowel)
  const mid = twice(twice(twice(all, 'hp', 700), 'hp', 700), 'lp', 3000);
  // (and the band just under it: all the ring of an u or an o is there, below 1000 Hz, and none of a hum's)
  const lowMid = twice(twice(twice(all, 'hp', 450), 'hp', 450), 'lp', 1200);
  const high = twice(all, 'hp', 3500);
  const hop = Math.max(1, Math.round(fs * HOP)), win = Math.max(hop, Math.round(fs * 0.02));
  const n = Math.max(1, Math.floor(x.length / hop));
  const power = (v: Float32Array) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = i * hop, a = Math.max(0, c - (win >> 1)), b = Math.min(v.length, c + (win >> 1));
      let s = 0;
      for (let j = a; j < b; j++) s += v[j] * v[j];
      out[i] = s / Math.max(1, b - a);
    }
    return out;
  };
  const pa = power(all), pm = power(mid), pl = power(lowMid), ph = power(high);
  let peak = 1e-12;
  for (let i = 0; i < n; i++) if (pa[i] > peak) peak = pa[i];
  const f: Frames = { n, loud: new Float32Array(n), mid: new Float32Array(n), high: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    f.loud[i] = clamp01((10 * Math.log10(pa[i] / peak + 1e-9) + 45) / 45);
    // (shares on a scale of decibels: a thousandth of the sound is 0, all of it 1; an ear hears a ring thirty times weaker than the hum under it)
    f.mid[i] = Math.max(share(pm[i], pa[i], peak), share(pl[i], pa[i], peak));
    f.high[i] = share(ph[i], pa[i], peak);
  }
  return f;
}

// ------------------------------------------------------------ what a sound is like

/** What a kind of sound is like: how loud, how much ring, how much hiss (each a span it stays in), how much each counts, and how long it may last at most (seconds). */
interface Kind { loud: [number, number]; mid: [number, number]; high: [number, number]; w: [number, number, number]; most?: number }
const ANY: [number, number] = [0, 1];
const KIND = {
  silence: { loud: [0, 0.1], mid: ANY, high: ANY, w: [3, 0, 0] },
  open: { loud: [0.85, 1], mid: [0.5, 1], high: [0, 0.5], w: [2, 3, 1.5] },         // a e o: the mouth open, the sound full
  close: { loud: [0.8, 1], mid: [0.48, 1], high: [0, 0.5], w: [2, 3, 1.5] },        // i u: loud, most of it low
  glide: { loud: [0.7, 1], mid: [0.4, 1], high: [0, 0.55], w: [1.5, 1, 1.5] },      // l r y w
  // (measured on the voices: the ring of a vowel is 0.5 to 0.95 of the sound on this scale, an m's or an n's 0 to 0.42)
  nasal: { loud: [0.6, 1], mid: [0, 0.42], high: [0, 0.3], w: [2, 3, 1] },          // a hum, nothing above it
  hiss: { loud: [0.3, 0.9], mid: ANY, high: [0.8, 1], w: [0.8, 0, 2.5] },           // s sh
  breath: { loud: [0.2, 0.8], mid: ANY, high: [0.5, 1], w: [1.5, 0, 1.5] },         // f th kh h
  buzz: { loud: [0.4, 0.95], mid: [0, 0.4], high: ANY, w: [1.2, 1.5, 0] },          // z zh v: a hum, then a hiss on it
  hold: { loud: [0, 0.2], mid: ANY, high: ANY, w: [3, 0, 0] },                      // a stop holding, no voice
  hum: { loud: [0.2, 0.95], mid: [0, 0.25], high: [0, 0.3], w: [2, 3, 1] },         // a stop holding, the voice going on
  burst: { loud: [0.3, 1], mid: ANY, high: ANY, w: [0.8, 0, 0], most: 0.05 },       // a stop letting go
  puff: { loud: [0.3, 0.85], mid: ANY, high: [0.4, 1], w: [1.2, 0, 1], most: 0.16 },// the air after it
} satisfies Record<string, Kind>;

/** how far a value lies outside a span */
const off = (v: number, [lo, hi]: [number, number]): number => (v < lo ? lo - v : v > hi ? v - hi : 0);
const cost = (k: Kind, f: Frames, i: number): number =>
  k.w[0] * off(f.loud[i], k.loud) + k.w[1] * off(f.mid[i], k.mid) + k.w[2] * off(f.high[i], k.high);

/** A stretch of the word: a sound, or a part of one (a stop holds, then lets go). */
interface Stretch { kind: Kind; /** in the model's time */ m0: number; m1: number; /** it may be left out of the recording altogether */ free?: boolean; /** when the model's mouth is really closed for it (a stop, a nasal), if it closes */ shut?: [number, number] | null }
const nameOf = (k: Kind): string => (Object.keys(KIND) as (keyof typeof KIND)[]).find((n) => KIND[n] === k) ?? '';

const SIBILANT = /^(s|z|ʃ|ʒ|ʂ|ʐ|tʃ|dʒ|ts|dz)/;

/** When the mouth lets go in a stretch of the model's movement (null: it never closes, or never opens). */
function letGo(tr: Trajectory, t0: number, t1: number): number | null {
  const n = 14;
  let shut = false;
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const pose = poseAt(tr, t);
    if (!pose) return null;
    const closed = narrowest(computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH)).area < CLOSED_AREA;
    if (closed) shut = true;
    else if (shut) return t;
  }
  return null;
}

/**
 * When the mouth is closed for a sound planned from t0 to t1: the start and the end of the closure that lies
 * most in that time (it may start a little before the plan, or after it), or null if the mouth does not close.
 */
function closure(tr: Trajectory, t0: number, t1: number): [number, number] | null {
  const dt = 0.004;
  let best: [number, number] | null = null, most = 0, from = NaN;
  const done = (to: number) => {
    if (Number.isNaN(from)) return;
    const share = Math.min(to, t1) - Math.max(from, t0);
    if (share > most) { most = share; best = [from, to]; }
    from = NaN;
  };
  for (let t = t0 - 0.06; t <= t1 + 0.024; t += dt) {
    const pose = poseAt(tr, Math.max(0, t));
    if (!pose) break;
    const closed = narrowest(computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH)).area < CLOSED_AREA;
    if (closed && Number.isNaN(from)) from = t;
    else if (!closed) done(t);
  }
  done(t1 + 0.024);
  return best;
}

/** The stretches of a word, from its sounds as the model says them. */
function stretches(phones: ScorePhone[], tr: Trajectory): Stretch[] {
  const out: Stretch[] = [];
  for (const p of phones) {
    const ph = PHONEMES[p.ipa];
    if (!ph || p.t1 <= p.t0) continue;
    const one = (kind: Kind, m0 = p.t0, m1 = p.t1) => { if (m1 > m0) out.push({ kind, m0, m1 }); };
    const m = ph.manner;
    if (m === 'silence') out.push({ kind: KIND.silence, m0: p.t0, m1: p.t1, free: true });
    else if (m === 'vowel') one(/^[iɪuʊyɯ]/.test(p.ipa) ? KIND.close : KIND.open);
    else if (m === 'nasal') out.push({ kind: KIND.nasal, m0: p.t0, m1: p.t1, shut: closure(tr, p.t0, p.t1) });
    else if (m === 'approximant' || m === 'lateral' || m === 'trill' || m === 'tap') one(KIND.glide);
    else if (m === 'fricative' || m === 'glottal') one(SIBILANT.test(p.ipa) ? (ph.voiced ? KIND.buzz : KIND.hiss) : ph.voiced ? KIND.buzz : KIND.breath);
    // (a glottal stop is silent; at the start of a word it may take no time at all)
    else if (m === 'glottalStop') out.push({ kind: KIND.hold, m0: p.t0, m1: p.t1, free: !out.length });
    else {
      // a stop or an affricate: it holds, then lets go (with a hiss, or a puff of air)
      const puffed = /[ʰʱ]$/.test(p.ipa);
      const share = m === 'affricate' ? 0.45 : puffed ? 0.45 : 0.72;
      const shut = closure(tr, p.t0, p.t1);
      const open = Math.max(p.t0 + 0.25 * (p.t1 - p.t0), Math.min(p.t1 - 0.012, (shut ? shut[1] : letGo(tr, p.t0, p.t1)) ?? p.t0 + share * (p.t1 - p.t0)));
      // (a voiceless one that starts the word holds in the silence before the first thing heard: it may be missing)
      out.push({ kind: ph.voiced ? KIND.hum : KIND.hold, m0: p.t0, m1: open, free: !ph.voiced && !out.length, shut });
      one(m === 'affricate' ? (ph.voiced ? KIND.buzz : KIND.hiss) : puffed ? KIND.puff : KIND.burst, open, p.t1);
    }
  }
  return out;
}

// ------------------------------------------------------------------ the cut

/**
 * Where each stretch of the word is in the recording: the times (seconds of
 * the recording) of its cuts, one more than the stretches. Before the first
 * and after the last the recording is silent.
 */
function cut(heard: Frames, st: Stretch[]): number[] {
  const S = st.length, J = heard.n;
  // Voices differ in how much of their sound rings above the hum: in a deep one the vowels themselves ring
  // little more than another voice's m. So the ring is counted against the most this recording has (its vowels'):
  // nine tenths of the way up among its loud moments is set to 0.9.
  const ringing = Array.from(heard.mid).filter((_, i) => heard.loud[i] > 0.6).sort((a, b) => a - b);
  const top = ringing.length ? ringing[Math.floor(0.9 * (ringing.length - 1))] : 0;
  const gain = top > 0.25 ? Math.min(2, 0.9 / top) : 1;
  const f: Frames = gain === 1 ? heard : { ...heard, mid: heard.mid.map((v) => Math.min(1, v * gain)) };
  // the word in the recording: from the first to the last moment that is not silence
  let a = 0, b = J;
  while (a < J && f.loud[a] < HEARD) a++;
  while (b > a && f.loud[b - 1] < HEARD) b--;
  if (b - a < 2 * S) { a = 0; b = J; }
  // A word that ends on a stop without voice (dhūp, ek) ends when the stop lets go: after a silence, and often
  // so faintly that it is quieter than what counts as heard. The word reaches to there, not to where the voice
  // stopped: the lips of the picture stay shut through that silence, as the speaker's do.
  if (S > 1 && st[S - 2].kind === KIND.hold && (st[S - 1].kind === KIND.burst || st[S - 1].kind === KIND.puff)) {
    const far = Math.min(J, b + Math.round(0.3 / HOP));
    for (let j = b; j < far; j++) if (f.loud[j] >= FAINT) b = j + 1;
  }
  // a stop that holds without voice is silent: at the start of a word it lies before the first thing heard,
  // so the cut may start a little earlier there
  const lead = st[0].kind === KIND.hold ? Math.min(a, Math.round(0.12 / HOP)) : 0;
  const j0 = a - lead, n = b - j0;
  const span = st[S - 1].m1 - st[0].m0;
  // the cost of each stretch over the first i moments
  const pre: Float32Array[] = st.map((s) => {
    const p = new Float32Array(n + 1);
    for (let i = 0; i < n; i++) p[i + 1] = p[i] + cost(s.kind, f, j0 + i);
    return p;
  });
  const want = st.map((s) => ((s.m1 - s.m0) / span) * n);
  const INF = 1e9, LAMBDA = 0.14;
  // Where one sound ends and the next starts the recording changes: it gets louder or quieter, its ring or its
  // hiss comes or goes, within a hundredth of a second or two. A cut is drawn to such a place (the more it
  // changes there, the more), so that it falls on the very instant lips meet or part, not somewhere in the
  // sound beside it that happens to suit the lengths planned.
  const KAPPA = 3, R = 3;
  const edge = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const a = Math.max(0, Math.min(J - 1, j0 + i - R)), b2 = Math.max(0, Math.min(J - 1, j0 + i + R - 1));
    edge[i] = Math.min(1, Math.abs(f.loud[b2] - f.loud[a]) + Math.abs(f.mid[b2] - f.mid[a]) + Math.abs(f.high[b2] - f.high[a]));
  }
  const best: Float32Array[] = [], from: Int32Array[] = [];
  for (let s = 0; s < S; s++) {
    const D = new Float32Array(n + 1).fill(INF), B = new Int32Array(n + 1).fill(-1);
    // no stretch shorter than three hundredths of a second (unless it may be left out), nor than a quarter of its share
    const least = st[s].free ? 0 : Math.max(Math.round(0.03 / HOP), Math.floor(want[s] * 0.25));
    const most = Math.max(least, Math.round((st[s].kind as Kind).most !== undefined ? (st[s].kind as Kind).most! / HOP : n));
    // (a stretch that keeps its share of the word costs nothing more; a longer or a shorter one does)
    if (s === 0) {
      // the first stretch starts at the start: every end of it is a candidate
      for (let e = least; e <= Math.min(n, most); e++) { D[e] = pre[0][e] + LAMBDA * Math.abs(e - want[0]); B[e] = 0; }
    } else {
      const prev = best[s - 1];
      for (let e = least; e <= n; e++) {
        for (let c = Math.max(0, e - most); c <= e - least; c++) {
          if (prev[c] >= INF) continue;
          const v = prev[c] + pre[s][e] - pre[s][c] + LAMBDA * Math.abs(e - c - want[s]) - KAPPA * edge[c];
          if (v < D[e]) { D[e] = v; B[e] = c; }
        }
      }
    }
    best.push(D); from.push(B);
  }
  const cuts = new Array<number>(S + 1);
  if (best[S - 1][n] >= INF) {
    // no cut fits (a recording far shorter than the word): each stretch gets its share
    let at = 0;
    for (let s = 0; s <= S; s++) { cuts[s] = (j0 + at) * HOP; if (s < S) at += want[s]; }
    return cuts;
  }
  let e = n;
  for (let s = S - 1; s >= 0; s--) { cuts[s + 1] = (j0 + e) * HOP; e = from[s][e]; }
  cuts[0] = j0 * HOP;
  return cuts;
}

// ------------------------------------------------------------------- the fit

export interface Fit {
  /** the time of the clip for a time of the recording (seconds from its first sample) */
  at: (audio: number) => number;
  /** when the recording's sound is over */
  end: number;
  /** where each stretch of the word starts and stops (in the recording, and in the model's movement), and what kind of sound it is */
  knots: { audio: number[]; model: number[]; kinds: string[] };
  /** the recording's own times of its sounds were taken (false: they were for other sounds, or there were none, and the sounds were looked for) */
  marked: boolean;
}

/** quieter than this (0..1), a moment of a recording is silence */
const HEARD = 0.28;
/** ...but a stop letting go at the end of a word is heard down to this */
const FAINT = 0.07;
/** The first moment something is heard in a recording, seconds. */
export function onset(f: Frames): number {
  let a = 0;
  while (a < f.n && f.loud[a] < HEARD) a++;
  return (a < f.n ? a : 0) * HOP;
}

/**
 * The fit of a word's sounds to a recording of it. `marks`, when the
 * recording was made with them (scripts/tutor-voice.ts), say where each
 * stretch of the word is, from the first moment something is heard: nothing
 * is then left to find. Without them the sounds are looked for.
 */
export function fitTo(f: Frames, phones: ScorePhone[], tr: Trajectory, marks?: number[]): Fit {
  const st = stretches(phones, tr);
  if (!st.length) {
    // nothing known of the word: the movement in the time the recording takes
    let b = f.n;
    while (b > 0 && f.loud[b - 1] < HEARD) b--;
    const t0 = onset(f), t1 = Math.max(t0 + HOP, b * HOP);
    return { at: (x) => clamp01((x - t0) / (t1 - t0)) * tr.speech, end: t1, knots: { audio: [t0, t1], model: [0, tr.speech], kinds: [''] }, marked: false };
  }
  const S = st.length;
  const from = onset(f);
  // (one recording may serve two letters that a voice says alike: hamza's ʔa and alif's a are both "आ". Its
  // marks then lack the silent hold the glottal stop starts with: it takes no time in the recording)
  // (and the other way round: أَ recorded for hamza serves the short a, whose word has no glottal stop before it)
  const own = !marks ? marks : marks.length === S && st[0].free ? [marks[0], ...marks] : marks.length === S + 2 ? marks.slice(1) : marks;
  const audio = own && own.length === S + 1 ? own.map((t) => from + t) : cut(f, st);
  const model = [st[0].m0, ...st.map((s) => s.m1)];
  // The plan says when each sound is due; the mouth of the model closes for a stop or a nasal a little before
  // or after that, and may open before a nasal is over. What is heard closing in the recording is set against
  // the mouth closing, not against the plan: the instant the lips meet is the instant the sound says they do.
  // (Between two sounds made with the mouth closed, n and d, nothing closes: the plan stands there.)
  const shuts = (s: Stretch | undefined) => !!s && (s.kind === KIND.hold || s.kind === KIND.hum || s.kind === KIND.nasal);
  for (let i = 0; i < S; i++) {
    const sh = st[i].shut;
    if (!sh) continue;
    if (i > 0 && !shuts(st[i - 1])) model[i] = Math.max(model[i - 1] + 0.01, Math.min(model[i + 1] - 0.01, sh[0]));
    if (st[i].kind === KIND.nasal && i + 1 < S && !shuts(st[i + 1])) model[i + 1] = Math.max(model[i] + 0.01, Math.min(model[i + 2] - 0.01, sh[1]));
  }
  // the first stretch that is really in the recording: what comes before it (a stop holding in silence) was done before the sound
  let first = 0;
  while (first < S - 1 && audio[first + 1] <= audio[first]) first++;
  const at = (x: number): number => {
    // before the word: the mouth is on its way, in real time, to where the word starts; after it, on its way on
    if (x <= audio[first]) return Math.max(0, model[first] + (x - audio[first]));
    if (x >= audio[S]) return Math.min(tr.speech, model[S] + (x - audio[S]));
    let s = first;
    while (s < S - 1 && x >= audio[s + 1]) s++;
    const len = audio[s + 1] - audio[s];
    return model[s] + (len > 0 ? (x - audio[s]) / len : 1) * (model[s + 1] - model[s]);
  };
  return { at, end: audio[S], knots: { audio, model, kinds: st.map((s) => nameOf(s.kind)) }, marked: !!own && own.length === S + 1 };
}

const fits = new WeakMap<Trajectory, WeakMap<VoiceClip, Fit>>();

/** The fit of a movement to a recording of its sounds (kept: it is worked out once for each pair). */
export function fit(tr: Trajectory, phones: ScorePhone[], rec: VoiceClip): Fit {
  let byRec = fits.get(tr);
  if (!byRec) fits.set(tr, (byRec = new WeakMap()));
  let f = byRec.get(rec);
  if (!f) byRec.set(rec, (f = fitTo(listen(rec.buffer.getChannelData(0), rec.buffer.sampleRate), phones, tr, rec.marks)));
  return f;
}
