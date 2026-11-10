/**
 * The illustrated head as shapes, without a canvas. A painted backdrop (the
 * skull, the spine, the brain, the neck: everything that never touches the
 * air) was made on a guide of this very head at rest; here it is cut into
 * bands that follow the speaker's size, the pharynx stretch and the jaw.
 * Everything that bounds the air is drawn over it from the acoustic geometry
 * of this instant: the air itself, the tongue, the lips, the teeth, the velum.
 * A test checks the two promises: nothing painted covers the air, and no air
 * painted in the backdrop is left where the model now has tissue.
 */
import { computeGeometry, canonToWorld, canonTransform, CANON_SCALE, GEOMETRY_CONST, TractGeometry, SolidId } from '../../dsp/tract/geometry';
import { Anatomy, Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../../dsp/tract/types';
import { HEAD_BACK, HEAD_FRONT_UP, CHIN, NASAL_CENTRE, NASAL_HALF, chinWeight, smoothOutline } from './outline';
import { BACKDROP_FRAME } from './frame';

/** An affine map as the canvas takes it: x' = a x + c y + e, y' = b x + d y + f. */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m after n (apply n first). */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function mapPts(m: Mat, pts: number[]): number[] {
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = m[0] * pts[i] + m[2] * pts[i + 1] + m[4];
    out[i + 1] = m[1] * pts[i] + m[3] * pts[i + 1] + m[5];
  }
  return out;
}

/** Rotation by `a` about `c`, then uniform scale `s` about the origin. */
function rotScale(a: number, c: [number, number], s: number): Mat {
  const ca = Math.cos(a), sa = Math.sin(a);
  return [s * ca, s * sa, -s * sa, s * ca, s * (c[0] - ca * c[0] + sa * c[1]), s * (c[1] - sa * c[0] - ca * c[1])];
}

/** Image pixels of the backdrop -> canonical centimetres. */
export const PIXELS: Mat = (() => {
  const f = BACKDROP_FRAME, k = f.width / (f.x1 - f.x0);
  return [1 / k, 0, 0, -1 / k, f.x0, f.y1];
})();

const { J, BEND_Y } = GEOMETRY_CONST;

/** The part of the painting that moves with the jaw (canonical, at rest): below the mouth,
 *  from the neck forward. Like the head's outline in the model, each point turns with the jaw
 *  by `chinWeight` of its x: not at all at the neck, fully from the chin's bone forward, and
 *  the stretch of the pharynx applies below BEND_Y as for every other point. */
const JAW_TOP = 7.3, JAW_BOTTOM = 0.4;
/** Where the jaw turns fully: from here forward it is two plain bands (above and below BEND_Y). */
const JAW_FULL = 6.2;
/** Where it starts to turn: between here and JAW_FULL it bends, drawn as strips of triangles. */
const JAW_FROM = 3.2;
const JAW_STRIPS = 8;
export const MANDIBLE = [JAW_FULL, JAW_TOP, 12.5, JAW_TOP, 12.5, JAW_BOTTOM, JAW_FULL, JAW_BOTTOM];
/** The still bands leave out everything that moves with the jaw. */
export const JAW_ZONE = [JAW_FROM, JAW_TOP, 12.5, JAW_TOP, 12.5, JAW_BOTTOM, JAW_FROM, JAW_BOTTOM];
/** Air of the guide that the painting shows as tissue (canonical): the pocket under the
 *  tongue's tip, retouched because it moves with the jaw differently from the tongue; the
 *  air drawn from the geometry shows it whenever the model has it. */
export const FILLED_AIR = [[5.6, 7.6, 5.62, 6.45, 6.15, 6.38, 6.62, 6.88, 6.8, 7.6]];
/** The back wall of the pharynx behind the velum (canonical, top down). */
const WALL = [-0.5, 10.95, -0.47, 10.6, -0.45, 10.5, -0.62, 9.8, -0.85, 9.1, -1.02, 8.3, -1.12, 7.4, -1.15, 6.4];

/** Canonical height where the painted neck ends. */
const NECK_END = -3.57;

/** The upper lip, the upper incisor's crown and the space in front: the backdrop has its
 *  own lips and teeth at rest, so it is not drawn there (canonical, does not move). */
