/**
 * What the mouth is doing at one instant, in plain words: the lips, the
 * tongue, the way to the nose, the voice and the air. Everything is read
 * from the same geometry the pictures are drawn from, so the words and the
 * pictures cannot disagree: if the tongue's tip touches behind the top teeth
 * in the picture, that is what the words say.
 */
import { computeGeometry, TractGeometry, SolidId } from '../../dsp/tract/geometry';
import { Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../../dsp/tract/types';
import { PHONEMES } from '../../dsp/speech/phonemes';
import type { Pose } from './motion';

/** below this area (cm²) a passage counts as closed */
export const CLOSED_AREA = 0.02;
/** below this area (cm²) a passage is narrow enough to hiss */
export const NARROW_AREA = 0.26;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * The mouth at rest, where every movement starts from and comes back to: the
 * tongue as for a relaxed, neutral vowel, the teeth almost together, the
 * lips closed and the soft palate down, as a mouth is when it is not
 * speaking and breathes through the nose.
 */
export const REST_ART: Articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, jaw: 0.15, lipOpen: -0.3, lipRound: 0, lipProtrude: 0, velum: 0.35 };
let rest: TractGeometry | null = null;
export const restGeom = (): TractGeometry => (rest ??= computeGeometry(REST_ART, DEFAULT_ANATOMY, DEFAULT_TEETH));

export interface Narrowing {
  /** area of the passage, cm² */
  area: number;
  /** the ray it is at */
  at: number;
  /** how far along the tract (canonical cm from the larynx: about 5 the throat, 10 the soft palate, 15 the ridge, 16.5 the teeth, 18 the lips) */
  sc: number;
  /** what bounds it below and above */
  low: SolidId | null;
  up: SolidId | null;
}

/** The narrowest place of the mouth and throat above the larynx (with `only`, the narrowest one made by that part). */
export function narrowest(geom: TractGeometry, only?: SolidId): Narrowing {
  let area = Infinity, at = 0;
  for (let i = 2; i <= geom.lastRay; i++) {
    const h = geom.hits[i];
    if (h.outside || (only && h.lowId !== only)) continue;
    if (h.area < area) { area = h.area; at = i; }
  }
  if (!only && geom.lipArea < area) return { area: geom.lipArea, at: geom.lastRay, sc: geom.rays[geom.lastRay].sc, low: 'lowerLip', up: 'upperLip' };
  const h = geom.hits[at];
  return { area, at, sc: geom.rays[at].sc, low: h.lowId, up: h.upId };
}

/** Where the air goes and whether the voice is on. */
export interface Flow {
  /** air out of the mouth, 0..1 */
  mouth: number;
  /** air out of the nose, 0..1 */
  nose: number;
  /** the voice sounding, 0..1 */
  voice: number;
  /** breath from the lungs, 0..1 */
  breath: number;
  /** the mouth is closed somewhere */
  blocked: boolean;
  /** the narrowest place of the mouth: its ray */
  at: number;
  /** its area, cm² */
  area: number;
}

export function flowOf(pose: Pose, geom: TractGeometry): Flow {
  const { area, at } = narrowest(geom);
  const blocked = area < CLOSED_AREA;
  const breath = clamp01(pose.ps / 7) * clamp01(pose.gate * 1.5);
  const open = clamp01(pose.abduction / 0.5);
  const nose = pose.art.velum > 0.08 ? breath : 0;
  return {
    blocked, at, area, breath, nose,
    mouth: blocked ? 0 : breath * (0.4 + 0.6 * open),
    voice: breath > 0.12 ? clamp01(1 - pose.abduction / 0.45) * clamp01(breath * 1.6) : 0,
  };
}

// ----------------------------------------------------------------- the lips

export type LipState = 'closed' | 'teeth' | 'round' | 'spread' | 'open';

/** The lips as the mirror shows them, measured on the side view (cm): everything the front picture needs. */
export interface LipMeasures {
  state: LipState;
  /** how far apart the lips are in the middle (0 = together) */
  gap: number;
  /** from corner to corner */
  width: number;
  /** how far the top teeth show below the upper lip, and where the bottom teeth's edge is below the upper lip */
  upperTeeth: number;
  lowerTeeth: number;
  /** where the top of the tongue's front is below the upper lip (small or negative: it fills the mouth behind the teeth) */
  tongueTop: number;
  /** how far the upper lip has risen from rest, and the chin dropped */
  lift: number;
  drop: number;
  /** the tongue's tip: out between the teeth, up behind the top teeth, curled back */
  between: boolean;
  tipUp: boolean;
  curled: boolean;
}

const solid = (g: TractGeometry, id: SolidId) => g.solids.find((s) => s.id === id)!;

