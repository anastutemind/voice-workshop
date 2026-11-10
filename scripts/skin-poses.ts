/**
 * Tells scripts/skin-register.py where the model puts the face in the posture
 * of each photograph of the skin (public/skin: the mouth at rest, a little
 * open, wide open, rounded, spread, the lip on the teeth, ...).
 *
 *   npx tsx scripts/skin-poses.ts points.json out.json <shape>[,<shape>...]
 *
 * points.json holds points of the face at rest ([x, y, upper] in canonical
 * cm, `upper` 1 for the upper lip's side of the mouth). For every shape the
 * answer gives where those points and the knots of the skin's net
 * (src/ui/tutor/skinNet.ts) are in the posture the model takes for that
 * shape's sound (PHOTO_POSES in src/ui/tutor/visemes.ts: a sound's, or one
 * part of the way from one sound's to another's), with the outlines of the
 * model's lips there, to check by eye, and the measures of the mouth the
 * photographs are blended by.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { headScene } from '../src/ui/head/scene';
import { INSIDE_LOWER_Y, INSIDE_UPPER_Y, insideGrid, NET_REST, NX, NY, ROW_LOWER, mouthMeasure, netKnots, skinPlacer } from '../src/ui/tutor/skinNet';
import { mouthFeatures, PHOTO_POSES } from '../src/ui/tutor/visemes';
import { photoArt } from './mirror-poses';

const [, , inPath, outPath, list] = process.argv;
const points = (JSON.parse(readFileSync(inPath, 'utf8')) as { points: [number, number, number][] }).points;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const shapes: Record<string, unknown> = {};
for (const name of (list ?? 'open,o,round').split(',')) {
  if (!PHOTO_POSES[name]) throw new Error(`no posture for the photograph ${name} (PHOTO_POSES in visemes.ts)`);
  const art = photoArt(name);
  const geom = computeGeometry(art, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const sc = headScene(geom, DEFAULT_ANATOMY, art);
  const put = skinPlacer(sc);
  // (the model's world is the painting's frame at the speaker's size: the answer is given in the painting's own centimetres)
  const k = 1 / sc.s, c3 = (v: number) => r3(v * k);
  const still = sc.place(-5, -3, 0);
  if (Math.abs(still[0] * k + 5) > 1e-6 || Math.abs(still[1] * k + 3) > 1e-6) throw new Error('the speaker is not the standard one: the still head is not where it is painted');
  shapes[name] = {
    pose: PHOTO_POSES[name].join(' '),
    features: Object.fromEntries(Object.entries(mouthFeatures(art, geom)).map(([k, v]) => [k, r3(v)])),
    points: points.map(([x, y, up]) => put(x, y, up > 0).map(c3)),
    knots: Array.from(netKnots(sc), c3),
    upperFace: sc.upperFace.map(c3), lowerFace: sc.lowerFace.map(c3), mouth: sc.mouth.map(c3),
    at: [r3(mouthMeasure(sc).gap), r3(mouthMeasure(sc).forward)],
    // the inside's two grids where this posture has them: the upper with the head, the lower with the jaw
    insideUpper: Array.from(insideGrid(INSIDE_UPPER_Y)).flatMap((v, i, a) => (i % 2 ? [] : sc.place(v, a[i + 1], 0).map(c3))),
    insideLower: Array.from(insideGrid(INSIDE_LOWER_Y)).flatMap((v, i, a) => (i % 2 ? [] : sc.place(v, a[i + 1], 1).map(c3))),
  };
}
writeFileSync(outPath, JSON.stringify({ nx: NX, ny: NY, rowLower: ROW_LOWER, rest: Array.from(NET_REST, r3), shapes }));
console.log(Object.entries(shapes).map(([k, v]) => { const q = v as { pose: string; at: number[] }; return `${k}: ${q.pose}: lips ${q.at[0]} cm apart, ${q.at[1]} cm forward`; }).join('\n'));
