/**
 * The skin of the tutor's head lies on the anatomy under it in every posture:
 * the profile of its lips is the profile of the painted lips, the two lips
 * are one skin behind the corner of the mouth, and they never pass through
 * one another in front of it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { FACE_LOWER, FACE_PROFILE, FACE_UPPER, headScene } from '../src/ui/head/scene';
import { CORNER, mouthMeasure, NET_REST, NET_TRIANGLES, NET_X, netKnots, NX, NY, ROW_LOWER, ROW_UPPER, skinPlacer } from '../src/ui/tutor/skinNet';
import { mouthsOf } from '../src/ui/tutor/skin';
import { REST_ART } from '../src/ui/tutor/readout';

const POSTURES: [string, Partial<Articulators>][] = [
  ['rest', {}],
  ...Object.values(PHONEMES).map((ph): [string, Partial<Articulators>] => [`/${ph.ipa}/`, ph.art]),
  ['jaw shut', { jaw: 0 }], ['jaw wide', { jaw: 1 }], ['lips shut', { lipOpen: -0.4 }], ['lips wide', { lipOpen: 1.2, jaw: 1 }],
  ['lips round', { lipRound: 1, lipProtrude: 1 }], ['lips spread', { lipProtrude: -0.6 }], ['lip tucked', { lipTuck: 1, lipOpen: 0.3 }],
];
const scene = (art: Partial<Articulators>) => {
  const a = { ...DEFAULT_ARTICULATORS, ...art };
  return headScene(computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH), DEFAULT_ANATOMY, a);
};

describe('the skin over the anatomy', () => {
  it('in every posture the profile of the skin is the profile of the painted lips', () => {
    for (const [name, art] of POSTURES) {
      const sc = scene(art), put = skinPlacer(sc);
      for (const [rest, face, first, upper] of [[FACE_UPPER, sc.upperFace, FACE_PROFILE.upper[0], true], [FACE_LOWER, sc.lowerFace, FACE_PROFILE.lower[0], false]] as const) {
        for (let i = 0; i < rest.length; i += 2) {
          const q = put(rest[i], rest[i + 1], upper);
          const d = Math.hypot(q[0] - face[2 * (first + i / 2)], q[1] - face[2 * (first + i / 2) + 1]);
          expect(d, `${name}: ${upper ? 'upper' : 'lower'} lip, point ${i / 2}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('the lips are one skin behind the corner of the mouth, and part without crossing in front of it', () => {
    for (const [name, art] of POSTURES) {
      const k = netKnots(scene(art));
      for (let i = 0; i < NX; i++) {
        const u = 2 * (ROW_UPPER * NX + i), l = 2 * (ROW_LOWER * NX + i);
        if (NET_X[i] <= CORNER) expect(Math.hypot(k[u] - k[l], k[u + 1] - k[l + 1]), `${name}: behind the corner at x ${NET_X[i]}`).toBeLessThan(1e-6);
        else expect(k[u + 1] - k[l + 1], `${name}: the lips cross at x ${NET_X[i]}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('no part of the skin is turned inside out', () => {
    const tri = NET_TRIANGLES.skin;
    const area = (k: Float32Array, t: number) => {
      const a = tri[t], b = tri[t + 1], c = tri[t + 2];
      return (k[2 * b] - k[2 * a]) * (k[2 * c + 1] - k[2 * a + 1]) - (k[2 * c] - k[2 * a]) * (k[2 * b + 1] - k[2 * a + 1]);
    };
    for (const [name, art] of POSTURES) {
      const k = netKnots(scene(art));
      for (let t = 0; t < tri.length; t += 3) if (area(NET_REST, t) > 1e-9) expect(area(k, t), `${name}: triangle ${t / 3}`).toBeGreaterThan(0);
    }
  });

  it('the photographs of the mouth are made for this net, and each is shown whole in its own posture', () => {
    const net = JSON.parse(readFileSync(new URL('../public/skin/net.json', import.meta.url), 'utf8')) as { shapes: Record<string, { at: [number, number]; uv: number[] }> };
    expect(Object.keys(net.shapes).sort()).toEqual(['o', 'open', 'round']);
    for (const [name, s] of Object.entries(net.shapes)) {
      expect(s.uv.length, name).toBe(2 * NX * NY);
      const w = mouthsOf(s.at[0], s.at[1], net.shapes);
      expect(w[name], name).toBeGreaterThan(0.97);
    }
    // a shut mouth at rest shows none of them; their shares never add up to more than the whole
    const rest = mouthMeasure(scene(REST_ART));
    for (const v of Object.values(mouthsOf(Math.max(0, rest.gap), rest.forward, net.shapes))) expect(v).toBeLessThan(0.05);
    for (const [, art] of POSTURES) {
      const m = mouthMeasure(scene(art));
      const sum = Object.values(mouthsOf(m.gap, m.forward, net.shapes)).reduce((a, b) => a + b, 0);
      expect(sum).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
