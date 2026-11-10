/**
 * The movement of a score, worked out ahead of time: the same smoothing the
 * engine gives to the articulators (the target approximation of tam.ts),
 * run once over the whole score, so that the tutor can show any instant of
 * a sound (play it, pause it, step through it, drag a scrubber) without
 * asking the audio engine anything.
 */
import { Articulators, ARTICULATOR_KEYS, DEFAULT_ANATOMY, DEFAULT_TEETH } from '../../dsp/tract/types';
import { computeGeometry } from '../../dsp/tract/geometry';
import { CLOSED_AREA, narrowest, REST_ART } from './readout';
import type { Score, ScorePhone } from '../../dsp/engine/params';
import { TamChannel, TAM_TAU } from '../../dsp/speech/tam';
import { PHONEMES } from '../../dsp/speech/phonemes';
import { guideFor, Handle } from './guide';

/** What the mouth, the glottis and the lungs do at one instant. */
export interface Pose {
  art: Articulators;
  /** glottis: 0 = closed for voice, 1 = wide open */
  abduction: number;
  /** lung pressure, cm H2O */
  ps: number;
  /** 0 = the folds pressed shut (a glottal stop) */
  gate: number;
}

export interface Trajectory {
  /** seconds between two poses */
  dt: number;
  /** the whole movement: the sounds, then the way back to rest */
  duration: number;
  /** how long the sounds last: the mouth goes back to rest after it */
  speech: number;
  poses: Pose[];
  /** before the first sound (times below zero): from rest into the first posture, in `lead` seconds */
  pre: Pose[];
  preDt: number;
  lead: number;
}

/** How long the mouth takes to come back to rest after a score, in seconds of real speed. */
const TAIL = 0.3;
/** How long it takes to get ready before the first sound, in seconds (whatever the speed). */
const LEAD = 0.32;

/**
 * Runs the engine's smoothing over a score and keeps every pose. A mouth
 * gets ready before it speaks: from rest it takes its first posture in the
 * moments before the first sound (the times below zero), so that at time
 * zero the picture is where the engine's voice starts, and the two stay
 * together. After the last sound it comes back to rest.
 */
export function trajectory(score: Score): Trajectory {
  const scale = Math.max(1, score.timeScale ?? 1);
  const dt = 0.002 * scale;
  const fr = score.frames;
  const first = fr.find((f) => f.art)?.art;
  const preDt = 0.004;
  if (!first) return { dt, duration: score.duration, speech: score.duration, poses: [], pre: [], preDt, lead: 0 };
  // getting ready: rest → the first posture, no breath yet
  const pre: Pose[] = [];
  const ready: Record<string, TamChannel> = {};
  for (const k of ARTICULATOR_KEYS) ready[k] = new TamChannel(REST_ART[k], TAM_TAU[k] * 1.6);
  for (let t = 0; t <= LEAD; t += preDt) {
    const art = {} as Articulators;
    for (const k of ARTICULATOR_KEYS) art[k] = t === 0 ? REST_ART[k] : ready[k].step(first[k], preDt);
    pre.push({ art, abduction: fr[0].abduction, ps: 0, gate: 1 });
  }
  const tam: Record<string, TamChannel> = {};
  for (const k of ARTICULATOR_KEYS) tam[k] = new TamChannel(first[k], TAM_TAU[k] * scale);
  tam.abduction = new TamChannel(fr[0].abduction, TAM_TAU.abduction * scale);
  tam.ps = new TamChannel(0, TAM_TAU.ps * scale);
  let gate = 1;
  const poses: Pose[] = [];
  let idx = 0;
  const duration = score.duration + TAIL * scale;
  // The score ends by letting the mouth go slack, open, a moment after its last sound: said by a person, a word
  // that ends on closed lips (aam, seb) ends there, and the mouth stays shut. So the way back to rest starts
  // where the last sound stops: lips that are closed do not open again only to close.
  let said = 0;
  for (const p of score.phones) if (p.ipa !== '_' && PHONEMES[p.ipa]) said = Math.max(said, p.t1);
  const over = said > 0 ? Math.min(score.duration, said) : score.duration;
  for (let t = 0; t <= duration + dt; t += dt) {
    if (t > over) {
      // after the last sound: the breath stops, the mouth goes back to where it rests
      const art = {} as Articulators;
      for (const k of ARTICULATOR_KEYS) art[k] = tam[k].step(REST_ART[k], dt);
      gate += (1 - gate) * (1 - Math.exp(-dt / (0.006 * scale)));
      poses.push({ art, abduction: tam.abduction.step(fr[fr.length - 1].abduction, dt), ps: tam.ps.step(0, dt), gate });
      continue;
    }
    while (idx < fr.length - 2 && fr[idx + 1].t <= t) idx++;
    const a = fr[idx], b = fr[Math.min(idx + 1, fr.length - 1)];
    const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const mix = (x: number, y: number) => x + (y - x) * u;
    const art = {} as Articulators;
    const aa = a.art ?? first, ba = b.art ?? first;
    for (const k of ARTICULATOR_KEYS) art[k] = tam[k].step(mix(aa[k], ba[k]), dt);
    // the taps of the tongue tip are added on top of the smooth posture, as in the engine
    art.tipY += mix(a.tip ?? 0, b.tip ?? 0);
    gate += (mix(a.gate ?? 1, b.gate ?? 1) - gate) * (1 - Math.exp(-dt / (0.006 * scale)));
    poses.push({ art, abduction: tam.abduction.step(mix(a.abduction, b.abduction), dt), ps: tam.ps.step(mix(a.ps, b.ps), dt), gate });
  }
  return { dt, duration, speech: score.duration, poses, pre, preDt, lead: LEAD };
}