const HOLE_UPPER = [
  12.5, 10.62, 7.3, 10.62, 7.24, 9.95, 6.75, 9.82, 6.3, 9.2, 6.45, 8.75, 6.65, 8.35, 6.85, 7.92, 12.5, 7.75,
];
/** The lower lip, the lower incisor's crown and the space in front (canonical, turns with
 *  the jaw). It reaches high enough to meet the upper part with the jaw wide open. */
const HOLE_LOWER = [
  12.5, 10.4, 6.95, 10.4, 6.95, 8.45, 6.72, 8.3, 6.58, 7.95, 6.43, 7.55, 6.3, 6.95, 6.6, 6.52, 7.0, 6.18,
  // (down to the chin, behind the skin that gives way under the lip: the painting's own chin is not drawn there,
  // where it would stick out in front of the lip's skin when that moves)
  6.95, 5.75, 7.05, 5.2, 7.6, 4.95, 8.27, 4.97, 12.5, 4.97,
];

/** Behind the lips, inside the hole: always tissue or air, so it gets a base of mucosa
 *  (the upper part is still, the lower one turns with the jaw). */
const INNER_UPPER = [7.3, 10.62, 7.4, 10.62, 7.4, 7.75, 6.85, 7.92, 6.65, 8.35, 6.45, 8.75, 6.3, 9.2, 6.75, 9.82, 7.24, 9.95];
const INNER_LOWER = [6.95, 8.45, 7.05, 8.45, 7.05, 6.18, 7.0, 6.18, 6.6, 6.52, 6.3, 6.95, 6.43, 7.55, 6.58, 7.95, 6.72, 8.3];

/** Canonical height where the upper lip's part of the face leaves the backdrop. */
const BRIDGE_Y = 10.62;

/**
 * The front of the painted face around the mouth, traced on the painting itself (canonical cm, top to
 * bottom): the upper lip from under the nose to where the lips meet, the lower lip from there to the top of
 * the chin. The model's lips are the few straight edges the air meets; drawn as they are they cut the
 * painted lips square. So each lip is drawn with the painting's own profile, moved as the model's lip moves.
 */
export const FACE_UPPER = [
  8.98, 10.62, 8.96, 10.37, 8.96, 10.19, 8.97, 10.01, 9.0, 9.83, 9.05, 9.65, 9.1, 9.47, 9.16, 9.29, 9.21, 9.11, 9.17, 8.93, 9.11, 8.75,
  9.02, 8.57, 8.86, 8.39, 8.6, 8.2, 8.32, 8.06,
];
export const FACE_LOWER = [
  8.32, 8.06, 8.57, 7.87, 8.66, 7.67, 8.75, 7.49, 8.78, 7.31, 8.8, 7.13, 8.78, 6.95, 8.72, 6.77, 8.53, 6.59,
  // (and on down the fold to the front of the chin: the skin below a lip gives way with it)
  8.34, 6.41, 8.2, 6.23, 8.03, 6.05, 7.95, 5.87, 7.98, 5.69, 8.08, 5.51, 8.14, 5.33, 8.22, 5.15, 8.27, 4.97,
];
/**
 * A lower lip that goes down, or forward, goes whole: it is as full when the mouth is open as when it is shut.
 * What gives way is the skin under it, the fold between the lip and the chin, down to the chin itself. (Giving
 * way inside the lip, it thinned to a flap whenever the mouth opened, and to a beak when the lips were pushed
 * forward.) Above the first height the lip moves whole with the model's lip; at the second nothing moves.
 */
const LIP_WHOLE = 6.95, CHIN_STILL = 4.97;
/** Inside the lip and the chin, behind the profile: where the painting of the lower lip is held to the jaw (canonical), from the chin up. */
const LOWER_HELD = [7.6, 4.95, 7.05, 5.2, 6.95, 5.75, 7.0, 6.18, 6.6, 6.52];
/** A point inside the lower lip's painting from which all of its outline is seen: its triangles fan out from it. */
const LOWER_CENTRE: [number, number] = [7.6, 6.2];
/** Where the model's lips have their front corners (their points 4) when the mouth is as the painting has it: just behind where the painted lips meet. */
const CORNER_UPPER: [number, number] = [8.22, 8.07];
const CORNER_LOWER: [number, number] = [7.95, 8.05];
/** The painted lips' edges behind it, toward the corner of the mouth (where the model's lips have their points 3 and 2). */
const SEAM_UPPER = [7.8, 8.12, 7.5, 8.2];
const SEAM_LOWER = [7.05, 7.95, 7.3, 8.03];
/** The upper lip moves whole below this height, and not at all where it leaves the nose. */
const LIP_MOVES = 9.3;

