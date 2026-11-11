/**
 * Paints the illustrated head on a canvas from a `HeadScene`: the plate
 * stretched by the scene's sheet, and the few parts drawn from the acoustic
 * geometry over the air (the velum, the wet rim of the air's walls). The air
 * itself (coloured by the sound field) is drawn by the head view, so nothing
 * here can hide it.
 *
 * On a 2D canvas the sheet is drawn by the processor, pixel by pixel (a few
 * hundredths of a second); the tutor's side view draws it with the graphics
 * card instead (gl.ts), which also draws the air as a cavity and the velum.
 */
import { HeadScene, Mat, mul, PIXELS } from './scene';
import { BACKDROP_FRAME, framePixel } from './frame';
import { PLATE_BG } from './gl';

export interface Backdrop {
  img: HTMLImageElement;
  /** the head's silhouette on the plate (white on the head, black on its background), once loaded */
  mask: HTMLImageElement | null;
  /** colours picked from the painting, so the drawn parts match it */
  tone: { tissue: string; skin: string; mucosa: string; tongue: string };
  /** a tile of mucosa in the painting's colour, made when first needed */
  mucosaTile?: HTMLCanvasElement;
  /** the same flecks on nothing, to lay over a colour of its own */
  flecksTile?: HTMLCanvasElement;
  /** the plate's pixels with its silhouette, for drawing it on a 2D canvas (made when first needed) */
  pixels?: { data: Uint8ClampedArray; w: number; h: number };
}

/** The pictures asked for so far, by address: loading, loaded, or failed. */
const backdrops = new Map<string, { bd: Backdrop | null; failed: boolean }>();

/** The painted backdrop, once loaded (null until then, or if it cannot load). The picture is
 *  drawn at the frame's size whatever its own, so a finer one stays sharp seen from close. */
export function getBackdrop(url = 'anatomy/head-real.jpg'): Backdrop | null {
  let e = backdrops.get(url);
  if (!e && typeof Image !== 'undefined') {
    const entry = { bd: null as Backdrop | null, failed: false };
    backdrops.set(url, (e = entry));
    const img = new Image();
    img.decoding = 'async';
    // the plate and its silhouette (where the head is, its dark background left out): the backdrop is there once
    // both are (a silhouette that cannot load leaves the plate whole)
    const mUrl = url.replace(/head-real\.jpg$/, 'head-mask.png');
    let mask: HTMLImageElement | null = null, waiting = mUrl !== url ? 2 : 1;
    const done = () => { if (--waiting === 0 && img.complete && img.naturalWidth) entry.bd = { img, mask, tone: sampleTones(img) }; };
    img.onload = done;
    img.onerror = () => { entry.failed = true; };
    img.src = url;
    if (mUrl !== url) {
      const m = new Image();
      m.decoding = 'async';
      m.onload = () => { mask = m; done(); };
      m.onerror = done;
      m.src = mUrl;
    }
  }
  return e?.bd ?? null;
}

/** True once a picture is known not to load. */
export function backdropFailed(url: string): boolean { return backdrops.get(url)?.failed ?? false; }

/** Average colour of a few pixels around canonical points of the painting. */
function sampleTones(img: HTMLImageElement): Backdrop['tone'] {
  const fallback = { tissue: '#b9606b', skin: '#e3a98f', mucosa: '#c9606e', tongue: '#d9727f' };
  try {
    const cv = document.createElement('canvas');
    cv.width = BACKDROP_FRAME.width; cv.height = BACKDROP_FRAME.height;
    const c = cv.getContext('2d', { willReadFrequently: true });
    if (!c) return fallback;
    c.drawImage(img, 0, 0, cv.width, cv.height);
    const avg = (x: number, y: number) => {
      const [px, py] = framePixel(x, y);
      const d = c.getImageData(Math.round(px) - 4, Math.round(py) - 4, 9, 9).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`;
    };
    return { tissue: avg(3.2, 4.0), skin: avg(8.6, 10.78), mucosa: avg(7.75, 9.2), tongue: avg(3.5, 7.6) };
  } catch {
    return fallback;
  }
}

const setMat = (ctx: CanvasRenderingContext2D, m: Mat) => ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);

/** A tile of wet mucosa, seamless: soft lighter and darker flecks on the painting's colour,
 *  or on nothing without one. */
function mucosaTile(base?: string): HTMLCanvasElement {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  // (kept in the computer's own memory, not the graphics card's: a pattern cut from a tile that lives on the
  // card has to be fetched back from it at every fill, which costs a twentieth of a second each on a slow card
  // and made a head take seconds to paint)
  const g = c.getContext('2d', { willReadFrequently: true })!;
  if (base) {
    g.fillStyle = base;
    g.fillRect(0, 0, N, N);
  }
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const x = rnd() * N, y = rnd() * N, r = 1.5 + rnd() * 4.5;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,225,228,${(0.05 + rnd() * 0.08).toFixed(3)})` : `rgba(110,30,40,${(0.04 + rnd() * 0.07).toFixed(3)})`;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, 2 * Math.PI);
      g.fill();
    }
  }
  return c;
}