/** The pose at a time (between two kept poses: their mix). */
export function poseAt(tr: Trajectory, t: number): Pose | null {
  const n = tr.poses.length;
  if (!n) return null;
  if (t < 0 && tr.pre.length) {
    // before the first sound: at rest, then getting ready
    const i = Math.max(0, Math.min(tr.pre.length - 1, Math.round((t + tr.lead) / tr.preDt)));
    return tr.pre[i];
  }
  const x = Math.max(0, Math.min(n - 1, t / tr.dt));
  const i = Math.floor(x), j = Math.min(n - 1, i + 1), u = x - i;
  const p = tr.poses[i], q = tr.poses[j];
  if (u < 1e-6 || i === j) return p;
  const art = {} as Articulators;
  for (const k of ARTICULATOR_KEYS) art[k] = p.art[k] + (q.art[k] - p.art[k]) * u;
  return { art, abduction: p.abduction + (q.abduction - p.abduction) * u, ps: p.ps + (q.ps - p.ps) * u, gate: p.gate + (q.gate - p.gate) * u };
}

/** A step of a sound a child can follow: what to do, and where to look. */
export interface Stage {
  ipa: string;
  t0: number;
  t1: number;
  /** hold: the mouth closes and waits; pop: it lets go; puff: the air after it; say: everything else */
  part: 'hold' | 'pop' | 'puff' | 'say';
  /** a few words for the child */
  caption: string;
  /** the part of the mouth that works */
  handle: Handle;
  /** the instant that shows the step best: where a paused picture rests */
  key: number;
}

const firstClause = (s: string) => s.split(/, then|, hum|, breathy/)[0];

/** When the mouth is closed during a span of the movement: from when to when (null if never). */
function closedSpan(tr: Trajectory, t0: number, t1: number): [number, number] | null {
  const n = 16;
  let from = -1, to = -1;
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const pose = poseAt(tr, t);
    if (!pose) return null;
    if (narrowest(computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH)).area < CLOSED_AREA) { if (from < 0) from = t; to = t; }
    else if (from >= 0) break;
  }
  return from < 0 ? null : [from, to];
}

/**
 * The steps of a score: one per sound; a stop in two or three, as the
 * movement shows them (hold while the mouth is closed, pop when it opens,
 * puff for the air after it).
 */
/** How far apart two values of an articulator are that make two different sounds: its distances are counted in these. */
const SPAN: Record<string, number> = { jaw: 0.5, tongueX: 1, tongueY: 1, tongueRoot: 1, tipX: 0.8, tipY: 1, groove: 0.6, tongueSides: 0.6, lipOpen: 0.4, lipRound: 0.6, lipProtrude: 0.6, lipTuck: 0.6, velum: 0.25, larynx: 1 };

