/**
 * The far half of the head behind the cut, for the 3D view: the head is shown
 * cut down the middle, its cut face the painted anatomy, and what lies behind
 * that face needs a body or it would be a card.
 *
 * The body is raised from the painting's own silhouette: every point inside
 * it lies as deep behind the cut as the head is wide there. A real head is
 * broad where its outline is broad (the skull, the neck) and thin where a
 * part stands out of it (the nose, the lips, the chin), so the depth has two
 * parts: a quarter circle from the edge of the head without those parts, and
 * a small rounded rim for the parts themselves. It moves as the painting
 * moves (the chin turns with the jaw, the cheek stretches, the lips part),
 * and is covered with the photograph of the same head's skin, seen from the
 * side as it was taken.
 *
 * Inside it lies a shallower tray of dark tissue, moving with it: wherever the
 * cut face has a hole the airway's own walls do not fill, that is what is
 * seen, not the room.
 */
import { BACKDROP_FRAME } from '../head/frame';
import { chinWeight } from '../head/outline';
import type { HeadScene } from '../head/scene';

/** The silhouette is read from the painting at 8 samples a centimetre; the body has a point every 2 samples. */
export const GW = 192, GH = 288;
const STEP = 2;
const PX = GW / (BACKDROP_FRAME.x1 - BACKDROP_FRAME.x0);
/** Where the lips meet at rest, and the corner of the mouth (canonical): in front of the corner the body is slit, as a mouth is. */
const LIPS_MEET = 8.06, CORNER = 6.9;
/** The first row of points lies a little above the frame, so that one row lies exactly where the lips meet. */
const Y_TOP = BACKDROP_FRAME.y1 + (LIPS_MEET - Math.floor(LIPS_MEET * (PX / STEP)) / (PX / STEP));
/** The neck ends on a flat cut (canonical height), like the painting's. */
const NECK_CUT = -3.45;
/** Half the width of the head at its widest, and of a part that stands out of it (canonical cm). */
const BROAD = 6.6, THIN = 1.55, THIN_OVER = 1.25, CORE = 1.9;
/** How far behind the cut the tray of tissue lies at most, and how far inside the silhouette it starts. */
const TRAY_DEPTH = 3.0, TRAY_INSET = 0.3;

export interface Body {
  /** per point: canonical x, y, and depth behind the cut (cm) */
  canon: Float32Array;
  /** how much of the jaw's turn each point takes */
  weight: Float32Array;
  /** where each point is in the photograph of the skin (and in the painting) */
  uv: Float32Array;
  index: Uint32Array;
  /** the tray inside: its own points (canonical x, y: the body's, kept a little inside the silhouette), their depth, and its triangles */
  trayCanon: Float32Array;
  trayDepth: Float32Array;
  trayIndex: Uint32Array;
  count: number;
  /** the lips: which lip carries each point (1 the upper, -1 the lower, 0 neither), how much of its movement
   *  the point takes, and where along that lip's profile it lies (a profile point and the way to the next) */
  lipSide: Int8Array;
  lipShare: Float32Array;
  lipAt: Float32Array;
}

/** The painted profile of the two lips at rest (canonical x, y pairs, from the nose down and from the lips' meeting down). */
export interface LipProfile { upper: number[]; lower: number[] }
/** How far each point of the lips' profile has moved from where the jaw alone would put it (world x, y pairs). */
export interface LipMove { upper: number[]; lower: number[] }

const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** Behind the corner of the mouth the face is one skin: all of the jaw's turn at the chin, none at the cheekbone. */
const cheek = (y: number) => 1 - ease((y - 6.9) / 2.3);

