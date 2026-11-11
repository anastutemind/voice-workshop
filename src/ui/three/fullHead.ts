/**
 * A whole head for the 3D view: the skin of both halves, all the way round.
 *
 * Its form is a scanned head ("Face Cap" by Bannaflak, public/models/facecap.glb;
 * see THIRD_PARTY_NOTICES.md): a real skull, nose, ears and lips. That head is
 * not the head of the painting, so it is bent onto it: seen from the side,
 * its outline is laid on the outline of the photographed face (which is the
 * painting's own, see scripts/skin-register.py), place by place (the tip of
 * the nose on the tip of the nose, the chin on the chin, the ear on the ear),
 * by a smooth bend of the side view that every point of the head takes,
 * whatever its distance from the middle. The scan ends under the jaw: a neck
 * is grown from that edge down to where the painting's neck is cut.
 *
 * The head then moves as the painting moves: every point turns with the jaw
 * by the share the painted skin takes at its place, and the lips go where the
 * painted lips go. So the two halves of the head meet the cut face of the 3D
 * view along its outline in every posture.
 *
 * Its skin is a picture made for it, in the scan's own texture space
 * (public/head3d/skin.jpg, baked by scripts/head3d-bake.py from photographs of
 * one man from every side, each registered to the bent head from where it was
 * taken): every feature lies where the form has it, from whichever side it is
 * seen. The neck has its own place in that picture, unrolled. The scan's own
 * upper teeth, with a lower row made from them that turns with the jaw, stand
 * behind its lips; the pocket the scan's lips close on is taken out, so that
 * the inside of the mouth is the anatomy's.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { BACKDROP_FRAME } from '../head/frame';
import { chinWeight } from '../head/outline';
import type { HeadScene } from '../head/scene';
import type { LipMove, LipProfile } from './head3d';

export interface Scan {
  /** the head's points, turned to the view's axes (x forward, y up, z to the side), in the scan's own units (10 cm) */
  position: Float32Array;
  index: Uint32Array;
  /** how far each point goes when the scan's jaw opens */
  jaw: Float32Array;
  /** how many of the points are the head's own skin: the rest are its eyes */
  skin: number;
  /** where each point is in the scan's own photograph of its skin (0..1), and that photograph */
  uv: Float32Array;
  map: THREE.Texture | null;
  /** the scan's teeth (both rows and their gums, as it was made: shut), in the same axes and units, and their triangles */
  teeth: { position: Float32Array; index: Uint32Array } | null;
}

/** The scanned head, or null if it cannot be read. */
export function loadScan(renderer: THREE.WebGLRenderer): Promise<Scan | null> {
  return new Promise((resolve) => {
    const ktx2 = new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
    new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).load('models/facecap.glb', (gltf) => {
      ktx2.dispose();
      let head: THREE.Mesh | null = null, teeth: THREE.Mesh | null = null;
      const eyes: THREE.Mesh[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 20) head = mesh;
        else if (/eye/i.test(mesh.parent?.name ?? '')) eyes.push(mesh);
        else if (/teeth/i.test(mesh.parent?.name ?? '')) teeth = mesh;
      });
      const h = head as THREE.Mesh | null, tm = teeth as THREE.Mesh | null;
      if (!h) { resolve(null); return; }
      const parts = [h, ...eyes];
      // The scan stands a little askew in its file (turned by a degree or two): seen from the side that is its
      // pose, and is kept; but its two halves must meet exactly at the middle, so how far to the side a point
      // lies is taken from the scan before that turn.
      const turned = gltf.scene.getObjectByName('grp_transform');
      const straight = new Map<THREE.Mesh, THREE.Matrix4>();
      if (turned) {
        const q = turned.quaternion.clone();
        turned.quaternion.identity();
        gltf.scene.updateMatrixWorld(true);
        for (const m of tm ? [...parts, tm] : parts) straight.set(m, m.matrixWorld.clone());
        turned.quaternion.copy(q);
        gltf.scene.updateMatrixWorld(true);
      }
      const total = parts.reduce((s, m) => s + (m.geometry.attributes.position as THREE.BufferAttribute).count, 0);
      const position = new Float32Array(3 * total), jaw = new Float32Array(3 * total), uv = new Float32Array(2 * total);
      const map = ((h.material as THREE.MeshStandardMaterial).map ?? null) as THREE.Texture | null;
      // (the file keeps its texture coordinates as whole numbers, with the scale and offset that make them 0..1 on
      // its texture: those of the file itself if its texture has not come)
      const [su, sv, ou, ov] = map ? [map.repeat.x, map.repeat.y, map.offset.x, map.offset.y] : UV_TRANSFORM;
      const index: number[] = [];
      const v = new THREE.Vector3(), b = new THREE.Vector3();
      let at = 0;
      for (const m of parts) {
        const g = m.geometry, pos = g.attributes.position as THREE.BufferAttribute, n = pos.count, mw = m.matrixWorld;
        const d = m === h ? (g.morphAttributes.position?.[h.morphTargetDictionary!.jawOpen] as THREE.BufferAttribute | undefined) : undefined;
        const lin = new THREE.Matrix3().setFromMatrix4(mw);
        const tc = g.attributes.uv as THREE.BufferAttribute | undefined;
        if (tc && m === h) {
          const raw = !tc.normalized && tc.array instanceof Uint16Array;
          for (let i = 0; i < n; i++) {
            const u = tc.getX(i), w = tc.getY(i);
            uv[2 * (at + i)] = raw ? ou + su * u : u; uv[2 * (at + i) + 1] = raw ? ov + sv * w : w;
          }
        }
        for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mw);
          // the scan looks along +z with x to its left: the view has the face along +x and the side along z
          position[3 * (at + i)] = v.z; position[3 * (at + i) + 1] = v.y; position[3 * (at + i) + 2] = -v.x;
          const st = straight.get(m);
          if (st) position[3 * (at + i) + 2] = -b.fromBufferAttribute(pos, i).applyMatrix4(st).x;
          if (d) {
            v.fromBufferAttribute(d, i);
            if (!g.morphTargetsRelative) v.sub(b.fromBufferAttribute(pos, i));
            v.applyMatrix3(lin);
            jaw[3 * (at + i)] = v.z; jaw[3 * (at + i) + 1] = v.y; jaw[3 * (at + i) + 2] = -v.x;
          }
        }
        const idx = g.index ? (g.index.array as ArrayLike<number>) : null;
        const count = idx ? idx.length : n;
        for (let i = 0; i < count; i++) index.push(at + (idx ? idx[i] : i));
        at += n;
      }
      // the teeth, placed as the head is
      let teethOut: Scan['teeth'] = null;
      if (tm) {
        const pos = tm.geometry.attributes.position as THREE.BufferAttribute, n = pos.count, st = straight.get(tm);
        const tp = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(tm.matrixWorld);
          tp[3 * i] = v.z; tp[3 * i + 1] = v.y; tp[3 * i + 2] = st ? -b.fromBufferAttribute(pos, i).applyMatrix4(st).x : -v.x;
        }
        const idx = tm.geometry.index ? Uint32Array.from(tm.geometry.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i);
        teethOut = { position: tp, index: idx };
      }
      resolve({ position, index: Uint32Array.from(index), jaw, skin: (h.geometry.attributes.position as THREE.BufferAttribute).count, uv, map, teeth: teethOut });
    }, undefined, () => resolve(null));
  });
}