/** Inner points of a cubic Hermite curve from a to b, leaving a along ta and reaching b along tb (unit vectors). */
function hermite(a: number[], ta: number[], b: number[], tb: number[], n = 8): number[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out: number[] = [];
  for (let j = 1; j < n; j++) {
    const t = j / n, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    out.push(
      h00 * a[0] + h10 * L * ta[0] + h01 * b[0] + h11 * L * tb[0],
      h00 * a[1] + h10 * L * ta[1] + h01 * b[1] + h11 * L * tb[1],
    );
  }
  return out;
}

/** The part of a polygon below height y (Sutherland-Hodgman against one line). */
function clipBelow(pts: number[], y: number): number[] {
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[2 * i], ay = pts[2 * i + 1], bx = pts[2 * j], by = pts[2 * j + 1];
    if (ay <= y) out.push(ax, ay);
    if ((ay <= y) !== (by <= y)) {
      const t = (y - ay) / (by - ay);
      out.push(ax + t * (bx - ax), y);
    }
  }
  return out;
}

interface Guide {
  /** canonical solids of the head at rest */
  solids: Map<SolidId, number[]>;
  /** canonical lower and upper edges of the air on each grid line (NaN past the lips) */
  low: number[]; up: number[];
  lastRay: number;
  jawAngle: number;
  /** canonical outline of the head at rest, as painted */
  outline: number[];
  /** canonical front of the painted face around the mouth, top to bottom */
  front: number[];
  tongueCenter: [number, number];
}

let guide: Guide | null = null;

/** The head the backdrop was painted on: the default speaker at rest. */
export function guideHead(): Guide {
  if (guide) return guide;
  const an = DEFAULT_ANATOMY, a = DEFAULT_ARTICULATORS;
  const g = computeGeometry(a, an, DEFAULT_TEETH);
  const c = 1 / CANON_SCALE;
  const solids = new Map<SolidId, number[]>();
  for (const s of g.solids) solids.set(s.id, s.pts.map((v) => v * c));
  const low: number[] = [], up: number[] = [];
  for (let i = 0; i < g.rays.length; i++) {
    const r = g.rays[i], h = g.hits[i];
    if (i > g.lastRay) { low.push(NaN, NaN); up.push(NaN, NaN); continue; }
    low.push((r.sx + r.nx * (r.t0 + h.tLow)) * c, (r.sy + r.ny * (r.t0 + h.tLow)) * c);
    up.push((r.sx + r.nx * (r.t0 + h.tUp)) * c, (r.sy + r.ny * (r.t0 + h.tUp)) * c);
  }
  const outline = smoothOutline([
    ...canonToWorld(HEAD_BACK, { ...an, pharynx: 1 }, { ...a, larynx: 0 }),
    ...canonToWorld(HEAD_FRONT_UP, an, a),
    ...canonToWorld(CHIN, { ...an, pharynx: 1 }, { ...a, larynx: 0 }, chinWeight),
  ]).map((v) => v * c);
  // the front of the outline around the mouth (the outline runs down the face there)
  const front: number[] = [];
  for (let i = 0; i < outline.length; i += 2) {
    if (outline[i] > 7 && outline[i + 1] > 5.2 && outline[i + 1] < 11.6) front.push(outline[i], outline[i + 1]);
  }
  guide = { solids, low, up, lastRay: g.lastRay, jawAngle: g.jawAngle, outline, front, tongueCenter: [g.tongueCenter[0] * c, g.tongueCenter[1] * c] };
  return guide;
}

export interface Band {
  id: 'neck' | 'cranium' | 'jawLow' | 'jawHigh';
  /** canonical -> world */
  mat: Mat;
  /** canonical polygons the band is clipped to (all of them) */
  clip: number[][];
  /** canonical polygons left out of the band */
  exclude: number[][];
  /** a world polygon the band is clipped to as well (which side of BEND_Y) */
  world?: number[];
}

/** A triangle of the painting (canonical, at rest) and where it goes now (world). */
export interface Tri { from: number[]; to: number[] }

