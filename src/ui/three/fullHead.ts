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
 * Its skin is photographs of one face, each laid on from where it was taken
 * (the side, the front, the back) and mixed by which way the skin faces.
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
}

/** The scanned head, or null if it cannot be read. */
export function loadScan(renderer: THREE.WebGLRenderer): Promise<Scan | null> {
  return new Promise((resolve) => {
    const ktx2 = new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
    new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).load('models/facecap.glb', (gltf) => {
      ktx2.dispose();
      let head: THREE.Mesh | null = null;
      const eyes: THREE.Mesh[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 20) head = mesh;
        else if (/eye/i.test(mesh.parent?.name ?? '')) eyes.push(mesh);
      });
      const h = head as THREE.Mesh | null;
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
        for (const m of parts) straight.set(m, m.matrixWorld.clone());
        turned.quaternion.copy(q);
        gltf.scene.updateMatrixWorld(true);
      }
      const total = parts.reduce((s, m) => s + (m.geometry.attributes.position as THREE.BufferAttribute).count, 0);
      const position = new Float32Array(3 * total), jaw = new Float32Array(3 * total), uv = new Float32Array(2 * total);
      const map = ((h.material as THREE.MeshStandardMaterial).map ?? null) as THREE.Texture | null;
      const index: number[] = [];
      const v = new THREE.Vector3(), b = new THREE.Vector3();
      let at = 0;
      for (const m of parts) {
        const g = m.geometry, pos = g.attributes.position as THREE.BufferAttribute, n = pos.count, mw = m.matrixWorld;
        const d = m === h ? (g.morphAttributes.position?.[h.morphTargetDictionary!.jawOpen] as THREE.BufferAttribute | undefined) : undefined;
        const lin = new THREE.Matrix3().setFromMatrix4(mw);
        const tc = g.attributes.uv as THREE.BufferAttribute | undefined;
        if (tc && m === h) for (let i = 0; i < n; i++) { uv[2 * (at + i)] = tc.getX(i); uv[2 * (at + i) + 1] = tc.getY(i); }
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
      resolve({ position, index: Uint32Array.from(index), jaw, skin: (h.geometry.attributes.position as THREE.BufferAttribute).count, uv, map });
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
/** The neck: where it is cut, where it becomes a plain column under the jaw, its half width, and how many rings it has from the scan's edge down. */
const NECK_CUT = -3.45, NECK_TOP = 2.6, NECK_HALF = 5.7, RINGS_JOIN = 6, RINGS_NECK = 5;

export interface Head {
  count: number;
  /** per point: its place at rest in the painting's centimetres (x forward, y up, z to the side, the middle at 0) */
  canon: Float32Array;
  /** which way the skin faces there, at rest */
  facing: Float32Array;
  index: Uint32Array;
  /** how much of the jaw's turn each point takes */
  weight: Float32Array;
  /** the lips, as in the half body: which lip carries a point, by how much, and where along that lip's profile it lies */
  lipSide: Int8Array;
  lipShare: Float32Array;
  lipAt: Float32Array;
  /** 0 skin, 1 an eye, 2 the cut end of the neck */
  kind: Float32Array;
  /** where each point is in the scan's own photograph (the neck: where the edge under the jaw it grows from is) */
  uv: Float32Array;
  /** the scan is in pieces that meet edge to edge: for each point, the one point that stands for all those at its place */
  same: Int32Array;
  /** the middle of the far eye (z below 0; the near one is its mirror) and its radius, the painting's cm */
  eye: [number, number, number, number];
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
  // inside of this head's mouth is the anatomy's. A point is inside if something of the head lies in front of it.
  const normal = new Float32Array(3 * n0);
  const cross = (t: number, into: Float32Array | null): [number, number, number] => {
    const a = idx0[t], b = idx0[t + 1], c = idx0[t + 2];
    const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (into) for (const q of [a, b, c]) { into[3 * q] += nx; into[3 * q + 1] += ny; into[3 * q + 2] += nz; }
    return [nx, ny, nz];
  };
  for (let t = 0; t < idx0.length; t += 3) cross(t, normal);
  const inMouth = (i: number) => i < scan.skin && P[3 * i] > 0.2 && P[3 * i] < 0.78 && P[3 * i + 1] > -0.68 && P[3 * i + 1] < -0.22 && Math.abs(P[3 * i + 2]) < 0.32;
  const hidden = new Uint8Array(n0);
  for (let i = 0; i < scan.skin; i++) {
    if (!inMouth(i)) continue;
    const l = Math.hypot(normal[3 * i], normal[3 * i + 1], normal[3 * i + 2]) || 1;
    const dx = normal[3 * i] / l, dy = normal[3 * i + 1] / l, dz = normal[3 * i + 2] / l;
    const ox = P[3 * i] + dx * 0.004, oy = P[3 * i + 1] + dy * 0.004, oz = P[3 * i + 2] + dz * 0.004;
    for (let t = 0; t < idx0.length && !hidden[i]; t += 3) {
      const a = idx0[t], b = idx0[t + 1], c = idx0[t + 2];
      if (a === i || b === i || c === i || a >= scan.skin) continue;
      // (a ray and a triangle, Möller and Trumbore's way)
      const e1x = P[3 * b] - P[3 * a], e1y = P[3 * b + 1] - P[3 * a + 1], e1z = P[3 * b + 2] - P[3 * a + 2];
      const e2x = P[3 * c] - P[3 * a], e2y = P[3 * c + 1] - P[3 * a + 1], e2z = P[3 * c + 2] - P[3 * a + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const tx = ox - P[3 * a], ty = oy - P[3 * a + 1], tz = oz - P[3 * a + 2];
      const u = (tx * px + ty * py + tz * pz) / det;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) / det;
      if (v < 0 || u + v > 1) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (d > 0.002 && d < 1.2) hidden[i] = 1;
    }
  }
  const kept: number[] = [];
  for (let t = 0; t < idx0.length; t += 3) if (hidden[idx0[t]] + hidden[idx0[t + 1]] + hidden[idx0[t + 2]] < 2) kept.push(idx0[t], idx0[t + 1], idx0[t + 2]);

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
  const column = RINGS_JOIN + RINGS_NECK, extra = rim.length * column + 1, count = n0 + extra;
  const canon = new Float32Array(3 * count), kind = new Float32Array(count), uv = new Float32Array(2 * count);
  uv.set(scan.uv.subarray(0, 2 * n0));
  for (let i = 0; i < n0; i++) {
    const q = warp(P[3 * i], P[3 * i + 1]);
    canon[3 * i] = q[0]; canon[3 * i + 1] = q[1]; canon[3 * i + 2] = P[3 * i + 2] * SIDE;
    kind[i] = i < scan.skin ? 0 : 1;
  }
  // ---- the neck: from every point of the edge a line of points down to the cut, first to the neck's own
  // column under the jaw (straight: under the chin it is the slope to the throat), then down the column,
  // whose front and back are the photograph's
  const index = kept.slice();
  if (rim.length > 8) {
    const mid = (y: number): [number, number] => { const f = outline.front(y), b = outline.back(y); return [0.5 * (f + b), 0.5 * (f - b)]; };
    const [c0, r0] = mid(NECK_TOP);
    const angle = rim.map((v) => Math.atan2(canon[3 * v + 2] / NECK_HALF, (canon[3 * v] - c0) / r0));
    let at = n0;
    const first = at;
    rim.forEach((v, j) => {
      const bx = canon[3 * v], by = canon[3 * v + 1], bz = canon[3 * v + 2], cs = Math.cos(angle[j]), sn = Math.sin(angle[j]);
      for (let k = 1; k <= column; k++) {
        let x: number, y: number, z: number;
        if (k <= RINGS_JOIN) {
          const t = k / RINGS_JOIN, e = t * t * (3 - 2 * t);
          // (a little hollow under the jaw, as a throat is)
          x = bx + (c0 + r0 * cs - bx) * e; y = by + (NECK_TOP - by) * t; z = bz + (NECK_HALF * sn - bz) * (0.35 * t + 0.65 * e);
        } else {
          y = NECK_TOP + (NECK_CUT - NECK_TOP) * ((k - RINGS_JOIN) / RINGS_NECK);
          const [c, r] = mid(y);
          x = c + r * cs; z = NECK_HALF * sn;
        }
        canon[3 * at] = x; canon[3 * at + 1] = y; canon[3 * at + 2] = z;
        uv[2 * at] = scan.uv[2 * v]; uv[2 * at + 1] = scan.uv[2 * v + 1];
        at++;
      }
    });
    // the cut end of the neck: a point in its middle
    const [cb] = mid(NECK_CUT);
    canon[3 * at] = cb; canon[3 * at + 1] = NECK_CUT; canon[3 * at + 2] = 0; kind[at] = 2;
    const end = at;
    for (let j = 0; j < rim.length; j++) {
      const j2 = (j + 1) % rim.length;
      // (the scan's edge may be a point shared by several of its own: any of them will do, they are at one place)
      for (let k = 0; k < column; k++) {
        const a = k === 0 ? rim[j] : first + j * column + k - 1, b = k === 0 ? rim[j2] : first + j2 * column + k - 1;
        const c = first + j * column + k, d = first + j2 * column + k;
        index.push(a, c, b, b, c, d);
      }
      index.push(first + j * column + column - 1, end, first + j2 * column + column - 1);
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
  // (the scan's points at one place face one way: no seam shows where its pieces meet)
  const sum = new Float32Array(3 * n0);
  for (let i = 0; i < n0; i++) for (let c = 0; c < 3; c++) sum[3 * root[i] + c] += facing[3 * i + c];
  for (let i = 0; i < n0; i++) for (let c = 0; c < 3; c++) facing[3 * i + c] = sum[3 * root[i] + c];
  for (let i = 0; i < count; i++) { const l = Math.hypot(facing[3 * i], facing[3 * i + 1], facing[3 * i + 2]) || 1; facing[3 * i] /= l; facing[3 * i + 1] /= l; facing[3 * i + 2] /= l; }

  // ---- how each point moves: with the jaw by its share, and with the lip it belongs to
  const weight = new Float32Array(count), lipSide = new Int8Array(count), lipShare = new Float32Array(count), lipAt = new Float32Array(count);
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
    // (in front of the corner of the mouth, the scan itself says which lip a point is of: what its jaw carries is the lower)
    const moved = i < scan.skin && most > 0 ? Math.hypot(scan.jaw[3 * i], scan.jaw[3 * i + 1], scan.jaw[3 * i + 2]) / most : -1;
    const upper = moved >= 0 && x > CORNER - 0.3 && Math.abs(y - LIPS_MEET) < 1.6 ? moved < 0.3 : y >= LIPS_MEET;
    const front = ease((x - CORNER) / 1.0);
    weight[i] = kind[i] === 1 ? 0 : chinWeight(x) * (cheek(y) + ((upper ? 0 : 1) - cheek(y)) * front);
    if (!lips || kind[i] === 1) continue;
    const profile = upper ? lips.upper : lips.lower, m = profile.length / 2;
    if (m < 2) continue;
    const top = profile[1], foot = profile[2 * m - 1];
    // (a lip's inner side lies a little past the line where the lips meet: it goes with its lip)
    if (upper ? y > top || y < foot - 0.7 : y < foot || y > top + 0.7) continue;
    lipSide[i] = upper ? 1 : -1;
    lipShare[i] = ease((x - (CORNER - 0.7)) / 1.7);
    lipAt[i] = place(profile, Math.max(foot, Math.min(top, y)));
  }
  // the eyes: the middle of the one on the far side, and its size
  const eye: [number, number, number, number] = [6.2, 16.5, -3.2, 1.2];
  {
    let ex = 0, ey = 0, ez = 0, m = 0;
    for (let i = scan.skin; i < n0; i++) if (canon[3 * i + 2] < 0) { ex += canon[3 * i]; ey += canon[3 * i + 1]; ez += canon[3 * i + 2]; m++; }
    if (m > 8) {
      ex /= m; ey /= m; ez /= m;
      let r = 0;
      for (let i = scan.skin; i < n0; i++) if (canon[3 * i + 2] < 0) r += Math.hypot(canon[3 * i] - ex, canon[3 * i + 1] - ey, canon[3 * i + 2] - ez);
      eye[0] = ex; eye[1] = ey; eye[2] = ez; eye[3] = r / m;
    }
  }
  const one = new Int32Array(count);
  for (let i = 0; i < count; i++) one[i] = i < n0 ? root[i] : i;
  return { count, canon, facing, index: tri, weight, lipSide, lipShare, lipAt, kind, same: one, eye, uv };
}

/** Where the head's points are for a posture (world cm: the middle of the head at z = 0). */
export function placeHead(head: Head, sc: HeadScene, out: Float32Array, move?: LipMove): void {
  const { canon, weight, count, lipSide, lipShare, lipAt } = head, s = sc.s;
  for (let v = 0; v < count; v++) {
    const q = sc.place(canon[3 * v], canon[3 * v + 1], weight[v]);
    let lx = 0, ly = 0;
    if (move && lipSide[v]) {
      const d = lipSide[v] > 0 ? move.upper : move.lower, m = d.length / 2;
      const i = Math.min(m - 1, Math.floor(lipAt[v])), j = Math.min(m - 1, i + 1), f = lipAt[v] - i, g = lipShare[v];
      lx = g * (d[2 * i] + (d[2 * j] - d[2 * i]) * f); ly = g * (d[2 * i + 1] + (d[2 * j + 1] - d[2 * i + 1]) * f);
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
