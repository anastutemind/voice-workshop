import { describe, expect, it } from 'vitest';
import { computeGeometry, CANON_SCALE } from '../src/dsp/tract/geometry';
import { Anatomy, Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { headScene, guideHead, HeadScene, FILLED_AIR, FACE_PROFILE } from '../src/ui/head/scene';

/** Even-odd point in polygon. */
function inside(x: number, y: number, p: number[]): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) c = !c;
  }
  return c;
}

const POSTURES: [string, Partial<Articulators>][] = [
  ['rest', {}],
  ...Object.values(PHONEMES).map((ph): [string, Partial<Articulators>] => [`/${ph.ipa}/`, ph.art]),
  ['jaw shut', { jaw: 0 }], ['jaw wide', { jaw: 1 }], ['jaw past wide', { jaw: 1.2 }],
  ['tongue front high', { tongueX: 1.4, tongueY: 1.6 }], ['tongue back low', { tongueX: -1.6, tongueY: -1.6 }],
  ['tongue back high', { tongueX: -1.6, tongueY: 1.6 }], ['tongue front low', { tongueX: 1.4, tongueY: -1.6 }],
  ['root forward', { tongueRoot: 1.2 }], ['root back', { tongueRoot: -1.2 }],
  ['tip up', { tipY: 2.2, tipX: 1.4 }], ['tip curled', { tipY: 2.2, tipX: -1.2 }],
  ['lips shut', { lipOpen: -0.4 }], ['lips wide', { lipOpen: 1.2, jaw: 1 }], ['lips round', { lipRound: 1, lipProtrude: 1 }],
  ['lips spread', { lipProtrude: -0.6 }], ['lip tucked', { lipTuck: 1, lipOpen: 0.3 }],
  ['velum low', { velum: 1 }], ['larynx low', { larynx: -1.5 }], ['larynx high', { larynx: 1.2 }],
];
const ANATOMIES: [string, Anatomy][] = [
  ['man', DEFAULT_ANATOMY],
  ['woman', { ...DEFAULT_ANATOMY, scale: 0.87, pharynx: 0.88 }],
  ['child', { ...DEFAULT_ANATOMY, scale: 0.72, pharynx: 0.8 }],
  ['long pharynx', { ...DEFAULT_ANATOMY, pharynx: 1.15 }],
];

function scene(an: Anatomy, art: Partial<Articulators>) {
  const a = { ...DEFAULT_ARTICULATORS, ...art };
  const geom = computeGeometry(a, an, DEFAULT_TEETH);
  return { geom, sc: headScene(geom, an, a) };
}

/** Points of the backdrop's painted air that nothing of this instant covers. */
function uncoveredAir(sc: HeadScene, geom: ReturnType<typeof computeGeometry>): [number, number][] {
  const G = guideHead();
  const map = sc.warp;
  const n = geom.lastRay;
  const quads: number[][] = [];
  for (let i = 0; i < n; i++) {
    quads.push([sc.lower[2 * i], sc.lower[2 * i + 1], sc.lower[2 * i + 2], sc.lower[2 * i + 3], sc.upper[2 * i + 2], sc.upper[2 * i + 3], sc.upper[2 * i], sc.upper[2 * i + 1]]);
  }
  const covers = [...quads, ...sc.patch, ...sc.hole, ...sc.inner, ...sc.sprites.map((s) => s.poly), sc.velum, sc.port, sc.upperFace, sc.lowerFace, sc.vestibule];
  const out: [number, number][] = [];
  for (let i = 0; i < G.lastRay; i++) {
    const l0 = [G.low[2 * i], G.low[2 * i + 1]], l1 = [G.low[2 * i + 2], G.low[2 * i + 3]];
    const u0 = [G.up[2 * i], G.up[2 * i + 1]], u1 = [G.up[2 * i + 2], G.up[2 * i + 3]];
    if (Math.hypot(u0[0] - l0[0], u0[1] - l0[1]) < 0.03 && Math.hypot(u1[0] - l1[0], u1[1] - l1[1]) < 0.03) continue;
    for (const u of [0.25, 0.5, 0.75]) {
      for (const v of [0.08, 0.3, 0.5, 0.7, 0.92]) {
        const lx = l0[0] + (l1[0] - l0[0]) * u, ly = l0[1] + (l1[1] - l0[1]) * u;
        const ux = u0[0] + (u1[0] - u0[0]) * u, uy = u0[1] + (u1[1] - u0[1]) * u;
        const cx = lx + (ux - lx) * v, cy = ly + (uy - ly) * v;
        if (FILLED_AIR.some((p) => inside(cx, cy, p))) continue; // the painting has no air there
        const [x, y] = map(cx, cy);
        if (!covers.some((p) => inside(x, y, p))) out.push([x, y]);
      }
    }
  }
  return out;
}