// ------------------------------------------------------------------ the bend onto the painting

/**
 * The bend of the side view that lays one head's outline on the other's. Each outline is a ring of the same
 * places in the same order round a point inside the head (the hollow of the ear, on both); a point of the head
 * lies in the wedge between two neighbours of the ring and the centre, and keeps its place in that wedge. So
 * the outline goes exactly onto the outline, the ear onto the ear, and nothing between them can fold over.
 */
function fan(from: number[], to: number[], cf: [number, number], ct: [number, number]): (x: number, y: number) => [number, number] {
  const n = from.length / 2;
  const angle = new Float64Array(n);
  for (let i = 0; i < n; i++) angle[i] = Math.atan2(from[2 * i + 1] - cf[1], from[2 * i] - cf[0]);
  return (x, y) => {
    const px = x - cf[0], py = y - cf[1];
    const th = Math.atan2(py, px);
    // (the ring runs with the clock: the wedge is the one whose two sides the point lies between)
    let k = 0, best = Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let span = angle[i] - angle[j], off = angle[i] - th;
      if (span < 0) span += 2 * Math.PI;
      if (off < 0) off += 2 * Math.PI;
      if (span > 2.6) continue;
      if (off <= span + 1e-9) { k = i; best = 0; break; }
      const miss = Math.min(off - span, 2 * Math.PI - off);
      if (miss < best) { best = miss; k = i; }
    }
    const j = (k + 1) % n;
    const ax = from[2 * k] - cf[0], ay = from[2 * k + 1] - cf[1], bx = from[2 * j] - cf[0], by = from[2 * j + 1] - cf[1];
    const det = ax * by - ay * bx || 1e-9;
    const u = (px * by - py * bx) / det, v = (ax * py - ay * px) / det;
    return [ct[0] + u * (to[2 * k] - ct[0]) + v * (to[2 * j] - ct[0]), ct[1] + u * (to[2 * k + 1] - ct[1]) + v * (to[2 * j + 1] - ct[1])];
  };
}

/** Solves a small set of linear equations (each row its coefficients, then its right sides). */
function solve(A: number[][], rhs: number): number[][] {
  const m = A.length;
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-12;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = A[r][c] / d;
      if (f) for (let k = c; k < m + rhs; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r.slice(m).map((v) => v / (r[i] || 1e-12)));
}

/**
 * The outline of a head seen from the side, as the furthest point on every ray from a centre inside it: a
 * point for each degree, from the nape up over the crown and down the face to under the chin.
 */
function outlineOf(far: (cos: number, sin: number) => number, cx: number, cy: number, fromDeg: number, toDeg: number): number[] {
  const out: number[] = [];
  for (let a = fromDeg; a >= toDeg; a -= 1) {
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180), r = far(c, s);
    if (r > 0) out.push(cx + r * c, cy + r * s);
  }
  return out;
}

/** Points of an outline between places on it: each place itself, and `per` points evenly along the outline before the next. */
function along(line: number[], places: [number, number][], per: number): number[] {
  const n = line.length / 2;
  const near = (p: [number, number]) => { let b = 0, d = Infinity; for (let i = 0; i < n; i++) { const e = Math.hypot(line[2 * i] - p[0], line[2 * i + 1] - p[1]); if (e < d) { d = e; b = i; } } return b; };
  const idx = places.map(near);
  // (the places follow one another along the outline)
  for (let i = 1; i < idx.length; i++) if (idx[i] <= idx[i - 1]) idx[i] = Math.min(n - 1, idx[i - 1] + 1);
  const out: number[] = [];
  for (let k = 0; k + 1 < idx.length; k++) {
    const a = idx[k], b = idx[k + 1];
    const len = [0];
    for (let i = a; i < b; i++) len.push(len[len.length - 1] + Math.hypot(line[2 * i + 2] - line[2 * i], line[2 * i + 3] - line[2 * i + 1]));
    for (let j = 0; j <= per; j++) {
      const t = (len[len.length - 1] * j) / (per + 1);
      let i = 0;
      while (i + 2 < len.length && len[i + 1] < t) i++;
      const f = len[i + 1] > len[i] ? (t - len[i]) / (len[i + 1] - len[i]) : 0, q = a + i;
      out.push(line[2 * q] + f * (line[2 * q + 2] - line[2 * q]), line[2 * q + 1] + f * (line[2 * q + 3] - line[2 * q + 1]));
    }
  }
  const e = idx[idx.length - 1];
  out.push(line[2 * e], line[2 * e + 1]);
  return out;
}

/**
 * The same places on the two heads, read off each by eye: on the scan (its own units) and on the photograph
 * of the face from the side (the painting's centimetres). First those along the outline, from the nape over
 * the crown and down the face to under the chin; then those inside it.
 */
