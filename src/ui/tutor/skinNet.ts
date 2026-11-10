/**
 * The skin of the tutor's head as a net: the knots of a net laid over the
 * face as it is painted (the anatomy's own frame, lips closed), and where
 * each knot goes for a posture of the model. Photographs of the face are
 * stretched over the net, so the face moves with the very shapes that move
 * the anatomy: the chin turns with the model's jaw, each lip is carried by
 * the model's lip, and the profile of the face lies on the profile of the
 * painted lips in every posture.
 *
 * A face is one skin, not rigid pieces. The chin turns with the jaw, the
 * cheek stretches between it and the still head, and the corner of the
 * mouth is a hinge in front of which the lips part. So the net has two rows
 * of knots on the line where the lips meet (the upper lip's and the lower
 * lip's), joined behind the corner and free in front of it; between them is
 * the inside of the mouth, which a photograph of an open mouth fills.
 *
 * Nothing here draws: scripts/skin-poses.ts uses it to tell
 * scripts/skin-register.py where the knots are in each photograph's posture,
 * and skin.ts to draw.
 */
import { chinWeight } from '../head/outline';
import { FACE_LOWER, FACE_PROFILE, FACE_UPPER, HeadScene } from '../head/scene';

/** Where the lips meet at rest (canonical cm), and the corner of the mouth as seen from the side. */
export const LIPS_MEET = 8.06, CORNER = 6.9, STOMION = 8.32;

/** The net's lines. Fine round the mouth, coarse over the rest of the head, which does not move. */
export const NET_X = [-11, -8, -5, -2, 0.5, 2, 2.6, 3.2, 3.9, 4.6, 5.2, 5.7, 6.1, 6.5, CORNER, 6.97, 7.06, 7.18, 7.33, 7.5, 7.8, 8.06, STOMION, 8.56, 8.8, 9.05, 9.3, 9.6, 10, 10.5, 11.2, 12, 13];
const BELOW = [-7, -4, -2.75, -1.5, -0.5, 0.4, 1.4, 2.4, 3.2, 3.9, 4.5, 5.0, 5.5, 5.9, 6.3, 6.6, 6.9, 7.2, 7.5, 7.8];
const ABOVE = [8.35, 8.65, 8.95, 9.3, 9.65, 10.0, 10.35, 10.7, 11.2, 12, 13, 15, 18, 22, 26, 29];
/** The rows from the neck up: those below the mouth, the lower lip's edge, the middle of the opening, the upper lip's edge, those above. */
export const NET_Y = [...BELOW, LIPS_MEET, LIPS_MEET, LIPS_MEET, ...ABOVE];
export const ROW_LOWER = BELOW.length, ROW_MID = ROW_LOWER + 1, ROW_UPPER = ROW_LOWER + 2;
export const NX = NET_X.length, NY = NET_Y.length;
/** The column of the corner of the mouth: the lips' rows are one behind it. */
const COL_CORNER = NET_X.indexOf(CORNER);

const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** How much of the jaw's turn a point of the face takes, behind the corner of the mouth: all of it at the chin, none at the cheekbone. */
const cheek = (y: number) => 1 - ease((y - 6.9) / (9.2 - 6.9));
/**
 * In front of the corner the two lips go their own ways: 0 at the corner, 1 nine millimetres in front of it.
 * The corner of a mouth is round, not a notch: the lips leave it straight up and down and turn forward (a
 * quarter of a circle), so the opening ends in an arc.
 */
const front = (x: number) => { const t = Math.max(0, Math.min(1, (x - CORNER) / 0.9)); return Math.sqrt(1 - (1 - t) * (1 - t)); };
/** The share of the jaw's turn of a point: `upper` for the upper lip's side of the mouth. */
export function share(x: number, y: number, upper: boolean): number {
  return chinWeight(x) * (cheek(y) + ((upper ? 0 : 1) - cheek(y)) * front(x));
}
/** How much of a lip's own movement the skin behind it takes: all of it at the lip, none in the cheek. */
const carried = (x: number) => ease((x - (CORNER - 0.6)) / 1.6);
/** The lowest height at which the face turns with the jaw (under the chin). */
const FLOOR = 0.4;
/** How far above and below the mouth the corner's own movement reaches. */
const near = (y: number) => ease(1 - Math.abs(y - LIPS_MEET) / 1.8);