export interface Sprite {
  id: SolidId;
  /** the solid now (world), as far as it is drawn */
  poly: number[];
  /** canonical -> world map that carries the solid as painted at rest onto it */
  tex: Mat;
  /** the solid as painted at rest, carried by `tex` (world): the texture is used only inside both */
  painted: number[];
  /** a wider area the texture fills instead (a lip with the face in front of it) */
  area?: number[];
  /** how the painting reaches `area`: stretched from the same area at rest */
  areaMesh?: Mesh;
  /** a solid that changes shape: its painting is stretched onto it */
  mesh?: Mesh;
}

/** A painting stretched onto a shape, triangle by triangle: from the centre `cFrom`
 *  (canonical, at rest) to `cTo` (world), and from each edge of `from` (canonical) to the
 *  same edge of `to` (world). */
export interface Mesh { from: number[]; to: number[]; cFrom: [number, number]; cTo: [number, number] }

export interface HeadScene {
  /** world cm per canonical cm */
  s: number;
  /** the head (world), its chin turning with the jaw: the base the bands lie on */
  outline: number[];
  bands: Band[];
  /** under the jaw, where the painting bends between the still neck and the turning chin */
  bend: Tri[];
  /** where the backdrop draws a canonical point of its painting (world) */
  warp: (x: number, y: number) => [number, number];
  /** where a canonical point of the head goes when it turns with the jaw by a share `w` (0: not at all, 1: wholly), sized and stretched (world) */
  place: (x: number, y: number, w: number) => [number, number];
  /** world height where the painted neck ends */
  neckEnd: number;
  /** world polygons where no band is drawn: the lips, the incisors' crowns and the opening */
  hole: number[][];
  /** world polygons behind the lips, inside the hole: a base of mucosa */
  inner: number[][];
  /** the air (world): lower edge from the glottis to the lips, then the upper edge back */
  lumen: number[];
  lower: number[];
  upper: number[];
  /** world quads where the backdrop shows air at rest and the model has tissue now */
  patch: number[][];
  /** each lip with the face in front of it, up to the painted profile (world): only the
   *  lips' inner surfaces and the opening touch the air, so their outside follows the painting */
  upperFace: number[];
  lowerFace: number[];
  /** the opening between the lips (world): air the grid's straight steps may leave out;
   *  empty while they touch */
  mouth: number[];
  /** between the upper incisor and the upper lip (world) */
  vestibule: number[];
  /** the air above the velum, open to the nose (world): the velum's back first (tip to
   *  root), then the vault and the wall down to below the tip */
  port: number[];
  /** how many of the port's points lie on the velum */
  portVelum: number;
  /** the nasal cavity (world), for the glow of the air that flows through it */
  nasal: number[];
  /** solids textured with the backdrop's own painting, back to front */
  sprites: Sprite[];
  /** the velum (world), painted */
  velum: number[];
}

type Place = (x: number, y: number) => [number, number];

/** Where the profile lies in the outlines `lipFaces` makes (`upperFace`, `lowerFace`): its first point, and how many it has. */
export const FACE_PROFILE = { upper: [1, FACE_UPPER.length / 2], lower: [0, FACE_LOWER.length / 2] } as const;

const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

/**
 * Each lip with the face in front of it, as painted: its inner side is the model's (the corner where the
 * lip meets the air, the edge that closes the mouth), its outer side the painting's own profile, carried
 * along by the lip: wholly at the lip's edge, less and less toward the nose for the upper one and toward
 * the chin for the lower one, which also turns with the jaw. `crown` and `jaw` place canonical points of
 * the still head and of the jaw. Every face has the same number of points in every posture, the same as
 * the painting's at rest (`ul` and `ll` null), onto which it is stretched.
 */
