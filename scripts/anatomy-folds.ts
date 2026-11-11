/**
 * Counts the cells of the plate's sheet that fold (a triangle turned inside out) in every posture the tests use, by what the
 * cell is (soft tissue, jaw, still, painted air) and where, for looking at what is left:
 *
 *   npx tsx scripts/anatomy-folds.ts [all]
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { headScene } from '../src/ui/head/scene';

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
const kinds = ['soft', 'jaw', 'still', 'air'];
let total = 0;
const byKind = [0, 0, 0, 0];
const where = new Map<string, number>();
for (const [name, art] of POSTURES) {
  const a = { ...DEFAULT_ARTICULATORS, ...art };
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const sc = headScene(g, DEFAULT_ANATOMY, a);
  const { warp: W, at: A } = sc.sheet();
  const R = W.rest;
  let n = 0;
  for (const pc of [...W.whole, ...W.parts]) {
    // each of the cell's two triangles
    let bad = false, cx = 0, cy = 0;
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
      const p = pc.k[i], q = pc.k[j], r = pc.k[k];
      const area = (A[2 * q] - A[2 * p]) * (A[2 * r + 1] - A[2 * p + 1]) - (A[2 * r] - A[2 * p]) * (A[2 * q + 1] - A[2 * p + 1]);
      if (area < 0) bad = true;
    }
    for (let c = 0; c < 4; c++) { cx += R[2 * pc.k[c]] / 4; cy += R[2 * pc.k[c] + 1] / 4; }
    if (!bad) continue;
    n++;
    byKind[pc.kind]++;
    if (pc.kind === 3) continue;
    const key = `${kinds[pc.kind]} (${cx.toFixed(1)}, ${cy.toFixed(1)})`;
    where.set(key, (where.get(key) ?? 0) + 1);
  }
  total += n;
  if (process.argv[2] === 'all' && n) console.log(name, n);
}
console.log('folded cells over', POSTURES.length, 'postures:', total, Object.fromEntries(kinds.map((k, i) => [k, byKind[i]])));
console.log([...where].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v}  ${k}`).join('\n'));