/** Distance (in samples) from every sample that is `set` to the nearest one that is not; 0 where not set. */
function distance(set: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h), D = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = set[i] ? 1e6 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i] === 0) continue;
    let m = d[i];
    if (x > 0) m = Math.min(m, d[i - 1] + 1);
    if (y > 0) { m = Math.min(m, d[i - w] + 1); if (x > 0) m = Math.min(m, d[i - w - 1] + D); if (x < w - 1) m = Math.min(m, d[i - w + 1] + D); }
    d[i] = m;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (d[i] === 0) continue;
    let m = d[i];
    if (x < w - 1) m = Math.min(m, d[i + 1] + 1);
    if (y < h - 1) { m = Math.min(m, d[i + w] + 1); if (x < w - 1) m = Math.min(m, d[i + w + 1] + D); if (x > 0) m = Math.min(m, d[i + w - 1] + D); }
    d[i] = m;
  }
  return d;
}

/**
 * The silhouette of the painted head, as samples that are inside it. The painting stands on black, and so
 * does the air inside it: the outside is what can be reached from the frame's edge through black that is
 * not a thin crack (the nostril, the lips), the cut end of the neck being closed first so that the windpipe
 * is not taken for the room.
 */
export function silhouette(img: CanvasImageSource): Uint8Array | null {
  const cv = document.createElement('canvas');
  cv.width = GW; cv.height = GH;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(img, 0, 0, GW, GH);
  let px: Uint8ClampedArray;
  try { px = c.getImageData(0, 0, GW, GH).data; } catch { return null; }
  const n = GW * GH;
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) dark[i] = 0.3 * px[4 * i] + 0.59 * px[4 * i + 1] + 0.11 * px[4 * i + 2] < 36 ? 1 : 0;
  // black with black all around it, two samples deep
  const open = new Uint8Array(n);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let ok = 1;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) {
      const u = x + dx, v = y + dy;
      if (u >= 0 && u < GW && v >= 0 && v < GH && !dark[v * GW + u]) { ok = 0; break; }
    }
    open[y * GW + x] = ok;
  }
  const row = (y: number) => Math.round((BACKDROP_FRAME.y1 - y) * PX), col = (x: number) => Math.round((x - BACKDROP_FRAME.x0) * PX);
  for (let y = row(-3.3); y <= row(-4.0) && y < GH; y++) for (let x = col(-8.8); x <= col(3.2); x++) open[y * GW + x] = 0;
  const out = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number) => { if (open[i] && !out[i]) { out[i] = 1; stack.push(i); } };
  for (let x = 0; x < GW; x++) { push(x); push((GH - 1) * GW + x); }
  for (let y = 0; y < GH; y++) { push(y * GW); push(y * GW + GW - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % GW, y = (i - x) / GW;
    if (x > 0) push(i - 1);
    if (x < GW - 1) push(i + 1);
    if (y > 0) push(i - GW);
    if (y < GH - 1) push(i + GW);
  }
  // the outside reaches the head itself (the two samples kept clear of it above)
  const inside = new Uint8Array(n);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    let o = 0;
    if (dark[i]) for (let dy = -2; dy <= 2 && !o; dy++) for (let dx = -2; dx <= 2; dx++) {
      const u = x + dx, v = y + dy;
      if (u >= 0 && u < GW && v >= 0 && v < GH && out[v * GW + u]) { o = 1; break; }
    }
    inside[i] = o ? 0 : 1;
  }
  // the neck goes on below its cut: its end is a flat face, not a rounded one
  const cut = row(-3.1);
  for (let x = 0; x < GW; x++) {
    const on = inside[cut * GW + x];
    for (let y = cut + 1; y < GH; y++) inside[y * GW + x] = on;
  }
  return inside;
}

