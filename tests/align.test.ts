/**
 * The aligner on recordings made up here, whose sounds are where they were
 * put: the instant the times of a recording are counted from does not move
 * when it is coded and decoded otherwise, and a final stop is cut where it
 * lets go, however faintly.
 */
import { describe, expect, it } from 'vitest';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { trajectory } from '../src/ui/tutor/motion';
import { fitTo, listen, onset, rise } from '../src/ui/tutor/align';

const FS = 22050;
let seed = 3;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
/** a vowel: a buzz at 120 Hz with two rings */
const vowel = (t: number) => 0.3 * Math.sin(2 * Math.PI * 120 * t) + 0.25 * Math.sin(2 * Math.PI * 720 * t) + 0.15 * Math.sin(2 * Math.PI * 1150 * t);

/** A low-pass filter of one pole, as a coder that drops the top of a hiss: what is left of a faint th is fainter. */
function soften(x: Float32Array, fc: number, fs: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * fc) / fs), y = new Float32Array(x.length);
  let v = 0;
  for (let i = 0; i < x.length; i++) y[i] = v = (1 - a) * x[i] + a * v;
  return y;
}
/** The same sound at another rate (linear interpolation). */
function resample(x: Float32Array, from: number, to: number): Float32Array {
  const y = new Float32Array(Math.floor((x.length * to) / from));
  for (let i = 0; i < y.length; i++) { const p = (i * from) / to, j = Math.floor(p), u = p - j; y[i] = (x[j] ?? 0) * (1 - u) + (x[j + 1] ?? 0) * u; }
  return y;
}

describe('the aligner', () => {
  it('counts a recording\'s times from a steep rise, which coding and decoding at another rate do not move', () => {
    // "thalātha": a th that fades in over 60 ms, 30 dB under the vowel after it
    const x = new Float32Array(Math.round(0.6 * FS));
    for (let i = 0; i < x.length; i++) {
      const t = i / FS;
      if (t >= 0.05 && t < 0.15) x[i] = 0.03 * Math.min(1, (t - 0.05) / 0.06) * noise();
      else if (t >= 0.15 && t < 0.5) x[i] = vowel(t) * Math.min(1, (t - 0.15) / 0.004);
    }
    const coded = resample(soften(x, 3000, FS), FS, 48000);
    const r0 = rise(listen(x, FS)), r1 = rise(listen(coded, 48000));
    const o0 = onset(listen(x, FS)), o1 = onset(listen(coded, 48000));
    // the vowel starts at 0.15 s: the rise is there, wherever the faint th starts to be heard
    expect(Math.abs(r0 - 0.15)).toBeLessThan(0.012);
    expect(Math.abs(r1 - r0)).toBeLessThan(0.002);
    // (the first moment heard, which the times were counted from before, moves more than that)
    expect(Math.abs(o1 - o0)).toBeGreaterThan(Math.abs(r1 - r0));
  });

  it('tells the puff after a stop from the soft i after it: the puff is air, the i a voice ("thī")', () => {
    // a long a, the closure of the t, its puff (noise, 70 ms), then an ī said softly: its ring is weak, most of
    // it the hum of the voice, as a voice says a long close vowel at the end of a word
    const x = new Float32Array(Math.round(0.8 * FS));
    for (let i = 0; i < x.length; i++) {
      const t = i / FS;
      if (t >= 0.02 && t < 0.22) x[i] = vowel(t);
      else if (t >= 0.27 && t < 0.34) x[i] = 0.05 * noise();
      else if (t >= 0.34 && t < 0.62) x[i] = (0.35 * Math.sin(2 * Math.PI * 160 * t) + 0.2 * Math.sin(2 * Math.PI * 320 * t) + 0.004 * Math.sin(2 * Math.PI * 2400 * t)) * Math.min(1, (0.62 - t) / 0.1);
    }
    const ps = compactPhones('aːtʰiː');
    ps[0].stress = true; ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
    const score = buildScore(ps, { lang: 'hi', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
    const fit = fitTo(listen(x, FS), score.phones, trajectory(score));
    const { audio, kinds } = fit.knots;
    expect(kinds).toEqual(['open', 'hold', 'puff', 'close']);
    // the ī starts where the voice comes back, not 100 ms into it
    expect(Math.abs(audio[3] - 0.34)).toBeLessThan(0.02);
    expect(Math.abs(audio[2] - 0.27)).toBeLessThan(0.02);
  });

  it('cuts a final stop where it lets go, even 55 dB under the loudest moment ("ship")', () => {
    const x = new Float32Array(Math.round(0.6 * FS));
    // sh 0.02-0.14, i 0.14-0.30 dying away, the lips shut and silent, then a faint click at 0.36
    for (let i = 0; i < x.length; i++) {
      const t = i / FS;
      if (t >= 0.02 && t < 0.14) x[i] = 0.25 * noise();
      else if (t >= 0.14 && t < 0.3) x[i] = vowel(t) * (t > 0.26 ? Math.max(0, 1 - (t - 0.26) / 0.04) : 1);
      else if (t >= 0.36 && t < 0.375) x[i] = 0.0012 * noise() * (1 - (t - 0.36) / 0.015);
    }
    const ps = compactPhones('ʃɪp');
    ps[1].stress = true; ps[0].wordStart = true; ps[2].wordEnd = true;
    const score = buildScore(ps, { lang: 'en', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
    const fit = fitTo(listen(x, FS), score.phones, trajectory(score));
    const { audio, kinds } = fit.knots;
    expect(kinds.slice(-2)).toEqual(['hold', 'burst']);
    // the burst is the click, not the end of the vowel; the lips stay shut through the silence before it
    const burst = audio[audio.length - 2];
    expect(burst).toBeGreaterThan(0.33);
    expect(burst).toBeLessThan(0.37);
    expect(audio[audio.length - 3]).toBeLessThan(0.31);
  });
});
