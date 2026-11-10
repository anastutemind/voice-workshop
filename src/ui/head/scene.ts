/**
 * The illustrated head as shapes, without a canvas. A painted plate of the
 * head (public/anatomy/head-real.jpg) was made on a guide of this very head at
 * rest; here it becomes one sheet of tissue that the model stretches (warp.ts):
 * the skull holds still, the mandible turns with the jaw, and the soft tissue
 * between them (lips, floor of the mouth, tongue, front of the neck) takes the
 * smoothest shape between its attachments, its tongue led onto the model's
 * tongue and its lips onto the model's lips. The air of this instant is then
 * taken out of it, so what bounds the air is where the model has it.
 * A test checks the promises: the air drawn is the acoustic air, no air
 * painted in the plate is left where the model now has tissue, and the sheet
 * never folds.
 */
import { computeGeometry, canonToWorld, canonTransform, CANON_SCALE, GEOMETRY_CONST, TractGeometry, SolidId } from '../../dsp/tract/geometry';
import { Anatomy, Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../../dsp/tract/types';
import { HEAD_BACK, HEAD_FRONT_UP, CHIN, NASAL_CENTRE, NASAL_HALF, chinWeight, smoothOutline } from './outline';
import { BACKDROP_FRAME } from './frame';
import { buildWarp, Warp } from './warp';

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

/** Air of the guide that the painting shows as tissue (canonical): the pocket under the
 *  tongue's tip, retouched because it moves with the jaw differently from the tongue; the
 *  air drawn from the geometry shows it whenever the model has it. */
export const FILLED_AIR = [[5.6, 7.6, 5.62, 6.45, 6.15, 6.38, 6.62, 6.88, 6.8, 7.6]];
/** The back wall of the pharynx behind the velum (canonical, top down). */
const WALL = [-0.5, 10.95, -0.47, 10.6, -0.45, 10.5, -0.62, 9.8, -0.85, 9.1, -1.02, 8.3, -1.12, 7.4, -1.15, 6.4];

/** Canonical height where the painted neck ends. */
const NECK_END = -3.57;

/** Canonical height where the upper lip's part of the face leaves the still head (the base of the nose). */
const BRIDGE_Y = 10.62;

// ------------------------------------------------------------ the plate as tissue

/**
 * The soft tissue of the plate, which may move (canonical, traced on the painting): from the larynx up the back
 * wall of the pharynx to the nasopharynx, along the hard palate, round the upper incisor (just inside it), up to
 * the base of the nose, out a centimetre in front of the face, down to the front of the neck and back over the
 * larynx (whose front the model moves with the tongue's root). Outside it the head holds still: the skull, the hard
 * palate and the upper teeth, the spine, the vocal folds and the neck below them.
 */
const TISSUE = [
  -0.75, 1.6, -0.3, 1.0, 0.6, 0.9, 1.5, 1.1, 2.2, 0.9, 2.5, 0.2, 2.6, -1.2, 4.6, -1.2, 7.4, 1.2, 9.6, 3.6, 10.4, 6.0, 10.4, 10.62, 8.98, 10.62, 7.3, 10.62,
  7.25, 9.95, 7.26, 9.6, 7.27, 9.2, 7.24, 8.7, 7.18, 8.32, 7.1, 8.0, 7.03, 7.94, 6.92, 8.0, 6.84, 8.15, 6.72, 8.4, 6.56, 8.75, 6.43, 9.02,
  6.25, 9.22, 5.95, 9.52, 5.55, 9.92, 5.0, 10.3, 4.3, 10.6, 3.5, 10.72, 2.5, 10.62, 1.5, 10.45, 0.7, 10.35, -0.45, 10.4,
  -0.62, 9.8, -0.85, 9.1, -1.02, 8.3, -1.12, 7.4, -1.15, 6.4, -1.12, 5.2, -1.02, 4.0, -0.9, 2.8, -0.75, 1.8,
];
/**
 * What turns with the jaw, rigid (canonical, traced on the painting): the mandible where it is cut at the chin,
 * the lower incisor and the tooth behind it, and the chin's soft tissue below the fold under the lower lip (the
 * chin moves whole with its bone; the skin under it and the floor of the mouth behind it stretch).
 */
const MANDIBLE = [
  6.68, 7.78, 6.76, 7.55, 6.77, 7.05, 6.74, 6.55, 6.66, 6.2, 6.78, 5.6, 6.92, 5.16, 7.4, 5.02, 8.15, 4.9, 8.12, 4.5,
  7.95, 4.1, 7.6, 3.82, 7.1, 3.5, 6.5, 3.32, 5.95, 3.42, 5.7, 3.85, 5.65, 4.85, 5.47, 5.4, 5.47, 6.1, 5.56, 6.55,
  5.85, 6.83, 6.05, 6.6, 6.18, 6.55, 6.3, 6.9, 6.48, 7.3,
];
/**
 * Where the tissue only touches and parts (canonical polylines, traced on the painting): the line where the lips
 * meet, from in front of the face back to the upper incisor's edge, then up its front to where the lip turns onto
 * the gum; from that edge down the front of the lower incisor to where the lower lip turns onto its gum; and round
 * the upper incisor's edge and up its back.
 */
const PARTINGS = [
  [9.9, 8.06, 8.32, 8.06, 7.9, 8.06, 7.5, 8.05, 7.2, 8.045, 7.16, 8.045, 7.21, 8.25, 7.26, 8.45, 7.295, 8.65, 7.3, 8.95, 7.315, 9.2, 7.31, 9.6, 7.3, 9.97],
  [7.16, 8.045, 7.12, 7.91, 7.0, 7.88, 6.86, 7.83, 6.77, 7.8, 6.79, 7.65, 6.79, 7.5, 6.79, 7.05, 6.79, 6.6, 6.75, 6.4, 6.7, 6.2],
  // (and up the back of the upper incisor from under its edge into the mouth: the tooth does not stretch with the air under it)
  [7.0, 7.88, 6.9, 7.99, 6.83, 8.12, 6.7, 8.4, 6.56, 8.72, 6.45, 8.95],
];
/** The grid of the sheet (canonical): fine over all that moves, BEND_Y on one of its lines (the pharynx stretches below it). */
export const SHEET_GRID = { x0: -1.6, y0: BEND_Y - 45 * 0.2, h: 0.2, nx: 67, ny: 70 };
/**
 * How far the painted tongue lies inside the guide's (the model's at rest), by length along the guide's outline
 * from the foot of its root, cm: the painting's dorsum is lower and its back further forward than the model's.
 */
const TONGUE_INSET = [0, 0, 3.0, 0, 3.6, 0.28, 4.6, 0.3, 5.4, 0.55, 6.1, 0.55, 7.0, 0.14, 9.0, 0.12, 10.5, 0.09, 11.3, 0.04, 99, 0.04];
/**
 * The skin under the chin and down the front of the neck, traced on the painting (canonical, from the chin back,
 * just inside the edge): it is led as the model leads the head's outline, turning with the jaw by `chinWeight`,
 * so the stretch between the chin and the neck is spread along it.
 */
const SKIN_UNDER = [
  7.4, 3.23, 7.0, 3.06, 6.6, 2.95, 6.2, 2.9, 5.8, 2.86, 5.4, 2.81, 5.0, 2.78, 4.6, 2.75, 4.2, 2.72, 3.8, 2.59, 3.5, 2.36,
  3.26, 2.0, 3.06, 1.6, 2.91, 1.2, 2.81, 0.8, 2.74, 0.4,
];
/** The points of the model's larynx that lead the sheet: the front of its inlet, which moves with the tongue's root (LARYNX in geometry.ts). */
const LARYNX_LEAD = [3, 4, 8];
/** How far above the painted tongue its led line lies, cm. */
const TONGUE_PROUD = 0.07;
/** How many points lead the tongue along its root, its body's arc, its blade and round its tip. */
const TONGUE_LEAD = [6, 34, 6, 4];
/** How firmly a led point holds (against the membrane's own stiffness, ~4 at a knot). */
const LEAD = 40;

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
 * The painted lips (canonical, on the painting): the upper from the base of the nose down its profile to where the
 * lips meet, back along that parting and up the front of the incisor to where the lip turns onto the gum; the
 * lower from where they meet back along the parting, down the front of the lower incisor to its gum, forward to
 * the fold under the lip and up its profile (each just on its own side of the partings). Carried by the sheet,
 * they are the lips as drawn: nothing of them is taken out as air (the grid's last lines reach between them and
 * the teeth, where there is none).
 */
const PAINTED_LIPS: { upper: number[]; lower: number[]; gums: number[][] } = (() => {
  const upper = [7.3, 10.62, ...FACE_UPPER.slice(0, -2), 8.32, 8.1, 7.9, 8.1, 7.5, 8.09, 7.24, 8.09, 7.25, 8.27, 7.3, 8.45, 7.335, 8.65, 7.34, 8.95, 7.355, 9.2, 7.35, 9.6, 7.34, 9.98];
  const lower = [8.32, 8.01, 7.9, 8.01, 7.5, 8.0, 7.2, 8.0, 7.17, 7.98, 7.1, 7.86, 6.95, 7.82, 6.85, 7.76, 6.84, 7.65, 6.84, 7.5, 6.84, 7.05, 6.84, 6.6, 6.79, 6.4, 6.74, 6.2, 7.4, 6.05];
  // (up the profile from the fold under the lip, which FACE_LOWER runs down)
  for (let i = 2 * 11; i >= 2; i -= 2) lower.push(FACE_LOWER[i], FACE_LOWER[i + 1]);
  // and the teeth with the gum over their roots, on the other side of the partings: the grid's last lines reach
  // into them as well
  const gums = [
    [7.27, 9.97, 7.27, 9.6, 7.275, 9.2, 7.26, 8.95, 7.255, 8.65, 7.22, 8.45, 7.17, 8.25, 7.07, 8.02, 6.95, 8.08, 6.6, 9.0, 6.5, 9.6, 6.9, 10.1],
    [6.76, 7.65, 6.76, 7.5, 6.76, 7.05, 6.76, 6.6, 6.71, 6.4, 6.66, 6.2, 6.25, 6.35, 6.17, 6.52, 6.28, 6.9, 6.47, 7.32, 6.62, 7.68, 6.69, 7.75],
  ];
  return { upper, lower, gums };
})();

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

/**
 * The plate as a sheet for one posture: the warp's knot copies where they are now (world cm), and the still
 * frame of the plate round the warp's grid, as quads (canonical at rest, world now), in which nothing moves but
 * the speaker's size and the stretch of the pharynx.
 */
export interface Sheet {
  warp: Warp;
  /** displacement of every knot copy (canonical cm) */
  d: Float64Array;
  /** where every knot copy is (world cm) */
  at: Float32Array;
  /** quads of the still frame: four corners each, at rest (canonical) and now (world) */
  frameRest: Float32Array;
  frameAt: Float32Array;
}

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
  /** the head (world), its chin turning with the jaw */
  outline: number[];
  /** the plate stretched for this posture (made when first asked) */
  sheet: () => Sheet;
  /** where the plate draws a canonical point of its painting (world) */
  warp: (x: number, y: number) => [number, number];
  /** where a canonical point of the head goes when it turns with the jaw by a share `w` (0: not at all, 1: wholly), sized and stretched (world) */
  place: (x: number, y: number, w: number) => [number, number];
  /** world height where the painted neck ends */
  neckEnd: number;
  /** the model's tongue (world) */
  tongue: number[];
  /** the painted lips, and the front teeth with their gums, as the sheet carries them (world outlines; made when first asked) */
  lips: () => { upper: number[]; lower: number[]; gums: number[][] };
  /**
   * The free edges of parted lips (world; none while they touch): the painted lips meet on a flat face, which apart
   * would show as a lip cut square; each lip's is rounded off instead, deepest toward the teeth. For each lip, what
   * is taken off it (`off`), and its edge as it is then, from its front to its back (`edge`), and which way is into
   * the lip (`into`, a unit vector).
   */
  margins: () => { off: number[]; edge: number[]; into: [number, number] }[];
  /** the air (world): lower edge from the glottis to the lips, then the upper edge back */
  lumen: number[];
  lower: number[];
  upper: number[];
  /** for each grid line, whether its lower and its upper edge of the air lie on no wall (the line ends in open air there) */
  bare: { lower: boolean[]; upper: boolean[] };
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

/**
 * A point of the tongue (world) kept `gap` under the upper wall of the air: on the grid line nearest to it, no
 * higher than where the air ends above.
 */
function underRoof(g: TractGeometry, x: number, y: number, gap: number): [number, number] {
  let best = Infinity, bi = -1, bt = 0;
  for (let i = 0; i <= g.lastRay; i++) {
    const r = g.rays[i];
    const dx = x - r.sx, dy = y - r.sy;
    const t = dx * r.nx + dy * r.ny;
    if (t < r.t0 - 0.5 || t > r.t1) continue;
    const off = Math.abs(dx * r.ny - dy * r.nx);
    if (off < best) { best = off; bi = i; bt = t; }
  }
  if (bi < 0 || best > 0.3) return [x, y];
  const r = g.rays[bi], top = r.t0 + g.hits[bi].tUp - gap;
  if (bt <= top) return [x, y];
  return [x + r.nx * (top - bt), y + r.ny * (top - bt)];
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

// ------------------------------------------------------------ what leads the sheet

/**
 * Points along the tongue's surface the air meets, from the foot of its root over its body and blade and round
 * its tip (canonical): the same number in every posture, spread evenly along each of these parts, so each keeps
 * its place on the tongue as it moves.
 */
function tongueLead(pts: number[]): number[] | null {
  const n = pts.length / 2, arc = n - 19;
  if (arc < 2) return null;
  const out: number[] = [];
  const along = (from: number, to: number, m: number) => {
    const len = [0];
    for (let i = from + 1; i <= to; i++) len.push(len[len.length - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]));
    const total = len[len.length - 1];
    for (let j = 0, i = 0; j < m; j++) {
      const at = (total * j) / m;
      while (i < len.length - 2 && len[i + 1] < at) i++;
      const t = len[i + 1] > len[i] ? Math.min(1, (at - len[i]) / (len[i + 1] - len[i])) : 0;
      const a = from + i, b = a + 1;
      out.push(pts[2 * a] + t * (pts[2 * b] - pts[2 * a]), pts[2 * a + 1] + t * (pts[2 * b + 1] - pts[2 * a + 1]));
    }
  };
  along(0, 1, TONGUE_LEAD[0]);
  along(1, arc, TONGUE_LEAD[1]);
  along(arc, arc + 1, TONGUE_LEAD[2]);
  for (let i = 1; i <= TONGUE_LEAD[3]; i++) out.push(pts[2 * (arc + i)], pts[2 * (arc + i) + 1]);
  return out;
}

/** The value of a table of (x, y) pairs at x, eased between its entries. */
function table(tb: number[], x: number): number {
  for (let i = 2; i < tb.length; i += 2) {
    if (x <= tb[i]) return tb[i - 1] + (tb[i + 1] - tb[i - 1]) * ease((x - tb[i - 2]) / Math.max(1e-9, tb[i] - tb[i - 2]));
  }
  return tb[tb.length - 1];
}

/** Points inside each lip, to tell its side of a parting. */
const UPPER_SIDE: [number, number] = [8.3, 9.2], LOWER_SIDE: [number, number] = [7.8, 7.0];

/**
 * A point of a lip moved off any parting it lies on (or nearly): to half a millimetre on the lip's own side, so
 * it leads the lip's side of the cut and not the other.
 */
function offParting(x: number, y: number, side: [number, number]): [number, number] {
  const CLEAR = 0.05;
  let best = Infinity, px = 0, py = 0, nx = 0, ny = 0;
  for (const p of PARTINGS) {
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], dx = p[i + 2] - ax, dy = p[i + 3] - ay;
      const L2 = Math.max(1e-12, dx * dx + dy * dy);
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(x - qx, y - qy);
      if (d < best) { best = d; px = qx; py = qy; const L = Math.sqrt(L2); nx = -dy / L; ny = dx / L; }
    }
  }
  if (nx * (side[0] - px) + ny * (side[1] - py) < 0) { nx = -nx; ny = -ny; }
  // (near enough, or near and on the other side of it)
  const wrong = nx * (x - px) + ny * (y - py) < 0;
  if (best >= CLEAR && !(wrong && best < 0.15)) return [x, y];
  return [px + nx * CLEAR, py + ny * CLEAR];
}