function lipFaces(ul: number[] | null, ll: number[] | null, rest: { ul: number[]; ll: number[] }, crown: Place, jaw: Place): { upper: number[]; lower: number[]; lowerCentre: [number, number] } {
  const upper: number[] = [], lower: number[] = [];
  const P = (i: number): [number, number] => (ul ? [ul[2 * i], ul[2 * i + 1]] : [rest.ul[2 * i], rest.ul[2 * i + 1]]);
  const Q = (i: number): [number, number] => (ll ? [ll[2 * i], ll[2 * i + 1]] : [rest.ll[2 * i], rest.ll[2 * i + 1]]);
  // The painted lips are fuller than the model's, whose front corners (its points 4) lie a little behind where
  // the painted ones meet: the profile is carried by the corner's own movement, and keeps that lead on it.
  // ---- the upper lip: from the head behind the nose's base, down the profile to the lip's edge, then its inner side
  upper.push(...crown(7.3, BRIDGE_Y));
  const s0 = crown(CORNER_UPPER[0], CORNER_UPPER[1]);
  const dU: [number, number] = ul ? [P(4)[0] - s0[0], P(4)[1] - s0[1]] : [0, 0];
  for (let i = 0; i < FACE_UPPER.length; i += 2) {
    const w = ease((BRIDGE_Y - FACE_UPPER[i + 1]) / (BRIDGE_Y - LIP_MOVES));
    const q = crown(FACE_UPPER[i], FACE_UPPER[i + 1]);
    upper.push(q[0] + w * dU[0], q[1] + w * dU[1]);
  }
  if (ul) upper.push(...P(4), ...P(3), ...P(2));
  else upper.push(...CORNER_UPPER, ...SEAM_UPPER);
  upper.push(...P(1), ...P(0), ...P(9));
  // (and up the back of the lip where the painting has it, to where it leaves the gum: no sliver of the hole
  // under it is left uncovered when the lip moves away from it)
  upper.push(...crown(7.24, 9.95));
  // ---- the lower lip: from its edge down the profile to the chin, back under it, and up its inner side
  const s1 = jaw(CORNER_LOWER[0], CORNER_LOWER[1]);
  const dL: [number, number] = ll ? [Q(4)[0] - s1[0], Q(4)[1] - s1[1]] : [0, 0];
  const held = (y: number) => ease((y - CHIN_STILL) / (LIP_WHOLE - CHIN_STILL));
  for (let i = 0; i < FACE_LOWER.length; i += 2) {
    const w = held(FACE_LOWER[i + 1]);
    const q = jaw(FACE_LOWER[i], FACE_LOWER[i + 1]);
    lower.push(q[0] + w * dL[0], q[1] + w * dL[1]);
  }
  for (let i = 0; i < LOWER_HELD.length; i += 2) lower.push(...jaw(LOWER_HELD[i], LOWER_HELD[i + 1]));
  lower.push(...Q(1));
  if (ll) lower.push(...Q(2), ...Q(3), ...Q(4));
  else lower.push(...SEAM_LOWER, ...CORNER_LOWER);
  // (the middle of the painting goes half the way of the lip in front of it)
  const c0 = jaw(LOWER_CENTRE[0], LOWER_CENTRE[1]), wc = 0.5 * held(LOWER_CENTRE[1]);
  return { upper, lower, lowerCentre: [c0[0] + wc * dL[0], c0[1] + wc * dL[1]] };
}

let restFaces: { upper: number[]; lower: number[]; lowerCentre: [number, number] } | null = null;

/** Area-weighted centroid of a polygon. */
export function centroid(pts: number[]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * j], y1 = pts[2 * j + 1];
    const c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += pts[2 * i]; sy += pts[2 * i + 1]; }
    return [sx / n, sy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function edgePoint(g: TractGeometry, i: number, upper: boolean): [number, number] {
  const r = g.rays[i], h = g.hits[i], t = r.t0 + (upper ? h.tUp : h.tLow);
  return [r.sx + r.nx * t, r.sy + r.ny * t];
}

/** Points of the tongue on the arc over its body, evenly spaced: the rest of its outline
 *  has a fixed number of points (the root's foot, the tip, the underside, the floor). */
const TONGUE_ARC = 24;

/** The tongue's outline with the same number of points in every posture, so that each
 *  point keeps its place on the tongue: the foot of the root, the arc of the body
 *  resampled by length, then the tip, the underside and its deep end. The three points
 *  of the floor under it are left out: the tongue is drawn down to the line from its deep
 *  end back to the root's foot, and the painting below (the hyoid, the muscles of the
 *  floor), which never meets the air, stays with the jaw and the neck. */
export function tongueMesh(pts: number[]): number[] | null {
  const n = pts.length / 2, arc = n - 19;
  if (arc < 2) return null;
  const len = [0];
  for (let i = 2; i <= arc; i++) {
    len.push(len[i - 2] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]));
  }
  const out = [pts[0], pts[1]];
  const total = len[arc - 1];
  for (let j = 0, i = 0; j < TONGUE_ARC; j++) {
    const at = (total * j) / (TONGUE_ARC - 1);
    while (i < arc - 2 && len[i + 1] < at) i++;
    const t = len[i + 1] > len[i] ? Math.min(1, (at - len[i]) / (len[i + 1] - len[i])) : 0;
    const a = 1 + i, b = 2 + i;
    out.push(pts[2 * a] + t * (pts[2 * b] - pts[2 * a]), pts[2 * a + 1] + t * (pts[2 * b + 1] - pts[2 * a + 1]));
  }
  for (let i = 1 + arc; i < n - 3; i++) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

