/**
 * Fits the mouth's movement to a recording of the voice. The model says a
 * sound with its own timing, the recorded voice with another: the picture
 * must follow the recording. Two things are known of each: when it is loud
 * and when it is not (the model's mouth open with voice, closed, hissing;
 * the recording's loudness). The two curves are matched in time (dynamic
 * time warping: every moment of the recording gets the moment of the model
 * that sounds most like it, never going backwards), so that the mouth opens
 * when the recording gets loud and closes when it falls, sound by sound,
 * not only at the two ends.
 */
import { computeGeometry } from '../../dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_TEETH } from '../../dsp/tract/types';
import { poseAt, Trajectory } from './motion';
import { flowOf, narrowest } from './readout';
import type { VoiceClip } from './clips';

const HOP = 0.01;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** How loud the model is at a time, 0..1: an open mouth with voice is loud, a hiss less, a closed mouth silent. */
function loudness(tr: Trajectory, t: number): number {
  const pose = poseAt(tr, t);
  if (!pose) return 0;
  const geom = computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const flow = flowOf(pose, geom);
  const open = clamp01(narrowest(geom).area / 0.6);
  const voiced = flow.voice * (flow.blocked ? (flow.nose > 0.1 ? 0.45 : 0.08) : 0.35 + 0.65 * open);
  const hiss = flow.voice < 0.3 && !flow.blocked ? 0.3 * flow.breath * (1 - 0.6 * open) : 0;
  return clamp01(Math.max(voiced, hiss));
}

/** The recording's loudness every HOP seconds, 0..1 (square root of its level, against its loudest). */
function envelope(rec: VoiceClip): Float32Array {
  const d = rec.buffer.getChannelData(0), sr = rec.buffer.sampleRate;
  const win = Math.max(1, Math.round(sr * HOP));
  const n = Math.max(1, Math.floor(((rec.t1 - rec.t0) * sr) / win));
  const from = Math.round(rec.t0 * sr);
  const env = new Float32Array(n);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = from + i * win, e = Math.min(d.length, j + win); j < e; j++) s += d[j] * d[j];
    env[i] = Math.sqrt(s / win);
    if (env[i] > peak) peak = env[i];
  }
  for (let i = 0; i < n; i++) env[i] = Math.sqrt(env[i] / peak);
  return env;
}

export interface Fit {
  /** the time of the clip for a time of the recording (seconds from its first sample) */
  at: (audio: number) => number;
  /** when the recording's sound is over */
  end: number;
}

const fits = new WeakMap<Trajectory, WeakMap<VoiceClip, Fit>>();

/** The fit of a movement to a recording (kept: it is worked out once for each pair). */
export function fit(tr: Trajectory, rec: VoiceClip): Fit {
  let byRec = fits.get(tr);
  if (!byRec) fits.set(tr, (byRec = new WeakMap()));
  let f = byRec.get(rec);
  if (!f) byRec.set(rec, (f = make(tr, rec)));
  return f;
}

function make(tr: Trajectory, rec: VoiceClip): Fit {
  // the model's loudness through its sounds, and where it is first and last heard
  const nm = Math.max(2, Math.round(tr.speech / (tr.dt * 5)));
  const step = tr.speech / nm;
  const m = new Float32Array(nm + 1);
  for (let i = 0; i <= nm; i++) m[i] = loudness(tr, i * step);
  let a = 0, b = nm;
  while (a < nm && m[a] < 0.12) a++;
  while (b > a && m[b] < 0.12) b--;
  const on = a * step, off = Math.max(on + step, b * step);
  const env = envelope(rec);
  const na = env.length, span = rec.t1 - rec.t0;
  const mm = m.subarray(a, b + 1), nmm = mm.length;
  /** for each moment of the recording, how far through the model's sound (0..1) */
  const map = new Float32Array(na);
  const linear = () => { for (let j = 0; j < na; j++) map[j] = na > 1 ? j / (na - 1) : 0; };
  if (nmm < 4 || na < 4) linear();
  else {
    // the model's curve, brought to the recording's number of steps so the two can be matched step for step
    const K = na;
    const ms = new Float32Array(K);
    for (let i = 0; i < K; i++) { const x = (i * (nmm - 1)) / (K - 1), i0 = Math.floor(x), i1 = Math.min(nmm - 1, i0 + 1); ms[i] = mm[i0] + (mm[i1] - mm[i0]) * (x - i0); }
    // matched within a band about the diagonal: a sound may come up to 30 % early or late, no more
    const band = Math.max(3, Math.round(K * 0.3));
    const INF = 1e9;
    const cost = new Float32Array(K * K).fill(INF);
    const back = new Int8Array(K * K);
    for (let j = 0; j < K; j++) {
      for (let i = Math.max(0, j - band); i <= Math.min(K - 1, j + band); i++) {
        const d = Math.abs(env[j] - ms[i]) + 0.02 * Math.abs(i - j) / K;
        if (i === 0 && j === 0) { cost[0] = d; continue; }
        let best = INF, way = 0;
        if (i > 0 && j > 0 && cost[(j - 1) * K + i - 1] < best) { best = cost[(j - 1) * K + i - 1]; way = 0; }
        if (j > 0 && cost[(j - 1) * K + i] + 0.03 < best) { best = cost[(j - 1) * K + i] + 0.03; way = 1; }
        if (i > 0 && cost[j * K + i - 1] + 0.03 < best) { best = cost[j * K + i - 1] + 0.03; way = 2; }
        cost[j * K + i] = d + best;
        back[j * K + i] = way;
      }
    }
    if (cost[K * K - 1] >= INF) linear();
    else {
      const sum = new Float32Array(K), cnt = new Float32Array(K);
      let i = K - 1, j = K - 1;
      for (;;) {
        sum[j] += i; cnt[j]++;
        if (i === 0 && j === 0) break;
        const way = back[j * K + i];
        if (way === 0) { i--; j--; } else if (way === 1) j--; else i--;
        if (i < 0 || j < 0) break;
      }
      for (let q = 0; q < K; q++) map[q] = cnt[q] ? sum[q] / cnt[q] / (K - 1) : q / (K - 1);
      // smooth, and never backwards: a mouth does not jump
      const sm = new Float32Array(K);
      for (let q = 0; q < K; q++) { let s = 0, c = 0; for (let w = -4; w <= 4; w++) { const r = q + w; if (r >= 0 && r < K) { s += map[r]; c++; } } sm[q] = s / c; }
      sm[0] = 0; sm[K - 1] = 1;
      for (let q = 1; q < K; q++) map[q] = Math.max(sm[q], map[q - 1] = q === 1 ? sm[0] : map[q - 1]);
    }
  }
  const at = (audio: number): number => {
    const el = audio - rec.t0;
    // before the sound: the mouth is on its way, in real time, to where the sound starts
    if (el <= 0) return Math.max(0, on + el);
    if (el >= span) return off;
    const x = (el / span) * (na - 1), j0 = Math.floor(x), j1 = Math.min(na - 1, j0 + 1);
    const u = map[j0] + (map[j1] - map[j0]) * (x - j0);
    return on + (off - on) * u;
  };
  return { at, end: rec.t1 };
}
