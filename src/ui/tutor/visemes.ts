/**
 * The mouth of a moment, measured the way its photographs are told apart.
 *
 * The mirror (MirrorPhoto.tsx) and the skin of the side view (skin.ts) are
 * photographs of one man's mouth in many shapes: shut, pressed, a little,
 * half and wide open, rounded shut and open, spread, the lip on the teeth,
 * the tongue between them... Each photograph shows the model's posture for
 * one sound (or a fraction of the way from one sound's to another's:
 * PHOTO_POSES). At every frame the model's own posture is measured
 * (`mouthFeatures`) and set against the photographs' (`photoWeights`): the
 * two or three nearest are warped onto one shape and mixed, more of the
 * nearer. The measures change continuously with the posture, and so do the
 * weights: the picture never jumps from one photograph to another, and a
 * posture that is a photograph's shows that photograph whole.
 */
import type { Articulators } from '../../dsp/tract/types';
import type { TractGeometry } from '../../dsp/tract/geometry';
import { CLOSED_AREA, lipsOf } from './readout';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The measures of a mouth the photographs are blended by. */
export interface MouthFeatures {
  /** how far apart the lips are in the middle, cm (0: shut) */
  open: number;
  /** how far apart the front teeth are, cm */
  teeth: number;
  /** the lips rounded, 0..1 */
  round: number;
  /** pushed forward, 0..1 */
  forward: number;
  /** spread back against the teeth, 0..1 */
  spread: number;
  /** pressed together harder than shut, 0..1 */
  press: number;
  /** the lower lip tucked under the top teeth, 0..1 */
  tuck: number;
  /** the tongue's tip out between the teeth, 0..1 */
  tongue: number;
  /** the tongue's tip up behind the top teeth, 0..1 */
  tip: number;
}
export const FEATURE_KEYS: (keyof MouthFeatures)[] = ['open', 'teeth', 'round', 'forward', 'spread', 'press', 'tuck', 'tongue', 'tip'];
/** How much of each measure makes two mouths look different: the unit each is counted in. */
const SCALE: Record<keyof MouthFeatures, number> = { open: 0.3, teeth: 0.45, round: 0.3, forward: 0.45, spread: 0.35, press: 0.5, tuck: 0.3, tongue: 0.3, tip: 0.45 };

export function mouthFeatures(a: Articulators, geom: TractGeometry): MouthFeatures {
  const m = lipsOf(a, geom);
  // how far apart the lips are, continuously: their gap, going to nothing as the opening between them closes
  // (the readout calls lips shut at once below a size; a picture must not jump there)
  const up = geom.solids.find((s) => s.id === 'upperLip'), lo = geom.solids.find((s) => s.id === 'lowerLip');
  const raw = up && lo ? Math.max(0, up.minY - lo.maxY) : m.gap;
  // (the opening the readout judges the lips shut by: the narrowest place the lower lip bounds)
  let area = geom.lipArea;
  for (let i = 2; i <= geom.lastRay; i++) { const h = geom.hits[i]; if (!h.outside && h.lowId === 'lowerLip') area = Math.min(area, h.area); }
  const ease = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
  // (a lower lip tucked under the teeth is not shut by them: the readout does not call it shut)
  const shut = ease((area - CLOSED_AREA) / 0.13), tuck = ease((a.lipTuck - 0.3) / 0.2);
  const open = raw * ease((raw - 0.02) / 0.04) * (shut + (1 - shut) * tuck);
  return {
    open,
    teeth: Math.max(0, geom.slit.vertical),
    round: clamp01(a.lipRound),
    forward: clamp01(a.lipProtrude),
    spread: clamp01(-a.lipProtrude / 0.35),
    // (the lips at rest are shut with lipOpen at -0.3; a bilabial presses them harder)
    press: clamp01((-0.3 - a.lipOpen) / 0.05) * clamp01(1 - open / 0.1),
    tuck: clamp01(a.lipTuck),
    tongue: clamp01((a.tipX - 0.6) / 0.45),
    tip: clamp01((a.tipY - 0.9) / 1.0),
  };
}

/**
 * The posture each photograph shows: a sound's, said as the model says it (at the instant that shows it best),
 * or `f` of the way from one sound's posture to another's. Shared by the mirror's photographs and the side's.
 */
export const PHOTO_POSES: Record<string, [string] | [string, string, number]> = {
  rest: ['rest'], press: ['m'],
  open1: ['rest', 'aː', 0.25], mid: ['ə'], open2: ['rest', 'aː', 0.5], open25: ['rest', 'aː', 0.65], open3: ['rest', 'aː', 0.85], open: ['aː'],
  e: ['eː'], ae: ['æ'], ee: ['ɪ'], spread: ['iː'], s: ['s'],
  kiss: ['w'], round: ['uː'], o: ['oː'], owide: ['ɔ'], sh: ['ʃ'],
  fv: ['f'], th: ['θ'], th1: ['ə', 'θ', 0.6], l: ['l'],
};