/** The parts the backdrop's painting carries onto the moving solids (back to front). */
const TEXTURED: SolidId[] = ['palate', 'tongue', 'lowerIncisor', 'lowerLip', 'upperIncisor', 'upperLip'];
const TURNS_WITH_JAW = new Set<SolidId>(['tongue', 'lowerIncisor', 'lowerLip']);
/** Solids below BEND_Y that the pharynx stretch reshapes: their painting is stretched onto them. */
const STRETCHED = new Set<SolidId>(['lowerIncisor']);

/** The illustrated head for this posture (geometry from `computeGeometry` with the same anatomy and articulators). */
export function headScene(geom: TractGeometry, an: Anatomy, a: Articulators): HeadScene {
  const G = guideHead();
  const { s, k } = canonTransform(an, a);
  const cranium: Mat = [s, 0, 0, s, 0, 0];
  const neck: Mat = [s, 0, 0, s * k, 0, BEND_Y * s * (1 - k)];
  const dJaw = geom.jawAngle - G.jawAngle;
  const turn1 = rotScale(dJaw, J, 1);
  const big = BACKDROP_FRAME;
  const upperHalf = [big.x0, BEND_Y - 0.01, big.x1, BEND_Y - 0.01, big.x1, big.y1, big.x0, big.y1];
  const lowerHalf = [big.x0, big.y0, big.x1, big.y0, big.x1, BEND_Y, big.x0, BEND_Y];
  const W = 100, bend = BEND_Y * s;
  const bands: Band[] = [
    { id: 'neck', mat: neck, clip: [G.outline, lowerHalf], exclude: [JAW_ZONE] },
    { id: 'cranium', mat: cranium, clip: [G.outline, upperHalf], exclude: [JAW_ZONE] },
    { id: 'jawLow', mat: mul(neck, turn1), clip: [G.outline, MANDIBLE], exclude: [], world: [-W, -W, W, -W, W, bend, -W, bend] },
    { id: 'jawHigh', mat: mul(cranium, turn1), clip: [G.outline, MANDIBLE], exclude: [], world: [-W, bend - 0.01, W, bend - 0.01, W, W, -W, W] },
  ];
  // a canonical point as the model would place it now: turned with the jaw by its weight,
  // then sized and stretched
  const place = (x: number, y: number, w: number): [number, number] => {
    const c = Math.cos(dJaw * w), sn = Math.sin(dJaw * w);
    const dx = x - J[0], dy = y - J[1];
    const rx = J[0] + c * dx - sn * dy, ry = J[1] + sn * dx + c * dy;
    return [s * rx, s * (ry < BEND_Y ? BEND_Y - (BEND_Y - ry) * k : ry)];
  };
  const inJaw = (y: number) => y >= JAW_BOTTOM && y <= JAW_TOP;
  const warp = (x: number, y: number): [number, number] => place(x, y, inJaw(y) ? chinWeight(x) : 0);
  const jaw = (pts: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(...place(pts[i], pts[i + 1], 1));
    return out;
  };
  // the bend under the jaw: vertical strips, each cut at BEND_Y where the stretch starts
  const tris: Tri[] = [];
  const ys = [JAW_BOTTOM, BEND_Y, JAW_TOP];
  for (let i = 0; i < JAW_STRIPS; i++) {
    const x0 = JAW_FROM + ((JAW_FULL - JAW_FROM) * i) / JAW_STRIPS;
    const x1 = JAW_FROM + ((JAW_FULL - JAW_FROM) * (i + 1)) / JAW_STRIPS;
    for (let j = 0; j + 1 < ys.length; j++) {
      const q = [x0, ys[j], x1, ys[j], x1, ys[j + 1], x0, ys[j + 1]];
      const c = [0, 1, 2, 3].map((v) => warp(q[2 * v], q[2 * v + 1]));
      tris.push({ from: [q[0], q[1], q[2], q[3], q[4], q[5]], to: [...c[0], ...c[1], ...c[2]] });
      tris.push({ from: [q[0], q[1], q[4], q[5], q[6], q[7]], to: [...c[0], ...c[2], ...c[3]] });
    }
  }
  // the lower part never reaches above the upper one, however far the jaw closes
  const hole = [mapPts(cranium, HOLE_UPPER), clipBelow(jaw(HOLE_LOWER), BRIDGE_Y * s)];
  const inner = [mapPts(cranium, INNER_UPPER), jaw(INNER_LOWER)];

  const outline = smoothOutline([
    ...canonToWorld(HEAD_BACK, an, a),
    ...canonToWorld(HEAD_FRONT_UP, an, a),
    ...canonToWorld(CHIN, an, a, chinWeight),
  ]);

  // the air
  const n = geom.lastRay;
  const lower: number[] = [], upper: number[] = [];
  for (let i = 0; i <= n; i++) {
    lower.push(...edgePoint(geom, i, false));
    upper.push(...edgePoint(geom, i, true));
  }
  const lumen = [...lower];
  for (let i = n; i >= 0; i--) lumen.push(upper[2 * i], upper[2 * i + 1]);

  // where the backdrop painted air that is tissue now: between its edge and ours
  const patch: number[][] = [];
  const m = Math.min(n, G.lastRay);
  const along = (i: number, cx: number, cy: number) => {
    const r = geom.rays[i];
    const [x, y] = warp(cx, cy);
    return (x - r.sx) * r.nx + (y - r.sy) * r.ny;
  };
  const at = (i: number, t: number): [number, number] => {
    const r = geom.rays[i];
    return [r.sx + r.nx * t, r.sy + r.ny * t];
  };
  const tl: number[] = [], tu: number[] = [], gl: number[] = [], gu: number[] = [];
  for (let i = 0; i <= m; i++) {
    const r = geom.rays[i], h = geom.hits[i];
    tl.push(r.t0 + h.tLow); tu.push(r.t0 + h.tUp);
    gl.push(along(i, G.low[2 * i], G.low[2 * i + 1]));
    gu.push(along(i, G.up[2 * i], G.up[2 * i + 1]));
  }
  const eps = 0.004;
  for (let i = 0; i < m; i++) {
    // lower side: the tissue reaches higher than the painted edge
    if (tl[i] > gl[i] + eps || tl[i + 1] > gl[i + 1] + eps) {
      patch.push([...at(i, Math.min(gl[i], tl[i])), ...at(i, tl[i]), ...at(i + 1, tl[i + 1]), ...at(i + 1, Math.min(gl[i + 1], tl[i + 1]))]);
    }
    // upper side: the tissue reaches lower than the painted edge
    if (tu[i] < gu[i] - eps || tu[i + 1] < gu[i + 1] - eps) {
      patch.push([...at(i, tu[i]), ...at(i, Math.max(gu[i], tu[i])), ...at(i + 1, Math.max(gu[i + 1], tu[i + 1])), ...at(i + 1, tu[i + 1])]);
    }
  }

  const solid = (id: SolidId) => geom.solids.find((x) => x.id === id)!.pts;

  const ul = solid('upperLip'), ll = solid('lowerLip'), ui = solid('upperIncisor');
  const P = (i: number): [number, number] => [ul[2 * i], ul[2 * i + 1]];
  const Q = (i: number): [number, number] => [ll[2 * i], ll[2 * i + 1]];
  const id: Place = (x, y) => [x, y];
  const guideLips = { ul: G.solids.get('upperLip')!, ll: G.solids.get('lowerLip')! };
  restFaces ??= lipFaces(null, null, guideLips, id, id);
  const faces = lipFaces(ul, ll, guideLips, (x, y) => apply(cranium, x, y), (x, y) => place(x, y, 1));
  const upperFace = faces.upper, lowerFace = faces.lower;
  const faceMesh = (rest: number[], now: number[]): Mesh => ({ from: rest, to: now, cFrom: centroid(rest), cTo: centroid(now) });
  // the opening between the lips, from their inner edges to their fronts: air, even where
  // the straight steps of the acoustic grid cut across the lips' curves (none once they touch)
  const apart = [2, 3, 4].every((i) => P(i)[1] - Q(i)[1] > 0.02 * s);
  const mouth = apart ? [...P(4), ...P(3), ...P(2), ...Q(2), ...Q(3), ...Q(4)] : [];
  // down the back of the lip, then up the incisor's labial surface (its points 6..9)
  const vestibule = [...apply(cranium, 7.24, 9.95), ...P(9), ...P(0), ...P(1), ...P(2)];
  for (let i = 6; i <= 9; i++) vestibule.push(ui[2 * i], ui[2 * i + 1]);

  // the air above the velum: from its tip along its back, up under the vault of the
  // nasopharynx and down the wall behind it
  const vel = solid('velum');
  const half = vel.length / 4; // points per side
  const port: number[] = [];
  for (let i = half; i < 2 * half; i++) port.push(vel[2 * i], vel[2 * i + 1]);
  const tipY = vel[2 * half + 1];
  const wall = canonToWorld(WALL, an, a);
  const root = port.slice(-2);
  port.push(...hermite(root, [-0.25, 0.95], wall.slice(0, 2), [-0.1, -0.95], 6));
  for (let i = 0; i < wall.length; i += 2) {
    port.push(wall[i], wall[i + 1]);
    if (wall[i + 1] < tipY - 0.35 * s) break;
  }

  // the nasal cavity band (as the acoustic model sees it: a tube to the nostrils)
  const nc = canonToWorld(NASAL_CENTRE, an, a);
  const up2: number[] = [], lo2: number[] = [];
  for (let i = 0; i < NASAL_HALF.length; i++) {
    const j = Math.min(NASAL_HALF.length - 2, i);
    const dx = nc[2 * j + 2] - nc[2 * j], dy = nc[2 * j + 3] - nc[2 * j + 1];
    const L = Math.hypot(dx, dy) || 1;
    const hw = NASAL_HALF[i] * s;
    up2.push(nc[2 * i] - (dy / L) * hw, nc[2 * i + 1] + (dx / L) * hw);
    lo2.unshift(nc[2 * i + 1] - (dx / L) * hw);
    lo2.unshift(nc[2 * i] + (dy / L) * hw);
  }

  // the solids that carry the backdrop's painting
  const sprites: Sprite[] = [];
  for (const id of TEXTURED) {
    const poly = solid(id);
    const g0 = G.solids.get(id)!;
    const gc = id === 'tongue' ? G.tongueCenter : centroid(g0);
    const cc = id === 'tongue' ? geom.tongueCenter : centroid(poly);
    const th = TURNS_WITH_JAW.has(id) ? dJaw : 0;
    const r = rotScale(th, gc, s);
    const [rx, ry] = apply(r, gc[0], gc[1]);
    const tex: Mat = [r[0], r[1], r[2], r[3], r[4] + cc[0] - rx, r[5] + cc[1] - ry];
    const area = id === 'upperLip' ? upperFace : id === 'lowerLip' ? lowerFace : undefined;
    const areaMesh = id === 'upperLip' ? faceMesh(restFaces.upper, upperFace) : id === 'lowerLip' ? { from: restFaces.lower, to: lowerFace, cFrom: restFaces.lowerCentre, cTo: faces.lowerCentre } : undefined;
    let mesh: Sprite['mesh'];
    let drawn = poly;
    if (id === 'tongue') {
      const from = tongueMesh(g0), to = tongueMesh(poly);
      if (from && to) { mesh = { from, to, cFrom: G.tongueCenter, cTo: geom.tongueCenter }; drawn = to; }
    } else if (STRETCHED.has(id) && g0.length === poly.length) {
      mesh = { from: g0, to: poly, cFrom: gc, cTo: cc };
    }
    sprites.push({ id, poly: drawn, tex, painted: mapPts(tex, g0), area, areaMesh, mesh });
  }

  return {
    s, outline, bands, bend: tris, warp, place, neckEnd: warp(0, NECK_END)[1], hole, inner, lumen, lower, upper, patch, upperFace, lowerFace, mouth, vestibule, port,
    portVelum: half, nasal: [...up2, ...lo2], sprites, velum: vel,
  };
}