const mucosaPatterns = new WeakMap<CanvasRenderingContext2D, { mucosa?: CanvasPattern | string; flecks?: CanvasPattern | string }>();

/** The mucosa as a fill for this context, a tile every 2.5 cm or so (world units);
 *  with `flecks`, only its flecks. */
function mucosa(ctx: CanvasRenderingContext2D, bd: Backdrop, flecks = false): CanvasPattern | string {
  let all = mucosaPatterns.get(ctx);
  if (!all) mucosaPatterns.set(ctx, (all = {}));
  const key = flecks ? 'flecks' : 'mucosa';
  let p = all[key];
  if (!p) {
    const tile = flecks ? (bd.flecksTile ??= mucosaTile()) : (bd.mucosaTile ??= mucosaTile(bd.tone.mucosa));
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) pat.setTransform(new DOMMatrix().scale(0.02));
    p = all[key] = pat ?? (flecks ? 'rgba(0,0,0,0)' : bd.tone.mucosa);
  }
  return p;
}

/** A polygon's points the other way round. */
function reversed(p: number[]): number[] {
  const out = new Array<number>(p.length);
  for (let i = 0, n = p.length / 2; i < n; i++) { out[2 * i] = p[2 * (n - 1 - i)]; out[2 * i + 1] = p[2 * (n - 1 - i) + 1]; }
  return out;
}

function poly(ctx: CanvasRenderingContext2D, p: number[]): void {
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
}

/** A closed outline with its corners rounded: curves from the middle of each edge to the
 *  middle of the next, bent by the point between them. */
function smoothPoly(ctx: CanvasRenderingContext2D, p: number[]): void {
  const n = p.length / 2;
  const mid = (i: number) => {
    const j = (i + 1) % n;
    return [(p[2 * i] + p[2 * j]) / 2, (p[2 * i + 1] + p[2 * j + 1]) / 2];
  };
  const m0 = mid(n - 1);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(i);
    ctx.quadraticCurveTo(p[2 * i], p[2 * i + 1], m[0], m[1]);
  }
  ctx.closePath();
}

/** Clip to everything outside the polygons (coordinates of the current transform). */
function clipOut(ctx: CanvasRenderingContext2D, polys: number[][], R = 200): void {
  for (const p of polys) {
    if (p.length < 6) continue;
    ctx.beginPath();
    ctx.rect(-R, -R, 2 * R, 2 * R);
    poly(ctx, p);
    ctx.clip('evenodd');
  }
}

// ------------------------------------------------------------ the plate on a 2D canvas

/** The plate's pixels, each its colour times how much of it the head covers, and that cover (made once). */
function platePixels(bd: Backdrop): Backdrop['pixels'] | null {
  if (bd.pixels) return bd.pixels;
  const w = BACKDROP_FRAME.width, h = BACKDROP_FRAME.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(bd.img, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  c.clearRect(0, 0, w, h);
  // (without its silhouette the plate is laid on whole)
  if (bd.mask) c.drawImage(bd.mask, 0, 0, w, h);
  else { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); }
  const m = c.getImageData(0, 0, w, h).data;
  const bg = PLATE_BG.map((v) => v * 255);
  for (let i = 0; i < d.length; i += 4) {
    const a = m[i] / 255;
    d[i] = Math.max(0, d[i] - (1 - a) * bg[0]);
    d[i + 1] = Math.max(0, d[i + 1] - (1 - a) * bg[1]);
    d[i + 2] = Math.max(0, d[i + 2] - (1 - a) * bg[2]);
    d[i + 3] = m[i];
  }
  return (bd.pixels = { data: d, w, h });
}

let scratch: { cv: HTMLCanvasElement; img: ImageData | null } | null = null;