describe('illustrated head', () => {
  it('at rest the backdrop and the painted solids sit exactly where they were painted', () => {
    const { sc } = scene(DEFAULT_ANATOMY, {});
    for (const b of sc.bands) {
      expect(b.mat.map((v) => +v.toFixed(9))).toEqual([CANON_SCALE, 0, 0, CANON_SCALE, 0, 0]);
    }
    for (const s of sc.sprites) {
      // a stretched painting is not stretched at rest; a carried one is carried nowhere
      if (s.mesh) for (let i = 0; i < s.mesh.to.length; i++) expect(Math.abs(s.mesh.to[i] - CANON_SCALE * s.mesh.from[i])).toBeLessThan(1e-9);
      else for (let i = 0; i < s.poly.length; i++) expect(Math.abs(s.painted[i] - s.poly[i])).toBeLessThan(1e-9);
      // a lip with the face in front of it is drawn with the painting's own profile, carried by the model's lip (the
      // painted lips are closed, the model's a little apart): it stays put only where it joins the rest of the
      // painting, under the nose for the upper lip, at the chin and under the lip for the lower one
      if (s.areaMesh) {
        const joins = s.id === 'upperLip' ? [0, 1] : [FACE_PROFILE.lower[1] - 1, FACE_PROFILE.lower[1], FACE_PROFILE.lower[1] + 1, FACE_PROFILE.lower[1] + 2, FACE_PROFILE.lower[1] + 3, FACE_PROFILE.lower[1] + 4];
        for (const k of joins) for (const i of [2 * k, 2 * k + 1]) expect(Math.abs(s.areaMesh.to[i] - CANON_SCALE * s.areaMesh.from[i])).toBeLessThan(1e-9);
        expect(s.areaMesh.to.length).toBe(s.areaMesh.from.length);
      }
    }
  });

  it('the drawn air is the acoustic air on every grid line', () => {
    for (const [, an] of ANATOMIES) {
      for (const [, art] of POSTURES) {
        const { geom, sc } = scene(an, art);
        const n = geom.lastRay;
        expect(sc.lumen.length).toBe(4 * (n + 1));
        for (let i = 0; i <= n; i++) {
          const r = geom.rays[i], h = geom.hits[i];
          const lo = [r.sx + r.nx * (r.t0 + h.tLow), r.sy + r.ny * (r.t0 + h.tLow)];
          const up = [r.sx + r.nx * (r.t0 + h.tUp), r.sy + r.ny * (r.t0 + h.tUp)];
          const j = 2 * (2 * n + 1 - i);
          expect(Math.hypot(sc.lumen[2 * i] - lo[0], sc.lumen[2 * i + 1] - lo[1])).toBeLessThan(1e-9);
          expect(Math.hypot(sc.lumen[j] - up[0], sc.lumen[j + 1] - up[1])).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('no air painted in the backdrop is left where the model has tissue', () => {
    const bad: string[] = [];
    for (const [who, an] of ANATOMIES) {
      for (const [name, art] of POSTURES) {
        const { geom, sc } = scene(an, art);
        const miss = uncoveredAir(sc, geom);
        if (miss.length) bad.push(`${who} ${name}: ${miss.length} points, first at (${miss[0][0].toFixed(2)}, ${miss[0][1].toFixed(2)})`);
      }
    }
    expect(bad).toEqual([]);
  });
});