const OUTLINE: [string, [number, number], [number, number]][] = [
  ['nape', [-1.38, -0.23], [-9.2, 11.0]],
  ['back', [-1.47, 0.0], [-10.5, 13.0]],
  ['back of the skull', [-1.52, 0.45], [-10.4, 18.0]],
  ['back of the crown', [-1.2, 1.05], [-8.8, 26.0]],
  ['crown', [-0.45, 1.37], [-2.1, 28.4]],
  ['front of the crown', [0.2, 1.25], [4.5, 27.4]],
  ['top of the forehead', [0.5, 0.95], [7.98, 24.0]],
  ['forehead', [0.6, 0.62], [9.34, 19.5]],
  ['root of the nose', [0.52, 0.3], [8.36, 17.0]],
  ['tip of the nose', [0.84, -0.04], [10.7, 11.95]],
  ['under the nose', [0.66, -0.22], [9.03, 10.76]],
  ['top lip', [0.68, -0.33], [9.2, 9.1]],
  ['lips meet', [0.6, -0.45], [8.31, 8.1]],
  ['bottom lip', [0.65, -0.52], [8.78, 7.15]],
  ['fold', [0.58, -0.62], [7.96, 5.85]],
  ['chin', [0.63, -0.76], [8.27, 4.75]],
  ['under the chin', [0.42, -0.94], [7.3, 3.2]],
];
/** ...on round the open edge under the jaw and the skull, back to the nape: the ring is closed. */
const UNDER: [string, [number, number], [number, number]][] = [
  ['jaw, front', [0.2, -0.8], [4.6, 4.0]],
  ['jaw, middle', [0.0, -0.65], [2.0, 4.9]],
  ['jaw, back', [-0.2, -0.5], [-0.6, 6.4]],
  ['angle of the jaw', [-0.33, -0.4], [-2.4, 8.4]],
  ['under the ear', [-0.45, -0.3], [-3.4, 10.4]],
  ['behind the ear', [-0.75, -0.21], [-5.6, 10.6]],
  ['under the skull', [-1.05, -0.22], [-7.5, 10.8]],
];
/** The middle of the ring: the hollow of the ear. */
const EAR: [[number, number], [number, number]] = [[-0.55, -0.02], [-4.55, 14.45]];
/** Places inside the outline, each moved onto its own after the ring has done its work, with what is round it (within so many cm). */
const INSIDE: [string, [number, number], [number, number], number][] = [
  ['top of the ear', [-0.62, 0.28], [-5.9, 17.5], 1.6],
  ['back of the ear', [-0.83, 0.03], [-7.35, 15.3], 1.6],
  ['lobe of the ear', [-0.42, -0.31], [-3.2, 11.0], 1.4],
  ['front of the ear', [-0.38, -0.05], [-3.4, 13.6], 1.4],
  ['middle of the eye', [0.36, 0.25], [5.7, 16.5], 2.4],
  ['corner of the mouth', [0.4, -0.46], [6.9, 8.06], 2.0],
];
/** Centimetres of the painting to a unit of the scan, from the middle of the head to its side. */
const SIDE = 9.6;
/** Where the lips meet at rest, and the corner of the mouth (the painting's cm). */
const LIPS_MEET = 8.06, CORNER = 6.9;
/** How far forward the lips stand at their middle (the painting's cm): where the lips meet, less a little. */
const LIPS_FRONT = 8.6;
/** The neck: where it is cut, where it becomes a plain column under the jaw, its half width, and how many rings it has from the scan's edge down. */
const NECK_CUT = -3.45, NECK_TOP = 2.6, NECK_HALF = 5.7, RINGS_JOIN = 6, RINGS_NECK = 5;
/** Where the neck's skin is in the scan's picture (u0, v0, u1, v1: a part of it the scan does not use; v down, as glTF has it). */
export const NECK_UV: readonly [number, number, number, number] = [0.012, 0.012, 0.47, 0.25];
/** The scale and offset of the scan's texture coordinates, as its file gives them (KHR_texture_transform). */
const UV_TRANSFORM: readonly [number, number, number, number] = [0.000238723238, 0.000239208952, 0.00724834995, 0.0100790262];

export interface Head {
  count: number;
  /** per point: its place at rest in the painting's centimetres (x forward, y up, z to the side, the middle at 0) */
  canon: Float32Array;
  /** which way the skin faces there, at rest */
  facing: Float32Array;
  index: Uint32Array;
  /** how much of the jaw's turn each point takes */
  weight: Float32Array;
  /** the lips: how much of a point is of the lower lip (0 the upper, 1 the lower: in between at the corners of
   *  the mouth, where the two meet), how much of the lips' movement it takes, and where along each lip's profile
   *  it lies (-1 where it is not by that lip) */
  lipLow: Float32Array;
  lipShare: Float32Array;
  lipAtU: Float32Array;
  lipAtL: Float32Array;
  /** 0 skin, 1 an eye, 2 the cut end of the neck */
  kind: Float32Array;
  /** where each point is in the scan's own photograph (the neck: where the edge under the jaw it grows from is) */
  uv: Float32Array;
  /** the scan is in pieces that meet edge to edge: for each point, the one point that stands for all those at its place */
  same: Int32Array;
  /** the eyes as balls (the far one, z below 0, first): their middles, and how far their fronts stand from them (the painting's cm) */
  eyes: [number, number, number, number][];
  /** the teeth (see `Teeth`), or null if the scan has none */
  teeth: Teeth | null;
}

/**
 * The teeth of the whole head: the scan's own upper row, bent with the head, and a lower row made from it
 * (each crown turned over onto its own edge, the front ones a little behind and over the edges of the upper
 * ones, as a closed bite has them). Every point at rest in the painting's centimetres, the lower row as it is
 * with the teeth together; `lower` 1 for a point of the lower row, which turns with the jaw.
 */
export interface Teeth {
  canon: Float32Array;
  index: Uint32Array;
  lower: Float32Array;
  /** how far up a crown a point is, 0 at its biting edge, 1 where it leaves the gum */
  crown: Float32Array;
  /** the front of the upper incisors (the painting's cm, x) */
  front: number;
}

const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const cheek = (y: number) => 1 - ease((y - 6.9) / 2.3);

/**
 * The outline of the painted head (the painting's cm), from its silhouette (`inside`: `w` by `h` samples over
 * the painting's frame): the cut face of the 3D view ends there, and so must the two halves of the head.
 */
export function paintingOutline(inside: Uint8Array, w: number, h: number): { line: number[]; front: (y: number) => number; back: (y: number) => number } {
  const f = BACKDROP_FRAME, k = w / (f.x1 - f.x0);
  const on = (x: number, y: number) => {
    const i = Math.round((x - f.x0) * k), j = Math.round((f.y1 - y) * k);
    return i >= 0 && i < w && j >= 0 && j < h && inside[j * w + i] > 0;
  };
  const cx = -0.5, cy = 15.5;
  const line = outlineOf((cs, sn) => { let last = 0; for (let r = 0.5; r < 17; r += 0.04) if (on(cx + r * cs, cy + r * sn)) last = r; return last; }, cx, cy, 215, -62);
  const edge = (y: number, dir: 1 | -1) => { for (let x = dir > 0 ? f.x1 : f.x0; dir > 0 ? x > f.x0 : x < f.x1; x -= dir * 0.04) if (on(x, y)) return x; return 0; };
  return { line, front: (y) => edge(y, 1), back: (y) => edge(y, -1) };
}

/**
 * The whole head, bent onto the painted one: `outline` is the painting's (see `paintingOutline`), `lips` the
 * painted profile of the lips at rest.
 */