/**
 * How much of each photograph a mouth shows (0..1, adding up to 1), from the measures of the mouth and of
 * each photograph. The nearer a photograph, the more of it (by the inverse of its distance to a `power`); and a
 * photograph much farther than the nearest is faded out altogether, smoothly, by how much less it has than the
 * nearest: so only the few near ones are mixed, each coming in and going out without a jump, however many are
 * about as near. A mouth that is a photograph's shows it whole. At most `most` are given (the faintest left out).
 */
export function photoWeights(f: MouthFeatures, photos: Record<string, MouthFeatures>, most = 3, power = 2): Record<string, number> {
  const names = Object.keys(photos);
  const near: [string, number][] = names.map((n) => {
    const p = photos[n];
    let d = 0;
    for (const k of FEATURE_KEYS) { const v = (f[k] - p[k]) / SCALE[k]; d += v * v; }
    // (d is the square of the distance)
    return [n, 1 / (Math.pow(d, power / 2) + 1e-9)];
  });
  near.sort((a, b) => b[1] - a[1]);
  const top = near[0][1];
  const faded = near.map(([n, w]) => { const u = Math.max(0, Math.min(1, (w / top - FADE[0]) / (FADE[1] - FADE[0]))); return [n, w * u * u * (3 - 2 * u)] as [string, number]; });
  // (more than `most` still shown: each less by the first one left out, which so goes out smoothly)
  const floor = faded.length > most ? faded[most][1] : 0;
  const out: Record<string, number> = {};
  let sum = 0;
  for (let i = 0; i < Math.min(most, faded.length); i++) {
    const v = faded[i][1] - floor;
    if (v > 0) { out[faded[i][0]] = v; sum += v; }
  }
  for (const k in out) out[k] /= sum;
  return out;
}
/** a photograph with less than the first of these of the nearest's share is not shown; with more than the second, wholly */
const FADE: [number, number] = [0.35, 0.8];

/** A photograph of the mirror: its measures, how far apart its lips are (pixels), where the net's knots are on it. */
export interface MorphPhoto { features: MouthFeatures; gap: number; at: ArrayLike<number> }
/** The rows of the mirror's net (scripts/mirror-register.py): the seam under the nose (above it nothing moves), and
 * the lips' inner edges (between them the inside of the mouth). */
export const MORPH_SEAM = 2, MORPH_IU = 6, MORPH_IL = 10;
/** an inside narrower than this (pixels of the photograph) shows nothing of the mouth's inside */
const SHUT_PX = 6;

/** The measures of a mouth as numbers in the units they are told apart by. */
function scaled(f: MouthFeatures): number[] { return FEATURE_KEYS.map((k) => f[k] / SCALE[k]); }

/**
 * The shape of the mirror as a function of the mouth's measures, fitted through every photograph's: a smooth
 * interpolation (radial: distance itself, plus a plane), exact at each photograph, straight between them, so
 * the face moves in proportion to the model's mouth and never faster. Solved once for a set of photographs.
 */
interface Fit { names: string[]; at: number[][]; coef: Float64Array; dims: number; lo: number[]; hi: number[] }
const fits = new WeakMap<object, Fit>();
function fitOf(photos: Record<string, MorphPhoto>): Fit {
  const hit = fits.get(photos);
  if (hit) return hit;
  const names = Object.keys(photos), n = names.length, D = FEATURE_KEYS.length, m = n + D + 1;
  const at = names.map((k) => scaled(photos[k].features));
  // (every knot's x and y, and last how open the mouth is: fitted alike)
  const len = photos[names[0]].at.length + 1;
  // [ K  P ] [c]   [values]
  // [ P' 0 ] [d] = [  0   ]
  const A = new Float64Array(m * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i * m + j] = Math.hypot(...at[i].map((v, q) => v - at[j][q]));
    A[i * m + n] = 1; A[n * m + i] = 1;
    for (let q = 0; q < D; q++) { A[i * m + n + 1 + q] = at[i][q]; A[(n + 1 + q) * m + i] = at[i][q]; }
  }
  // (a measure no photograph varies in is left out of the plane: a little slack keeps the system solvable)
  for (let q = 0; q < D + 1; q++) A[(n + q) * m + n + q] -= 1e-6;
  const B = new Float64Array(m * len);
  for (let i = 0; i < n; i++) { const v = photos[names[i]].at; for (let k = 0; k < len - 1; k++) B[i * len + k] = v[k]; B[i * len + len - 1] = photos[names[i]].features.open; }
  // Gaussian elimination with partial pivoting, all the knots at once
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r * m + c]) > Math.abs(A[p * m + c])) p = r;
    if (p !== c) {
      for (let k = 0; k < m; k++) { const t = A[c * m + k]; A[c * m + k] = A[p * m + k]; A[p * m + k] = t; }
      for (let k = 0; k < len; k++) { const t = B[c * len + k]; B[c * len + k] = B[p * len + k]; B[p * len + k] = t; }
    }
    const d = A[c * m + c] || 1e-12;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const g = A[r * m + c] / d;
      if (!g) continue;
      for (let k = c; k < m; k++) A[r * m + k] -= g * A[c * m + k];
      for (let k = 0; k < len; k++) B[r * len + k] -= g * B[c * len + k];
    }
  }
  for (let r = 0; r < m; r++) { const d = A[r * m + r] || 1e-12; for (let k = 0; k < len; k++) B[r * len + k] /= d; }
  const lo = FEATURE_KEYS.map((_, q) => Math.min(...at.map((v) => v[q]))), hi = FEATURE_KEYS.map((_, q) => Math.max(...at.map((v) => v[q])));
  const fit = { names, at, coef: B, dims: D, lo, hi };
  fits.set(photos, fit);
  return fit;
}

