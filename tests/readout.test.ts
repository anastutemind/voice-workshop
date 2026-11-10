import { describe, it, expect } from 'vitest';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { flowOf, lipsOf, readout } from '../src/ui/tutor/readout';
import { blendOf } from '../src/ui/tutor/Mirror3D';

/** The words for a sound held with the voice or the breath on. */
function words(ipa: string) {
  const ph = PHONEMES[ipa];
  const art = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...ph.art };
  const pose = { art, abduction: ph.voiced ? 0 : 0.6, ps: 8, gate: 1 };
  const geom = computeGeometry(art, DEFAULT_ANATOMY, DEFAULT_TEETH);
  return { r: readout(pose, geom, flowOf(pose, geom)), m: lipsOf(art, geom), art, geom };
}

describe('what the mouth is doing, in words read from the picture', () => {
  it('the lips: closed for p b m, on the teeth for f, rounded for u, spread for i, wide open for a', () => {
    for (const s of ['p', 'b', 'm']) expect(words(s).r.lipState, s).toBe('closed');
    expect(words('f').r.lipState).toBe('teeth');
    expect(words('u').r.lipState).toBe('round');
    expect(words('i').r.lipState).toBe('spread');
    expect(words('a').r.lips).toBe('wide open');
  });
  it('the tongue: where it touches or comes close', () => {
    expect(words('t').r.tongue).toMatch(/tip touching the ridge behind the top teeth/);
    expect(words('ʈ').r.tongue).toMatch(/curled back, touching the roof/);
    expect(words('k').r.tongue).toMatch(/back of the tongue touching the soft palate/);
    expect(words('q').r.tongue).toMatch(/uvula/);
    expect(words('s').r.tongue).toMatch(/behind the top teeth/);
    expect(words('θ').r.tongue).toMatch(/between the teeth/);
    expect(words('ħ').r.tongue).toMatch(/throat/);
    expect(words('l').r.tongue).toMatch(/sides/);
  });
  it('the nose, the voice and the air', () => {
    expect(words('m').r.noseOpen).toBe(true);
    expect(words('m').r.air).toBe('out through the nose');
    expect(words('b').r.noseOpen).toBe(false);
    expect(words('p').r.air).toBe('held behind the closure');
    expect(words('p').r.voiceOn).toBe(false);
    expect(words('b').r.voiceOn).toBe(true);
    expect(words('s').r.air).toMatch(/hissing/);
    expect(words('z').r.air).toMatch(/buzzing/);
    expect(words('a').r.air).toBe('flowing out freely');
  });
  it('the mirror moves with them: the jaw opens for a, the lips close for p, purse for u, the lower lip rolls in for f', () => {
    const blend = (s: string) => { const w = words(s); return blendOf(w.m, w.art, w.geom.slit.vertical); };
    expect(blend('a').jawOpen).toBeGreaterThan(blend('i').jawOpen + 0.3);
    expect(blend('p').mouthClose).toBeCloseTo(blend('p').jawOpen, 5);
    expect(blend('u').mouthPucker).toBeGreaterThan(0.6);
    expect(blend('f').mouthRollLower).toBeGreaterThan(0.7);
    expect(blend('θ').tongueOut).toBeGreaterThan(0);
  });
});