export function buildHead(scan: Scan, outline: ReturnType<typeof paintingOutline>, lips: LipProfile | null): Head {
  const P = scan.position, n0 = P.length / 3;
  // ---- the scan's own outline from the side: on every ray from a point inside it, the furthest place where
  // the ray crosses an edge of the scan (its points alone are too far apart over the skull)
  const sx = -0.35, sy = 0.25;
  const bins = new Float32Array(360);
  {
    const I = scan.index, deg = 180 / Math.PI;
    for (let t = 0; t < I.length; t += 3) {
      if (I[t] >= scan.skin) continue;
      for (let k = 0; k < 3; k++) {
        const p = I[t + k], q = I[t + (k + 1) % 3];
        const px = P[3 * p] - sx, py = P[3 * p + 1] - sy, qx = P[3 * q] - sx, qy = P[3 * q + 1] - sy;
        let a0 = Math.atan2(py, px) * deg, a1 = Math.atan2(qy, qx) * deg;
        if (a1 < a0) { const w = a0; a0 = a1; a1 = w; }
        if (a1 - a0 > 180) { const w = a0 + 360; a0 = a1; a1 = w; }
        for (let a = Math.ceil(a0); a <= a1; a++) {
          const c = Math.cos(a / deg), sn = Math.sin(a / deg);
          // where the ray (c, sn) meets the line through p and q
          const ex = qx - px, ey = qy - py, den = c * ey - sn * ex;
          if (Math.abs(den) < 1e-12) continue;
          const r = (px * ey - py * ex) / den, bin = ((a % 360) + 360) % 360;
          if (r > bins[bin]) bins[bin] = r;
        }
      }
    }
  }
  const own = outlineOf((cs, sn) => bins[Math.round((Math.atan2(sn, cs) * 180) / Math.PI + 360) % 360], sx, sy, 208, -60);
  // ---- the bend: the ring of places (the outline place by place with the points between, then round under
  // the jaw), then the places inside
  const from = along(own, OUTLINE.map((q) => q[1]), 3), to = along(outline.line, OUTLINE.map((q) => q[2]), 3);
  for (const [, a, b] of UNDER) { from.push(...a); to.push(...b); }
  // (the ring must go one way round the ear on both heads: a point that steps back, on either, is left out)
  {
    const turn = (ring: number[], c: [number, number]) => {
      const out: number[] = [];
      let last = 0;
      for (let i = 0; i < ring.length / 2; i++) {
        let a = Math.atan2(ring[2 * i + 1] - c[1], ring[2 * i] - c[0]);
        if (i > 0) { while (a > last + Math.PI) a -= 2 * Math.PI; while (a < last - Math.PI) a += 2 * Math.PI; }
        out.push(a); last = a;
      }
      return out;
    };
    const as = turn(from, EAR[0]), at = turn(to, EAR[1]);
    const f2: number[] = [], t2: number[] = [];
    let ls = Infinity, lt = Infinity;
    for (let i = 0; i < as.length; i++) {
      if (as[i] > ls - 0.004 || at[i] > lt - 0.004) continue;
      // (and never more than once round)
      if (f2.length && (as[0] - as[i] > 2 * Math.PI - 0.01 || at[0] - at[i] > 2 * Math.PI - 0.01)) continue;
      ls = as[i]; lt = at[i];
      f2.push(from[2 * i], from[2 * i + 1]); t2.push(to[2 * i], to[2 * i + 1]);
    }
    from.length = 0; to.length = 0;
    from.push(...f2); to.push(...t2);
  }
  const ring = fan(from, to, EAR[0], EAR[1]);
  // (each place inside pulls what is round it onto its own: less the further away, nothing at the outline,
  // which stays where the ring put it)
  const centre = INSIDE.map(([, a]) => ring(a[0], a[1]));
  const hold = (x: number, y: number) => {
    // how far out from the ear toward the outline a point is, 0 to 1: by the wedge it lies in
    const q = [x - EAR[1][0], y - EAR[1][1]], th = Math.atan2(q[1], q[0]);
    let far = 1e9;
    for (let i = 0; i < to.length / 2; i++) {
      const ex = to[2 * i] - EAR[1][0], ey = to[2 * i + 1] - EAR[1][1];
      let d = Math.abs(Math.atan2(ey, ex) - th);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < 0.12) far = Math.min(far, Math.hypot(ex, ey));
    }
    const rho = far < 1e8 ? Math.min(1, Math.hypot(q[0], q[1]) / far) : 0.5;
    return 1 - rho * rho * rho * rho;
  };
  const bump = (i: number, x: number, y: number) => { const dx = x - centre[i][0], dy = y - centre[i][1], r = INSIDE[i][3]; return Math.exp(-(dx * dx + dy * dy) / (r * r)); };
  const rows = INSIDE.map((q, i) => {
    const w = hold(centre[i][0], centre[i][1]);
    // (a place that lies on the outline is already where the ring put it: it pulls nothing)
    if (w < 0.08) return [...INSIDE.map((_, j) => (j === i ? 1 : 0)), 0, 0];
    return [...INSIDE.map((_, j) => w * bump(j, centre[i][0], centre[i][1])), q[2][0] - centre[i][0], q[2][1] - centre[i][1]];
  });
  if (import.meta.env.DEV) console.log('[head fit]', JSON.stringify({ from: from.map((v) => +v.toFixed(2)), to: to.map((v) => +v.toFixed(1)) }));
  const pull = solve(rows, 2);
  const warp = (x: number, y: number): [number, number] => {
    const q = ring(x, y), w = hold(q[0], q[1]);
    let ox = 0, oy = 0;
    for (let i = 0; i < INSIDE.length; i++) { const g = w * bump(i, q[0], q[1]); ox += g * pull[i][0]; oy += g * pull[i][1]; }
    return [q[0] + ox, q[1] + oy];
  };

  // ---- the scan is in pieces (the face, the skull, the eyes), and not all of them are wound the same way:
  // each piece is turned so that it faces away from the middle of the head
  const idx0 = Uint32Array.from(scan.index);
  {
    const piece = new Int32Array(n0).fill(-1);
    const find = (i: number): number => { while (piece[i] !== i) { piece[i] = piece[piece[i]]; i = piece[i]; } return i; };
    for (let i = 0; i < n0; i++) piece[i] = i;
    for (let t = 0; t < idx0.length; t += 3) { const a = find(idx0[t]); piece[find(idx0[t + 1])] = a; piece[find(idx0[t + 2])] = a; }
    const out = new Map<number, number>();
    const mx = -0.35, my = 0.25;
    for (let t = 0; t < idx0.length; t += 3) {
      const a = idx0[t], b = idx0[t + 1], c = idx0[t + 2];
      const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
      const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const gx = (P[3 * a] + P[3 * b] + P[3 * c]) / 3 - mx, gy = (P[3 * a + 1] + P[3 * b + 1] + P[3 * c + 1]) / 3 - my, gz = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
      const r = find(a);
      // (an eye faces away from its own middle: near enough, away from the head's)
      out.set(r, (out.get(r) ?? 0) + (nx * gx + ny * gy + nz * gz));
    }
    for (let t = 0; t < idx0.length; t += 3) if ((out.get(find(idx0[t])) ?? 0) < 0) { const k = idx0[t + 1]; idx0[t + 1] = idx0[t + 2]; idx0[t + 2] = k; }
  }

  // ---- the mouth: the scan's lips close on a pocket (the inside of its mouth), which is taken out: the
  // inside of this head's mouth is the anatomy's. The pocket is in pieces of its own in the scan's picture
  // (it has its own islands there): every piece of the skin that lies wholly inside the mouth, behind the
  // lips, goes, and the lips keep their own inner edge.
  const piece = new Int32Array(n0);
  {
    for (let i = 0; i < n0; i++) piece[i] = i;
    const find = (i: number): number => { while (piece[i] !== i) { piece[i] = piece[piece[i]]; i = piece[i]; } return i; };
    for (let t = 0; t < idx0.length; t += 3) { const a = find(idx0[t]); piece[find(idx0[t + 1])] = a; piece[find(idx0[t + 2])] = a; }
    for (let i = 0; i < n0; i++) piece[i] = find(i);
  }
  const reach = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < scan.skin; i++) {
    const r = piece[i], q = warp(P[3 * i], P[3 * i + 1]), b = reach.get(r) ?? [Infinity, -Infinity, Infinity, -Infinity];
    reach.set(r, [Math.min(b[0], q[0]), Math.max(b[1], q[0]), Math.min(b[2], q[1]), Math.max(b[3], q[1])]);
  }
  const pocket = (i: number) => {
    if (i >= scan.skin) return false;
    const b = reach.get(piece[i]);
    return !!b && b[1] < CORNER - 0.2 && b[2] > LIPS_MEET - 2.6 && b[3] < LIPS_MEET + 4 && Math.abs(P[3 * i + 2]) * SIDE < 4;
  };
  // (and whatever of the skin's own pieces reaches deep into the mouth, well behind the corners of the lips)
  const deep = (i: number) => {
    if (i >= scan.skin) return false;
    const q = warp(P[3 * i], P[3 * i + 1]);
    return q[0] < CORNER - 1.2 && q[1] > LIPS_MEET - 2.4 && q[1] < LIPS_MEET + 3.2 && Math.abs(P[3 * i + 2]) * SIDE < 3.4;
  };
  // (and the lips' inner side more than a few millimetres behind their front: bent onto the painting it runs back
  // into the mouth in long spikes, which seen through an open mouth would stand there like a row of teeth. The
  // lips' front follows the curve of the mouth back to its corners)
  const flange = (t: number) => {
    const a = idx0[t], b = idx0[t + 1], c = idx0[t + 2];
    if (a >= scan.skin || b >= scan.skin || c >= scan.skin) return false;
    const qa = warp(P[3 * a], P[3 * a + 1]), qb = warp(P[3 * b], P[3 * b + 1]), qc = warp(P[3 * c], P[3 * c + 1]);
    const x = (qa[0] + qb[0] + qc[0]) / 3, y = (qa[1] + qb[1] + qc[1]) / 3, z = ((P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3) * SIDE;
    if (Math.abs(z) > 3.1 || y < LIPS_MEET - 1.2 || y > LIPS_MEET + 1.5) return false;
    return x < LIPS_FRONT - 0.25 * z * z - 0.75;
  };
  const kept: number[] = [];
  for (let t = 0; t < idx0.length; t += 3) {
    if (pocket(idx0[t]) || (deep(idx0[t]) && deep(idx0[t + 1]) && deep(idx0[t + 2])) || flange(t)) continue;
    kept.push(idx0[t], idx0[t + 1], idx0[t + 2]);
  }

  // ---- the open edge under the jaw: the edges that one triangle only has (points at one place being one point)
  const same = new Map<string, number>(), root = new Int32Array(n0);
  for (let i = 0; i < n0; i++) {
    const key = `${Math.round(P[3 * i] * 2e4)},${Math.round(P[3 * i + 1] * 2e4)},${Math.round(P[3 * i + 2] * 2e4)}`;
    const r = same.get(key);
    if (r === undefined) { same.set(key, i); root[i] = i; } else root[i] = r;
  }
  const once = new Map<string, [number, number] | null>();
  for (let t = 0; t < idx0.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = root[idx0[t + k]], b = root[idx0[t + (k + 1) % 3]];
    if (a === b || a >= scan.skin) continue;
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    once.set(key, once.has(key) ? null : [a, b]);
  }
  const next = new Map<number, number>();
  for (const e of once.values()) if (e) next.set(e[0], e[1]);
  // (the loops of the edge: the one under the jaw is the longest)
  let rim: number[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let at: number | undefined = start;
    while (at !== undefined && !seen.has(at)) { seen.add(at); loop.push(at); at = next.get(at); }
    if (at === start && loop.length > rim.length) rim = loop;
  }

  // ---- every point in the painting's centimetres
  // (the neck: a column of points from every point of the edge, and one more column where its picture closes
  // round; then the cut end, a ring and its middle)
  const column = RINGS_JOIN + RINGS_NECK, cols = rim.length + 1, extra = rim.length > 8 ? cols * (column + 1) + cols + 1 : 0, count = n0 + extra;
  const canon = new Float32Array(3 * count), kind = new Float32Array(count), uv = new Float32Array(2 * count);
  /** for a point that is a copy of another at the same place (the neck's own copy of the scan's edge), that other */
  const copyOf = new Int32Array(count).fill(-1);
  uv.set(scan.uv.subarray(0, 2 * n0));
  for (let i = 0; i < n0; i++) {
    const q = warp(P[3 * i], P[3 * i + 1]);
    canon[3 * i] = q[0]; canon[3 * i + 1] = q[1]; canon[3 * i + 2] = P[3 * i + 2] * SIDE;
    kind[i] = i < scan.skin ? 0 : 1;
  }
  // ---- the neck: from every point of the edge a line of points down to the cut, first to the neck's own
  // column under the jaw (straight: under the chin it is the slope to the throat), then down the column,
  // whose front and back are the photograph's. Its skin has a place of its own in the scan's picture (where
  // the scan has nothing): the neck unrolled, round it across and down it from the edge to the cut; so the
  // edge has a copy of its own in the neck, at the same places.
  const index = kept.slice();
  if (rim.length > 8) {
    const mid = (y: number): [number, number] => { const f = outline.front(y), b = outline.back(y); return [0.5 * (f + b), 0.5 * (f - b)]; };
    const [c0, r0] = mid(NECK_TOP);
    const angle0 = rim.map((v) => Math.atan2(canon[3 * v + 2] / NECK_HALF, (canon[3 * v] - c0) / r0));
    // (the picture of the neck closes round at the back of it)
    let s0 = 0;
    for (let j = 1; j < rim.length; j++) if (Math.abs(angle0[j]) > Math.abs(angle0[s0])) s0 = j;
    const ring = [...rim.slice(s0), ...rim.slice(0, s0)], angle = [...angle0.slice(s0), ...angle0.slice(0, s0)], R = ring.length;
    const turned = [0];
    const step = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    for (let j = 1; j < R; j++) turned.push(turned[j - 1] + step(angle[j - 1], angle[j]));
    const round = turned[R - 1] + step(angle[R - 1], angle[0]) || 2 * Math.PI;
    // (the edge goes back on itself a little here and there, behind the angle of the jaw: the way round the neck
    // only ever goes on, or the neck and its picture would fold over)
    const dir = Math.sign(round);
    for (let j = 1; j < R; j++) turned[j] = dir * Math.max(dir * turned[j], dir * turned[j - 1]);
    const first = n0, at = (j: number, k: number) => first + j * (column + 1) + k;
    // (each column goes down from the edge: where the edge is already as low as the top of the neck's own column,
    // under the angle of the jaw, the column begins a little below it rather than folding back up to it)
    const length = new Float64Array(R + 1);
    for (let j = 0; j <= R; j++) {
      const v = ring[j % R], a = angle[0] + (j === R ? round : turned[j]);
      const bx = canon[3 * v], by = canon[3 * v + 1], bz = canon[3 * v + 2], cs = Math.cos(a), sn = Math.sin(a);
      const top = Math.min(NECK_TOP, by - 0.6);
      for (let k = 0; k <= column; k++) {
        let x: number, y: number, z: number;
        if (k <= RINGS_JOIN) {
          const t = k / RINGS_JOIN, e = t * t * (3 - 2 * t);
          const [c, r] = mid(top);
          // (a little hollow under the jaw, as a throat is)
          x = bx + (c + r * cs - bx) * e; y = by + (top - by) * t; z = bz + (NECK_HALF * sn - bz) * (0.35 * t + 0.65 * e);
        } else {
          y = top + (NECK_CUT - top) * ((k - RINGS_JOIN) / RINGS_NECK);
          const [c, r] = mid(y);
          x = c + r * cs; z = NECK_HALF * sn;
        }
        const q = at(j, k);
        canon[3 * q] = x; canon[3 * q + 1] = y; canon[3 * q + 2] = z;
        if (k > 0) {
          const p = at(j, k - 1);
          length[j] += Math.hypot(x - canon[3 * p], y - canon[3 * p + 1], z - canon[3 * p + 2]);
        }
        copyOf[q] = k === 0 ? v : j === R ? at(0, k) : -1;
      }
    }
    // the neck unrolled: across by the way round it, down by the length along it (one scale for the whole neck,
    // so its skin is nowhere stretched)
    const longest = Math.max(...length);
    for (let j = 0; j <= R; j++) {
      const u = NECK_UV[0] + (NECK_UV[2] - NECK_UV[0]) * (j === R ? 1 : turned[j] / round);
      let along = 0;
      for (let k = 0; k <= column; k++) {
        const q = at(j, k);
        if (k > 0) { const p = at(j, k - 1); along += Math.hypot(canon[3 * q] - canon[3 * p], canon[3 * q + 1] - canon[3 * p + 1], canon[3 * q + 2] - canon[3 * p + 2]); }
        uv[2 * q] = u; uv[2 * q + 1] = NECK_UV[1] + (NECK_UV[3] - NECK_UV[1]) * (along / longest);
      }
    }
    // the cut end of the neck: a ring at the cut, and a point in its middle
    const cap = at(R + 1, 0);
    for (let j = 0; j <= R; j++) {
      const q = cap + j, p = at(j, column);
      canon[3 * q] = canon[3 * p]; canon[3 * q + 1] = canon[3 * p + 1]; canon[3 * q + 2] = canon[3 * p + 2];
      // (a face of its own, with its own edge: not a copy for the shading)
      uv[2 * q] = uv[2 * p]; uv[2 * q + 1] = uv[2 * p + 1]; kind[q] = 2;
    }
    const end = cap + R + 1;
    const [cb] = mid(NECK_CUT);
    canon[3 * end] = cb; canon[3 * end + 1] = NECK_CUT; canon[3 * end + 2] = 0; kind[end] = 2;
    uv[2 * end] = 0.5 * (NECK_UV[0] + NECK_UV[2]); uv[2 * end + 1] = NECK_UV[3];
    for (let j = 0; j < R; j++) {
      for (let k = 0; k < column; k++) {
        const a = at(j, k), b = at(j + 1, k), c = at(j, k + 1), d = at(j + 1, k + 1);
        index.push(a, c, b, b, c, d);
      }
      index.push(cap + j, end, cap + j + 1);
    }
  }
  // (the triangles of the neck face outward as the scan's do: turned over if they do not)
  // ---- which way the skin faces at rest
  const facing = new Float32Array(3 * count);
  const tri = Uint32Array.from(index);
  const face = (t: number): [number, number, number] => {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    const ux = canon[3 * b] - canon[3 * a], uy = canon[3 * b + 1] - canon[3 * a + 1], uz = canon[3 * b + 2] - canon[3 * a + 2];
    const vx = canon[3 * c] - canon[3 * a], vy = canon[3 * c + 1] - canon[3 * a + 1], vz = canon[3 * c + 2] - canon[3 * a + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  // (does the neck face outward? at its first triangle, away from the neck's own axis)
  if (rim.length > 8) {
    const t0 = kept.length, nrm = face(t0), a = tri[t0];
    const [c0] = [0.5 * (outline.front(NECK_TOP) + outline.back(NECK_TOP))];
    if (nrm[0] * (canon[3 * a] - c0) + nrm[2] * canon[3 * a + 2] < 0) for (let t = t0; t < tri.length; t += 3) { const s = tri[t + 1]; tri[t + 1] = tri[t + 2]; tri[t + 2] = s; }
  }
  for (let t = 0; t < tri.length; t += 3) { const nrm = face(t); for (let k = 0; k < 3; k++) { const q = tri[t + k]; facing[3 * q] += nrm[0]; facing[3 * q + 1] += nrm[1]; facing[3 * q + 2] += nrm[2]; } }
  // (the points at one place face one way: no seam shows where the scan's pieces meet, nor where the neck does)
  const one = new Int32Array(count);
  for (let i = 0; i < count; i++) one[i] = i < n0 ? root[i] : copyOf[i] >= 0 ? one[copyOf[i]] : i;
  const sum = new Float32Array(3 * count);
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) sum[3 * one[i] + c] += facing[3 * i + c];
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) facing[3 * i + c] = sum[3 * one[i] + c];
  for (let i = 0; i < count; i++) { const l = Math.hypot(facing[3 * i], facing[3 * i + 1], facing[3 * i + 2]) || 1; facing[3 * i] /= l; facing[3 * i + 1] /= l; facing[3 * i + 2] /= l; }

  // ---- how each point moves: with the jaw by its share, and with the lip it belongs to
  const weight = new Float32Array(count), lipLow = new Float32Array(count), lipShare = new Float32Array(count);
  const lipAtU = new Float32Array(count).fill(-1), lipAtL = new Float32Array(count).fill(-1);
  let most = 0;
  for (let i = 0; i < scan.skin; i++) most = Math.max(most, Math.hypot(scan.jaw[3 * i], scan.jaw[3 * i + 1], scan.jaw[3 * i + 2]));
  const place = (profile: number[], y: number): number => {
    const m = profile.length / 2;
    if (y >= profile[1]) return 0;
    for (let i = 0; i + 1 < m; i++) { const y0 = profile[2 * i + 1], y1 = profile[2 * i + 3]; if (y <= y0 && y >= y1) return i + (y0 - y1 > 1e-6 ? (y0 - y) / (y0 - y1) : 0); }
    return m - 1;
  };
  for (let i = 0; i < count; i++) {
    const x = canon[3 * i], y = canon[3 * i + 1];
    // (in front of the corner of the mouth, the scan itself says which lip a point is of: what its jaw carries is
    // the lower; where the lips meet at their corners it carries a point partly, and the point goes partly with each,
    // so that the corner stretches and does not tear)
    const moved = i < scan.skin && most > 0 ? Math.hypot(scan.jaw[3 * i], scan.jaw[3 * i + 1], scan.jaw[3 * i + 2]) / most : -1;
    const byJaw = moved >= 0 ? ease((x - (CORNER - 0.75)) / 0.5) * (1 - ease((Math.abs(y - LIPS_MEET) - 1.3) / 0.4)) : 0;
    const lowY = y >= LIPS_MEET ? 0 : 1, low = lowY + (ease((moved - 0.12) / 0.36) - lowY) * byJaw;
    const front = ease((x - CORNER) / 1.0);
    weight[i] = kind[i] === 1 ? 0 : chinWeight(x) * (cheek(y) + (low - cheek(y)) * front);
    lipLow[i] = low;
    if (!lips || kind[i] === 1) continue;
    // (all of the lips' movement at their middle, less toward the corners of the mouth: read off how far back the
    // skin lies there, or, for the lips' inner side, which lies further back than their front at the same
    // place, off how far it is from the middle, as for the front there)
    const inner = ease((0.35 - facing[3 * i]) / 0.3) * (1 - ease((Math.abs(y - LIPS_MEET) - 1.0) / 0.4));
    lipShare[i] = Math.max(ease((x - (CORNER - 0.7)) / 1.7), inner * ease((3.4 - Math.abs(canon[3 * i + 2])) / 1.6));
    // (a lip's inner side lies a little past the line where the lips meet: it goes with its lip)
    const mu = lips.upper.length / 2, ml = lips.lower.length / 2;
    if (mu >= 2) {
      const top = lips.upper[1], foot = lips.upper[2 * mu - 1];
      if (y <= top && y >= foot - 0.7) lipAtU[i] = place(lips.upper, Math.max(foot, Math.min(top, y)));
    }
    if (ml >= 2) {
      const top = lips.lower[1], foot = lips.lower[2 * ml - 1];
      if (y >= foot && y <= top + 0.7) lipAtL[i] = place(lips.lower, Math.max(foot, Math.min(top, y)));
    }
  }
  // (a copy moves as what it is a copy of)
  for (let i = n0; i < count; i++) {
    const o = copyOf[i];
    if (o < 0) continue;
    weight[i] = weight[o]; lipLow[i] = lipLow[o]; lipShare[i] = lipShare[o]; lipAtU[i] = lipAtU[o]; lipAtL[i] = lipAtL[o];
  }
  // the eyes: the ball that fits each best (its middle and radius), the far one first
  const eyes: [number, number, number, number][] = [[4.36, 16.61, -3.15, 2.46], [4.52, 16.85, 3.16, 2.44]];
  for (const [k, side] of [[0, -1], [1, 1]] as const) {
    // (a sphere through the points, by least squares: |p|² = 2 c·p + (r² - |c|²))
    const A = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    let m = 0;
    for (let i = scan.skin; i < n0; i++) {
      if (side * canon[3 * i + 2] <= 0) continue;
      const row = [2 * canon[3 * i], 2 * canon[3 * i + 1], 2 * canon[3 * i + 2], 1];
      const b = canon[3 * i] ** 2 + canon[3 * i + 1] ** 2 + canon[3 * i + 2] ** 2;
      for (let r = 0; r < 4; r++) { for (let c = 0; c < 4; c++) A[r][c] += row[r] * row[c]; A[r][4] += row[r] * b; }
      m++;
    }
    if (m < 16) continue;
    const [[cx], [cy], [cz], [d]] = solve(A, 1);
    const r = Math.sqrt(Math.max(1e-6, d + cx * cx + cy * cy + cz * cz));
    // (the bend stretches the ball a little forward: how far its front stands from the middle is its radius
    // where the iris is)
    let front = 0;
    for (let i = scan.skin; i < n0; i++) if (side * canon[3 * i + 2] > 0) front = Math.max(front, canon[3 * i] - cx);
    if (r > 0.5 && r < 4) eyes[k] = [cx, cy, cz, front > 0.5 && front < 4 ? front : r];
  }
  return { count, canon, facing, index: tri, weight, lipLow, lipShare, lipAtU, lipAtL, kind, same: one, eyes, uv, teeth: scan.teeth ? buildTeeth(scan.teeth, warp) : null };
}

