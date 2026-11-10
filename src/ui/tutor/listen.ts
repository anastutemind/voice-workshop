/**
 * The tutor's ear for one sound. A learner says a letter ("ba", "sa", "aː")
 * into the microphone; `analyse` decodes from the samples what was done
 * (was there a pop, when did the voice start, was there a puff of air, a
 * hiss and how sharp, a hum, a flutter, which vowel and how long) and
 * `judge` sets that against what the letter asks for, finding by finding,
 * in words a parent can read to a child.
 *
 * Pure functions on samples: no microphone, no audio graph, no page. The
 * recording is expected mono at the microphone's rate, a second or a few
 * long, with silence around the sound, at any gain and with some room
 * noise: everything is measured against the loudest moment and against the
 * quietest ones (the room).
 *
 * What an ear of this kind can tell, it tells: voice against no voice (the
 * time between the pop and the voice), the puff of the aspirated letters,
 * a pop against a hiss against a hum, the sharp hiss of s against the
 * softer one of sh, the rolled r, an open vowel against a closed, a front
 * against a back, a long against a short. What it cannot tell (a t on the
 * teeth from one curled back, k from q, the heavy letters of Arabic, p
 * from t from k) it says it cannot: those findings come back with
 * `ok: null`, and the picture is the judge.
 */
import { getFFT, hann } from '../../dsp/util/fft';
import { yin } from '../../dsp/analysis/pitch';
import { decimate, lpcFormants } from '../../dsp/analysis/lpc';
import { PHONEMES, Phoneme } from '../../dsp/speech/phonemes';
import { compactPhones } from '../../dsp/speech/indic';
import { guideFor, PLACES } from './guide';

export interface Heard {
  /** nothing loud enough to judge */
  silent: boolean;
  /** where the utterance sits in the recording, s */
  t0: number;
  t1: number;
  /** seconds per frame of the tracks below */
  hop: number;
  /** per frame, loudness 0..1 relative to the loudest frame (0 = 50 dB below it) */
  level: number[];
  /** per frame, the voice is on (the sound is periodic) */
  voiced: boolean[];
  /** per frame, 0..1: noise of a hiss, a puff or a breath (0 = 45 dB below the loudest frame) */
  hiss: number[];
  /** median pitch of the vowel, Hz */
  pitch: number | null;
  /** how far the loudest moment stands above the room, dB (90 = no room noise at all) */
  snr: number;
  cues: {
    /** a closure then a sudden release */
    burst: boolean;
    /**
     * s from the burst to the clear voice: negative when the voice was on
     * before the burst (its lead), else the time until the voice sounds
     * clean (the gap and the breathy start); null without a burst
     */
    vot: number | null;
    /** voice during the consonant or right at its release */
    voicedOnset: boolean;
    /** a long noisy or breathy lag after the release */
    aspirated: boolean;
    /** s of sustained hiss before the vowel */
    frication: number;
    /** Hz, centre of gravity of that hiss */
    hissCentre: number | null;
    /** a voiced murmur with weak highs before the vowel: a hum (null = unsure). A lateral hums much the same. */
    nasal: boolean | null;
    /** 18–35 Hz flutter of the level (null = no voiced start to look at) */
    trill: boolean | null;
    vowel: { f1: number; f2: number } | null;
    /** s */
    vowelDuration: number;
    /** the vot was timed pulse by pulse (to a few ms); if not, only by the frames of the voice (to about 10 ms) */
    votFine: boolean;
    /** s from the burst to the full, open vowel: long after a puff of air (null without a burst) */
    puff: number | null;
    /** the aspirated lag was voiced: the breathy sigh of bʱ, dʱ, gʱ (null = no such lag, or unsure) */
    breathy: boolean | null;
    /** quick dips of the level before the vowel: the contacts of a tap or a trill */
    taps: number;
    /** share of the hiss that had the voice on, 0..1 (null without a hiss) */
    hissVoiced: number | null;
    /** s of voiced hum right before the vowel */
    murmur: number;
    /** how loud that hum was against the vowel, dB (0 = as loud) */
    murmurLevel: number;
    /**
     * what that hum has above 600 Hz against below, dB: a nose (or the sides
     * of the tongue) rings there, about -20 to -35; the hum of a b, d or g
     * held shut does not, below -40
     */
    murmurRing: number;
    /** s the sound took to swell from 20 dB below the vowel to the vowel: a few ms after a pop, long for a soft start */
    attack: number | null;
    /** the voice started with the sound (no pop, puff or hiss before it) */
    voiceFirst: boolean;
    /** s from the start of the sound to its vowel: the consonant */
    onset: number;
    /** share of that time with the voice on, 0..1 */
    onsetVoiced: number;
  };
  /** moments of the recording, s, for a picture of it (null = not found) */
  marks: { burst: number | null; voice: number | null; vowel: [number, number] | null; hiss: [number, number] | null };
}

export interface Finding {
  /** 'manner' | 'voice' | 'puff' | 'hiss' | 'vowel' | 'length' | 'place' | 'nose' */
  id: string;
  /** two or three plain words */
  title: string;
  /** what was asked for */
  want: string;
  /** what was heard */
  got: string;
  /** null = cannot be told by ear: the picture is the judge */
  ok: boolean | null;
  /** when not ok: one sentence a parent can read to a child */
  tip?: string;
}

export interface Report { heard: Heard; findings: Finding[]; score: number; stars: 0 | 1 | 2 | 3; headline: string }

const HOP = 0.01;
/** seconds per point of the fine envelopes */
const FINE = 0.001;
/** the phrase for what an ear cannot judge */
export const BY_EYE = "can't be judged by ear: check the picture";

const dB = (ratio: number) => 10 * Math.log10(Math.max(ratio, 1e-30));
const ms = (s: number) => `${Math.round(s * 1000)} ms`;

function blank(): Heard {
  return {
    silent: true, t0: 0, t1: 0, hop: HOP, level: [], voiced: [], hiss: [], pitch: null, snr: 0,
    cues: {
      burst: false, vot: null, voicedOnset: false, aspirated: false, frication: 0, hissCentre: null, nasal: null, trill: null, vowel: null, vowelDuration: 0,
      votFine: false, puff: null, breathy: null, taps: 0, hissVoiced: null, murmur: 0, murmurLevel: 0, murmurRing: 0, attack: null, voiceFirst: false, onset: 0, onsetVoiced: 0,
    },
    marks: { burst: null, voice: null, vowel: null, hiss: null },
  };
}

// ------------------------------------------------------------------ tools

/** A second-order Butterworth low-pass or high-pass. */
function biquad(x: ArrayLike<number>, fs: number, type: 'lp' | 'hp', fc: number): Float64Array {
  const w0 = (2 * Math.PI * Math.min(fc, 0.45 * fs)) / fs, c = Math.cos(w0), al = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + al, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  const b1 = (type === 'lp' ? 1 - c : -(1 + c)) / a0, b0 = (type === 'lp' ? (1 - c) / 2 : (1 + c) / 2) / a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Mean square of x in windows of `win` s, one value every FINE s. */
function envelope(x: Float64Array, fs: number, win: number): Float64Array {
  const sums = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) sums[i + 1] = sums[i] + x[i] * x[i];
  const n = Math.floor(x.length / (fs * FINE)) + 1;
  const half = Math.max(1, Math.round((win * fs) / 2));
  const out = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const c = Math.round(j * FINE * fs);
    const a = Math.max(0, c - half), b = Math.min(x.length, c + half);
    out[j] = b > a ? (sums[b] - sums[a]) / (b - a) : 0;
  }
  return out;
}

/**
 * The level of the quiet moments of a track: its tenth percentile, digital
 * silence apart (a recorder may start with a few empty frames). A track that
 * is digital silence for a good part of its length has no room in it at all.
 */
function quiet(v: ArrayLike<number>, peak: number): number {
  const live: number[] = [];
  for (let i = 0; i < v.length; i++) if (v[i] > peak * 1e-10) live.push(v[i]);
  if (live.length < 8 || live.length < 0.6 * v.length) return 0;
  live.sort((a, b) => a - b);
  return live[Math.floor(live.length * 0.1)];
}