/**
 * The mirror's shape for a mouth: where the knots of its net are (`out`, pixels of the photographs), the
 * photographs mixed for the face and their shares (two at most), and those mixed for the inside of the mouth
 * (only photographs with an open mouth have one). The shape is fitted through every photograph's (`fitOf`); the
 * lips meet when the model's do; and nothing turns over (the rows keep their order down the face).
 */
export function morphShape(photos: Record<string, MorphPhoto>, cols: number, f: MouthFeatures, out: Float32Array): { skin: Record<string, number>; inside: Record<string, number> } {
  const names = Object.keys(photos);
  const feats = Object.fromEntries(names.map((n) => [n, photos[n].features]));
  const skin = photoWeights(f, feats, 4, 2);
  const open = names.filter((n) => photos[n].gap > SHUT_PX);
  const inside = open.length ? photoWeights(f, Object.fromEntries(open.map((n) => [n, photos[n].features])), 4, 2) : skin;
  // ---- the shape (the measures kept within those of the photographs: no shape is guessed beyond them)
  const fit = fitOf(photos), n = fit.names.length, len = out.length, stride = len + 1;
  const x = scaled(f).map((v, q) => Math.max(fit.lo[q], Math.min(fit.hi[q], v)));
  const w = new Float64Array(n + fit.dims + 1);
  for (let i = 0; i < n; i++) w[i] = Math.hypot(...x.map((v, q) => v - fit.at[i][q]));
  w[n] = 1;
  for (let q = 0; q < fit.dims; q++) w[n + 1 + q] = x[q];
  out.fill(0);
  let openMix = 0;
  for (let j = 0; j < w.length; j++) {
    const c = w[j];
    if (!c) continue;
    const off = j * stride;
    for (let k = 0; k < len; k++) out[k] += c * fit.coef[off + k];
    openMix += c * fit.coef[off + len];
  }
  // ---- the lips meet when the model's do: the inside is made as much narrower as the model's mouth is less
  // open than the shape's (how open the shape is: by the same fit, from the photographs' own openings)
  // (a shape barely open itself is closed by as much as the model's lips are less open than a few millimetres)
  const s = Math.max(0, Math.min(1, f.open / Math.max(openMix, 0.15)));
  for (let c = 0; c < cols; c++) {
    const iu = 2 * (MORPH_IU * cols + c) + 1, il = 2 * (MORPH_IL * cols + c) + 1;
    const mid = 0.5 * (out[iu] + out[il]), half = Math.max(0, 0.5 * (out[il] - out[iu]) * s);
    for (let r = MORPH_IU; r <= MORPH_IL; r++) out[2 * (r * cols + c) + 1] = mid - half + (2 * half * (r - MORPH_IU)) / (MORPH_IL - MORPH_IU);
  }
  // ---- nothing turns over: down each column the rows below the seam keep their order
  const rows = len / 2 / cols;
  for (let c = 0; c < cols; c++) {
    for (let r = MORPH_SEAM + 1; r < rows; r++) {
      const here = 2 * (r * cols + c) + 1, above = 2 * ((r - 1) * cols + c) + 1;
      const lip = r > MORPH_IU - 1 && r <= MORPH_IL + 1;
      out[here] = Math.max(out[here], out[above] + (lip ? 0 : 1));
    }
  }
  return { skin, inside };
}