/**
 * Which points of the lips' outlines (`lipFaces`) lead the sheet: the painted profile and the edges where the lips
 * meet. Not the model's inner side of each lip (the upper lip's points 1, 0 and 9, the lower lip's point 1): a lip
 * that moves stays on its teeth, sliding along them (SLIDE_UPPER, SLIDE_LOWER), and never leaves a hole between.
 */
const UPPER_LEADS = (n: number) => Array.from({ length: n - 5 }, (_, i) => i + 1);
const LOWER_LEADS = (n: number) => Array.from({ length: n }, (_, i) => i).filter((i) => i !== n - 4);
/**
 * Points of each lip's inner face, just on its side of the parting along its teeth (canonical, from the edge of the
 * tooth up or down to the gum), led along the tooth's face: as far as the lip's edge moves along it at the edge,
 * not at all where the lip turns onto the gum.
 */
const SLIDE_UPPER = [7.31, 8.45, 7.345, 8.65, 7.35, 8.95, 7.365, 9.2, 7.36, 9.5, 7.35, 9.75];
const SLIDE_LOWER = [6.85, 7.6, 6.85, 7.3, 6.85, 7.0, 6.84, 6.7, 6.8, 6.45];
/** The direction of the upper and lower incisors' fronts (canonical, toward the gum and toward the edge, unit). */
const AXIS_UPPER: [number, number] = [0.074, 0.997], AXIS_LOWER: [number, number] = [0, 1];
const slideUpper = (y: number) => ease((9.97 - y) / (9.97 - 8.3));
const slideLower = (y: number) => Math.max(0, Math.min(1, (y - 6.2) / (7.7 - 6.2))) ** 1.5;