/**
 * The plate stretched by the scene's sheet, on a 2D canvas, pixel by pixel: every triangle of the sheet is
 * filled with the plate as it lies under it at rest (sampled between its pixels), each part of a cut cell only on
 * its side. `world` maps world centimetres to the canvas's pixels (no turn). Returns false if the plate's pixels
 * cannot be read.
 */
export function paintPlate(ctx: CanvasRenderingContext2D, sc: HeadScene, world: Mat, bd: Backdrop): boolean {
  const px = platePixels(bd);
  if (!px) return false;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!scratch) scratch = { cv: document.createElement('canvas'), img: null };
  if (scratch.cv.width !== W || scratch.cv.height !== H || !scratch.img) {
    scratch.cv.width = W; scratch.cv.height = H;
    scratch.img = new ImageData(W, H);
  }
  const out = scratch.img!.data;
  out.fill(0);
  const sh = sc.sheet();
  const Wp = sh.warp;
  const [a, , , d, e, f] = world;
  const K = BACKDROP_FRAME.width / (BACKDROP_FRAME.x1 - BACKDROP_FRAME.x0);
  const src = px.data, sw = px.w, shh = px.h;
  const aa = Math.abs(a) * sc.s;
  /** one triangle: screen corners (sx, sy), plate corners (u, v in plate pixels), and how far inside a part's lines each corner is */
  const tri = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
    u0: number, v0: number, u1: number, v1: number, u2: number, v2: number,
    s0: number, s1: number, s2: number, t0: number, t1: number, t2: number, bias: number) => {
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;
    const inv = 1 / area;
    const cut = s0 < 999 || s1 < 999 || s2 < 999 || t0 < 999 || t1 < 999 || t2 < 999;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const pxx = x + 0.5;
        // barycentric weights of the pixel's centre
        let w1 = ((pxx - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) * inv;
        let w2 = ((x1 - x0) * (py - y0) - (pxx - x0) * (y1 - y0)) * inv;
        let w0 = 1 - w1 - w2;
        if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
        if (w0 < 0) w0 = 0; if (w1 < 0) w1 = 0; if (w2 < 0) w2 = 0;
        let cover = 1;
        if (cut) {
          const k = Math.min(w0 * s0 + w1 * s1 + w2 * s2, w0 * t0 + w1 * t1 + w2 * t2);
          cover = Math.max(0, Math.min(1, k * aa + 0.5 + bias));
          if (cover <= 0) continue;
        }
        // the plate between its four nearest pixels
        const u = w0 * u0 + w1 * u1 + w2 * u2 - 0.5, v = w0 * v0 + w1 * v1 + w2 * v2 - 0.5;
        const iu = Math.floor(u), iv = Math.floor(v);
        if (iu < 0 || iv < 0 || iu + 1 >= sw || iv + 1 >= shh) continue;
        const fu = u - iu, fv = v - iv;
        const p00 = 4 * (iv * sw + iu), p10 = p00 + 4, p01 = p00 + 4 * sw, p11 = p01 + 4;
        const k00 = (1 - fu) * (1 - fv), k10 = fu * (1 - fv), k01 = (1 - fu) * fv, k11 = fu * fv;
        const sa = (src[p00 + 3] * k00 + src[p10 + 3] * k10 + src[p01 + 3] * k01 + src[p11 + 3] * k11) * cover;
        if (sa <= 0.5) continue;
        const sr = (src[p00] * k00 + src[p10] * k10 + src[p01] * k01 + src[p11] * k11) * cover;
        const sg = (src[p00 + 1] * k00 + src[p10 + 1] * k10 + src[p01 + 1] * k01 + src[p11 + 1] * k11) * cover;
        const sb = (src[p00 + 2] * k00 + src[p10 + 2] * k10 + src[p01 + 2] * k01 + src[p11 + 2] * k11) * cover;
        const o = 4 * (y * W + x), keep = 1 - sa / 255;
        // (the image keeps colours not multiplied by their cover: laid over what is there, then divided back)
        const da = out[o + 3], dk = da * keep;
        const na = sa + dk;
        out[o] = (sr + (out[o] * dk) / 255) * (255 / na);
        out[o + 1] = (sg + (out[o + 1] * dk) / 255) * (255 / na);
        out[o + 2] = (sb + (out[o + 2] * dk) / 255) * (255 / na);
        out[o + 3] = na;
      }
    }
  };
  const SX = (x: number) => a * x + e, SY = (y: number) => d * y + f;
  const U = (x: number) => (x - BACKDROP_FRAME.x0) * K, V = (y: number) => (BACKDROP_FRAME.y1 - y) * K;
  // the still frame round the sheet
  const fr = sh.frameRest, fa = sh.frameAt;
  for (let q = 0; q < fr.length; q += 8) {
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
      tri(SX(fa[q + 2 * i]), SY(fa[q + 2 * i + 1]), SX(fa[q + 2 * j]), SY(fa[q + 2 * j + 1]), SX(fa[q + 2 * k]), SY(fa[q + 2 * k + 1]),
        U(fr[q + 2 * i]), V(fr[q + 2 * i + 1]), U(fr[q + 2 * j]), V(fr[q + 2 * j + 1]), U(fr[q + 2 * k]), V(fr[q + 2 * k + 1]), 1e3, 1e3, 1e3, 1e3, 1e3, 1e3, 0);
    }
  }
  // the sheet: whole cells, then the parts of cut cells
  const R = Wp.rest, At = sh.at;
  // (air and soft tissue, the parts of cut cells, then bone and teeth over them)
  for (const pc of [...Wp.whole.slice(0, Wp.soft), ...Wp.parts, ...Wp.whole.slice(Wp.soft)]) {
    const l = pc.lines;
    const side = (n: number, o: number) => (l.length >= o + 3 ? l[o] * R[2 * n] + l[o + 1] * R[2 * n + 1] + l[o + 2] : 1e3);
    const bias = pc.takesRest ? 1 : 0;
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
      const A0 = pc.k[i], A1 = pc.k[j], A2 = pc.k[k];
      tri(SX(At[2 * A0]), SY(At[2 * A0 + 1]), SX(At[2 * A1]), SY(At[2 * A1 + 1]), SX(At[2 * A2]), SY(At[2 * A2 + 1]),
        U(R[2 * A0]), V(R[2 * A0 + 1]), U(R[2 * A1]), V(R[2 * A1 + 1]), U(R[2 * A2]), V(R[2 * A2 + 1]),
        side(A0, 0), side(A1, 0), side(A2, 0), side(A0, 3), side(A1, 3), side(A2, 3), bias);
    }
  }
  const sc2 = scratch.cv.getContext('2d', { willReadFrequently: true })!;
  sc2.putImageData(scratch.img!, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(scratch.cv, 0, 0);
  ctx.restore();
  return true;
}

