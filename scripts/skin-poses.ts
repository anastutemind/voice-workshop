/**
 * Tells scripts/skin-register.py where the model puts the face in the posture
 * of each photograph of the skin (public/skin: the mouth at rest, a little
 * open, wide open, rounded, spread, the lip on the teeth, ...).
 *
 *   npx tsx scripts/skin-poses.ts points.json out.json
 *
 * points.json holds points of the face at rest ([x, y, upper] in canonical
 * cm, `upper` 1 for the upper lip's side of the mouth). For every shape the
 * answer gives where those points and the knots of the skin's net
 * (src/ui/tutor/skinNet.ts) are in the posture the model takes for that
 * shape's sound, with the outlines of the model's lips there, to check by eye.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { headScene } from '../src/ui/head/scene';
import { poseAt, stagesOf, trajectory } from '../src/ui/tutor/motion';
import { NET_REST, NX, NY, ROW_LOWER, mouthMeasure, netKnots, skinPlacer } from '../src/ui/tutor/skinNet';

/** The sound each photograph shows: said alone (a vowel) or before "a" (a consonant), at the instant that shows it best. */
const SOUNDS: Record<string, string> = { open: 'aː', o: 'oː', round: 'uː' };

const [, , inPath, outPath] = process.argv;
const points = (JSON.parse(readFileSync(inPath, 'utf8')) as { points: [number, number, number][] }).points;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const shapes: Record<string, unknown> = {};
for (const [name, ipa] of Object.entries(SOUNDS)) {
  const ps = compactPhones(ipa);
  const vi = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  if (vi >= 0) ps[vi].stress = true;
  ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  const score = buildScore(ps, { lang: 'hi', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  const traj = trajectory(score);
  const stages = stagesOf(score.phones, traj);
  // the first sound's own instant (a stop is shown while it holds)
  const st = stages.find((s) => s.part === 'hold') ?? stages[0];
  const pose = poseAt(traj, st.key)!;
  const geom = computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const sc = headScene(geom, DEFAULT_ANATOMY, pose.art);
  const put = skinPlacer(sc);
  // (the model's world is the painting's frame at the speaker's size: the answer is given in the painting's own centimetres)
  const k = 1 / sc.s, c3 = (v: number) => r3(v * k);
  const still = sc.place(-5, -3, 0);
  if (Math.abs(still[0] * k + 5) > 1e-6 || Math.abs(still[1] * k + 3) > 1e-6) throw new Error('the speaker is not the standard one: the still head is not where it is painted');
  shapes[name] = {
    ipa, stage: st.ipa, t: r3(st.key),
    points: points.map(([x, y, up]) => put(x, y, up > 0).map(c3)),
    knots: Array.from(netKnots(sc), c3),
    upperFace: sc.upperFace.map(c3), lowerFace: sc.lowerFace.map(c3), mouth: sc.mouth.map(c3),
    at: [r3(mouthMeasure(sc).gap), r3(mouthMeasure(sc).forward)],
  };
}
writeFileSync(outPath, JSON.stringify({ nx: NX, ny: NY, rowLower: ROW_LOWER, rest: Array.from(NET_REST, r3), shapes }));
console.log(Object.entries(shapes).map(([k, v]) => { const q = v as { stage: string; at: number[] }; return `${k}: /${q.stage}/ lips ${q.at[0]} cm apart, ${q.at[1]} cm forward`; }).join('\n'));