export function lipsOf(a: Articulators, geom: TractGeometry): LipMeasures {
  const r = restGeom();
  const up = solid(geom, 'upperLip'), lo = solid(geom, 'lowerLip'), tg = solid(geom, 'tongue');
  const ue = geom.landmarks.upperEdge, le = geom.landmarks.lowerEdge;
  const gap = Math.max(0, up.minY - lo.maxY);
  const tuck = a.lipTuck > 0.4;
  const n = narrowest(geom);
  const shut = gap < 0.03 || (n.area < CLOSED_AREA && n.low === 'lowerLip' && !tuck);
  let tongueTop = -Infinity;
  for (let i = 0; i < tg.pts.length; i += 2) if (tg.pts[i] > ue[0] - 2.2 && tg.pts[i] < ue[0] - 0.2) tongueTop = Math.max(tongueTop, tg.pts[i + 1]);
  const state: LipState = shut ? 'closed' : tuck ? 'teeth' : a.lipRound > 0.55 ? 'round' : a.lipProtrude < -0.15 ? 'spread' : 'open';
  return {
    state, gap: shut ? 0 : gap,
    width: 4.6 - 3.5 * Math.min(1, Math.max(0, a.lipRound)) + (a.lipProtrude < 0 ? -a.lipProtrude * 1.2 : 0),
    upperTeeth: up.minY - ue[1], lowerTeeth: up.minY - le[1], tongueTop: up.minY - tongueTop,
    lift: up.minY - solid(r, 'upperLip').minY, drop: r.landmarks.lowerEdge[1] - le[1],
    between: a.tipX > 0.9, tipUp: a.tipY > 1.2, curled: a.tipY > 1.2 && a.tipX < -0.5,
  };
}

// -------------------------------------------------------------- in words

export interface Readout {
  lips: string;
  tongue: string;
  nose: string;
  voice: string;
  air: string;
  /** the same, as states for the pictures */
  lipState: LipState;
  noseOpen: boolean;
  voiceOn: boolean;
}

function lipWords(m: LipMeasures, a: Articulators): string {
  switch (m.state) {
    case 'closed': return 'closed, pressed together';
    case 'teeth': return 'lower lip touching the top teeth';
    case 'round': return m.gap < 0.3 ? 'rounded and pushed forward, a small hole' : a.lipProtrude > 0.6 ? 'rounded and pushed forward' : 'rounded';
    case 'spread': return m.gap < 0.35 ? 'spread wide, almost closed' : m.gap < 1.1 ? 'spread wide, a little open' : 'spread and open';
    default: return m.gap < 0.6 ? 'relaxed, a little open' : m.gap < 1.4 ? 'open' : 'wide open';
  }
}

function tongueWords(a: Articulators, geom: TractGeometry, m: LipMeasures): string {
  if (m.between) return 'tip out between the teeth';
  const n = narrowest(geom, 'tongue');
  const touch = n.area < CLOSED_AREA, near = n.area < NARROW_AREA;
  const sides = a.tongueSides > 0.3 ? '; air passes its sides' : '';
  if (m.curled) return (touch ? 'tip curled back, touching the roof' : 'tip curled back, close to the roof') + sides;
  if (touch || near) {
    if (n.up === 'upperIncisor') return 'tip close behind the top teeth: a thin gap';
    if (n.sc >= 14.6) return (touch ? 'tip touching the ridge behind the top teeth' : 'tip close to the ridge behind the top teeth') + sides;
    if (n.sc >= 12.9) return (touch ? 'front of the tongue touching the roof' : 'front of the tongue close to the roof') + sides;
    if (n.sc >= 11.4) return touch ? 'middle of the tongue touching the roof' : 'middle of the tongue close to the roof';
    if (n.sc >= 9.4) return touch ? 'back of the tongue touching the soft palate' : 'back of the tongue close to the soft palate';
    if (n.sc >= 6.6) return touch ? 'very back of the tongue touching the uvula' : 'very back of the tongue close to the uvula';
    return 'root of the tongue pulled back into the throat';
  }
  if (m.tipUp) return 'tip up behind the top teeth' + sides;
  // no narrowing made by the tongue: a vowel, or a sound made elsewhere
  const larynx = narrowest(geom);
  if (larynx.low === 'larynx' && larynx.area < NARROW_AREA && larynx.sc > 1.5) return 'throat squeezed just above the voice box';
  if (n.area >= 0.8) {
    if (a.jaw >= 0.75) return 'low and flat';
    if (a.tongueX > 0.45) return a.jaw > 0.5 ? 'forward and fairly low' : 'forward, half way up';
    return 'relaxed, in the middle';
  }
  if (n.sc >= 12.5) return n.area < 0.4 ? 'front high, close to the roof' : 'front raised toward the roof';
  if (n.sc >= 9.0) return n.sc >= 11.4 ? (n.area < 0.4 ? 'back high, close to the roof' : 'raised toward the roof') : 'back raised toward the soft palate';
  return 'low, pulled back toward the throat';
}

export function readout(pose: Pose, geom: TractGeometry, flow: Flow): Readout {
  const a = pose.art;
  const m = lipsOf(a, geom);
  const noseOpen = a.velum > 0.08;
  const voiceOn = flow.voice > 0.3;
  const breathing = flow.breath > 0.2;
  const air = !breathing ? 'no air yet'
    : flow.blocked ? (noseOpen ? 'out through the nose' : 'held behind the closure')
      : flow.area < NARROW_AREA ? (voiceOn ? 'buzzing through a narrow gap' : 'hissing through a narrow gap')
        : noseOpen ? 'out through the mouth and the nose'
          : pose.abduction > 0.3 ? 'a breath of air, no voice' : 'flowing out freely';
  return {
    lips: lipWords(m, a),
    tongue: tongueWords(a, geom, m),
    nose: noseOpen ? 'open: air goes through the nose' : 'closed',
    voice: voiceOn ? 'on' : breathing ? 'off' : 'resting',
    air, lipState: m.state, noseOpen, voiceOn,
  };
}