/**
 * Takes the air out of a painted layer, but not where something is kept (`keep`), and `clear` whatever is kept
 * there but `hard` (the teeth): what is behind the layer shows through the air.
 */
export function cutAirOut(lc: CanvasRenderingContext2D, world: Mat, cut: number[][], keep: number[][], clear: number[][] = [], hard: number[][] = []): void {
  lc.save();
  setMat(lc, world);
  clipOut(lc, keep);
  lc.globalCompositeOperation = 'destination-out';
  lc.fillStyle = '#000';
  // (all in one path, each turning the same way: where two meet, no hairline of the layer is left between them)
  lc.beginPath();
  for (const q of cut) {
    if (q.length < 6) continue;
    let turn = 0;
    for (let i = 0, n = q.length / 2; i < n; i++) { const j = (i + 1) % n; turn += q[2 * i] * q[2 * j + 1] - q[2 * j] * q[2 * i + 1]; }
    poly(lc, turn >= 0 ? q : reversed(q));
  }
  lc.fill('nonzero');
  lc.restore();
  // (and what is taken out whatever is kept there)
  if (!clear.length) return;
  lc.save();
  setMat(lc, world);
  clipOut(lc, hard);
  lc.globalCompositeOperation = 'destination-out';
  lc.fillStyle = '#000';
  for (const q of clear) {
    if (q.length < 6) continue;
    lc.beginPath();
    poly(lc, q);
    lc.fill('evenodd');
  }
  lc.restore();
}

/**
 * Fades the bottom of the painted neck out, so the head does not end on a cut.
 * Use on a layer of its own: it erases what is under it.
 */
export function fadeNeck(ctx: CanvasRenderingContext2D, sc: HeadScene, world: Mat): void {
  ctx.save();
  setMat(ctx, world);
  const y0 = sc.neckEnd, y1 = sc.neckEnd + 1.6 * sc.s;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(-100, y0 - 100, 200, y1 - y0 + 100);
  ctx.restore();
}