/** The teeth (see `Teeth`): the scan's upper row and a lower row made from it, bent as the head is. */
function buildTeeth(src: NonNullable<Scan['teeth']>, warp: (x: number, y: number) => [number, number]): Teeth {
  const TP = src.position, TI = src.index, m = TP.length / 3;
  // (each crown is a piece of its own)
  const root = Int32Array.from({ length: m }, (_, i) => i);
  const find = (i: number): number => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
  for (let t = 0; t < TI.length; t += 3) { const a = find(TI[t]); root[find(TI[t + 1])] = a; root[find(TI[t + 2])] = a; }
  const lo = new Map<number, number>(), hi = new Map<number, number>(), sx = new Map<number, number>(), nx = new Map<number, number>();
  for (let i = 0; i < m; i++) {
    const r = find(i), y = TP[3 * i + 1];
    lo.set(r, Math.min(lo.get(r) ?? Infinity, y)); hi.set(r, Math.max(hi.get(r) ?? -Infinity, y));
    sx.set(r, (sx.get(r) ?? 0) + TP[3 * i]); nx.set(r, (nx.get(r) ?? 0) + 1);
  }
  const canon = new Float32Array(6 * m), lower = new Float32Array(2 * m), crown = new Float32Array(2 * m);
  let front = -Infinity;
  for (let i = 0; i < m; i++) {
    const r = find(i), y0 = lo.get(r)!, y1 = hi.get(r)!, x = TP[3 * i], y = TP[3 * i + 1], z = TP[3 * i + 2];
    const q = warp(x, y);
    canon[3 * i] = q[0]; canon[3 * i + 1] = q[1]; canon[3 * i + 2] = z * SIDE;
    crown[i] = crown[m + i] = y1 > y0 ? (y - y0) / (y1 - y0) : 0;
    front = Math.max(front, q[0]);
    // the lower crown under it, turned over onto the same edge and a little shorter: inside the upper arch (the
    // front ones 5 mm behind the upper edges, the arch narrower) and a little below it, behind the lower lip's
    // inner side, which keeps them out of sight unless the mouth is well open (the scan's units are 10 cm)
    const a = ease((sx.get(r)! / nx.get(r)! - 0.42) / 0.08);
    const ql = warp(x - 0.035 * a - 0.015, y0 - 0.85 * (y - y0) - 0.006 - 0.004 * a);
    canon[3 * (m + i)] = ql[0]; canon[3 * (m + i) + 1] = ql[1]; canon[3 * (m + i) + 2] = z * (0.92 - 0.04 * a) * SIDE;
    lower[m + i] = 1;
  }
  // (the lower row is a mirror image: its triangles turn the other way)
  const index = new Uint32Array(2 * TI.length);
  index.set(TI);
  for (let t = 0; t < TI.length; t += 3) { index[TI.length + t] = m + TI[t]; index[TI.length + t + 1] = m + TI[t + 2]; index[TI.length + t + 2] = m + TI[t + 1]; }
  return { canon, index, lower, crown, front };
}