/**
 * The instant of a sound that shows it best: for a sound made with the mouth closed (m, n), the middle of the
 * time it is closed; for any other, the moment the mouth and the voice are nearest to that sound's own. Between its
 * neighbours a sound is itself only for a part of its time: a short vowel before a stop is already closing at
 * its end, lips open for the next sound before an m is over.
 */
function ownInstant(tr: Trajectory, t0: number, t1: number, closed: boolean, own: Partial<Articulators>, glottis: number): number {
  if (closed) {
    const shut = closedSpan(tr, t0, t1);
    if (shut) return (shut[0] + shut[1]) / 2;
  }
  const keys = Object.keys(own) as (keyof Articulators)[];
  let best = t0 + (t1 - t0) * 0.75, least = Infinity;
  if (!keys.length) return best;
  for (let i = 1; i <= 9; i++) {
    const t = t0 + ((t1 - t0) * i) / 10;
    const pose = poseAt(tr, t);
    if (!pose) continue;
    // (the voice counts too: a vowel after a puffed stop starts in its breath)
    let d = ((pose.abduction - glottis) / 0.3) ** 2;
    for (const k of keys) d += ((pose.art[k] - own[k]!) / (SPAN[k] ?? 1)) ** 2;
    // (of two moments as near, the later: the mouth has settled)
    if (d < least - 1e-9 || (d < least + 0.02 && d <= least * 1.05)) { least = Math.min(least, d); best = t; }
  }
  return best;
}

export function stagesOf(phones: ScorePhone[], tr: Trajectory): Stage[] {
  const out: Stage[] = [];
  let run = 0;
  phones.forEach((p, i) => {
    if (p.ipa === '_' || !PHONEMES[p.ipa]) { run = 0; return; }
    const prev = phones[i - 1];
    run = prev && prev.ipa === p.ipa && Math.abs(prev.t1 - p.t0) < 1e-6 ? run + 1 : 0;
    const ph = PHONEMES[p.ipa];
    const g = guideFor(p.ipa);
    const stopLike = ph.manner === 'stop' || ph.manner === 'affricate';
    const base = { ipa: p.ipa, t0: p.t0, t1: p.t1, handle: g.handle, key: ownInstant(tr, p.t0, p.t1, ph.manner === 'nasal', ph.art, ph.abduction) };
    if (stopLike && run === 0) {
      const hold = firstClause(guideFor(p.ipa.replace(/[ʰʱ]$/, '')).hint) + (ph.voiced ? ' and hum…' : ' and wait…');
      const pop = ph.manner === 'affricate' ? 'Let go with a hiss!' : 'Pop! Let go!';
      const shut = closedSpan(tr, p.t0, p.t1);
      // the closure, then (if this span also holds the release) the pop
      const open = shut ? shut[1] + (p.t1 - p.t0) / 16 : p.t1;
      const key = shut ? (shut[0] + shut[1]) / 2 : p.t0 + (p.t1 - p.t0) * 0.6;
      if (shut && p.t1 - open > 0.12 * (p.t1 - p.t0)) {
        out.push({ ...base, t1: open, part: 'hold', caption: hold, key });
        out.push({ ...base, t0: open, part: 'pop', caption: pop, key: open + (p.t1 - open) * 0.5 });
      } else out.push({ ...base, part: 'hold', caption: hold, key });
    } else if (stopLike && run === 1 && out[out.length - 1]?.part === 'hold') {
      out.push({ ...base, part: 'pop', caption: ph.manner === 'affricate' ? 'Let go with a hiss!' : 'Pop! Let go!', key: p.t0 + (p.t1 - p.t0) * 0.5 });
    } else if (run >= 1) {
      out.push({ ...base, part: 'puff', caption: ph.voiced ? 'A breathy sigh…' : 'A big puff of air!', handle: 'larynx' });
    } else out.push({ ...base, part: 'say', caption: g.hint + (p.ipa === 'a' ? ': aaah' : '') });
  });
  return out;
}

/** The step a time falls in (the nearest one before it, in a pause). */
export function stageAt(stages: Stage[], t: number): number {
  let best = -1;
  for (let i = 0; i < stages.length; i++) if (t >= stages[i].t0 - 1e-9) best = i;
  return best;
}

/** The instant that shows a sound best: the key instant of its first step. */
export function keyTime(stages: Stage[], ipa: string): number {
  return (stages.find((x) => x.ipa === ipa) ?? stages[0])?.key ?? 0;
}
