import { describe, expect, it } from 'vitest';
import { computeGeometry, CANON_SCALE } from '../src/dsp/tract/geometry';
import { Anatomy, Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { headScene, guideHead, HeadScene, FILLED_AIR, FACE_PROFILE, FACE_UPPER, FACE_LOWER } from '../src/ui/head/scene';
import { inPoly } from '../src/ui/head/warp';
import { anatomyLayers } from '../src/ui/tutor/faces';
import darkMap from './fixtures/plate-dark.json';

const inside = (x: number, y: number, p: number[]) => inPoly(x, y, p);

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

/** How far a point is from a polygon's outline. */
function toEdge(x: number, y: number, p: number[]): number {
  let best = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], ay = p[j + 1], dx = p[i] - ax, dy = p[i + 1] - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** Whether the painting is dark at a canonical point (what is left of its painted air, after scripts/anatomy-air.py has filled the thin marks of it with tissue). */
function paintedDark(x: number, y: number): boolean {
  const { x0, x1, y0, y1, step, rows } = darkMap as { x0: number; x1: number; y0: number; y1: number; step: number; rows: string[] };
  if (x < x0 || x >= x1 || y <= y0 || y > y1) return false;
  return rows[Math.floor((y1 - y) / step)][Math.floor((x - x0) / step)] === '1';
}

/**
 * Points of the plate's painted air that the sheet carries out of the air of this instant (nothing then covers
 * them) and that the painting still has dark: the app takes the air out of the plate and draws it as a cavity, and
 * what dark of the painted air is left where the model has tissue (thin marks of it are filled with tissue in the
 * painting itself) would show as a dark mark. The painted air is the guide's air behind the upper incisor's edge (in
 * front of it the grid's last lines reach between the teeth and the lips, where the painting has lip and tooth) and
 * above the hyoid (below it the painting has only the narrow cleft behind the epiglottis, and the model moves the
 * larynx's front by three points: there a little painted air may stay where the model narrows the air further). A
 * point within 0.8 mm of the air is where the tongue lies against the roof of the mouth, and is not counted, nor
 * one under the sheet's tissue, which is drawn over its painted air.
 */
function strandedAir(sc: HeadScene, geom: ReturnType<typeof computeGeometry>): [number, number][] {
  const G = guideHead();
  // (the air taken out as the views take it out, and the velum drawn over it)
  // (all of the air's strips, thin ones too: where the walls all but touch the app leaves them uncut, and tissue lies there)
  const strips: number[][] = [];
  for (let i = 0; i + 3 < sc.lower.length; i += 2) strips.push([sc.lower[i], sc.lower[i + 1], sc.lower[i + 2], sc.lower[i + 3], sc.upper[i + 2], sc.upper[i + 3], sc.upper[i], sc.upper[i + 1]]);
  const covers = [...anatomyLayers(sc, geom).cut, ...strips, sc.velum].filter((p) => p.length >= 6);
  // (and every cell of the sheet that is not painted air: those are drawn after the painted air, over it)
  const { warp: W, at: A } = sc.sheet();
  // (the cells in buckets of a few millimetres, by their bounds)
  const B = 0.3, buckets = new Map<number, number[][]>();
  const key = (i: number, j: number) => i * 100003 + j;
  for (const pc of [...W.whole, ...W.parts]) {
    if (pc.kind === 3) continue;
    const q = pc.k.flatMap((n) => [A[2 * n], A[2 * n + 1]]);
    const i0 = Math.floor(Math.min(q[0], q[2], q[4], q[6]) / B), i1 = Math.floor(Math.max(q[0], q[2], q[4], q[6]) / B);
    const j0 = Math.floor(Math.min(q[1], q[3], q[5], q[7]) / B), j1 = Math.floor(Math.max(q[1], q[3], q[5], q[7]) / B);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      const list = buckets.get(k);
      if (list) list.push(q); else buckets.set(k, [q]);
    }
  }
  const underTissue = (x: number, y: number) => (buckets.get(key(Math.floor(x / B), Math.floor(y / B))) ?? []).some((q) => inside(x, y, q));
  const out: [number, number][] = [];
  for (let i = 0; i < G.lastRay; i++) {
    if (G.up[2 * i] > 6.6) break;
    if (G.low[2 * i + 1] < 3.2) continue;
    const l0 = [G.low[2 * i], G.low[2 * i + 1]], l1 = [G.low[2 * i + 2], G.low[2 * i + 3]];
    const u0 = [G.up[2 * i], G.up[2 * i + 1]], u1 = [G.up[2 * i + 2], G.up[2 * i + 3]];
    if (Math.hypot(u0[0] - l0[0], u0[1] - l0[1]) < 0.03 && Math.hypot(u1[0] - l1[0], u1[1] - l1[1]) < 0.03) continue;
    for (const u of [0.25, 0.5, 0.75]) {
      for (const v of [0.3, 0.5, 0.7]) {
        const lx = l0[0] + (l1[0] - l0[0]) * u, ly = l0[1] + (l1[1] - l0[1]) * u;
        const ux = u0[0] + (u1[0] - u0[0]) * u, uy = u0[1] + (u1[1] - u0[1]) * u;
        const cx = lx + (ux - lx) * v, cy = ly + (uy - ly) * v;
        if (FILLED_AIR.some((p) => inside(cx, cy, p))) continue; // the painting has no air there
        const [x, y] = sc.warp(cx, cy);
        // (in the narrow column of the throat the painting's dark is the crease between the wall and the spine, not painted air)
        if (!(cx > -0.3 || cy > 8.2)) continue;
        if (paintedDark(cx, cy) && !covers.some((p) => inside(x, y, p)) && !covers.some((p) => toEdge(x, y, p) < 0.08) && !underTissue(x, y)) out.push([x, y]);
      }
    }
  }
  return out;
}