/**
 * Where the teeth are for a posture (world cm): the upper row with the skull, the lower row turned with the jaw
 * from `bite`, the lower row's place at rest such that it closes on the upper one when the jaw is shut.
 */
export function placeTeeth(teeth: Teeth, bite: Float32Array, sc: HeadScene, out: Float32Array): void {
  const { canon, lower } = teeth, n = lower.length, s = sc.s;
  for (let v = 0; v < n; v++) {
    const q = lower[v] ? sc.place(bite[2 * v], bite[2 * v + 1], 1) : sc.place(canon[3 * v], canon[3 * v + 1], 0);
    out[3 * v] = q[0]; out[3 * v + 1] = q[1]; out[3 * v + 2] = canon[3 * v + 2] * s;
  }
}

/**
 * The lower row's place at rest (x, y per point), from the scene of a shut jaw `shut`: the point that the jaw's
 * turn in that scene carries to where the row closes on the upper one.
 */
export function restBite(teeth: Teeth, shut: HeadScene): Float32Array {
  const { canon, lower } = teeth, n = lower.length, s = shut.s;
  // (the turn of the jaw, as the scene does it, is a turn about a point: read off three points and undone)
  const at = (x: number, y: number) => { const q = shut.place(x, y, 1); return [q[0] / s, q[1] / s]; };
  const o = at(0, 10), ex = at(1, 10), ey = at(0, 11);
  const a = ex[0] - o[0], b = ey[0] - o[0], c = ex[1] - o[1], d = ey[1] - o[1], det = a * d - b * c || 1;
  const out = new Float32Array(2 * n);
  for (let v = 0; v < n; v++) {
    const x = canon[3 * v], y = canon[3 * v + 1];
    if (!lower[v]) { out[2 * v] = x; out[2 * v + 1] = y; continue; }
    // the shut scene keeps the skull still: the row with its teeth together is where the skull would have it
    const t = shut.place(x, y, 0), px = t[0] / s - o[0], py = t[1] / s - o[1];
    out[2 * v] = (d * px - b * py) / det; out[2 * v + 1] = 10 + (-c * px + a * py) / det;
  }
  return out;
}