/** The body of the head behind the cut, from the painting (null if its picture cannot be read). */
export function buildBody(img: CanvasImageSource, lips?: LipProfile): Body | null {
  const inside = silhouette(img);
  if (!inside) return null;
  const n = GW * GH;
  const outside = new Uint8Array(n);
  for (let i = 0; i < n; i++) outside[i] = inside[i] ? 0 : 1;
  const dIn = distance(inside, GW, GH), dOut = distance(outside, GW, GH);
  // the head without what stands out of it: what is left of it after its thin parts are worn away
  const notCore = new Uint8Array(n);
  for (let i = 0; i < n; i++) notCore[i] = dIn[i] >= CORE * PX ? 0 : 1;
  const toCore = distance(notCore, GW, GH);
  const at = (f: Float32Array, x: number, y: number): number => {
    const u = Math.max(0, Math.min(GW - 1.001, x)), v = Math.max(0, Math.min(GH - 1.001, y));
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * GW + i;
    return (f[k] * (1 - a) + f[k + 1] * a) * (1 - b) + (f[k + GW] * (1 - a) + f[k + GW + 1] * a) * b;
  };
  const sdf = (x: number, y: number) => (at(dIn, x, y) - at(dOut, x, y)) / PX;
  const VW = GW / STEP + 1, VH = GH / STEP + 1, cell = STEP / PX;
  const lipRow = Math.round((Y_TOP - LIPS_MEET) / cell);
  const base = VW * VH;
  // the lower lip's own copy of the points on the line where the lips meet, in front of the corner
  const lower = new Int32Array(VW).fill(-1);
  let count = base;
  for (let c = 0; c < VW; c++) if (BACKDROP_FRAME.x0 + c * cell > CORNER) lower[c] = count++;
  const canon = new Float32Array(count * 3), weight = new Float32Array(count), uv = new Float32Array(count * 2);
  const trayCanon = new Float32Array(base * 2), trayDepth = new Float32Array(base);
  const edge = new Float32Array(base);
  const lipSide = new Int8Array(count), lipShare = new Float32Array(count), lipAt = new Float32Array(count);
  /** a point's place on a lip's profile, by its height: the profile point above it and the way to the next */
  const along = (profile: number[], y: number): number => {
    const m = profile.length / 2;
    if (m < 2 || y >= profile[1]) return 0;
    for (let i = 0; i + 1 < m; i++) {
      const y0 = profile[2 * i + 1], y1 = profile[2 * i + 3];
      if (y <= y0 && y >= y1) return i + (y0 - y1 > 1e-6 ? (y0 - y) / (y0 - y1) : 0);
    }
    return m - 1;
  };
  const lip = (v: number, x: number, y: number, upper: boolean) => {
    if (!lips) return;
    const profile = upper ? lips.upper : lips.lower;
    const m = profile.length / 2;
    if (m < 2 || y > profile[1] || y < profile[2 * m - 1]) return;
    // (all of the lip's movement at the lip, none of it behind the corner of the mouth)
    lipSide[v] = upper ? 1 : -1;
    lipShare[v] = ease((x - (CORNER - 0.7)) / 1.7);
    lipAt[v] = along(profile, y);
  };
  const W = BACKDROP_FRAME.x1 - BACKDROP_FRAME.x0, H = BACKDROP_FRAME.y1 - BACKDROP_FRAME.y0;
  for (let r = 0; r < VH; r++) for (let c = 0; c < VW; c++) {
    const v = r * VW + c;
    let x = BACKDROP_FRAME.x0 + c * cell, y = Y_TOP - r * cell;
    const gx = (x - BACKDROP_FRAME.x0) * PX, gy = (BACKDROP_FRAME.y1 - y) * PX;
    const d = sdf(gx, gy);
    edge[v] = d;
    let depth = 0;
    // (the gradient of the distance: the way straight into the head)
    const ex = (sdf(gx + 1, gy) - sdf(gx - 1, gy)) * 0.5 * PX, ey = -(sdf(gx, gy + 1) - sdf(gx, gy - 1)) * 0.5 * PX, el = Math.hypot(ex, ey) || 1;
    // the tray's point: the same, but never nearer the silhouette than its inset
    const back = d > -0.4 && d < TRAY_INSET ? TRAY_INSET - d : 0;
    trayCanon[2 * v] = x + (ex / el) * back; trayCanon[2 * v + 1] = y + (ey / el) * back;
    if (d > 0) {
      const core = at(toCore, gx, gy) / PX;
      const far = core <= 0.01 ? d : Math.max(0, CORE - core);
      const broad = far >= BROAD ? BROAD : Math.sqrt(far * (2 * BROAD - far));
      const t = 1 - Math.min(1, d / THIN_OVER);
      depth = Math.max(broad, THIN * Math.sqrt(1 - t * t));
    } else if (d > -0.4) {
      // a point just outside: onto the silhouette, so that the body's edge is the head's and not a staircase
      x -= (ex / el) * d; y -= (ey / el) * d;
    }
    canon[3 * v] = x; canon[3 * v + 1] = y; canon[3 * v + 2] = depth;
    const upper = y >= LIPS_MEET, front = ease((x - CORNER) / 1.0);
    weight[v] = chinWeight(x) * (cheek(y) + ((upper ? 0 : 1) - cheek(y)) * front);
    uv[2 * v] = (x - BACKDROP_FRAME.x0) / W; uv[2 * v + 1] = (y - BACKDROP_FRAME.y0) / H;
    trayDepth[v] = Math.min(0.9 * depth, TRAY_DEPTH);
    lip(v, x, y, upper);
    if (r === lipRow && lower[c] >= 0) {
      const w = lower[c];
      canon[3 * w] = x; canon[3 * w + 1] = y; canon[3 * w + 2] = depth;
      weight[w] = chinWeight(x) * (cheek(y) + (1 - cheek(y)) * front);
      uv[2 * w] = uv[2 * v]; uv[2 * w + 1] = uv[2 * v + 1];
      lip(w, x, y, false);
    }
  }
  const index: number[] = [], tray: number[] = [];
  for (let r = 0; r + 1 < VH; r++) {
    if (Y_TOP - (r + 1) * cell < NECK_CUT) break;
    for (let c = 0; c + 1 < VW; c++) {
      const a = r * VW + c, b = a + 1, e = a + VW, f = e + 1;
      if (!(edge[a] > 0 || edge[b] > 0 || edge[e] > 0 || edge[f] > 0)) continue;
      if (Math.min(edge[a], edge[b], edge[e], edge[f]) < -0.4) continue;
      // under the line where the lips meet, the lower lip's points
      const ta = r === lipRow && lower[c] >= 0 ? lower[c] : a, tb = r === lipRow && lower[c + 1] >= 0 ? lower[c + 1] : b;
      index.push(ta, e, tb, tb, e, f);
      tray.push(a, e, b, b, e, f);
    }
  }
  return { canon, weight, uv, index: Uint32Array.from(index), trayCanon, trayDepth, trayIndex: Uint32Array.from(tray), count, lipSide, lipShare, lipAt };
}