/**
 * The inside of the mouth as two grids of points (canonical cm, row by row from the bottom: x, y interleaved):
 * the upper one goes with the head (the upper teeth, the roof), the lower one with the jaw (the lower teeth,
 * the tongue). Between parted lips each photograph's inside is laid on them where its own posture had them, so
 * its teeth keep their size and place: the lips uncover them, they are never stretched.
 */
export const INSIDE_X = Array.from({ length: 19 }, (_, i) => 5.4 + 0.25 * i);
export const INSIDE_UPPER_Y = Array.from({ length: 12 }, (_, j) => 7.5 + 0.2 * j);
export const INSIDE_LOWER_Y = Array.from({ length: 16 }, (_, j) => 6.0 + 0.2 * j);
/** where the upper grid fades out downward (it is laid over the lower one): clear at the first, whole at the second */
export const INSIDE_FADE: [number, number] = [7.7, 8.1];
export function insideGrid(ys: number[]): Float32Array {
  const out = new Float32Array(2 * INSIDE_X.length * ys.length);
  ys.forEach((y, j) => INSIDE_X.forEach((x, i) => { out[2 * (j * INSIDE_X.length + i)] = x; out[2 * (j * INSIDE_X.length + i) + 1] = y; }));
  return out;
}

/** The knots at rest (canonical cm), row by row from the neck up: x, y interleaved. */
export const NET_REST: Float32Array = (() => {
  const out = new Float32Array(2 * NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { out[2 * (j * NX + i)] = NET_X[i]; out[2 * (j * NX + i) + 1] = NET_Y[j]; }
  return out;
})();

/**
 * The net's triangles (three knots each), in two lists: the skin, and the
 * inside of the mouth (between the lips' two rows, in front of the corner),
 * which has no size while the mouth is shut.
 */
export const NET_TRIANGLES: { skin: Uint16Array; mouth: Uint16Array } = (() => {
  const skin: number[] = [], mouth: number[] = [];
  const id = (i: number, j: number) => j * NX + i;
  for (let j = 0; j + 1 < NY; j++) {
    const inside = j === ROW_LOWER || j === ROW_MID;
    for (let i = 0; i + 1 < NX; i++) {
      if (inside && i < COL_CORNER) continue;
      (inside ? mouth : skin).push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
    }
  }
  return { skin: new Uint16Array(skin), mouth: new Uint16Array(mouth) };
})();

/** A line of the profile at rest, as heights and the movement of each of its points (dx, dy). */
interface Carried { y: number[]; d: number[] }
function at(c: Carried, y: number): [number, number] {
  const n = c.y.length;
  // (the heights fall along the line)
  if (y >= c.y[0]) return [c.d[0], c.d[1]];
  if (y <= c.y[n - 1]) return [c.d[2 * n - 2], c.d[2 * n - 1]];
  let i = 0;
  while (i + 2 < n && c.y[i + 1] > y) i++;
  const f = (c.y[i] - y) / Math.max(1e-6, c.y[i] - c.y[i + 1]);
  return [c.d[2 * i] + f * (c.d[2 * i + 2] - c.d[2 * i]), c.d[2 * i + 1] + f * (c.d[2 * i + 3] - c.d[2 * i + 1])];
}

/**
 * Where a posture puts points of the face (canonical, at rest; `upper` says on which side of the mouth each
 * lies): world centimetres. A point turns with the jaw by its share, then goes with the lip it belongs to: by
 * how far the painted lip's own profile has moved at its height. In front of the corner of the mouth each lip
 * goes its own way; at the corner and behind it the two are one skin, and go the way of both.
 */
export function skinPlacer(sc: HeadScene): (x: number, y: number, upper: boolean) => [number, number] {
  const line = (face: number[], rest: number[], first: number, upper: boolean): Carried => {
    const y: number[] = [], d: number[] = [];
    for (let i = 0; i < rest.length; i += 2) {
      const q = sc.place(rest[i], rest[i + 1], share(rest[i], rest[i + 1], upper));
      y.push(rest[i + 1]);
      d.push(face[2 * (first + i / 2)] - q[0], face[2 * (first + i / 2) + 1] - q[1]);
    }
    return { y, d };
  };
  const up = line(sc.upperFace, FACE_UPPER, FACE_PROFILE.upper[0], true);
  const low = line(sc.lowerFace, FACE_LOWER, FACE_PROFILE.lower[0], false);
  // above the profile's top (the base of the nose) and below its foot (the fold of the chin) nothing is carried
  up.y.unshift(up.y[0] + 0.45); up.d.unshift(0, 0);
  low.y.push(low.y[low.y.length - 1] - 0.5); low.d.push(0, 0);
  const u0 = at(up, LIPS_MEET), l0 = at(low, LIPS_MEET);
  const both: [number, number] = [0.5 * (u0[0] + l0[0]), 0.5 * (u0[1] + l0[1])];
  return (x, y, upper) => {
    // (below the chin there is no face in front of the neck: what the net has there goes down with the chin
    // as it is, and does not swing out on the jaw's long arm)
    if (y < FLOOR) {
      const a = sc.place(x, FLOOR, share(x, FLOOR, upper)), b = sc.place(x, FLOOR, 0), c0 = sc.place(x, y, 0);
      return [a[0] + c0[0] - b[0], a[1] + c0[1] - b[1]];
    }
    const q = sc.place(x, y, share(x, y, upper));
    const c = carried(x);
    if (c <= 0) return q;
    const f = front(x), own = at(upper ? up : low, y), n = near(y);
    q[0] += c * (f * own[0] + (1 - f) * n * both[0]);
    q[1] += c * (f * own[1] + (1 - f) * n * both[1]);
    return q;
  };
}

/** Where a posture puts the knots of the net (world centimetres), in the order of `NET_REST`. */
export function netKnots(sc: HeadScene, out = new Float32Array(2 * NX * NY)): Float32Array {
  const put = skinPlacer(sc);
  for (let j = 0; j < NY; j++) {
    if (j === ROW_MID) continue;
    const upper = j >= ROW_UPPER;
    for (let i = 0; i < NX; i++) {
      const q = put(NET_X[i], NET_Y[j], upper);
      out[2 * (j * NX + i)] = q[0]; out[2 * (j * NX + i) + 1] = q[1];
    }
  }
  for (let i = 0; i < NX; i++) {
    const a = 2 * (ROW_LOWER * NX + i), b = 2 * (ROW_UPPER * NX + i), m = 2 * (ROW_MID * NX + i);
    // lips pressed together do not pass through one another: they meet half way
    if (out[b + 1] < out[a + 1]) out[a + 1] = out[b + 1] = 0.5 * (out[a + 1] + out[b + 1]);
    // the middle of the opening, half way between the two lips
    out[m] = 0.5 * (out[a] + out[b]); out[m + 1] = 0.5 * (out[a + 1] + out[b + 1]);
  }
  return out;
}

/**
 * The mouth of a posture in two measures (the painting's own centimetres): how far apart the lips are at the
 * front, and how far forward of their place at rest. The photographs of the mouth are chosen by them.
 */
export function mouthMeasure(sc: HeadScene): { gap: number; forward: number } {
  const put = skinPlacer(sc);
  const u = put(STOMION, LIPS_MEET, true), l = put(STOMION, LIPS_MEET, false);
  return { gap: (u[1] - l[1]) / sc.s, forward: (0.5 * (u[0] + l[0])) / sc.s - STOMION };
}