describe('illustrated head', () => {
  it('the still head stays where it was painted, and only the speaker\'s size and the pharynx\'s stretch move it', () => {
    for (const [, an] of ANATOMIES) {
      for (const [name, art] of POSTURES) {
        const { sc } = scene(an, art);
        const { s } = sc;
        // the skull, the hard palate, the upper teeth, the spine and the nose (all above the pharynx's bend)
        for (const [x, y] of [[3, 12.5], [4.0, 10.95], [6.95, 9.0], [-3, 9], [9.6, 11.5], [-1.6, 8.5]]) {
          const [wx, wy] = sc.warp(x, y);
          expect(Math.hypot(wx - s * x, wy - s * y), `${name}: (${x}, ${y})`).toBeLessThan(1e-6);
        }
        // the sheet's knots that hold still: exactly at the speaker's size and stretch
        const sh = sc.sheet();
        for (let n = 0; n < sh.warp.kind.length; n += 7) {
          if (sh.warp.kind[n] !== 1) continue;
          const x = sh.warp.rest[2 * n], y = sh.warp.rest[2 * n + 1];
          const [wx, wy] = sc.place(x, y, 0);
          expect(Math.hypot(sh.at[2 * n] - wx, sh.at[2 * n + 1] - wy), `${name}: knot ${n}`).toBeLessThan(1e-4);
        }
      }
    }
  });

  it('at rest the bone and the painted solids sit exactly where they were painted', () => {
    const { sc } = scene(DEFAULT_ANATOMY, {});
    const sh = sc.sheet();
    for (let n = 0; n < sh.warp.kind.length; n++) {
      if (sh.warp.kind[n] === 0) continue;
      expect(Math.abs(sh.at[2 * n] - CANON_SCALE * sh.warp.rest[2 * n]) + Math.abs(sh.at[2 * n + 1] - CANON_SCALE * sh.warp.rest[2 * n + 1])).toBeLessThan(1e-4);
    }
    for (const s of sc.sprites) {
      if (s.mesh) for (let i = 0; i < s.mesh.to.length; i++) expect(Math.abs(s.mesh.to[i] - CANON_SCALE * s.mesh.from[i])).toBeLessThan(1e-9);
      else for (let i = 0; i < s.poly.length; i++) expect(Math.abs(s.painted[i] - s.poly[i])).toBeLessThan(1e-9);
      // a lip's outline is the painting's own profile, carried by the model's lip: it stays put where it joins the
      // rest of the painting, under the nose for the upper lip, at the chin and under the lip for the lower one
      if (s.areaMesh) {
        const joins = s.id === 'upperLip' ? [0, 1] : [FACE_PROFILE.lower[1] - 1, FACE_PROFILE.lower[1], FACE_PROFILE.lower[1] + 1, FACE_PROFILE.lower[1] + 2, FACE_PROFILE.lower[1] + 3, FACE_PROFILE.lower[1] + 4];
        for (const k of joins) for (const i of [2 * k, 2 * k + 1]) expect(Math.abs(s.areaMesh.to[i] - CANON_SCALE * s.areaMesh.from[i])).toBeLessThan(1e-9);
        expect(s.areaMesh.to.length).toBe(s.areaMesh.from.length);
      }
    }
  });

  it('the painted lips are carried onto the model\'s lips: their profile lies where the model puts it', () => {
    for (const [name, art] of POSTURES) {
      const { sc } = scene(DEFAULT_ANATOMY, art);
      for (const [rest, face, first] of [[FACE_UPPER, sc.upperFace, FACE_PROFILE.upper[0]], [FACE_LOWER, sc.lowerFace, FACE_PROFILE.lower[0]]] as const) {
        // (not the point where the two lips meet, which each lip leads from its own side of the parting)
        for (let i = 2; i < rest.length - 2; i += 2) {
          const [x, y] = sc.warp(rest[i], rest[i + 1]);
          const d = Math.hypot(x - face[2 * (first + i / 2)], y - face[2 * (first + i / 2) + 1]);
          expect(d, `${name}: profile point ${i / 2}`).toBeLessThan(0.06);
        }
      }
    }
  });

  it('the sheet never folds over itself in the painted tissue, away from where it meets the air or the teeth', () => {
    const G = guideHead();
    // the painted head, behind the face's own profile
    const profile = [...FACE_UPPER, ...FACE_LOWER.slice(2)];
    const front = [...profile, 13, profile[profile.length - 1], 13, profile[1]];
    // the air at rest and the partings: folds within a few millimetres of them lie where tissue meets air or a tooth
    const air: number[] = [];
    for (let i = 0; i <= G.lastRay; i++) air.push(G.low[2 * i], G.low[2 * i + 1]);
    for (let i = G.lastRay; i >= 0; i--) air.push(G.up[2 * i], G.up[2 * i + 1]);
    const near = (x: number, y: number, p: number[], r: number) => {
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const ax = p[j], ay = p[j + 1], dx = p[i] - ax, dy = p[i + 1] - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) < r) return true;
      }
      return false;
    };
    const bad: string[] = [];
    for (const [who, an] of ANATOMIES) {
      for (const [name, art] of POSTURES) {
        const { sc } = scene(an, art);
        const { warp: W, at: A } = sc.sheet();
        const R = W.rest;
        for (const pc of W.whole) {
          if (pc.kind === 3) continue;
          let area = 0, cx = 0, cy = 0;
          for (let c = 0; c < 4; c++) {
            const p = pc.k[c], q = pc.k[(c + 1) % 4];
            area += A[2 * p] * A[2 * q + 1] - A[2 * q] * A[2 * p + 1];
            cx += R[2 * p] / 4; cy += R[2 * p + 1] / 4;
          }
          if (area > 0) continue;
          if (!inside(cx, cy, G.outline) || inside(cx, cy, front) || inside(cx, cy, air) || near(cx, cy, air, 0.45)) continue;
          // (against bone or a tooth, which is drawn over it)
          if (pc.k.some((n) => W.kind[n] !== 0)) continue;
          bad.push(`${who} ${name}: cell at (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
        }
      }
    }
    expect(bad).toEqual([]);
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

  it('the plate\'s painted air is carried into the air of the instant, where it is taken out', () => {
    const bad: string[] = [];
    for (const [who, an] of ANATOMIES) {
      for (const [name, art] of POSTURES) {
        const { geom, sc } = scene(an, art);
        const miss = strandedAir(sc, geom);
        // (a stray sample or two of the ~600, a speck beside the air at the velum's root or the wall of the pharynx, is let be)
        if (miss.length > 2) bad.push(`${who} ${name}: ${miss.length} points, first at (${miss[0][0].toFixed(2)}, ${miss[0][1].toFixed(2)})`);
      }
    }
    expect(bad).toEqual([]);
  });
});