interface Leads {
  /** the led points at rest, on the painting (canonical), and how firmly each holds */
  rest: number[]; weights: number[];
  /** how many of them are the tongue's, which of the lips' outlines' points follow (in that order) */
  tongue: number; upper: number[]; lower: number[];
}
let leads: Leads | null = null;
let sheetWarp: Warp | null = null;

/** The led points, and the warp made for them (made once). */
function theWarp(): { warp: Warp; leads: Leads } {
  if (sheetWarp && leads) return { warp: sheetWarp, leads };
  const G = guideHead();
  const rest: number[] = [], weights: number[] = [];
  // the tongue: the painted surface (inside the guide's by TONGUE_INSET) is led onto the model's surface
  const t0 = tongueLead(G.solids.get('tongue')!)!;
  let run = 0;
  for (let i = 0; i < t0.length; i += 2) {
    if (i) run += Math.hypot(t0[i] - t0[i - 2], t0[i + 1] - t0[i - 1]);
    const a = Math.max(0, i - 2), b = Math.min(t0.length - 2, i + 2);
    const tx = t0[b] - t0[a], ty = t0[b + 1] - t0[a + 1], L = Math.hypot(tx, ty) || 1;
    // (a little above the painted surface: between the led points the painting then reaches past the model's
    // surface everywhere, and the air taken out of it there gives the tongue its edge)
    const d = table(TONGUE_INSET, run) - TONGUE_PROUD;
    rest.push(t0[i] + (d * ty) / L, t0[i + 1] - (d * tx) / L);
    // (the foot of the root is where the model's outline is closed, not a surface the air meets: it leads gently,
    // so the root's base and the epiglottis under it follow it without a crease)
    weights.push(LEAD * (0.1 + 0.9 * ease(run / 1.6)));
  }
  // the lips: their outlines at rest as `lipFaces` makes them (the painted profile, the painted edges where they
  // meet, the model's inner side); points that lie on a parting are put just on their own side of it
  const guideLips = { ul: G.solids.get('upperLip')!, ll: G.solids.get('lowerLip')! };
  const id: Place = (x, y) => [x, y];
  restFaces ??= lipFaces(null, null, guideLips, id, id);
  const upper = UPPER_LEADS(restFaces.upper.length / 2);
  for (const i of upper) {
    rest.push(...offParting(restFaces.upper[2 * i], restFaces.upper[2 * i + 1], UPPER_SIDE));
    weights.push(LEAD);
  }
  const lower = LOWER_LEADS(restFaces.lower.length / 2);
  for (const i of lower) {
    rest.push(...offParting(restFaces.lower[2 * i], restFaces.lower[2 * i + 1], LOWER_SIDE));
    weights.push(LEAD);
  }
  // the lips' inner faces, on their teeth
  for (const p of [SLIDE_UPPER, SLIDE_LOWER]) for (let i = 0; i < p.length; i += 2) { rest.push(p[i], p[i + 1]); weights.push(LEAD); }
  // the skin under the chin
  for (let i = 0; i < SKIN_UNDER.length; i += 2) { rest.push(SKIN_UNDER[i], SKIN_UNDER[i + 1]); weights.push(LEAD / 2); }
  // the front of the larynx, which the model moves with the tongue's root (less and less down toward the vocal folds)
  const lx = G.solids.get('larynx')!;
  for (const i of LARYNX_LEAD) { rest.push(lx[2 * i], lx[2 * i + 1]); weights.push(LEAD / 2); }
  leads = { rest, weights, tongue: t0.length / 2, upper, lower };
  // the painting's air at rest: over the painted tongue (from the foot of its root to its tip), on along the
  // guide's floor of the air to the lips, and back under its roof to the larynx
  const nearRay = (x: number, y: number) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i <= G.lastRay; i++) { const d = Math.hypot(G.low[2 * i] - x, G.low[2 * i + 1] - y); if (d < bd) { bd = d; bi = i; } }
    return bi;
  };
  const nt = 2 * leads.tongue;
  const iFoot = nearRay(rest[0], rest[1]), iTip = nearRay(rest[nt - 2], rest[nt - 1]);
  const air: number[] = [];
  for (let i = 0; i < iFoot; i++) air.push(G.low[2 * i], G.low[2 * i + 1]);
  air.push(...rest.slice(0, nt));
  for (let i = iTip + 1; i <= G.lastRay; i++) air.push(G.low[2 * i], G.low[2 * i + 1]);
  for (let i = G.lastRay; i >= 0; i--) air.push(G.up[2 * i], G.up[2 * i + 1]);
  sheetWarp = buildWarp({ ...SHEET_GRID, free: [TISSUE], jaw: [MANDIBLE], air: [air], cuts: PARTINGS, anchors: rest, weights, pivot: J });
  return { warp: sheetWarp, leads };
}