/** The air of the nose and above the velum, lit (0..1) when the velum is open and it carries sound. */
export function paintGlow(ctx: CanvasRenderingContext2D, sc: HeadScene, world: Mat, glow: number): void {
  if (glow <= 0.01) return;
  ctx.save();
  setMat(ctx, world);
  ctx.lineJoin = 'round';
  // (each is a body of light with no edge of its own: a faint fill, and wider and wider strokes round it, each fainter)
  for (const [p, rgb, fill] of [[sc.nasal, '42,212,189', 0.2], [sc.port, '42,212,189', 0.26]] as const) {
    ctx.beginPath();
    poly(ctx, p);
    ctx.fillStyle = `rgba(${rgb},${(fill * glow).toFixed(3)})`;
    ctx.fill();
    for (const [w, a] of [[0.7, 0.035], [0.45, 0.05], [0.26, 0.065], [0.12, 0.08]]) {
      ctx.lineWidth = w * sc.s;
      ctx.strokeStyle = `rgba(${rgb},${(a * glow).toFixed(3)})`;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The velum (the model's, painted: the plate's own is in another posture), with the wet rim of the air above it. */
export function paintVelumOver(ctx: CanvasRenderingContext2D, sc: HeadScene, world: Mat, bd: Backdrop): void {
  paintVelum(ctx, sc.velum, world, sc.s, mucosa(ctx, bd, true));
  ctx.save();
  setMat(ctx, world);
  clipOut(ctx, [sc.port]);
  ctx.beginPath();
  const from = 2 * sc.portVelum - 2;
  ctx.moveTo(sc.port[from], sc.port[from + 1]);
  for (let i = from + 2; i < sc.port.length; i += 2) ctx.lineTo(sc.port[i], sc.port[i + 1]);
  ctx.lineWidth = 0.07 * sc.s;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,205,212,0.32)';
  ctx.stroke();
  ctx.restore();
}

/** The affine map taking the triangle p0 p1 p2 onto q0 q1 q2, or null if p is degenerate. */
function triangleMap(p: number[], q: number[]): Mat | null {
  const a = p[2] - p[0], b = p[3] - p[1], c = p[4] - p[0], d = p[5] - p[1];
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return null;
  const A = q[2] - q[0], B = q[3] - q[1], C = q[4] - q[0], D = q[5] - q[1];
  // [m0 m2; m1 m3] = [A C; B D] * inverse([a c; b d])
  const m0 = (A * d - C * b) / det, m2 = (C * a - A * c) / det;
  const m1 = (B * d - D * b) / det, m3 = (D * a - B * c) / det;
  return [m0, m1, m2, m3, q[0] - m0 * p[0] - m2 * p[1], q[1] - m1 * p[0] - m3 * p[1]];
}

/** The painting's triangle p (canonical) drawn onto the triangle q (world), clipped a
 *  pixel larger than q so that no seam shows between neighbours. */
export function paintTriangle(ctx: CanvasRenderingContext2D, world: Mat, p: number[], q: number[], img: HTMLImageElement): void {
  const m = triangleMap(p, q);
  if (!m) return;
  const grow = 0.9 / Math.hypot(world[0], world[1]); // about a pixel, in world units
  const gx = (q[0] + q[2] + q[4]) / 3, gy = (q[1] + q[3] + q[5]) / 3;
  ctx.save();
  setMat(ctx, world);
  ctx.beginPath();
  for (let k = 0; k < 6; k += 2) {
    const dx = q[k] - gx, dy = q[k + 1] - gy, l = Math.hypot(dx, dy) || 1;
    const x = q[k] + (dx / l) * grow, y = q[k + 1] + (dy / l) * grow;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.clip();
  setMat(ctx, mul(mul(world, m), PIXELS));
  ctx.drawImage(img, 0, 0, BACKDROP_FRAME.width, BACKDROP_FRAME.height);
  ctx.restore();
}

/** The velum: soft palate muscle under a wet mucosa, lit from the mouth. Its outline has
 *  the oral side first (base to tip), then the nasal side back (tip to base). */
function paintVelum(ctx: CanvasRenderingContext2D, v0: number[], world: Mat, s: number, flecks: CanvasPattern | string): void {
  const half = v0.length / 4; // points per side
  // (the body is drawn a little thicker toward the nose than the model's, which is the thin shell the air meets: it goes
  // into the tissue behind it with no edge of its own, as the graphics card's velum does, gl.ts)
  const GROW = 1.3;
  const v = v0.slice();
  for (let i = 0; i < half; i++) {
    const o = [v0[2 * i], v0[2 * i + 1]], k = 2 * (2 * half - 1 - i);
    v[k] = o[0] + (v0[k] - o[0]) * GROW;
    v[k + 1] = o[1] + (v0[k + 1] - o[1]) * GROW;
  }
  const oral = (i: number): [number, number] => [v[2 * i], v[2 * i + 1]];
  const nasal = (i: number): [number, number] => [v[2 * (2 * half - 1 - i)], v[2 * (2 * half - 1 - i) + 1]];
  const line = (f: (i: number) => [number, number], w = 0) => {
    ctx.beginPath();
    for (let i = 0; i < half; i++) {
      const a = f(i), b = nasal(i);
      const x = a[0] + w * (b[0] - a[0]), y = a[1] + w * (b[1] - a[1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  };
  ctx.save();
  setMat(ctx, world);
  // lighter on the side of the mouth, darker toward the nose, and gone into the tissue behind
  const m = half >> 1;
  const g = ctx.createLinearGradient(oral(m)[0], oral(m)[1], nasal(m)[0], nasal(m)[1]);
  g.addColorStop(0, '#e88f98');
  g.addColorStop(0.35, '#c45d6d');
  g.addColorStop(0.72, 'rgba(120,42,58,0.75)');
  g.addColorStop(1, 'rgba(100,30,45,0)');
  // the body, and the uvula's rounded end
  let turn = 0;
  for (let i = 0, n = v.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    turn += v[2 * i] * v[2 * j + 1] - v[2 * j] * v[2 * i + 1];
  }
  const body = () => {
    ctx.beginPath();
    smoothPoly(ctx, v);
    const t0 = oral(half - 1), t1 = nasal(half - 1);
    ctx.moveTo((t0[0] + t1[0]) / 2 + Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) / 2, (t0[1] + t1[1]) / 2);
    // the same way round as the outline, so the two make one shape
    ctx.arc((t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2, Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) / 2, 0, 2 * Math.PI, turn < 0);
  };
  ctx.fillStyle = g;
  body();
  ctx.fill('nonzero');
  ctx.fillStyle = flecks;
  ctx.globalAlpha = 0.8;
  ctx.fill('nonzero');
  ctx.globalAlpha = 1;
  // muscle fibres along it
  ctx.save();
  body();
  ctx.clip('nonzero');
  ctx.lineWidth = 0.02 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,212,220,0.2)';
  for (const w of [0.2, 0.36, 0.52]) {
    line(oral, w);
    ctx.stroke();
  }
  ctx.restore();
  // a wet light on the side of the mouth
  line(oral);
  ctx.lineWidth = 0.05 * s;
  ctx.strokeStyle = 'rgba(255,214,220,0.4)';
  ctx.stroke();
  ctx.restore();
}

/** A thin wet rim along the air's walls, on the tissue side only. */
export function paintRim(ctx: CanvasRenderingContext2D, sc: HeadScene, world: Mat): void {
  ctx.save();
  setMat(ctx, world);
  // not across the opening between the lips, where the grid's steps cut through the air,
  // nor along the air above the velum
  clipOut(ctx, sc.mouth.length ? [sc.lumen, sc.mouth, sc.port] : [sc.lumen, sc.port]);
  ctx.lineWidth = 0.07 * sc.s;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,205,212,0.32)';
  // where the two walls touch (closed lips, a stop) there is no air to have a rim
  const shut = (i: number) => Math.hypot(sc.upper[i] - sc.lower[i], sc.upper[i + 1] - sc.lower[i + 1]) < 0.03 * sc.s;
  // nor where the wall jumps from one part to another across open air (from the tongue's tip to the teeth)
  // (and where a grid line ends in open air, with no wall under or over it)
  const jump = (e: number[], i: number) => Math.hypot(e[i] - e[i - 2], e[i + 1] - e[i - 1]) > 0.4 * sc.s;
  for (const [e, open] of [[sc.lower, sc.bare.lower], [sc.upper, sc.bare.upper]] as const) {
    ctx.beginPath();
    for (let i = 0; i < e.length; i += 2) {
      if (i === 0 || (shut(i - 2) && shut(i)) || jump(e, i) || open[i / 2] || open[i / 2 - 1]) ctx.moveTo(e[i], e[i + 1]);
      else ctx.lineTo(e[i], e[i + 1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}
