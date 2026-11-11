/**
 * The mirror is one face morphed between photographs (MirrorPhoto.tsx): its
 * net must lie on every photograph without folding, a posture that is a
 * photograph's must show that photograph whole, and along a real word the
 * face must move as the model does: continuously, without a jump from one
 * photograph to another, and with the lips together whenever the model's
 * are (m, b, p).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { poseAt, stagesOf, trajectory } from '../src/ui/tutor/motion';
import { lipsOf } from '../src/ui/tutor/readout';
import { FEATURE_KEYS, MORPH_IL, MORPH_IU, morphShape, MorphPhoto, mouthFeatures, MouthFeatures, photoWeights } from '../src/ui/tutor/visemes';

const morph = JSON.parse(readFileSync(new URL('../public/mirror/morph.json', import.meta.url), 'utf8')) as {
  size: [number, number]; cols: number; rows: number; skin: number[]; inside: number[]; photos: Record<string, MorphPhoto & { features: MouthFeatures }>;
};
const N = morph.cols * morph.rows;
/** the units the measures are told apart by (as visemes.ts counts them) */
const UNIT: Record<keyof MouthFeatures, number> = { open: 0.3, teeth: 0.45, round: 0.3, forward: 0.45, spread: 0.35, press: 0.5, tuck: 0.3, tongue: 0.3, tip: 0.45 };

function word(ipa: string, timeScale = 1) {
  const ps = compactPhones(ipa);
  const vi = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  if (vi >= 0) ps[vi].stress = true;
  ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  const score = buildScore(ps, { lang: 'hi', f0: 120, ps: 8, rate: 0.9, timeScale });
  const traj = trajectory(score);
  return { traj, stages: stagesOf(score.phones, traj) };
}

describe('the mirror', () => {
  it('has a net on every photograph, which nowhere folds over', () => {
    expect(Object.keys(morph.photos).length).toBeGreaterThanOrEqual(20);
    const tris = [...morph.skin, ...morph.inside];
    const rest = morph.photos.rest.at;
    const area = (k: ArrayLike<number>, t: number) => {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      return (k[2 * b] - k[2 * a]) * (k[2 * c + 1] - k[2 * a + 1]) - (k[2 * c] - k[2 * a]) * (k[2 * b + 1] - k[2 * a + 1]);
    };
    for (const [name, p] of Object.entries(morph.photos)) {
      expect(p.at.length, name).toBe(2 * N);
      for (let t = 0; t < morph.skin.length; t += 3) if (Math.abs(area(rest, t)) > 1e-3) expect(Math.sign(area(p.at, t)) * Math.sign(area(rest, t)), `${name}: triangle ${t / 3}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('shows a photograph whole in its own posture, and at most two at a time', () => {
    const feats = Object.fromEntries(Object.entries(morph.photos).map(([k, p]) => [k, p.features]));
    for (const [name, f] of Object.entries(feats)) expect(photoWeights(f, feats, 2)[name], name).toBeGreaterThan(0.97);
  });

  for (const [ipa, scale] of [['aːm', 1], ['bɪlɪ', 1], ['fɪʃ', 1], ['ʃoːr', 1], ['θɪŋk', 1], ['aːm', 4]] as const) {
    it.concurrent(`moves with the model through /${ipa}/${scale > 1 ? ' in slow motion' : ''}, without jumps, the lips shut when the model's are`, () => {
      const { traj, stages } = word(ipa, scale);
      // how much the face changes in a step, beyond what the model's mouth does (its measures, in the units they are
      // told apart by), at two step sizes: a change that is continuous shrinks with the step, a jump does not
      const run = (dt: number) => {
        const k = new Float32Array(2 * N), prev = new Float32Array(2 * N);
        let last: Record<string, number> | null = null, lastF: MouthFeatures | null = null, lastState = '';
        let move = 0, share = 0;
        for (let t = 0; t <= traj.duration; t += dt) {
          const pose = poseAt(traj, t);
          if (!pose) continue;
          const geom = computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH);
          const f = mouthFeatures(pose.art, geom);
          const { skin } = morphShape(morph.photos, morph.cols, f, k);
          const state = lipsOf(pose.art, geom).state;
          // (where the model's own lips snap shut or open, the readout's state flips: the face follows it)
          if (last && lastF && (state === 'closed') === (lastState === 'closed')) {
            const df = Math.hypot(...FEATURE_KEYS.map((q) => (f[q] - lastF![q]) / UNIT[q]));
            let mv = 0;
            for (let i = 0; i < k.length; i++) mv = Math.max(mv, Math.abs(k[i] - prev[i]));
            let dw = 0;
            for (const n of new Set([...Object.keys(skin), ...Object.keys(last)])) dw = Math.max(dw, Math.abs((skin[n] ?? 0) - (last[n] ?? 0)));
            move = Math.max(move, mv - 120 * df);
            share = Math.max(share, dw - 1.5 * df);
          }
          // the lips together whenever the model's are
          if (state === 'closed') {
            for (let c = 0; c < morph.cols; c++) expect(Math.abs(k[2 * (MORPH_IL * morph.cols + c) + 1] - k[2 * (MORPH_IU * morph.cols + c) + 1]), `t ${t.toFixed(3)}`).toBeLessThan(0.5);
          }
          prev.set(k); last = skin; lastF = f; lastState = state;
        }
        return { move, share };
      };
      const full = run(0.0005 * scale), fine = run(0.000125 * scale);
      expect(full.move, 'pixels beyond the model\'s own movement').toBeLessThan(1.5);
      // (a photograph's share: no jump, and no faster than a few tenths a millisecond)
      expect(fine.share, 'a photograph\'s share, at a quarter of the step').toBeLessThan(0.6 * full.share + 0.02);
      expect(full.share).toBeLessThan(0.35);
      expect(stages.length).toBeGreaterThan(0);
      // (ten thousand poses each: minutes on a busy machine)
    }, 600_000);
  }
});