/** The canonical frame round the warp's grid, as rectangles (x0, y0, x1, y1), each wholly above or below BEND_Y. */
const FRAME_RECTS: number[][] = (() => {
  const g = SHEET_GRID, f = BACKDROP_FRAME, o = g.h / 2;
  const gx1 = g.x0 + (g.nx - 1) * g.h, gy1 = g.y0 + (g.ny - 1) * g.h;
  const rects = [
    [f.x0, f.y0, g.x0 + o, f.y1], [gx1 - o, f.y0, f.x1, f.y1],
    [g.x0 + o, f.y0, gx1 - o, g.y0 + o], [g.x0 + o, gy1 - o, gx1 - o, f.y1],
  ];
  const out: number[][] = [];
  for (const r of rects) {
    if (r[1] < BEND_Y && r[3] > BEND_Y) out.push([r[0], r[1], r[2], BEND_Y], [r[0], BEND_Y, r[2], r[3]]);
    else out.push(r);
  }
  return out;
})();

/** The illustrated head for this posture (geometry from `computeGeometry` with the same anatomy and articulators). */
export function headScene(geom: TractGeometry, an: Anatomy, a: Articulators): HeadScene {
  const G = guideHead();
  const { s, k } = canonTransform(an, a);
  const cranium: Mat = [s, 0, 0, s, 0, 0];
  const dJaw = geom.jawAngle - G.jawAngle;
  // a canonical point as the model would place it now: turned with the jaw by its weight,
  // then sized and stretched
  const place = (x: number, y: number, w: number): [number, number] => {
    const c = Math.cos(dJaw * w), sn = Math.sin(dJaw * w);
    const dx = x - J[0], dy = y - J[1];
    const rx = J[0] + c * dx - sn * dy, ry = J[1] + sn * dx + c * dy;
    return [s * rx, s * (ry < BEND_Y ? BEND_Y - (BEND_Y - ry) * k : ry)];
  };
  /** world <-> canonical, for what does not turn: the speaker's size and the stretch of the pharynx */
  const toWorld = (x: number, y: number): [number, number] => [s * x, s * (y < BEND_Y ? BEND_Y - (BEND_Y - y) * k : y)];
  const toCanon = (x: number, y: number): [number, number] => { const yc = y / s; return [x / s, yc < BEND_Y ? BEND_Y - (BEND_Y - yc) / k : yc]; };

  const outline = smoothOutline([
    ...canonToWorld(HEAD_BACK, an, a),
    ...canonToWorld(HEAD_FRONT_UP, an, a),
    ...canonToWorld(CHIN, an, a, chinWeight),
  ]);

  // the air
  const n = geom.lastRay;
  const lower: number[] = [], upper: number[] = [];
  const bare = { lower: [] as boolean[], upper: [] as boolean[] };
  for (let i = 0; i <= n; i++) {
    lower.push(...edgePoint(geom, i, false));
    upper.push(...edgePoint(geom, i, true));
    bare.lower.push(geom.hits[i].lowId === null);
    bare.upper.push(geom.hits[i].upId === null);
  }
  const lumen = [...lower];
  for (let i = n; i >= 0; i--) lumen.push(upper[2 * i], upper[2 * i + 1]);

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

  // ---- the plate as a sheet: led by the tongue and the lips, turned by the jaw (solved when first asked)
  let made: Sheet | null = null;
  const sheet = (): Sheet => {
    if (made) return made;
    const { warp: W, leads: L } = theWarp();
    const to = new Float64Array(L.rest.length);
    let q = 0;
    const put = (x: number, y: number) => { const c = toCanon(x, y); to[q++] = c[0]; to[q++] = c[1]; };
    // the tongue's surface, kept under the roof of the air: where the model lets it rise into the palate, the
    // velum or the wall of the pharynx (the air there is shut), it lies against them instead
    const tl = tongueLead(solid('tongue'));
    for (let i = 0; i < 2 * L.tongue; i += 2) {
      if (tl) put(...underRoof(geom, tl[i], tl[i + 1], 0)); else { to[q] = L.rest[q]; to[q + 1] = L.rest[q + 1]; q += 2; }
    }
    const u0 = q;
    for (const i of L.upper) put(upperFace[2 * i], upperFace[2 * i + 1]);
    const l0 = q;
    for (const i of L.lower) put(lowerFace[2 * i], lowerFace[2 * i + 1]);
    // lips pressed together do not pass through one another: where they meet, they meet half way
    // (the upper lip's last profile point and its edge, against the lower lip's first profile point and its edge)
    const nu = L.upper.length, nl = L.lower.length;
    const fu = FACE_UPPER.length / 2 - 1 - (L.upper[0] - FACE_PROFILE.upper[0]);
    for (const [a, b] of [[u0 + 2 * fu, l0], [u0 + 2 * (fu + 1), l0 + 2 * (nl - 1)], [u0 + 2 * (fu + 2), l0 + 2 * (nl - 2)], [u0 + 2 * (fu + 3), l0 + 2 * (nl - 3)]]) {
      if (fu + 3 >= nu) break;
      if (to[a + 1] < to[b + 1]) to[a + 1] = to[b + 1] = 0.5 * (to[a + 1] + to[b + 1]);
    }
    // the lips' inner faces slide along their teeth as far as each lip's edge moves along them
    const ax = (axis: [number, number], turn: number): [number, number] => [Math.cos(turn) * axis[0] - Math.sin(turn) * axis[1], Math.sin(turn) * axis[0] + Math.cos(turn) * axis[1]];
    const au = AXIS_UPPER, al = ax(AXIS_LOWER, dJaw);
    const cu = apply(cranium, CORNER_UPPER[0], CORNER_UPPER[1]), cl = place(CORNER_LOWER[0], CORNER_LOWER[1], 1);
    const su = (P(4)[0] - cu[0]) * au[0] + (P(4)[1] - cu[1]) * au[1], sl = (Q(4)[0] - cl[0]) * al[0] + (Q(4)[1] - cl[1]) * al[1];
    for (let i = 0; i < SLIDE_UPPER.length; i += 2) {
      const w = slideUpper(SLIDE_UPPER[i + 1]) * su;
      put(s * SLIDE_UPPER[i] + w * au[0], s * SLIDE_UPPER[i + 1] + w * au[1]);
    }
    for (let i = 0; i < SLIDE_LOWER.length; i += 2) {
      const w = slideLower(SLIDE_LOWER[i + 1]) * sl, b = place(SLIDE_LOWER[i], SLIDE_LOWER[i + 1], 1);
      put(b[0] + w * al[0], b[1] + w * al[1]);
    }
    for (let i = 0; i < SKIN_UNDER.length; i += 2) put(...place(SKIN_UNDER[i], SKIN_UNDER[i + 1], chinWeight(SKIN_UNDER[i])));
    const lx = solid('larynx');
    for (const i of LARYNX_LEAD) put(lx[2 * i], lx[2 * i + 1]);
    const d = W.solve(dJaw, to);
    const nn = W.rest.length / 2;
    const at = new Float32Array(2 * nn);
    for (let i = 0; i < nn; i++) {
      const w = toWorld(W.rest[2 * i] + d[2 * i], W.rest[2 * i + 1] + d[2 * i + 1]);
      at[2 * i] = w[0]; at[2 * i + 1] = w[1];
    }
    const frameRest = new Float32Array(8 * FRAME_RECTS.length), frameAt = new Float32Array(8 * FRAME_RECTS.length);
    FRAME_RECTS.forEach((r, j) => {
      const c = [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]];
      for (let v = 0; v < 8; v += 2) {
        frameRest[8 * j + v] = c[v]; frameRest[8 * j + v + 1] = c[v + 1];
        const w = toWorld(c[v], c[v + 1]);
        frameAt[8 * j + v] = w[0]; frameAt[8 * j + v + 1] = w[1];
      }
    });
    return (made = { warp: W, d, at, frameRest, frameAt });
  };
  /** where the sheet carries a canonical point of the plate (world) */
  const warp = (x: number, y: number): [number, number] => {
    const g = SHEET_GRID;
    if (x <= g.x0 || y <= g.y0 || x >= g.x0 + (g.nx - 1) * g.h || y >= g.y0 + (g.ny - 1) * g.h) return toWorld(x, y);
    const sh = sheet();
    const loc = sh.warp.locate(x, y);
    if (!loc) return toWorld(x, y);
    let dx = 0, dy = 0;
    for (let c = 0; c < 4; c++) { dx += loc.w[c] * sh.d[2 * loc.piece.k[c]]; dy += loc.w[c] * sh.d[2 * loc.piece.k[c] + 1]; }
    return toWorld(x + dx, y + dy);
  };

  // the painted lips, carried by the sheet: their outlines at rest, a point every millimetre or so, each carried
  let lipsNow: { upper: number[]; lower: number[]; gums: number[][] } | null = null;
  const lips = () => {
    if (lipsNow) return lipsNow;
    const carry = (p: number[]) => {
      const at: number[] = [], moved: number[] = [];
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length, n = Math.max(1, Math.ceil(Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]) / 0.1));
        for (let k = 0; k < n; k++) {
          const x = p[i] + ((p[j] - p[i]) * k) / n, y = p[i + 1] + ((p[j + 1] - p[i + 1]) * k) / n;
          const w = warp(x, y), r = toWorld(x, y);
          at.push(w[0], w[1]); moved.push(w[0] - r[0], w[1] - r[1]);
        }
      }
      // (a point right where the partings meet may be carried by the far side of one: it moves unlike both its
      // neighbours, and is left out rather than drawn as a spike across the air)
      const out: number[] = [], m = at.length / 2;
      for (let i = 0; i < m; i++) {
        const a = (i + m - 1) % m, b = (i + 1) % m;
        const ex = moved[2 * i] - 0.5 * (moved[2 * a] + moved[2 * b]), ey = moved[2 * i + 1] - 0.5 * (moved[2 * a + 1] + moved[2 * b + 1]);
        if (Math.hypot(ex, ey) < 0.2 * s) out.push(at[2 * i], at[2 * i + 1]);
      }
      return out;
    };
    return (lipsNow = { upper: carry(PAINTED_LIPS.upper), lower: carry(PAINTED_LIPS.lower), gums: PAINTED_LIPS.gums.map(carry) });
  };

  // the free edges of parted lips, rounded (worked out when first asked)
  let marginsNow: { off: number[]; edge: number[]; into: [number, number] }[] | null = null;
  const margins = () => {
    if (marginsNow) return marginsNow;
    // the parting where the lips meet, front to back (canonical), each lip's side of it, carried
    const line = PARTINGS[0];
    const lineY = (x: number) => {
      for (let i = 2; i + 1 < 12; i += 2) if (x >= line[i + 2]) return line[i + 1] + ((line[i + 3] - line[i + 1]) * (x - line[i])) / (line[i + 2] - line[i]);
      return line[11];
    };
    const side = (dy: number) => { const out: number[] = []; for (let x = 8.3; x >= 7.15; x -= 0.07) out.push(...warp(x, lineY(x) + dy)); return out; };
    const up = side(0.02), lo = side(-0.02);
    // (the lower lip's top goes on back along the parting from the lower incisor, down to its edge: its rounding
    // takes in what of the lip rises there)
    for (const [x, y] of [[7.17, 7.97], [7.08, 7.86], [6.98, 7.83], [6.88, 7.79], [6.82, 7.74]]) lo.push(...warp(x, y));
    // (how far apart the model's lips are at their front: shut, nothing is rounded)
    const gap = Math.min(P(4)[1] - Q(4)[1], P(3)[1] - Q(3)[1]);
    const f = ease((gap - 0.03 * s) / (0.3 * s));
    marginsNow = [];
    if (f <= 0.01) return marginsNow;
    for (const [e, toward, inside] of [[up, warp(8.6, 8.2), warp(7.6, 8.6)], [lo, warp(8.57, 7.87), warp(7.6, 7.5)]] as const) {
      const n = e.length / 2, C: [number, number] = [e[0], e[1]], K: [number, number] = [e[2 * n - 2], e[2 * n - 1]];
      // into the lip: across its edge, on the side its body is
      let ix = -(K[1] - C[1]), iy = K[0] - C[0];
      const il = Math.hypot(ix, iy) || 1;
      ix /= il; iy /= il;
      if (ix * (inside[0] - C[0]) + iy * (inside[1] - C[1]) < 0) { ix = -ix; iy = -iy; }
      const r = 0.1 * s * f, D = 0.34 * s * f;
      const ux = toward[0] - C[0], uy = toward[1] - C[1], ul = Math.hypot(ux, uy) || 1;
      const F: [number, number] = [C[0] + (r * ux) / ul, C[1] + (r * uy) / ul];
      // the new edge: the old one taken in more and more toward the teeth (the lip rolling into its inner face),
      // and rounded at the front into the profile
      const edge: number[] = [F[0], F[1]];
      for (let k = 1; k < n; k++) {
        const t = k / (n - 1), d = D * t ** 1.6 + r * Math.max(0, 1 - t / 0.14) ** 2;
        edge.push(e[2 * k] + d * ix, e[2 * k + 1] + d * iy);
      }
      // (from in front of the corner, where the painting has the shadow between the lips' fronts: apart, it would
      // be left on the lip as a dark hair)
      const ahead = warp(9.2, lineY(8.32) + (iy > 0 ? 0.03 : -0.03)), beyond = warp(9.2, lineY(8.32) + (iy > 0 ? 0.25 : -0.25));
      const off: number[] = [...toward, ...beyond, ...ahead, ...e];
      for (let k = edge.length - 2; k >= 0; k -= 2) off.push(edge[k], edge[k + 1]);
      marginsNow.push({ off, edge, into: [ix, iy] });
    }
    return marginsNow;
  };

  // where the plate painted air that is tissue now: between its edge and ours (worked out when first asked)
  let patches: number[][] | null = null;
  const patchesNow = (): number[][] => {
    if (patches) return patches;
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
    return (patches = patch);
  };

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

  // the solids, with how the plate's painting at rest would be carried onto each (for views that draw them alone)
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
    s, outline, sheet, warp, place, neckEnd: toWorld(0, NECK_END)[1], tongue: solid('tongue'), lips, margins, lumen, lower, upper, bare,
    get patch() { return patchesNow(); },
    upperFace, lowerFace, mouth, vestibule, port, portVelum: half, nasal: [...up2, ...lo2], sprites, velum: vel,
  };
}