/**
 * Where the body's points are for a posture (world cm, the cut face at z = 0 and the body behind it):
 * `skin` gets the body, `tray` the tissue inside it.
 */
export function placeBody(body: Body, sc: HeadScene, skin: Float32Array, tray: Float32Array, move?: LipMove): void {
  const { canon, weight, trayCanon, trayDepth, count, lipSide, lipShare, lipAt } = body, s = sc.s, base = trayDepth.length;
  for (let v = 0; v < count; v++) {
    const q = sc.place(canon[3 * v], canon[3 * v + 1], weight[v]);
    let lx = 0, ly = 0;
    if (move && lipSide[v]) {
      // the lip goes where the painted one goes: out for a rounded mouth, up or in for a spread or a tucked one
      const d = lipSide[v] > 0 ? move.upper : move.lower, m = d.length / 2;
      const i = Math.min(m - 1, Math.floor(lipAt[v])), j = Math.min(m - 1, i + 1), f = lipAt[v] - i, g = lipShare[v];
      lx = g * (d[2 * i] + (d[2 * j] - d[2 * i]) * f); ly = g * (d[2 * i + 1] + (d[2 * j + 1] - d[2 * i + 1]) * f);
    }
    skin[3 * v] = q[0] + lx; skin[3 * v + 1] = q[1] + ly; skin[3 * v + 2] = -canon[3 * v + 2] * s;
    if (v < base) {
      // the tray goes with the skin it lies under (across the mouth it is one piece: the dark between parted lips)
      const t = sc.place(trayCanon[2 * v], trayCanon[2 * v + 1], weight[v]);
      tray[3 * v] = t[0] + lx; tray[3 * v + 1] = t[1] + ly; tray[3 * v + 2] = -trayDepth[v] * s;
    }
  }
}
