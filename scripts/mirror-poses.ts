/**
 * The model's mouth in the posture of each photographed mouth: what
 * scripts/mirror-register.py and scripts/skin-register.py set each
 * photograph's place by, among the mouths the model can make.
 *
 *   npx tsx scripts/mirror-poses.ts [out.json]
 *
 * Every photograph shows a sound (said alone, or before "a" for a
 * consonant, at the instant that shows it best), or a mouth half way from
 * one sound's to another's (the in-betweens made by the editing model). For
 * each the answer gives the model's articulators there and the measures of
 * the mouth the photographs are blended by (`mouthFeatures` in
 * src/ui/tutor/visemes.ts).
 */
import { writeFileSync } from 'node:fs';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { Articulators, DEFAULT_ANATOMY, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { poseAt, stagesOf, trajectory } from '../src/ui/tutor/motion';
import { REST_ART, lipsOf } from '../src/ui/tutor/readout';
import { mouthFeatures, PHOTO_POSES } from '../src/ui/tutor/visemes';

/** The model's articulators at the instant that shows a sound best. */
export function soundArt(ipa: string): Articulators {
  if (ipa === 'rest') return { ...REST_ART };
  const ps = compactPhones(ipa);
  const vi = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  if (vi >= 0) ps[vi].stress = true;
  ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  const score = buildScore(ps, { lang: 'hi', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  const traj = trajectory(score);
  const stages = stagesOf(score.phones, traj);
  const st = stages.find((s) => s.part === 'hold') ?? stages[0];
  return { ...poseAt(traj, st.key)!.art };
}

/** A photograph's posture: a sound's, or `f` of the way from one sound's to another's. */
export function photoArt(name: string): Articulators {
  const p = PHOTO_POSES[name];
  if (!p) throw new Error(`no posture for ${name}`);
  const a = soundArt(p[0]);
  if (p.length === 1) return a;
  const b = soundArt(p[1]), f = p[2];
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Articulators)[]) out[k] = a[k] + f * (b[k] - a[k]);
  return out;
}

if (process.argv[1]?.endsWith('mirror-poses.ts')) {
  const out: Record<string, unknown> = {};
  const r2 = (v: number) => Math.round(v * 100) / 100;
  for (const name of Object.keys(PHOTO_POSES)) {
    const art = photoArt(name);
    const geom = computeGeometry(art, DEFAULT_ANATOMY, DEFAULT_TEETH);
    const m = lipsOf(art, geom);
    const f = mouthFeatures(art, geom);
    out[name] = { art, features: f };
    console.log(`${name.padEnd(7)} ${m.state.padEnd(6)} gap ${r2(m.gap)} sep ${r2(geom.slit.vertical)} jaw ${r2(art.jaw)} lipOpen ${r2(art.lipOpen)} round ${r2(art.lipRound)} protr ${r2(art.lipProtrude)} tuck ${r2(art.lipTuck)} tipX ${r2(art.tipX)} tipY ${r2(art.tipY)} | ${Object.entries(f).map(([k, v]) => `${k} ${r2(v)}`).join(' ')}`);
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out));
}