/** Where the head's points are for a posture (world cm: the middle of the head at z = 0). */
export function placeHead(head: Head, sc: HeadScene, out: Float32Array, move?: LipMove): void {
  const { canon, weight, count, lipLow, lipShare, lipAtU, lipAtL } = head, s = sc.s;
  // (a lip's movement at a place along its profile)
  const at = (d: number[], t: number, k: 0 | 1) => {
    const m = d.length / 2, i = Math.min(m - 1, Math.floor(t)), j = Math.min(m - 1, i + 1), f = t - i;
    return d[2 * i + k] + (d[2 * j + k] - d[2 * i + k]) * f;
  };
  for (let v = 0; v < count; v++) {
    const q = sc.place(canon[3 * v], canon[3 * v + 1], weight[v]);
    let lx = 0, ly = 0;
    if (move && lipShare[v] > 0) {
      const g = lipShare[v], lo = lipLow[v];
      if (lipAtU[v] >= 0 && lo < 1) { lx += g * (1 - lo) * at(move.upper, lipAtU[v], 0); ly += g * (1 - lo) * at(move.upper, lipAtU[v], 1); }
      if (lipAtL[v] >= 0 && lo > 0) { lx += g * lo * at(move.lower, lipAtL[v], 0); ly += g * lo * at(move.lower, lipAtL[v], 1); }
    }
    out[3 * v] = q[0] + lx; out[3 * v + 1] = q[1] + ly; out[3 * v + 2] = canon[3 * v + 2] * s;
  }
}

/** Which way the skin faces at every point, for the places the points have now: smooth across the edges where the scan's pieces meet. */
export function shadeHead(head: Head, at: Float32Array, normal: Float32Array): void {
  const { index, same, count } = head;
  normal.fill(0);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ux = at[3 * b] - at[3 * a], uy = at[3 * b + 1] - at[3 * a + 1], uz = at[3 * b + 2] - at[3 * a + 2];
    const vx = at[3 * c] - at[3 * a], vy = at[3 * c + 1] - at[3 * a + 1], vz = at[3 * c + 2] - at[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [same[a], same[b], same[c]]) { normal[3 * q] += nx; normal[3 * q + 1] += ny; normal[3 * q + 2] += nz; }
  }
  for (let i = 0; i < count; i++) {
    const r = same[i];
    if (r !== i) { normal[3 * i] = normal[3 * r]; normal[3 * i + 1] = normal[3 * r + 1]; normal[3 * i + 2] = normal[3 * r + 2]; }
  }
}
