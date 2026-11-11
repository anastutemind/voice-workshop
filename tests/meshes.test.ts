import { describe, it, expect } from 'vitest';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { buildTractMeshes, wallsAt, airHalfWidth, Walls, RING_SIDE } from '../src/ui/three/meshes';
import { teethShape } from '../src/ui/three/mouth';
import { seamWeights } from '../src/ui/three/skin';
import { note } from './helpers';

const geometryOf = (ph: string, piriform = 1) =>
  computeGeometry({ ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...PHONEMES[ph].art }, { ...DEFAULT_ANATOMY, piriform }, DEFAULT_TEETH);

/** Area of section i from the walls the 3D view draws (trapezoids across the section). */
function drawnArea(g: ReturnType<typeof geometryOf>, i: number): number {
  const W = airHalfWidth(g, i);
  const n = 400;
  const w: Walls = { roof: 0, floor: 0 };
  let a = 0;
  for (let k = 0; k < n; k++) {
    const z = -W + ((k + 0.5) / n) * 2 * W;
    wallsAt(g, i, z, w);
    a += Math.max(0, w.roof - w.floor) * ((2 * W) / n);
  }
  return a;
}

describe('the 3D view of the tract', () => {
  it('draws the cross-sections the sound is computed with', () => {
    const rows: string[] = [];
    let worst = 0;
    for (const ph of ['a', 'i', 'u', 'l']) {
      const g = geometryOf(ph);
      for (let i = 0; i <= g.lastRay; i++) {
        const h = g.hits[i];
        // the lens sections (the lips and teeth are drawn as their ellipses and slits)
        if (h.lensP <= 0 || h.area < 0.2) continue;
        // a sub-lingual pocket is counted in the area but not drawn
        if (h.sub > 0.05 * g.scale) continue;
        const e = Math.abs(drawnArea(g, i) / h.area - 1);
        worst = Math.max(worst, e);
      }
      rows.push(ph);
    }
    note('3D view', `cross-sections drawn from the same lenses as the acoustics (${rows.join(' ')}): worst area difference ${(100 * worst).toFixed(1)} %`);
    expect(worst).toBeLessThan(0.03);
  });

  it('keeps the same mesh as the tract moves, and every vertex finite', () => {
    const a = buildTractMeshes(geometryOf('a'));
    const sizes = [a.air.positions.length, a.upper.positions.length, a.lower.positions.length, a.air.index.length];
    const l = buildTractMeshes(geometryOf('l'), a);
    expect([l.air.positions.length, l.upper.positions.length, l.lower.positions.length, l.air.index.length]).toEqual(sizes);
    for (const arr of [l.air.positions, l.upper.positions, l.lower.positions]) for (const x of arr) expect(Number.isFinite(x)).toBe(true);
    const verts = l.air.positions.length / 3;
    for (const k of l.air.index) expect(k).toBeLessThan(verts);
    expect(l.teeth.length).toBe(28);
  });

  it('shows the two lateral channels of an /l/ beside the closed midline', () => {
    const g = geometryOf('l');
    let i = 0;
    while (i < g.lastRay && !(g.hits[i].d <= 0 && g.hits[i].lateral > 0)) i++;
    const w: Walls = { roof: 0, floor: 0 };
    const W = airHalfWidth(g, i);
    wallsAt(g, i, 0, w);
    const mid = w.roof - w.floor;
    wallsAt(g, i, 0.95 * W, w);
    const side = w.roof - w.floor;
    wallsAt(g, i, -0.95 * W, w);
    expect(mid).toBe(0);
    expect(side).toBeGreaterThan(0.2);
    expect(w.roof - w.floor).toBeCloseTo(side, 6);
    const m = buildTractMeshes(g);
    expect(m.anchors.channels).not.toBeNull();
    expect(m.anchors.supra).not.toBeNull();
    expect(m.air.positions.length).toBe(g.rays.length * 2 * RING_SIDE * 3);
  });

  it('fills the piriform fossae with water from the bottom', () => {
    const empty = buildTractMeshes(geometryOf('a')).pouch;
    const half = buildTractMeshes(geometryOf('a', 0.5)).pouch;
    expect(empty.air).toBeCloseTo(empty.length, 6);
    expect(half.air).toBeCloseTo(0.5 * half.length, 6);
    expect(empty.rOpen).toBeGreaterThan(empty.rBottom);
  });
});

describe('the 3D head: what its shading reads off the mesh', () => {
  it('gives each crown of the teeth a round normal and a dark side where the next crown meets it', () => {
    // two crowns, each a small tetrahedron-like piece (4 points), side by side along the arch (z)
    const canon = new Float32Array([
      // crown A: z from -1 to 0
      6, 9, -1,  6.4, 9, -0.5,  6, 9.5, -0.5,  6, 8.5, 0,
      // crown B: z from 0.4 to 1.4
      6, 9, 0.4,  6.4, 9, 0.9,  6, 9.5, 0.9,  6, 8.5, 1.4,
    ]);
    const index = Uint32Array.from([0, 1, 2, 0, 2, 3, 1, 2, 3, 4, 5, 6, 4, 6, 7, 5, 6, 7]);
    const { gap, blob } = teethShape(canon, index, 8);
    expect(gap.length).toBe(8);
    expect(Array.from(gap).every((g) => g >= 0 && g <= 1)).toBe(true);
    for (let i = 0; i < 8; i++) expect(Math.hypot(blob[3 * i], blob[3 * i + 1], blob[3 * i + 2])).toBeCloseTo(1, 4);
    // (the point of a crown farthest along the arch lies at its side)
    expect(Math.max(...Array.from(gap))).toBeGreaterThan(0.5);
  });

  it('weights the points near the seam of the grown neck 1 on it and 0 away from it', () => {
    // a strip of 7 points in a row (a chain of triangles); the last one is a copy, in the neck, of the first
    const n0 = 6, count = 7;
    const same = Int32Array.from([0, 1, 2, 3, 4, 5, 0]);
    const index = Uint32Array.from([0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 6, 5, 4]);
    const w = seamWeights(index, same, count, n0);
    expect(w[0]).toBe(1);
    expect(w[6]).toBe(1);
    expect(w[1]).toBeGreaterThan(w[3]);
    expect(w[3]).toBeLessThan(1);
  });
});