const median = (v: number[]): number => {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
};

const maxIn = (v: ArrayLike<number>, a: number, b: number): number => {
  let m = 0;
  for (let i = Math.max(0, a); i <= b && i < v.length; i++) if (v[i] > m) m = v[i];
  return m;
};
const minIn = (v: ArrayLike<number>, a: number, b: number): number => {
  let m = Infinity;
  for (let i = Math.max(0, a); i <= b && i < v.length; i++) if (v[i] < m) m = v[i];
  return m;
};

// ---------------------------------------------------------------- analyse

/** Decodes a recording of one sound: what was done, and when. */
export function analyse(samples: Float32Array, sampleRate: number): Heard {
  const fs = sampleRate;
  const len = samples.length;
  const heard = blank();
  if (!(fs >= 8000) || len < fs * 0.1) return heard;

  // ---- no hum, no rumble, no offset
  const x = biquad(samples, fs, 'hp', 60);
  let amp = 0;
  for (let i = 0; i < len; i++) { const a = Math.abs(x[i]); if (a > amp) amp = a; }
  if (!(amp > 2e-4)) return heard;

  // ---- the spectrum of every frame, and its energy in four bands
  const N = fs >= 30000 ? 1024 : fs >= 15000 ? 512 : 256;
  const half = N / 2;
  const hopN = Math.round(fs * HOP);
  const nF = Math.floor(len / hopN) + 1;
  const win = hann(N);
  const fft = getFFT(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const spec = new Float64Array(nF * (half + 1));
  const top = Math.min(11000, 0.92 * (fs / 2));
  const bin = (f: number) => Math.max(1, Math.min(half, Math.round((f * N) / fs)));
  const bLo = bin(60), bMid = bin(600), bHi = bin(2000), bVhi = bin(4000), bTop = bin(top);
  const tot = new Float64Array(nF), lo = new Float64Array(nF), mid = new Float64Array(nF), hi = new Float64Array(nF), vhi = new Float64Array(nF);
  for (let i = 0; i < nF; i++) {
    const c = i * hopN - half;
    for (let k = 0; k < N; k++) { const j = c + k; re[k] = j >= 0 && j < len ? x[j] * win[k] : 0; im[k] = 0; }
    fft.transform(re, im);
    const row = i * (half + 1);
    let a = 0, b = 0, d = 0, e = 0;
    for (let k = 1; k <= half; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      spec[row + k] = p;
      if (k < bLo || k >= bTop) continue;
      if (k < bMid) a += p; else if (k < bHi) b += p; else { d += p; if (k >= bVhi) e += p; }
    }
    lo[i] = a; mid[i] = b; hi[i] = d; vhi[i] = e; tot[i] = a + b + d;
  }
  // the loudest frame (one frame alone may be a click: take the middle of three)
  let pk = 0, iPk = 0;
  for (let i = 0; i < nF; i++) {
    const a = tot[Math.max(0, i - 1)], b = tot[i], c = tot[Math.min(nF - 1, i + 1)];
    const m = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    if (m > pk) { pk = m; iPk = i; }
  }
  if (!(pk > 0)) return heard;

  // ---- the room: the quiet frames, their level and their spectrum
  const nRef = quiet(tot, pk);
  const noise = new Float64Array(half + 1);
  let nLo = 0, nMid = 0, nHi = 0, nVhi = 0, nTot = 0, nCount = 0;
  if (nRef > 0) {
    for (let i = 0; i < nF; i++) {
      if (!(tot[i] > pk * 1e-10 && tot[i] <= nRef * 1.6)) continue;
      const row = i * (half + 1);
      for (let k = 1; k <= half; k++) noise[k] += spec[row + k];
      nLo += lo[i]; nMid += mid[i]; nHi += hi[i]; nVhi += vhi[i]; nTot += tot[i]; nCount++;
    }
    if (nCount) {
      for (let k = 1; k <= half; k++) noise[k] /= nCount;
      nLo /= nCount; nMid /= nCount; nHi /= nCount; nVhi /= nCount; nTot /= nCount;
    }
  }
  // nothing stands out of the room: silence
  if (nTot > 0 && pk < nTot * 16) return heard;

  // ---- where the sound is: the loud frames around the loudest one
  const active = (i: number) => tot[i] > Math.max(nTot * 8, pk * 10 ** -4.5);
  const GAP = 3;
  let i0 = iPk, i1 = iPk;
  for (let i = iPk - 1, miss = 0; i >= 0 && miss <= GAP; i--) { if (active(i)) { i0 = i; miss = 0; } else miss++; }
  for (let i = iPk + 1, miss = 0; i < nF && miss <= GAP; i++) { if (active(i)) { i1 = i; miss = 0; } else miss++; }
  if (i1 - i0 + 1 < 4) return heard;

  const level: number[] = new Array(nF);
  const L = new Float64Array(nF);
  for (let i = 0; i < nF; i++) { L[i] = dB(tot[i] / pk); level[i] = Math.max(0, Math.min(1, 1 + L[i] / 50)); }

  // ---- the voice: is the sound periodic, every 5 ms, in the band of the first harmonics
  const D = Math.max(1, Math.round(fs / 4000));
  const xd = decimate(x, D);
  const fsd = fs / D;
  const nw = 2 * Math.round(0.016 * fsd);
  const n5 = 2 * nF;
  const e5 = new Float64Array(n5), f5 = new Float64Array(n5);
  const at5 = (m: number) => Math.round(m * 0.005 * fsd) - nw / 2;
  let pk5 = 0;
  for (let m = 0; m < n5; m++) {
    const c = at5(m);
    if (c < 0 || c + nw > xd.length) continue;
    let e = 0;
    for (let k = c; k < c + nw; k++) e += xd[k] * xd[k];
    e5[m] = e / nw;
    if (e5[m] > pk5) pk5 = e5[m];
  }
  // (a period is looked for only where there is sound enough to be a voice: 33 dB below
  // the loudest at most, and well above the room)
  const q5 = quiet(e5, pk5);
  const raw5 = new Uint8Array(n5);
  for (let m = 0; m < n5; m++) {
    if (!(e5[m] > 0) || e5[m] < Math.max(q5 * 5, pk5 * 10 ** -3.3)) continue;
    const c = at5(m);
    const y = yin(xd.subarray(c, c + nw), fsd, 70, 520, 0.2);
    if (y.confidence > 0 && y.f0 >= 70 && y.f0 <= 520) { raw5[m] = 1; f5[m] = y.f0; }
  }
  const voiced5 = new Uint8Array(n5);
  for (let m = 0; m < n5; m++) {
    let c = 0;
    for (let k = -2; k <= 2; k++) c += raw5[Math.max(0, Math.min(n5 - 1, m + k))];
    voiced5[m] = c >= 3 ? 1 : 0;
  }
  const voiced: boolean[] = new Array(nF);
  for (let i = 0; i < nF; i++) voiced[i] = voiced5[2 * i] === 1;

  // ---- noise: a hiss, a puff, a breath. Without the voice, whatever sounds above 600 Hz;
  // with it, a band above 4 kHz that a voice alone does not fill (the resonances of an i or
  // an e lie just below it and spill a little into it: a hiss has as much above as below)
  const audible = pk * 10 ** -4.8;
  const noisy = new Uint8Array(nF);
  const hissE = new Float64Array(nF);
  for (let i = 0; i < nF; i++) {
    if (voiced[i]) {
      const v = Math.max(0, vhi[i] - nVhi);
      if (v >= Math.max(2 * nVhi, audible) && vhi[i] >= 0.16 * mid[i] && vhi[i] >= 0.0025 * (tot[i] - vhi[i]) && vhi[i] >= 0.35 * (hi[i] - vhi[i])) { noisy[i] = 1; hissE[i] = v; }
    } else {
      const v = Math.max(0, mid[i] - nMid) + Math.max(0, hi[i] - nHi);
      if (v >= Math.max(2 * (nMid + nHi), audible)) noisy[i] = 1;
      hissE[i] = v;
    }
  }
  const hiss: number[] = new Array(nF);
  for (let i = 0; i < nF; i++) hiss[i] = i >= i0 && i <= i1 && (noisy[i] || !voiced[i]) ? Math.max(0, Math.min(1, 1 + dB(hissE[i] / pk) / 45)) : 0;

  heard.silent = false;
  heard.snr = nTot > 0 ? Math.min(90, dB(pk / nTot)) : 90;
  heard.t0 = i0 * HOP;
  heard.t1 = Math.min(len / fs, (i1 + 1) * HOP);
  heard.level = level;
  heard.voiced = voiced;
  heard.hiss = hiss;
  const cues = heard.cues;

  // ---- the vowel: in the main stretch of voice, where the mouth sounds most open (a hum
  // before it may be as loud, but nearly all of a hum lies below 600 Hz)
  let runA = -1, runB = -1, best = 0;
  for (let m = Math.max(0, 2 * i0 - 4); m <= Math.min(n5 - 1, 2 * i1 + 4);) {
    if (!voiced5[m]) { m++; continue; }
    let e = m, sum = 0;
    while (e < n5 && voiced5[e]) { sum += tot[Math.min(nF - 1, e >> 1)]; e++; }
    if (e - m >= 8 && sum > best) { best = sum; runA = m; runB = e - 1; }
    m = e;
  }
  const hasVowel = runA >= 0;
  let iVs = i1 + 1, iVe = i1 + 1, Lmax = 0, Ocore = 0;
  /** how open the mouth sounds: what is above 600 Hz against what is below, dB */
  const O = (i: number) => dB((mid[i] + hi[i] + pk * 1e-9) / (lo[i] + pk * 1e-9));
  if (hasVowel) {
    const a = Math.max(i0, (runA + 1) >> 1), b = Math.min(i1, runB >> 1);
    let loud = -Infinity;
    for (let i = a; i <= b; i++) if (voiced[i] && L[i] > loud) loud = L[i];
    // how open the vowel is: the upper quarter of the frames that could be it (one frame at
    // the start may ring more than the vowel does, a hum before it far less)
    const cand: number[] = [];
    for (let i = a; i <= b; i++) if (voiced[i] && !noisy[i] && L[i] >= loud - 12) cand.push(O(i));
    if (cand.length) { cand.sort((p, q) => p - q); Ocore = cand[Math.min(cand.length - 1, Math.floor(cand.length * 0.75))]; }
    else Ocore = O(a);
    const inVowel = (i: number) => voiced[i] && !noisy[i] && L[i] >= loud - 12 && O(i) >= Ocore - 9;
    // the vowel: the stretch of such frames that carries the most sound
    let bestSum = -1;
    iVs = a;
    let c1 = a;
    for (let i = a; i <= b;) {
      if (!inVowel(i)) { i++; continue; }
      let e = i, sum = 0;
      while (e <= b && inVowel(e)) { sum += tot[e]; e++; }
      if (sum > bestSum) { bestSum = sum; iVs = i; c1 = e - 1; }
      i = e;
    }
    if (bestSum < 0) { for (let i = a; i <= b; i++) if (L[i] > L[iVs]) iVs = i; c1 = iVs; }
    // the vowel's own level: every level from here on is against it
    Lmax = -Infinity;
    for (let i = iVs; i <= c1; i++) if (L[i] > Lmax) Lmax = L[i];
    iVe = c1;
    while (iVe + 1 <= b && voiced[iVe + 1] && !noisy[iVe + 1] && L[iVe + 1] >= Lmax - 15) iVe++;
    cues.vowelDuration = (iVe - iVs + 1) * HOP;
    heard.marks.vowel = [iVs * HOP, (iVe + 1) * HOP];
    const fs0: number[] = [];
    for (let m = 2 * iVs; m <= 2 * iVe && m < n5; m++) if (voiced5[m] && f5[m] > 0) fs0.push(f5[m]);
    heard.pitch = fs0.length ? median(fs0) : null;
  }
  const tVs = iVs * HOP;
  {
    let v = 0;
    for (let i = i0; i < iVs; i++) if (voiced[i]) v++;
    cues.onset = Math.max(0, iVs - i0) * HOP;
    cues.onsetVoiced = iVs > i0 ? v / (iVs - i0) : 0;
  }

  // ---- before the vowel: the hiss that runs up to it
  {
    let i = iVs - 1, skip = 0;
    // (between a hiss and its vowel the voice may already be on for a few frames)
    while (i >= i0 && !noisy[i] && (skip < 2 || (skip < 4 && voiced[i]))) { i--; skip++; }
    let end = -1, start = -1, hole = 0;
    for (; i >= i0; i--) {
      if (noisy[i]) { if (end < 0) end = i; start = i; hole = 0; } else if (end >= 0 && ++hole > 1) break; else if (end < 0) break;
    }
    if (end >= 0) {
      let n = 0, v = 0, last = false;
      for (let k = start; k <= end; k++) if (noisy[k]) { n++; last = voiced[k]; if (last) v++; }
      cues.frication = n * HOP;
      // (its last frame already has the vowel in it)
      cues.hissVoiced = n >= 4 ? (v - (last ? 1 : 0)) / (n - 1) : v / n;
      heard.marks.hiss = [start * HOP, (end + 1) * HOP];
      // its centre of gravity: the louder half of its frames, the room taken away
      const frames: number[] = [];
      for (let k = start; k <= end; k++) if (noisy[k]) frames.push(k);
      frames.sort((p, q) => hissE[q] - hissE[p]);
      const use = frames.slice(0, Math.max(1, Math.ceil(frames.length * 0.6)));
      const from = bin(v / n >= 0.5 ? 2000 : 1500);
      let num = 0, den = 0;
      for (const k of use) {
        const row = k * (half + 1);
        for (let b = from; b < bTop; b++) { const p = Math.max(0, spec[row + b] - noise[b]); num += p * b; den += p; }
      }
      if (den > 0) cues.hissCentre = ((num / den) * fs) / N;
    }
  }

  // ---- before the vowel: a hum (voice on, no noise, the mouth still closed or nearly)
  let murmurLevel = 0, murmurRing = 0, murmurHighs = 0, highsKnown = false;
  if (hasVowel) {
    const levels: number[] = [], rings: number[] = [], highs: number[] = [];
    let low = 0;
    for (let i = iVs - 1; i >= i0 && voiced[i] && !noisy[i] && L[i] >= Lmax - 30; i--) {
      levels.push(L[i] - Lmax);
      rings.push(O(i));
      highs.push(dB((Math.max(0, hi[i] - nHi) + pk * 1e-12) / (lo[i] + pk * 1e-12)));
      low += lo[i];
    }
    if (levels.length) {
      murmurLevel = levels.reduce((p, q) => p + q, 0) / levels.length;
      // (the middle one of its frames: the last, where the mouth already opens, does not count)
      murmurRing = median(rings);
      murmurHighs = median(highs);
      // can the room's own highs be told from 50 dB below the hum?
      highsKnown = 2 * nHi < (low / levels.length) * 10 ** -5;
    }
    cues.murmur = levels.length * HOP;
    cues.murmurLevel = murmurLevel;
    cues.murmurRing = murmurRing;
  }

  // ---- the fine picture: every millisecond, the sound above 2 kHz and the whole of it
  const eH = envelope(biquad(biquad(x, fs, 'hp', 2000), fs, 'hp', 2000), fs, 0.002);
  const eB = envelope(x, fs, 0.004);
  const nE = eH.length;
  const jA = Math.max(16, Math.round((heard.t0 - 0.03) / FINE)), jV = Math.min(nE - 45, Math.round((tVs + 0.012) / FINE));
  let pkH = 0, pkB = 0;
  for (let j = Math.round(heard.t0 / FINE); j <= Math.round(heard.t1 / FINE) && j < nE; j++) { if (eH[j] > pkH) pkH = eH[j]; if (eB[j] > pkB) pkB = eB[j]; }
  const qH = quiet(eH, pkH);
  // (in a recording without any room noise every start would be a jump out of nothing:
  // the jump is measured from 50 dB below the loudest moment at least)
  const flH = Math.max(qH, pkB * 1e-5);

  // ---- a flutter: quick dips of the level between two voiced moments, 28 to 55 ms apart
  let lastDip = -1;
  if (hasVowel) {
    const a = Math.max(8, Math.round(heard.t0 / FINE)), b = Math.min(nE - 8, Math.round((tVs + 0.03) / FINE));
    const s = new Float64Array(nE);
    for (let j = a - 4; j <= b + 4; j++) { let q = 0; for (let k = -3; k <= 3; k++) q += eB[Math.max(0, Math.min(nE - 1, j + k))]; s[j] = dB(q / 7 / pkB); }
    const ref = dB(maxIn(eB, Math.round(tVs / FINE), Math.round((tVs + 0.08) / FINE)) / pkB);
    const dips: number[] = [];
    for (let j = a + 6; j <= b - 6; j++) {
      let isMin = true;
      for (let k = -12; k <= 12 && isMin; k++) { const q = j + k; if (q >= a && q <= b && s[q] < s[j]) isMin = false; }
      if (!isMin) continue;
      let left = -Infinity, right = -Infinity, jl = j;
      for (let q = Math.max(a, j - 45); q < j; q++) if (s[q] > left) { left = s[q]; jl = q; }
      for (let q = j + 1; q <= Math.min(b + 4, j + 45); q++) if (s[q] > right) right = s[q];
      const fl = Math.min(nF - 1, Math.round((jl * FINE) / HOP));
      const hum = lo[fl] >= 0.25 * (mid[fl] + hi[fl]); // a voice before the dip, not a hiss
      if (Math.min(left, right) - s[j] >= 6 && left >= ref - 14 && hum && (!dips.length || j - dips[dips.length - 1] >= 20)) dips.push(j);
    }
    cues.taps = dips.length;
    lastDip = dips.length ? dips[dips.length - 1] : -1;
    // how fast the sound swells to the vowel's level
    let up = -1;
    for (let j = a; j <= b + 4; j++) if (s[j] >= ref - 4) { up = j; break; }
    if (up >= 0) {
      let down = up;
      while (down > a - 4 && s[down] >= ref - 20) down--;
      cues.attack = (up - down) * FINE;
    }
    let paired = false;
    for (let k = 1; k < dips.length; k++) { const d = (dips[k] - dips[k - 1]) * FINE; if (d >= 0.028 && d <= 0.056) paired = true; }
    cues.trill = paired;
  }

  // ---- a burst: after a closure the highs jump within a dozen milliseconds. Of the jumps before
  // the vowel, the one that lets it go: the first after the last closure, and one that is
  // followed by what follows a burst (the vowel at once, a puff or a hiss, a breathy sigh),
  // not by a quiet hum (the sudden start of an m or a z is no burst); nor is it a tap of a rolled r
  const followsBurst = (j: number): boolean => {
    const t = j * FINE;
    if (cues.trill && j <= lastDip + 25) return false;
    if (!hasVowel || tVs - t <= 0.045) return true;
    let n = 0, hissy = 0, sigh = 0;
    for (let i = Math.round((t + 0.012) / HOP); i < iVs && i < nF; i++) {
      n++;
      if (noisy[i]) hissy++;
      if (voiced[i] && L[i] >= Lmax - 8 && O(i) >= Ocore - 10) sigh++;
    }
    return !n || hissy >= 0.6 * n || sigh >= 0.6 * n;
  };
  let jB = -1, candidate = -1, strength = 0, shut = 0;
  for (let j = jA; j <= jV; j++) {
    // a closure: 25 ms with the highs down at the floor
    shut = eH[j] <= 2 * flH ? shut + 1 : 0;
    if (shut >= 25) candidate = -1;
    const post = maxIn(eH, j, j + 2);
    // (a later jump of the same event counts only if it is far stronger: a click, then the burst)
    if (candidate >= 0 && post < 10 * strength) continue;
    if (post < Math.max(qH * 20, pkB * 10 ** -4.4)) continue;
    // 18 dB above what there was 12 to 26 ms before (the pulses of a voice are closer than
    // that to one another, the slow start of a hiss climbs less in that time), and above
    // the 40 ms before by 15 dB: a closure
    if (dB((post + flH) / (maxIn(eH, j - 26, j - 12) + flH)) < 18) continue;
    if (maxIn(eH, j - 40, j - 12) > post * 0.032) continue;
    candidate = j;
    strength = maxIn(eH, j, j + 8);
    jB = followsBurst(j) ? j : -1;
  }
  // the first millisecond of the jump
  if (jB >= 0) { const post = maxIn(eH, jB, jB + 2); while (jB > jA && eH[jB - 1] > post * 0.1) jB--; }
  cues.burst = jB >= 0;
  const tB = jB * FINE;
  if (cues.burst) heard.marks.burst = tB;

  // ---- the voice against the burst
  const tRun = hasVowel ? runA * 0.005 : NaN;
  if (hasVowel) heard.marks.voice = tRun;
  let lead = 0, lag: number | null = null, breathy: boolean | null = null;
  if (cues.burst && hasVowel) {
    if (tRun <= tB - 0.015) lead = tB - tRun;
    else {
      // (the hum of a closure often dies a moment before the burst, or the burst cuts it:
      // a stretch of voice of its own, 30 ms at least, that ends within 50 ms of the burst)
      let m = Math.min(runA - 1, Math.round((tB - 0.005) / 0.005));
      const stop = Math.max(0, Math.round((tB - 0.05) / 0.005));
      while (m > stop && !voiced5[m]) m--;
      if (m >= 0 && voiced5[m]) {
        let a = m;
        while (a > 0 && voiced5[a - 1]) a--;
        if (m - a + 1 >= 6) lead = tB - a * 0.005;
      }
    }
    // the pitch period at the start of the vowel, and how low the highs fall between two pulses of a clean voice
    const f0s: number[] = [];
    for (let m = 2 * iVs; m <= 2 * iVs + 12 && m < n5; m++) if (f5[m] > 0) f0s.push(f5[m]);
    const T0 = 1 / Math.max(80, Math.min(450, f0s.length ? median(f0s) : heard.pitch ?? 150));
    const tw = Math.max(3, Math.round((1.25 * T0) / FINE));
    const sA = Math.round((tVs + 0.04) / FINE), sB = Math.round(Math.min((iVe + 1) * HOP, tVs + 0.16) / FINE) - tw;
    const lows: number[] = [], highs: number[] = [];
    for (let j = sA; j <= sB; j += 2) { lows.push(minIn(eH, j, j + tw)); highs.push(maxIn(eH, j, j + tw)); }
    const trough = median(lows), crest = median(highs);
    // (pulse by pulse only for a low voice, above about 170 Hz the pulses come too close to tell
    // them apart, and only with 60 ms of steady vowel to learn what its clean pulses look like)
    if (sB - sA >= 60 && crest >= 4 * trough && T0 >= 0.0058) {
      // clean voice: three pulses a period apart, and between them the highs fall nearly as
      // low as they do between the pulses of the vowel. (In the gap after a burst there is no
      // next pulse; in a puff or a breathy start the highs do not fall.) The burst itself may
      // be the first of the three: then the voice was there at once
      const P = T0 / FINE;
      const limit = Math.min(nE - Math.ceil(3.2 * P) - 3, jB + 260);
      const next = (j: number): number => {
        const from = j + Math.round(0.6 * P), to = j + Math.round(1.6 * P);
        let q = from;
        for (let k = from; k <= to; k++) if (eH[k] > eH[q]) q = k;
        return eH[q] >= crest / 16 && minIn(eH, j, q) <= 4 * trough ? q : -1;
      };
      for (let j = jB; j <= limit; j++) {
        if (eH[j] < crest / 16 || eH[j] < maxIn(eH, j - 2, j + 2)) continue;
        const q = next(j);
        if (q >= 0 && next(q) >= 0) { lag = Math.max(0, j - jB - 2) * FINE; break; }
      }
      cues.votFine = lag !== null;
    }
    if (lag === null) lag = Math.max(0, tRun - tB);
    cues.vot = Math.round((lead > 0 ? -lead : lag) * 1000) / 1000;
    if (lead > 0) heard.marks.voice = tB - lead;
    // the puff: the time from the burst to the full, open vowel. Long, it is a puff of air;
    // with the voice on all through it and nearly as loud as the vowel, a breathy sigh
    const puff = Math.round(Math.max(0, tVs - tB) * 1000) / 1000;
    cues.puff = puff;
    cues.aspirated = puff >= 0.055;
    if (cues.aspirated) {
      let n = 0, v = 0, lv = 0;
      for (let i = Math.round((tB + 0.012) / HOP); i < iVs && i < nF; i++) { n++; if (voiced[i]) v++; lv += L[i] - Lmax; }
      if (n) breathy = v / n >= 0.6 && lv / n >= -10;
    }
    cues.breathy = breathy;
  }

  // ---- voice at the start
  const firstVoiced = hasVowel && tRun <= heard.t0 + 0.03;
  cues.voiceFirst = firstVoiced && cues.frication < 0.03 && !cues.burst;
  cues.voicedOnset = cues.burst && hasVowel
    ? lead > 0 || (lag !== null && lag <= 0.015 && cues.votFine)
    : cues.frication >= 0.03 ? (cues.hissVoiced ?? 0) >= 0.5 : hasVowel;

  // ---- a hum through the nose (or past the tongue), or the hum of a closure. A nose rings:
  // 20 to 35 dB below its low note there is sound above 600 Hz, and some above 2 kHz; lips or
  // a tongue shut on a b, d, g let through the low note and nothing else. In between, unsure;
  // and the vowel must be the more open of the two for a hum to be told from it at all
  if (hasVowel) {
    const told = Ocore - murmurRing >= 9 && murmurRing <= -14;
    const rings = murmurRing >= -32 || (murmurRing >= -39 && highsKnown && murmurHighs >= -48);
    const shut = murmurRing <= -40 || (murmurRing <= -36 && highsKnown && murmurHighs <= -54);
    if (cues.murmur >= 0.05 && told && rings) cues.nasal = true;
    else if (cues.murmur <= 0.02 || (cues.murmur >= 0.03 && shut)) cues.nasal = false;
    else cues.nasal = null;
  }

  // ---- the vowel's two lowest resonances, from a few moments of its middle
  if (hasVowel && cues.vowelDuration >= 0.04) {
    const D2 = Math.max(1, Math.round(fs / 11025));
    const fs2 = fs / D2;
    const a = Math.max(0, Math.round((tVs - 0.02) * fs)), b = Math.min(len, Math.round(((iVe + 1) * HOP + 0.02) * fs));
    const seg = decimate(x.subarray(a, b), D2);
    const wn = Math.round(0.03 * fs2);
    const f1s: number[] = [], f2s: number[] = [];
    const dur = cues.vowelDuration;
    for (const u of [0.25, 0.35, 0.45, 0.55, 0.65]) {
      const c = Math.round((tVs + u * dur - a / fs) * fs2) - (wn >> 1);
      if (c < 0 || c + wn > seg.length) continue;
      const fm = lpcFormants(seg.subarray(c, c + wn), fs2, Math.round(2 + fs2 / 1000), 500);
      const f1 = fm.find((p) => p.f >= 180 && p.f <= 1300);
      const f2 = f1 && fm.find((p) => p.f >= Math.max(500, f1.f + 150) && p.f <= 3600);
      if (f1 && f2) { f1s.push(f1.f); f2s.push(f2.f); }
    }
    if (f1s.length >= 2) {
      const f1 = Math.round(median(f1s)), f2 = Math.round(median(f2s));
      // (in noise the weak second resonance of a back vowel is lost, and a false one found far
      // above: one is believed only where the vowel, the room taken away, has its sound)
      const k = sizeFactor(heard.pitch);
      const band = (fa: number, fb: number) => {
        let e = 0;
        for (let i = iVs; i <= iVe; i++) { const row = i * (half + 1); for (let q = bin(fa); q < bin(fb); q++) e += Math.max(0, spec[row + q] - noise[q]); }
        return e;
      };
      const below = band(600 * k, 1500 * k), above = band(1700 * k, 3500 * k);
      const believed = f2 >= 1700 * k ? above >= 0.5 * below : f2 <= 1300 * k ? below >= above : true;
      // (and a low first resonance only if the sound is not, in truth, strong where an open vowel has its own)
      const closed = f1 > 430 * k || band(550 * k, 1100 * k) < 0.5 * band(150, 450 * k);
      if (believed && closed) cues.vowel = { f1, f2 };
    }
  }
  return heard;
}

// ------------------------------------------------------------------ judge

type Verdict = boolean | null;
const W: Record<string, number> = { manner: 3, voice: 3, puff: 2, hiss: 2, vowel: 2, length: 1, place: 0, nose: 0 };

/** How much taller than a grown man's the speaker's resonances are, from the pitch: a woman about 1.15, a child about 1.3. */
function sizeFactor(pitch: number | null): number {
  if (!pitch) return 1.1;
  return Math.max(1, Math.min(1.35, 1 + (pitch - 130) / 520));
}

const SHARP = new Set(['s', 'z', 'sˤ', 'ts', 'dz']);
/** the hisses too soft, or too like one another, to place by ear */
const SOFT = new Set(['f', 'v', 'θ', 'ð', 'ðˤ', 'h', 'ħ', 'ɣ', 'x', 'ʕ']);
/** made in a place an ear cannot tell from its neighbour */
const SUBTLE: Record<string, string> = {
  'ʈ': 'tongue tip curled back, not on the teeth', 'ɖ': 'tongue tip curled back, not on the teeth', 'ɳ': 'tongue tip curled back', 'ɽ': 'tongue tip curled back',
  'ʂ': 'tongue tip curled back', q: 'far back, deeper than k', 'sˤ': 'a heavy s: the back of the tongue pulled back', 'tˤ': 'a heavy t: the back of the tongue pulled back',
  'dˤ': 'a heavy d: the back of the tongue pulled back', 'ðˤ': 'a heavy th: the back of the tongue pulled back', 'ħ': 'squeezed deep in the throat', 'ʕ': 'squeezed deep in the throat',
  'ʔ': 'a catch in the throat',
};

const HEIGHT: Record<string, 'open' | 'mid' | 'close'> = { a: 'open', 'ɑ': 'open', 'æ': 'open', e: 'mid', 'ɛ': 'mid', o: 'mid', 'ɔ': 'mid', 'ə': 'mid', 'ʌ': 'mid', i: 'close', 'ɪ': 'close', u: 'close', 'ʊ': 'close' };
const FRONT: Record<string, 'front' | 'central' | 'back'> = { i: 'front', 'ɪ': 'front', e: 'front', 'ɛ': 'front', 'æ': 'front', a: 'central', 'ə': 'central', 'ʌ': 'central', 'ɑ': 'back', u: 'back', 'ʊ': 'back', o: 'back', 'ɔ': 'back' };
const VOWEL_WANT: Record<string, string> = {
  a: 'mouth wide open: aaa', 'ə': 'mouth half open, relaxed: uh', 'ɪ': 'a small smile: i', i: 'a big smile, mouth nearly closed: ee', 'ʊ': 'lips a little round: u',
  u: 'lips round and forward, mouth nearly closed: oo', e: 'a half smile: e', 'ɛ': 'an open smile: e', o: 'lips round: o', 'ɔ': 'open and round: aw',
};

function vowelFinding(ipa: string, heard: Heard): Finding {
  const want = VOWEL_WANT[ipa] ?? 'the right vowel';
  const v = heard.cues.vowel;
  if (!v) return { id: 'vowel', title: 'Vowel', want, got: 'the vowel was too short or too soft to tell', ok: null };
  const k = sizeFactor(heard.pitch);
  const f1 = v.f1 / k, f2 = v.f2 / k;
  const height = f1 >= 600 ? 'open' : f1 <= 430 ? 'close' : 'mid';
  const front = f2 >= 1750 ? 'front' : f2 <= 1250 ? 'back' : 'central';
  const mouth = height === 'open' ? 'mouth open' : height === 'close' ? 'mouth nearly closed' : 'mouth half open';
  const tongue = front === 'front' ? 'a smiling sound, tongue forward' : front === 'back' ? 'a round sound, tongue back' : 'tongue in the middle';
  // (with the mouth wide open the tongue lies low wherever it is: only the mouth is told)
  const got = height === 'open' && front !== 'front' ? mouth : `${mouth}, ${tongue}`;
  const wantH = HEIGHT[ipa] ?? 'mid', wantF = FRONT[ipa] ?? 'central';
  let ok: Verdict = null;
  let tip: string | undefined;
  // right when both are where they should be; wrong only when one is clearly at the other end
  const hOk = wantH === 'open' ? f1 >= 560 : wantH === 'close' ? f1 <= (ipa === 'ɪ' || ipa === 'ʊ' ? 540 : 480) : f1 >= 330 && f1 <= 720;
  const hBad = wantH === 'open' ? f1 <= 430 : wantH === 'close' ? f1 >= 640 : false;
  const fOk = wantF === 'front' ? f2 >= 1650 : wantF === 'back' ? f2 <= (ipa === 'ʊ' ? 1450 : 1300) : f2 >= 1000 && f2 <= 1900;
  const fBad = wantF === 'front' ? f2 <= 1250 : wantF === 'back' ? f2 >= 1800 : false;
  if (hBad || fBad) {
    ok = false;
    tip = hBad
      ? wantH === 'open' ? 'Open your mouth wide, like at the doctor: aaa.' : 'Close your mouth more: only a small gap.'
      : wantF === 'front' ? 'Smile and push your tongue forward.' : 'Make your lips round and pull your tongue back.';
  } else if (hOk && fOk) ok = true;
  return { id: 'vowel', title: 'Vowel', want, got, ok, tip };
}

/** What the voice did against the pop: before it, at it, after it. */
function voicing(c: Heard['cues']): 'lead' | 'at' | 'unsure' | 'after' | 'late' | null {
  if (!c.burst || c.vot === null) return null;
  if (c.vot <= -0.02) return 'lead';
  if (c.vot >= 0.03) return 'late';
  // (timed only roughly, a voice "at" the pop may as well be a little after it, or before)
  if (!c.votFine) return 'unsure';
  if (c.vot >= 0.022) return 'after';
  if (c.vot <= 0.015) return 'at';
  return 'unsure';
}

/**
 * Sets what was heard against what the letter asks for. `sound` is the
 * letter's sound in the symbols of the model ('pʰ', 'ʃ', 'a', 'ã'); `say`
 * is what was to be said, in the compact form ('pʰa', 'ʃa', 'aː').
 */
export function judge(heard: Heard, target: { sound: string; say: string }): Report {
  if (heard.silent) return { heard, findings: [], score: 0, stars: 0, headline: "I couldn't hear you: come closer and try again" };
  const c = heard.cues;
  const phones = compactPhones(target.say || target.sound);
  const isVowel = (ipa: string) => PHONEMES[ipa]?.manner === 'vowel';
  const first = phones[0];
  const onset: Phoneme | null = first && !isVowel(first.ipa) ? PHONEMES[first.ipa] : !first && PHONEMES[target.sound] && !isVowel(target.sound) ? PHONEMES[target.sound] : null;
  const vi = phones.findIndex((p) => isVowel(p.ipa));
  const vowel = vi >= 0 ? phones[vi] : isVowel(target.sound) ? { ipa: target.sound } : target.sound === 'ã' ? { ipa: 'a', nasal: true } : null;
  const vowelIsLesson = target.sound === 'ã' || isVowel(target.sound);
  const findings: Finding[] = [];
  const add = (id: string, title: string, want: string, got: string, ok: Verdict, tip?: string) => { findings.push(ok === false && tip ? { id, title, want, got, ok, tip } : { id, title, want, got, ok }); };
  const manner = onset?.manner ?? 'vowel';
  const ipa = onset?.ipa ?? '';
  const v = voicing(c);
  const lagMs = c.vot !== null && c.vot > 0 ? ms(c.vot) : '';
  const startsVoiced = c.voiceFirst || c.murmur >= 0.03 || (c.voicedOnset && !c.burst && c.frication < 0.03);
  const hissed = c.frication >= 0.05;
  /** the room is quiet enough for a soft hiss, a hum or a weak pop to have been heard: only then is its absence held against the learner */
  const clear = heard.snr >= 38;
  /** a hum that rings came before the vowel: a nose, or the sides of the tongue */
  const ringing = c.nasal === true && c.murmur >= 0.05;

  // ---- the voice of a sound that hums or flows: on from the start
  const voiceFromStart = (tip: string) => {
    if (hissed && (c.hissVoiced ?? 0) <= 0.2) add('voice', 'Voice', 'voice ON from the start', 'it started with air, not with the voice', false, tip);
    else if (v === 'late' || v === 'after') add('voice', 'Voice', 'voice ON from the start', `the voice came ${lagMs} after a pop`, false, tip);
    else if (startsVoiced || v === 'lead' || v === 'at') add('voice', 'Voice', 'voice ON from the start', 'voice on from the start', true);
    else add('voice', 'Voice', 'voice ON from the start', 'not clear when the voice started', null);
  };
  /** the place of a sound an ear cannot place */
  const place = () => {
    const where = SUBTLE[ipa] ?? PLACES[guideFor(ipa).place]?.name.toLowerCase() ?? 'the right place';
    add('place', 'Place', where, BY_EYE, null);
  };

  if (ipa === 'ʕ') {
    // the squeezed sound of the throat is voice, creak and breath by turns: nothing in it is judged
    add('manner', 'Kind of sound', 'a squeezed sound from deep in the throat, then the vowel', BY_EYE, null);
    place();
  } else if (manner === 'vowel' || manner === 'glottalStop' || manner === 'silence') {
    // ---- a vowel on its own (after a catch in the throat, for ʔ)
    const want = manner === 'glottalStop' ? 'a clean, sudden start, then the vowel' : 'only the vowel, voice on from the start';
    if (hissed) add('manner', 'Kind of sound', want, c.burst ? 'a pop and a puff came before the vowel' : 'a hiss or a breath came before the vowel', false, 'Start with your voice straight away: no air before it.');
    else if (v === 'late' || v === 'after') add('manner', 'Kind of sound', want, 'a pop came before the vowel', false, 'Start with your voice straight away: no pop before it.');
    else if (c.nasal === true) add('manner', 'Kind of sound', want, 'a hum came before the vowel', false, 'Open your mouth first, then start your voice.');
    else if (c.trill) add('manner', 'Kind of sound', want, 'a flutter came before the vowel', false, 'Keep your tongue still and low.');
    else add('manner', 'Kind of sound', want, manner === 'glottalStop' && c.burst ? 'a sudden start, then the vowel' : 'a clear vowel', true);
    if (manner === 'glottalStop') place();
  } else if (manner === 'stop') {
    const voicedT = onset!.voiced, puffT = !!onset!.aspirated;
    // the kind: a pop. A hum that rings (a nose, the sides of the tongue) before it is another sound
    const POP = 'a pop: closed, then let go';
    if (ringing && (!voicedT || c.murmurRing >= -32)) add('manner', 'Kind of sound', POP, 'a hum like m, n or l came first, not a closed pop', false, 'Close completely, hold the air behind the closure, then let it burst out.');
    else if (c.burst) add('manner', 'Kind of sound', POP, ringing ? 'a pop, after a hum that was not clear' : 'a clear pop', ringing ? null : true);
    else if (c.frication >= (puffT ? 0.15 : 0.07)) add('manner', 'Kind of sound', POP, 'a hiss, not a pop', false, 'Close completely, hold the air, then let go all at once.');
    else if (c.trill) add('manner', 'Kind of sound', POP, 'a flutter, not a pop', false, 'Close completely, then let go once.');
    else if (c.voiceFirst && !voicedT && heard.snr >= 50 && c.attack !== null && c.attack >= 0.04) add('manner', 'Kind of sound', POP, 'no pop: the vowel started softly', false, 'Close completely, hold the air, then let go all at once.');
    else add('manner', 'Kind of sound', POP, 'no clear pop heard', null);
    // the voice. Urdu, Hindi and Arabic hum through the closure of b, d, g: the voice leads the
    // pop. Without that hum a voice right at the pop is the sound of p, t, k
    if (voicedT) {
      const want = 'voice ON before the pop: hum, then pop';
      const tip = 'Hum first with your mouth closed, then let go.';
      if (v === 'lead') add('voice', 'Voice', want, `voice on before the pop (a hum of ${ms(-c.vot!)})`, true);
      else if (puffT && c.breathy) add('voice', 'Voice', want, 'voice on through the breathy sigh', true);
      else if (v === 'late' || v === 'after' || (c.burst && c.aspirated && c.breathy === false)) add('voice', 'Voice', want, lagMs ? `the voice came late (${lagMs} after the pop)` : 'the voice came after the puff', false, tip);
      else if (!c.burst && (startsVoiced || (c.onset >= 0.05 && c.onsetVoiced >= 0.6))) add('voice', 'Voice', want, 'voice on from the start', true);
      else add('voice', 'Voice', want, c.burst ? 'voice right at the pop: no hum heard before it' : 'not clear when the voice started', null);
    } else {
      const want = 'voice OFF until the pop';
      const tip = 'Keep your throat quiet until the pop: only air, then the vowel.';
      if (v === 'lead') add('voice', 'Voice', want, `the voice was already on before the pop (a hum of ${ms(-c.vot!)})`, false, tip);
      else if (c.burst) add('voice', 'Voice', want, 'no voice before the pop', true);
      else if (ringing || (c.murmur >= 0.05 && c.nasal === false)) add('voice', 'Voice', want, 'the voice was on from the start', false, tip);
      else if (c.frication >= 0.04 && (c.hissVoiced ?? 1) <= 0.3) add('voice', 'Voice', want, 'no voice during the puff', true);
      else add('voice', 'Voice', want, 'not clear when the voice started', null);
    }
    // the puff: how long from the pop to the full vowel (without a clear pop, the hiss before the vowel)
    const puff = c.burst ? c.puff : c.frication >= 0.04 ? c.frication : null;
    if (puffT) {
      const want = voicedT ? 'a breathy sigh after the pop, with the voice on' : 'a big puff of air after the pop';
      const name = voicedT ? 'sigh' : 'puff';
      if (puff === null) add('puff', 'Puff of air', want, 'not clear', null);
      else if (puff >= 0.06) add('puff', 'Puff of air', want, `a ${voicedT && c.breathy ? 'breathy sigh' : name} of ${ms(puff)}`, true);
      // (a breathy sigh is voice all through: it is easily taken for the vowel itself, and its absence is not held against the learner)
      else if (puff <= 0.04) add('puff', 'Puff of air', want, voicedT ? 'no clear sigh heard' : 'no puff: the vowel came at once', voicedT ? null : false, 'Blow after the pop, like blowing out a candle.');
      else add('puff', 'Puff of air', want, `a short ${name} (${ms(puff)}): hard to tell`, null);
    } else {
      const want = 'no puff: the vowel comes at once';
      if (puff === null) add('puff', 'Puff of air', want, c.burst ? 'not clear' : 'no clear pop to time it from', null);
      else if (puff <= 0.045) add('puff', 'Puff of air', want, 'the vowel came at once', true);
      else if (puff >= 0.06) add('puff', 'Puff of air', want, `a puff of air (${ms(puff)}) before the vowel`, false, 'Do not blow: let the vowel come right after the pop.');
      else add('puff', 'Puff of air', want, `a short puff (${ms(puff)}): hard to tell`, null);
    }
    place();
  } else if (manner === 'affricate') {
    const voicedT = onset!.voiced, puffT = !!onset!.aspirated;
    const want = 'a pop that turns into a short hiss';
    if (c.frication >= 0.05) add('manner', 'Kind of sound', want, c.burst ? `a pop, then a hiss of ${ms(c.frication)}` : `a hiss of ${ms(c.frication)}; the pop was not clear`, c.burst ? true : null);
    // (the hiss of a voiced one rides on the voice and may be faint: its absence is held only against a voiceless one)
    else if (c.burst && c.puff !== null && c.puff <= 0.04 && !voicedT && clear) add('manner', 'Kind of sound', want, 'a pop without the hiss', false, 'After the pop let the air hiss for a moment: ch.');
    else add('manner', 'Kind of sound', want, c.burst ? 'a pop; the hiss was not clear' : 'no clear pop or hiss heard', null);
    const share = c.hissVoiced;
    if (voicedT) {
      const w = 'voice ON with the hiss: a buzz';
      if (v === 'lead' || (share !== null && share >= 0.5)) add('voice', 'Voice', w, 'voice on with the hiss', true);
      else if (share !== null && c.frication >= 0.04 && share <= 0.2) add('voice', 'Voice', w, 'only air: no voice during the hiss', false, 'Hum while you make it: put a hand on your throat and feel it buzz.');
      else add('voice', 'Voice', w, 'not clear', null);
    } else {
      const w = 'voice OFF during the hiss';
      if (v === 'lead' || (share !== null && share >= 0.6)) add('voice', 'Voice', w, 'the voice was on during the hiss', false, 'Only air: your throat stays quiet until the vowel.');
      else if (share !== null && share <= 0.3) add('voice', 'Voice', w, 'hiss with no voice', true);
      else add('voice', 'Voice', w, 'not clear', null);
    }
    hissFinding();
    if (puffT) {
      const w = voicedT ? 'a breathy sigh after the hiss' : 'a puff of air after the hiss';
      add('puff', 'Puff of air', w, c.frication >= 0.11 ? `a long hiss and puff (${ms(c.frication)})` : c.frication > 0 && c.frication <= 0.06 ? 'a short hiss, no puff' : 'not clear', c.frication >= 0.11 && !voicedT ? true : null);
    }
  } else if (manner === 'fricative' || manner === 'glottal') {
    const voicedT = onset!.voiced;
    const soft = SOFT.has(ipa);
    const want = manner === 'glottal' ? 'a breath of air, then the vowel' : 'a steady hiss before the vowel';
    if (hissed) add('manner', 'Kind of sound', want, `${manner === 'glottal' ? 'a breath' : 'a hiss'} of ${ms(c.frication)}`, true);
    else if (c.burst && c.puff !== null && c.puff <= 0.045 && !(voicedT && c.murmur >= 0.04)) add('manner', 'Kind of sound', want, 'a pop, not a hiss', false, 'Do not close completely: leave a small gap and let the air flow.');
    else if (c.frication >= 0.03) add('manner', 'Kind of sound', want, `a very short hiss (${ms(c.frication)})`, null);
    else if (soft || !clear || (voicedT && (c.murmur >= 0.04 || (c.onset >= 0.04 && c.onsetVoiced >= 0.6)))) add('manner', 'Kind of sound', want, voicedT && clear ? 'a buzz without a clear hiss' : 'the hiss was too soft to hear', null);
    else add('manner', 'Kind of sound', want, 'no hiss heard', false, 'Let the air hiss for a moment before the vowel.');
    const share = c.hissVoiced;
    if (voicedT) {
      const w = 'voice ON during the hiss: a buzz';
      const tip = 'Hum while you hiss: put a hand on your throat and feel it buzz.';
      if (c.frication >= 0.04 && share !== null) {
        if (share >= 0.5) add('voice', 'Voice', w, 'a buzz: voice and hiss together', true);
        else if (share <= 0.3) add('voice', 'Voice', w, 'only hiss, no voice', false, tip);
        else add('voice', 'Voice', w, 'not clear', null);
      } else if (c.murmur >= 0.04 || c.voiceFirst || (c.onset >= 0.05 && c.onsetVoiced >= 0.6)) add('voice', 'Voice', w, 'voice on from the start', true);
      else add('voice', 'Voice', w, 'not clear', null);
    } else {
      const w = manner === 'glottal' ? 'only air first, then the voice' : 'voice OFF during the hiss';
      const tip = 'Only air: your throat stays quiet until the vowel.';
      if (c.frication >= 0.04 && share !== null) {
        if (share <= 0.3) add('voice', 'Voice', w, 'hiss with no voice', true);
        else if (share >= 0.6) add('voice', 'Voice', w, 'the voice was on during the hiss', false, tip);
        else add('voice', 'Voice', w, 'not clear', null);
      } else if (!c.burst && (c.murmur >= 0.05 || (c.onset >= 0.05 && c.onsetVoiced >= 0.7))) add('voice', 'Voice', w, 'the voice was on from the start', false, tip);
      else add('voice', 'Voice', w, 'not clear', null);
    }
    if (soft || SUBTLE[ipa]) place();
    if (!soft) hissFinding();
  } else if (manner === 'nasal') {
    const want = 'a hum through the nose, then the vowel: no pop, no hiss';
    if (hissed) add('manner', 'Kind of sound', want, 'a hiss came first', false, 'Close your mouth and hum: the air goes out through your nose.');
    else if (c.burst && (v === 'late' || v === 'after' || c.aspirated)) add('manner', 'Kind of sound', want, 'a pop, not a hum', false, 'Close your mouth and hum first: mmm, then open.');
    else if (c.nasal === true) add('manner', 'Kind of sound', want, `a soft hum of ${ms(c.murmur)}, then the vowel`, true);
    else if (c.nasal === false && c.murmur >= 0.05) add('manner', 'Kind of sound', want, 'a hum with the mouth shut, like b: nothing came through the nose', false, 'Let the air out through your nose while you hum: mmm.');
    else if (c.nasal === false && clear) add('manner', 'Kind of sound', want, 'no hum before the vowel', false, 'Close your mouth and hum first: mmm, then open.');
    else add('manner', 'Kind of sound', want, 'the hum was not clear', null);
    voiceFromStart('Hum from the very start: feel your throat buzz.');
    place();
  } else if (manner === 'trill' || manner === 'tap') {
    const want = manner === 'trill' ? 'the tongue tip flutters: rrr' : 'one quick flick of the tongue';
    if (hissed) add('manner', 'Kind of sound', want, 'a hiss came first', false, 'Keep your voice on and let the tongue tip tap.');
    else if (c.trill) add('manner', 'Kind of sound', want, `the tongue tip fluttered (${c.taps} taps)`, true);
    else if (c.taps >= 1) add('manner', 'Kind of sound', want, 'one quick tap of the tongue', true);
    // (a single tap at the very start of a word leaves no dip to hear: its absence is not held against the learner)
    else add('manner', 'Kind of sound', want, manner === 'trill' ? 'the flutter was not clear' : 'the flick was not clear', null);
    voiceFromStart('Keep your voice on while the tongue taps.');
    if (manner === 'tap' || SUBTLE[ipa]) place();
  } else {
    // ---- a lateral or an approximant: smooth, voiced
    const want = 'a smooth start with the voice on: no pop, no hiss';
    if (hissed) add('manner', 'Kind of sound', want, 'a hiss came first', false, 'Let the air flow softly, without a hiss.');
    else if (c.burst && (v === 'late' || v === 'after' || c.aspirated)) add('manner', 'Kind of sound', want, 'a pop came first', false, 'Do not hold the air: start softly with your voice.');
    else if (c.trill) add('manner', 'Kind of sound', want, 'a flutter of the tongue', false, 'Keep the tongue still: let the sound flow smoothly.');
    else if (c.burst && c.nasal === false && v === 'lead') add('manner', 'Kind of sound', want, 'a hum with the mouth shut, then a pop: like b', false, 'Do not close completely: let the sound flow.');
    else if (startsVoiced || v === 'lead' || v === 'at') add('manner', 'Kind of sound', want, 'smooth and voiced', true);
    else add('manner', 'Kind of sound', want, 'not clear', null);
    voiceFromStart('Start with your voice straight away.');
    place();
  }

  // ---- the vowel, when it is the lesson; its length; the nose
  if (vowel && (vowelIsLesson || manner === 'vowel' || manner === 'glottalStop')) {
    findings.push(vowelFinding(vowel.ipa, heard));
    const long = !!(vowel as { long?: boolean }).long;
    const d = c.vowelDuration;
    if (long) {
      add('length', 'Length', 'a long vowel: hold it', d > 0 ? `held for ${ms(d)}` : 'not clear', d >= 0.2 ? true : d > 0 && d < 0.12 ? false : null, 'Hold the vowel longer: count one, two.');
    } else if (vowelIsLesson) {
      add('length', 'Length', 'a short vowel: quick', d > 0 ? `held for ${ms(d)}` : 'not clear', d > 0 && d <= 0.26 ? true : d >= 0.42 ? false : null, 'Make it short and quick.');
    }
    if ((vowel as { nasal?: boolean }).nasal || target.sound === 'ã') add('nose', 'Through the nose', 'air through the nose and the mouth together', "can't be judged by ear: pinch your nose, the sound should change", null);
  }
  // a sound that comes after the vowel (the m of a shadda, the breath of a visarga) is not judged
  if (!vowelIsLesson && PHONEMES[target.sound] && onset?.ipa !== target.sound) add('place', 'After the vowel', 'the sound that follows the vowel', BY_EYE, null);

  /** s against sh: the centre of the hiss, scaled to the speaker */
  function hissFinding(): void {
    const sharp = SHARP.has(ipa);
    const want = sharp ? 'a sharp, high hiss: sss' : 'a softer, lower hiss: shh';
    const centre = c.hissCentre;
    if (centre === null || c.frication < 0.05) { add('hiss', 'Hiss', want, 'no hiss to listen to', null); return; }
    // (the pitch says only roughly how small the mouth is: it moves the border by half of what it would, and the middle is left wide)
    const edge = 4700 * (1 + 0.6 * (sizeFactor(heard.pitch) - 1));
    const kHz = `${(centre / 1000).toFixed(1)} kHz`;
    // (the short hiss of ch and j, made further forward in Urdu and Hindi, falls in the wide middle)
    const high = centre >= edge * 1.2, low = centre <= edge * 0.95;
    if (sharp) add('hiss', 'Hiss', want, high ? `a sharp, high hiss (${kHz})` : low ? `a lower hiss, like shh (${kHz})` : `between sss and shh (${kHz})`, high ? true : low ? false : null, 'Smile a little and bring the tongue tip close behind the top teeth: sss.');
    else add('hiss', 'Hiss', want, low ? `a soft, lower hiss (${kHz})` : high ? `a sharp hiss, like sss (${kHz})` : `between shh and sss (${kHz})`, low ? true : high ? false : null, 'Push your lips forward and pull the tongue back a little: shh.');
  }

  // ---- the score: the share of what was right in what could be told
  const weight = (f: Finding) => (f.id === 'vowel' && vowelIsLesson) || (f.id === 'puff' && onset?.aspirated) ? 3 : W[f.id] ?? 1;
  let sum = 0, right = 0;
  for (const f of findings) {
    if (f.ok === null) continue;
    sum += weight(f);
    if (f.ok) right += weight(f);
  }
  if (!sum) return { heard, findings, score: 50, stars: 1, headline: "I heard you, but I couldn't judge it: try again, a little closer" };
  const score = Math.round((100 * right) / sum);
  const wrong = findings.filter((f) => f.ok === false).sort((p, q) => weight(q) - weight(p))[0];
  // what matters most and could not be told keeps the third star back
  const unsure = findings.find((f) => f.ok === null && weight(f) >= 3);
  // three stars: everything that matters was heard, and all of it right
  const stars = !wrong && !unsure ? 3 : score >= 50 ? 2 : 1;
  const headline = wrong
    ? stars === 2 ? `Close: watch the ${wrong.title.toLowerCase()}` : `Not yet: work on the ${wrong.title.toLowerCase()}`
    : unsure ? `Sounds right, but the ${unsure.title.toLowerCase()} was not clear: once more` : 'Spot on!';
  return { heard, findings, score, stars, headline };
}
