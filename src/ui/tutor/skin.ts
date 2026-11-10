/**
 * The skin layer of the tutor's head: the same head as the painted anatomy,
 * seen from outside. The face at rest is a picture in the frame of the
 * anatomical painting (the same canonical centimetres, the same pixels), so
 * the painter moves it exactly as it moves the anatomy: the chin, the jaw
 * line and the lower lip turn with the jaw, and the two layers can be faded
 * into one another. The lips are not in the picture: they are drawn from the
 * model at every pose, like the lips of the anatomy.
 *
 * The picture is a rendering made here. A photograph of a face in profile,
 * placed on the painting's frame (1024 × 1536 pixels, see head/frame.ts),
 * replaces it when the file `assets/skin.jpg` (or .png, .webp) exists beside
 * this module.
 */
import type { TractGeometry } from '../../dsp/tract/geometry';
import { guideHead, HeadScene, Mat, mul, PIXELS } from '../head/scene';
import { BACKDROP_FRAME, framePixel } from '../head/frame';
import { Backdrop, paintBackdrop, paintTriangle } from '../head/painter';
import { smoothOutline } from '../head/outline';
import { restGeom } from './readout';

export interface SkinView { X: (x: number) => number; Y: (y: number) => number; k: number }

const TONE = { light: '#f1c8ad', base: '#dfa88b', shade: '#bd856a', deep: '#93614c', lip: '#b65f69', hair: '#1f1611', hairLight: '#523a29' };

/** a photograph of the face, if the project has one: found when the app is built, so nothing is asked of the network for it */
const PHOTO = Object.values(import.meta.glob('./assets/skin.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }))[0] as string | undefined;

let layer: Backdrop | null = null;
let photoTried = false;
let version = 0;

/** The face in profile, photographed once for every mouth shape (public/skin): loaded when first asked for. */
const PROFILE = ['rest', 'mid', 'open', 'round', 'spread', 'fv', 'th', 'l', 'e', 'o', 's', 'sh'];
const STAND_IN: Record<string, string> = { e: 'mid', o: 'round', s: 'spread', sh: 'round', t: 'l' };
const profiles = new Map<string, HTMLImageElement>();
let profilesAsked = false;
/** The photograph of a mouth shape (or of the shape that stands in for it), null until the closed mouth's has loaded. */
function profileShot(shape: string): HTMLImageElement | null {
  if (!profilesAsked && typeof Image !== 'undefined') {
    profilesAsked = true;
    for (const name of PROFILE) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { profiles.set(name, im); version++; };
      im.src = `skin/${name}.webp`;
    }
  }
  if (!profiles.has('rest')) return null;
  return profiles.get(shape) ?? profiles.get(STAND_IN[shape] ?? '') ?? profiles.get('rest')!;
}
/** Changes when the picture of the skin changes (the photograph has arrived): what was painted with the old one is stale. */
export const skinVersion = (): number => version;
/** the picture is a photograph: it has its own lips, none are drawn over it */
let fromPhoto = false;
/** the skin's colour just above and just below the mouth, taken from the picture: the lips' faces are filled with it */
let faceTone: [string, string] = [TONE.light, TONE.light];

/** No flecks of mucosa where the open jaw leaves a gap in the picture: the skin is plain there. */
function plain(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 4;
  return cv;
}

function sampleFace(src: CanvasImageSource): void {
  try {
    const cv = document.createElement('canvas');
    cv.width = BACKDROP_FRAME.width; cv.height = BACKDROP_FRAME.height;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(src, 0, 0, cv.width, cv.height);
    const at = (x: number, y: number) => {
      const [px, py] = framePixel(x, y);
      const d = c.getImageData(Math.round(px) - 3, Math.round(py) - 3, 7, 7).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
    };
    faceTone = [at(8.45, 10.15), at(8.25, 6.15)];
  } catch { /* a picture that cannot be read keeps the default tone */ }
}

/** The face at rest in the painting's frame: the photograph if there is one (once loaded), the rendering otherwise. */
function skinBackdrop(): Backdrop {
  const tone = { tissue: TONE.base, skin: TONE.base, mucosa: TONE.base, tongue: TONE.base };
  if (PHOTO && !photoTried && typeof Image !== 'undefined') {
    photoTried = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { layer = { img, tone, flecksTile: plain() }; fromPhoto = true; version++; sampleFace(img); };
    img.src = PHOTO;
  }
  if (layer) return layer;
  const cv = document.createElement('canvas');
  cv.width = BACKDROP_FRAME.width;
  cv.height = BACKDROP_FRAME.height;
  renderFace(cv.getContext('2d')!);
  layer = { img: cv as unknown as HTMLImageElement, tone, flecksTile: plain() };
  sampleFace(cv);
  return layer;
}

/** Paints the face at rest, in the pixels of the painting's frame. Done once. */
function renderFace(c: CanvasRenderingContext2D): void {
  const W = BACKDROP_FRAME.width, H = BACKDROP_FRAME.height;
  const k = W / (BACKDROP_FRAME.x1 - BACKDROP_FRAME.x0); // pixels per cm
  const P = framePixel;
  const canBlur = 'filter' in c;
  /** draws softened by `cm` centimetres */
  const blurred = (cm: number, draw: () => void) => { c.save(); if (canBlur) c.filter = `blur(${(cm * k).toFixed(1)}px)`; draw(); c.restore(); };
  const trace = (pts: number[], close = true, smooth = true) => {
    const q = smooth ? smoothOutline(pts, 6) : pts;
    c.beginPath();
    for (let i = 0; i < q.length; i += 2) { const [x, y] = P(q[i], q[i + 1]); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
    if (close) c.closePath();
  };
  const glow = (x: number, y: number, r: number, colour: string, ry = r, turn = 0) => {
    const [cx, cy] = P(x, y);
    c.save();
    c.translate(cx, cy);
    c.rotate(turn);
    c.scale(1, ry / r);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r * k);
    g.addColorStop(0, colour);
    g.addColorStop(1, colour.replace(/[\d.]+\)$/, '0)'));
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, r * k, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  const line = (pts: number[], colour: string, width: number, soften: number) => blurred(soften, () => {
    trace(pts, false);
    c.strokeStyle = colour;
    c.lineWidth = width * k;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();
  });

  // ---- the skin, lit from the front and above
  const [bx] = P(-5.5, 10), [fx] = P(9.8, 10);
  const base = c.createLinearGradient(bx, 0, fx, 0);
  base.addColorStop(0, TONE.shade); base.addColorStop(0.5, TONE.base); base.addColorStop(1, TONE.light);
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);
  glow(6.0, 12.4, 4.8, 'rgba(255,230,210,0.5)');               // the cheek
  glow(6.4, 18.2, 3.8, 'rgba(255,232,214,0.5)');               // the forehead
  glow(8.0, 5.5, 1.5, 'rgba(255,230,210,0.42)');               // the chin
  glow(6.3, 11.3, 2.2, 'rgba(214,110,96,0.16)');               // the blood under the cheek
  glow(10.0, 12.2, 0.9, 'rgba(214,110,96,0.2)');               // and in the tip of the nose
  // the neck and the side of the head lie further from the light
  blurred(0.9, () => {
    trace([7.8, 3.9, 5.3, 3.75, 3.4, 4.5, 2.0, 6.1, 1.15, 8.6, -1.2, 9.8, -8, 9.6, -8, -8, 4.5, -8, 3.1, 0.8, 3.9, 2.8]);
    c.fillStyle = 'rgba(112,62,46,0.36)';
    c.fill();
  });
  line([7.75, 4.2, 5.3, 4.05, 3.4, 4.85, 2.0, 6.45, 1.25, 8.6, 1.0, 10.7], 'rgba(100,54,40,0.34)', 0.5, 0.42);   // the line of the jaw
  line([-0.3, 10.9, 0.5, 6.5, 1.7, 2.0, 2.3, -3.6], 'rgba(255,228,208,0.22)', 1.3, 0.7);                        // the muscle down the side of the neck
  glow(2.3, 0.3, 0.85, 'rgba(255,228,208,0.34)', 1.25);                                                           // the larynx under the skin
  glow(7.2, 15.55, 1.4, 'rgba(104,58,44,0.42)', 1.05);                                                            // the eye's hollow
  glow(9.0, 10.85, 0.6, 'rgba(104,58,44,0.42)', 0.42);                                                            // under the nose
  glow(8.3, 6.55, 0.8, 'rgba(104,58,44,0.3)', 0.42);                                                              // the fold above the chin
  line([8.72, 11.72, 8.2, 10.6, 7.62, 9.4, 7.38, 8.45], 'rgba(100,54,40,0.3)', 0.22, 0.26);                       // the fold from the nose to the mouth's corner
  line([9.3, 14.3, 10.05, 12.9, 10.5, 12.25], 'rgba(255,240,228,0.42)', 0.32, 0.28);                              // the light along the ridge of the nose

  // ---- the hair: its mass, its edge softened where it grows out of the skin, then the strands
  const hair = [7.75, 19.6, 6.5, 18.7, 4.7, 18.0, 3.1, 17.3, 2.3, 15.9, 1.95, 14.3, 1.6, 13.1, 1.05, 13.7, 0.95, 15.3, -0.6, 15.7, -1.45, 14.2, -1.75, 12.0, -2.7, 10.2, -4.5, 8.6, -9, 8, -9, 25, 9.8, 25];
  const [, hy0] = P(0, 22), [, hy1] = P(0, 9);
  const hg = c.createLinearGradient(0, hy0, 0, hy1);
  hg.addColorStop(0, TONE.hairLight); hg.addColorStop(0.45, TONE.hair); hg.addColorStop(1, '#120c09');
  blurred(0.16, () => { trace(hair); c.fillStyle = hg; c.fill(); });
  c.save();
  trace(hair);
  c.clip();
  c.lineCap = 'round';
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 420; i++) {
    const u = rnd();
    const x0 = 8.2 - u * 14.5, y0 = 20.3 + Math.sin(u * 3.1) * 1.4 - rnd() * 6;
    c.strokeStyle = rnd() < 0.55 ? `rgba(120,88,62,${(0.1 + rnd() * 0.22).toFixed(2)})` : `rgba(0,0,0,${(0.15 + rnd() * 0.25).toFixed(2)})`;
    c.lineWidth = 0.6 + rnd() * 1.1;
    trace([x0, y0, x0 - 1.0 - u, y0 - 1.5, x0 - 1.7 - 1.6 * u, y0 - 3.2, x0 - 2.0 - 2.0 * u, y0 - 5.0], false);
    c.stroke();
  }
  // the sheen where the light falls on the crown
  glow(2.0, 19.3, 4.2, 'rgba(170,130,96,0.22)', 1.6, -0.12);
  c.restore();

  // ---- the ear
  const ear = [0.95, 15.25, -0.3, 15.0, -0.78, 13.7, -0.45, 12.5, 0.2, 11.55, 0.72, 11.85, 0.95, 12.6, 1.25, 13.25, 1.35, 14.5];
  blurred(0.22, () => { c.translate(-0.12 * k, 0.1 * k); trace(ear); c.fillStyle = 'rgba(86,46,34,0.5)'; c.fill(); });   // its shadow on the head
  trace(ear);
  const [ex0] = P(-0.8, 13.4), [ex1] = P(1.4, 13.4);
  const eg = c.createLinearGradient(ex0, 0, ex1, 0);
  eg.addColorStop(0, '#c58a72'); eg.addColorStop(0.55, '#e3a68c'); eg.addColorStop(1, '#cf917a');
  c.fillStyle = eg;
  c.fill();
  c.save();
  trace(ear);
  c.clip();
  glow(0.3, 13.6, 1.3, 'rgba(210,104,92,0.3)', 2.0);                                                              // the blood in the ear
  line([1.05, 14.85, 0.05, 14.7, -0.4, 13.7, -0.18, 12.75, 0.22, 12.15], 'rgba(92,48,36,0.5)', 0.16, 0.09);       // inside the rim
  line([1.12, 15.05, -0.12, 14.9, -0.6, 13.7, -0.34, 12.6, 0.2, 11.8], 'rgba(255,232,214,0.5)', 0.1, 0.07);       // the light on the rim
  line([0.95, 14.2, 0.38, 14.0, 0.12, 13.3, 0.4, 12.6], 'rgba(255,230,212,0.4)', 0.16, 0.1);                      // the inner fold
  glow(0.62, 13.2, 0.44, 'rgba(62,28,22,0.82)', 0.66);                                                            // the hollow of the ear
  c.restore();
  trace(ear);
  c.strokeStyle = 'rgba(92,48,36,0.45)';
  c.lineWidth = 0.04 * k;
  c.stroke();

  // ---- the eye and the brow
  {
    const O = P(6.32, 15.38), F = P(7.44, 15.44), up = P(6.98, 16.02), dn = P(7.02, 15.0);
    const eye = () => { c.beginPath(); c.moveTo(O[0], O[1]); c.quadraticCurveTo(up[0], up[1], F[0], F[1]); c.quadraticCurveTo(dn[0], dn[1], O[0], O[1]); c.closePath(); };
    eye();
    const wg = c.createLinearGradient(O[0], 0, F[0], 0);
    wg.addColorStop(0, '#bfb3a9'); wg.addColorStop(1, '#f3eee8');
    c.fillStyle = wg;
    c.fill();
    c.save();
    eye();
    c.clip();
    const I = P(7.2, 15.47);
    c.fillStyle = '#3d2616';
    c.beginPath(); c.ellipse(I[0], I[1], 0.21 * k, 0.4 * k, 0, 0, Math.PI * 2); c.fill();
    const ig = c.createRadialGradient(I[0] + 0.03 * k, I[1] + 0.08 * k, 0, I[0], I[1], 0.36 * k);
    ig.addColorStop(0, '#9a6a3c'); ig.addColorStop(1, '#4a2e1a');
    c.fillStyle = ig;
    c.beginPath(); c.ellipse(I[0] + 0.02 * k, I[1], 0.15 * k, 0.33 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0b0806';
    c.beginPath(); c.ellipse(I[0] + 0.05 * k, I[1], 0.07 * k, 0.17 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.beginPath(); c.arc(I[0] + 0.1 * k, I[1] - 0.14 * k, 0.045 * k, 0, Math.PI * 2); c.fill();
    // the lid's shade on the eye
    const sh = c.createLinearGradient(0, up[1], 0, I[1]);
    sh.addColorStop(0, 'rgba(50,24,18,0.7)'); sh.addColorStop(1, 'rgba(50,24,18,0)');
    c.fillStyle = sh;
    c.fillRect(O[0], up[1], F[0] - O[0], I[1] - up[1]);
    c.restore();
    // the upper lid and its lashes, the fold above it, the lower lid
    c.strokeStyle = '#24140e';
    c.lineWidth = 0.085 * k;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(O[0], O[1]); c.quadraticCurveTo(up[0], up[1], F[0], F[1]); c.stroke();
    c.lineWidth = 0.032 * k;
    for (let i = 0; i < 7; i++) {
      const u = 0.45 + i * 0.085;
      const lx = (1 - u) * (1 - u) * O[0] + 2 * (1 - u) * u * up[0] + u * u * F[0];
      const ly = (1 - u) * (1 - u) * O[1] + 2 * (1 - u) * u * up[1] + u * u * F[1];
      c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + 0.1 * k, ly - 0.05 * k, lx + (0.14 + 0.04 * i) * k, ly - (0.2 - 0.02 * i) * k); c.stroke();
    }
    line([6.25, 15.62, 6.6, 16.1, 6.98, 16.26, 7.36, 16.0, 7.55, 15.68], 'rgba(92,48,36,0.5)', 0.05, 0.04);
    c.strokeStyle = 'rgba(92,48,36,0.38)';
    c.lineWidth = 0.035 * k;
    c.beginPath(); c.moveTo(O[0], O[1]); c.quadraticCurveTo(dn[0], dn[1], F[0], F[1]); c.stroke();
    // the brow: short hairs along an arch
    c.lineWidth = 0.035 * k;
    const b0 = P(8.1, 16.5), b1 = P(7.1, 17.2), b2 = P(5.9, 16.72);
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const x = (1 - u) * (1 - u) * b0[0] + 2 * (1 - u) * u * b1[0] + u * u * b2[0];
      const y = (1 - u) * (1 - u) * b0[1] + 2 * (1 - u) * u * b1[1] + u * u * b2[1];
      const len = (0.36 - 0.2 * u) * k;
      for (const o of [-0.6, 0, 0.6]) {
        c.strokeStyle = `rgba(34,22,15,${(0.5 + rnd() * 0.4).toFixed(2)})`;
        c.beginPath(); c.moveTo(x, y + o * 0.1 * k); c.lineTo(x - len, y - len * (0.6 - 0.6 * u) + o * 0.1 * k); c.stroke();
      }
    }
  }

  // ---- the wing of the nose and the nostril
  line([8.92, 12.1, 8.5, 11.62, 8.6, 11.15, 9.04, 10.98], 'rgba(100,54,40,0.5)', 0.1, 0.09);
  glow(9.52, 11.14, 0.36, 'rgba(40,16,12,0.92)', 0.14, 0.12);

  // ---- the edge of the head turns away from the light
  blurred(0.55, () => {
    const o = guideHead().outline;
    c.beginPath();
    let pen = false;
    for (let j = 0; j < o.length; j += 2) {
      // not across the mouth, where the outline only joins the upper lip to the chin: the lips are drawn from the model
      const lips = o[j] > 7 && o[j + 1] > 6.2 && o[j + 1] < 10.4;
      const [x, y] = P(o[j], o[j + 1]);
      if (lips) { pen = false; continue; }
      if (pen) c.lineTo(x, y); else c.moveTo(x, y);
      pen = true;
    }
    c.strokeStyle = 'rgba(84,44,32,0.5)';
    c.lineWidth = 1.2 * k;
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    c.stroke();
  });
  // the grain of the skin
  const N = 96;
  const tile = document.createElement('canvas');
  tile.width = tile.height = N;
  const tc = tile.getContext('2d')!;
  const d = tc.createImageData(N, N);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = rnd();
    const dark = v < 0.5;
    d.data[i] = dark ? 70 : 255; d.data[i + 1] = dark ? 30 : 235; d.data[i + 2] = dark ? 20 : 220;
    d.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 20);
  }
  tc.putImageData(d, 0, 0);
  c.fillStyle = c.createPattern(tile, 'repeat')!;
  c.fillRect(0, 0, W, H);
}

const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** the photograph's mouth: where its lips meet (canonical height), its corner, and how far its lips are apart as taken */
const PHOTO_LIP = 8.45, PHOTO_CORNER = 6.75, PHOTO_GAP = 1.0;
const JAW_PIVOT: [number, number] = [-0.6, 11.0];
/** the part of the photograph that moves with the mouth (canonical): columns and rows of a net laid over it;
 *  two rows lie on the two lips' edges, so that between them the net holds only the opening */
const NET_X = [2, 3, 4, 5, 6, 6.75, 7.5, 8.25, 9, 9.75, 10.5, 12.5];
const NET_Y = [0, 1, 2, 3, 4, 5, 6, 6.8, PHOTO_LIP - PHOTO_GAP, PHOTO_LIP, 9.2, 10];

/**
 * The photographed face, moved as a face moves. It is one skin, not rigid
 * pieces: the lower lip follows the model's lips, the chin its jaw, the
 * cheek stretches between them and the still head, and the corner of the
 * mouth is a hinge, so the opening runs to a point there. A net of
 * triangles over the lower face carries the photograph; each knot of it
 * turns about the jaw's joint by its own share.
 */
function paintPhoto(lc: CanvasRenderingContext2D, img: HTMLImageElement, sc: HeadScene, geom: TractGeometry, world: Mat): void {
  const s = sc.s;
  const still = mul(mul(world, [s, 0, 0, s, 0, 0]), PIXELS);
  const x0 = NET_X[0], x1 = NET_X[NET_X.length - 1], y0 = NET_Y[0], y1 = NET_Y[NET_Y.length - 1];
  // the head outside the net, as it is
  lc.save();
  lc.setTransform(world[0], world[1], world[2], world[3], world[4], world[5]);
  lc.beginPath();
  lc.rect(-200, -200, 400, 400);
  lc.rect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
  lc.clip('evenodd');
  lc.setTransform(still[0], still[1], still[2], still[3], still[4], still[5]);
  lc.drawImage(img, 0, 0, BACKDROP_FRAME.width, BACKDROP_FRAME.height);
  lc.restore();
  // how far the model's lips are apart, and how far its jaw has turned from where the photograph has it
  const ul = geom.solids.find((q) => q.id === 'upperLip')?.pts, ll = geom.solids.find((q) => q.id === 'lowerLip')?.pts;
  const gap = ul && ll && ul.length >= 8 && ll.length >= 8 ? Math.max(0, (ul[7] - ll[7]) / s) : PHOTO_GAP;
  const aLip = (gap - PHOTO_GAP) / 9.2;                       // opening, as an angle at the joint (radians)
  const aJaw = -(geom.jawAngle - guideHead().jawAngle);
  const knot = (x: number, y: number, lower: boolean): [number, number] => {
    const wx = smooth((x - 2.0) / 3.5);
    const t = smooth((x - PHOTO_CORNER) / 1.5);
    const yb = PHOTO_LIP + Math.max(0, PHOTO_CORNER - x) * 0.15;
    // (in front of the corner the two lips' edges are two rows of the net: the upper one never moves)
    const below = x >= PHOTO_CORNER ? lower : y < yb;
    if (!below) return [x * s, y * s];
    const depth = smooth((yb - (x >= PHOTO_CORNER ? Math.min(y, PHOTO_LIP - PHOTO_GAP) + PHOTO_GAP : y)) / (1.8 + Math.max(0, PHOTO_CORNER - x) * 0.6));
    // at the lips the model's lips decide, deep in the chin its jaw
    const turn = -wx * ((1 - depth) * t * aLip + depth * aJaw + (1 - depth) * (1 - t) * 0);
    const c = Math.cos(turn), sn = Math.sin(turn), dx = x - JAW_PIVOT[0], dy = y - JAW_PIVOT[1];
    return [(JAW_PIVOT[0] + c * dx - sn * dy) * s, (JAW_PIVOT[1] + sn * dx + c * dy) * s];
  };
  const lipRow = NET_Y.indexOf(PHOTO_LIP);
  for (let j = 0; j + 1 < NET_Y.length; j++) {
    for (let i = 0; i + 1 < NET_X.length; i++) {
      const xa = NET_X[i], xb = NET_X[i + 1], ya = NET_Y[j], yb = NET_Y[j + 1];
      // the upper edge of the row under the lips' line belongs to the upper lip, everything under it to the lower
      const lowA = j < lipRow - 1 || j === lipRow - 1, lowB = j + 1 < lipRow;
      const q00 = knot(xa, ya, lowA && j + 0 < lipRow), q10 = knot(xb, ya, lowA && j + 0 < lipRow), q01 = knot(xa, yb, lowB), q11 = knot(xb, yb, lowB);
      paintTriangle(lc, world, [xa, ya, xb, ya, xb, yb], [...q00, ...q10, ...q11], img);
      paintTriangle(lc, world, [xa, ya, xb, yb, xa, yb], [...q00, ...q11, ...q01], img);
    }
  }
}

/**
 * Paints the head with its skin on a layer of its own, cut to the head's
 * outline, with the opening between the lips left empty so that what is
 * under the layer shows through it. `world` maps world centimetres to the
 * layer's device pixels; `mask` is a spare canvas of the same size.
 */
export function paintSkin(lc: CanvasRenderingContext2D, mask: HTMLCanvasElement, sc: HeadScene, geom: TractGeometry, v: SkinView, w: number, h: number, dpr: number, world: Mat, shape = 'rest'): void {
  const { X, Y, k } = v;
  const s = sc.s;
  const cw = lc.canvas.width, ch = lc.canvas.height;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, cw, ch);
  // the face photographed in this very mouth shape: shown as it is, nothing stretched, nothing cut
  const shot = profileShot(shape);
  if (shot) {
    const m = mul(mul(world, [s, 0, 0, s, 0, 0]), PIXELS);
    lc.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    lc.drawImage(shot, 0, 0, BACKDROP_FRAME.width, BACKDROP_FRAME.height);
    lc.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  const bd = skinBackdrop();
  lc.setTransform(dpr, 0, 0, dpr, 0, 0);
  const poly = (c: CanvasRenderingContext2D, pts: number[], smooth = false) => {
    const q = smooth ? smoothOutline(pts, 5) : pts;
    c.beginPath();
    for (let i = 0; i < q.length; i += 2) { if (i === 0) c.moveTo(X(q[i]), Y(q[i + 1])); else c.lineTo(X(q[i]), Y(q[i + 1])); }
    c.closePath();
  };

  if (fromPhoto) paintPhoto(lc, bd.img, sc, geom, world);
  else {
  // ---- the skin. Under everything, the lips' faces in the colour of the skin around them: they show
  // only where a lip reaches past the picture's own profile. Then the picture as it is at rest, which
  // fills with cheek the gap a wide jaw opens between its two parts; then the picture moved like the anatomy.
  // (and under a photograph, the whole head in that colour: where the photograph's own edge falls short of the model's, skin shows, not what is under it)
  if (!fromPhoto) [sc.upperFace, sc.lowerFace].forEach((f, i) => { if (f.length >= 6) { poly(lc, f); lc.fillStyle = faceTone[i]; lc.fill(); } });
  const still = sc.bands.find((b) => b.id === 'cranium');
  if (still) {
    lc.save();
    // (a photograph is cut out already: its own edge is the face's, the model's outline would cut the nose and the lips)
    if (!fromPhoto) { poly(lc, sc.outline); lc.clip(); }
    // (and only behind the corner of the mouth: in front of it the still picture would show a second pair of lips)
    else { lc.beginPath(); lc.rect(X(-40), Y(60), X(6.4 * s) - X(-40), Y(-40) - Y(60)); lc.clip(); }
    const m = mul(mul(world, still.mat), PIXELS);
    lc.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    lc.drawImage(bd.img, 0, 0, BACKDROP_FRAME.width, BACKDROP_FRAME.height);
    lc.restore();
  }
  // (for a photograph the bands are not cut to the model's outline either: each keeps only its own half)
  const whole = [-100, -100, 100, -100, 100, 100, -100, 100];
  // The photograph's lower lip reaches a little above the line where the jaw's part of the picture starts: that
  // strip is given to the jaw (and taken from the still head), or it would stay behind when the mouth opens
  const LIP_STRIP = [6.75, 7.3, 12.5, 7.3, 12.5, 7.95, 6.75, 7.95];
  const JAW_AND_LIP = [6.2, 0.4, 12.5, 0.4, 12.5, 7.95, 6.75, 7.95, 6.75, 7.3, 6.2, 7.3];
  const photoBands = () => sc.bands.map((b) => {
    const clip = b.clip.slice(1);
    if (b.id === 'jawHigh' || b.id === 'jawLow') return { ...b, clip: [JAW_AND_LIP, ...clip.slice(1)] };
    return { ...b, clip, exclude: [...b.exclude, LIP_STRIP] };
  });
  paintBackdrop(lc, fromPhoto ? { ...sc, hole: [], outline: whole, bands: photoBands() } : { ...sc, hole: [] }, world, bd, false);
  lc.setTransform(dpr, 0, 0, dpr, 0, 0);

  }
  lc.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ---- the mouth as it is seen from the side: the line where the lips meet runs back to the corner
  // of the mouth; when they part, the opening is a wedge from their fronts to that corner
  const ul = geom.solids.find((q) => q.id === 'upperLip')?.pts, ll = geom.solids.find((q) => q.id === 'lowerLip')?.pts;
  /** the opening of the mouth; `out`: how far it runs on in front of the lips (cm), to open the profile too; below zero: only behind where the lips meet */
  let wedge: ((c: CanvasRenderingContext2D, out?: number) => void) | null = null;
  let teeth: (() => void) | null = null;
  if (ul && ll && ul.length >= 20 && ll.length >= 20) {
    const P = (i: number): [number, number] => [ul[2 * i], ul[2 * i + 1]];
    const Q = (i: number): [number, number] => [ll[2 * i], ll[2 * i + 1]];
    const lf = geom.landmarks.lipFront;
    const open = sc.mouth.length >= 6;
    // where the lips meet at the front, and the corner of the mouth behind it
    const su = P(3), sl = open ? Q(3) : P(3);
    // (the lower lip goes back with an open jaw, and the corner with it)
    const corner: [number, number] = [Math.min(su[0] - 1.34 * s, sl[0] - 0.9 * s), 0.5 * (su[1] + sl[1]) - 0.1 * s];
    /** the front of a lip, from the fullest point of its face round to where it meets the other */
    const front = (face: number[], from: [number, number], lo: number, hi: number, upper: boolean): number[] => {
      let end = 0, e = Infinity;
      for (let i = 0; i < face.length; i += 2) { const d = Math.hypot(face[i] - from[0], face[i + 1] - from[1]); if (d < e) { e = d; end = i; } }
      let top = -1;
      for (let i = 0; i < face.length; i += 2) if (face[i + 1] >= lo && face[i + 1] <= hi && (top < 0 || face[i] > face[top])) top = i;
      if (top < 0) return [];
      const out: number[] = [];
      // the upper face runs from the nose down to the lip's edge, the lower one from the lip's edge down to the chin
      if (upper) for (let i = top; i <= end; i += 2) out.push(face[i], face[i + 1]);
      else for (let i = end; i <= top; i += 2) out.push(face[i], face[i + 1]);
      return out;
    };
    const uf = front(sc.upperFace, P(4), P(4)[1], P(6)[1] + 0.12 * s, true);     // fullest point … P(4)
    const lw = front(sc.lowerFace, Q(4), Q(6)[1] - 0.12 * s, Q(4)[1], false);    // Q(4) … fullest point
    const red = (pts: number[], meet: [number, number], bend: number, light: string, dark: string) => {
      if (pts.length < 4) return;
      const x0 = pts[0], y0 = pts[1];
      lc.beginPath();
      lc.moveTo(X(x0), Y(y0));
      for (let i = 2; i < pts.length; i += 2) lc.lineTo(X(pts[i]), Y(pts[i + 1]));
      // under the lip to where it meets the other, along the line of the mouth to the corner,
      // then back along the edge of the red
      lc.lineTo(X(meet[0]), Y(meet[1]));
      lc.quadraticCurveTo(X(0.5 * (meet[0] + corner[0])), Y(0.5 * (meet[1] + corner[1]) + 0.04 * s), X(corner[0]), Y(corner[1]));
      lc.quadraticCurveTo(X(0.5 * (x0 + corner[0]) - 0.1 * s), Y(0.5 * (y0 + corner[1]) + bend), X(x0), Y(y0));
      lc.closePath();
      // full and lit toward the front, thin and in the shade toward the corner
      const g = lc.createLinearGradient(X(corner[0]), 0, X(lf[0] + 0.25 * s), 0);
      g.addColorStop(0, dark.replace('1)', '0.2)')); g.addColorStop(0.45, dark); g.addColorStop(1, light);
      lc.fillStyle = g;
      lc.fill();
    };
    // the upper lip, in its own shade; the lower one, which catches the light (a photograph has its own)
    if (!fromPhoto) red(uf, su, 0.12 * s, 'rgba(186,98,104,1)', 'rgba(150,72,80,1)');
    const lwUp: number[] = [];
    for (let i = lw.length - 2; i >= 0; i -= 2) lwUp.push(lw[i], lw[i + 1]);
    if (!fromPhoto) red(lwUp, sl, -0.12 * s, 'rgba(206,120,124,1)', 'rgba(164,84,92,1)');
    if (!fromPhoto && lw.length >= 4) {
      const fx = lw[lw.length - 2] - 0.22 * s, fy = 0.5 * (lw[1] + lw[lw.length - 1]);
      const g = lc.createRadialGradient(X(fx), Y(fy), 0, X(fx), Y(fy), 0.32 * k);
      g.addColorStop(0, 'rgba(255,226,224,0.42)'); g.addColorStop(1, 'rgba(255,226,224,0)');
      lc.fillStyle = g;
      lc.beginPath(); lc.arc(X(fx), Y(fy), 0.32 * k, 0, Math.PI * 2); lc.fill();
    }
    // the line of the mouth: closed lips meet on it; parted, each keeps its own edge to the corner
    lc.lineCap = 'round';
    lc.strokeStyle = 'rgba(70,24,28,0.6)';
    lc.lineWidth = Math.max(1, 0.045 * k);
    for (const from of fromPhoto ? [] : open ? [su, sl] : [su]) {
      lc.beginPath();
      lc.moveTo(X(from[0]), Y(from[1]));
      lc.quadraticCurveTo(X(0.5 * (from[0] + corner[0])), Y(0.5 * (from[1] + corner[1]) + 0.04 * s), X(corner[0]), Y(corner[1]));
      lc.stroke();
    }
    // a soft shade at the corner, and under the lower lip
    for (const [x, y, r, al] of [[corner[0] - 0.05 * s, corner[1], 0.38, 0.3], [Q(6)[0] - 0.25 * s, Q(7)[1] + 0.15 * s, 0.55, 0.18]] as [number, number, number, number][]) {
      const g = lc.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * k);
      g.addColorStop(0, `rgba(96,48,40,${al})`); g.addColorStop(1, 'rgba(96,48,40,0)');
      lc.fillStyle = g;
      lc.beginPath(); lc.arc(X(x), Y(y), r * k, 0, Math.PI * 2); lc.fill();
    }
    if (open) {
      const p4 = P(4), q4 = Q(4);
      wedge = (c, out = 4) => {
        c.beginPath();
        if (out < 0) c.moveTo(X(su[0]), Y(su[1]));
        else { c.moveTo(X(p4[0] + out * s), Y(p4[1])); c.lineTo(X(p4[0]), Y(p4[1])); c.lineTo(X(su[0]), Y(su[1])); }
        c.quadraticCurveTo(X(0.5 * (su[0] + corner[0])), Y(0.5 * (su[1] + corner[1]) + 0.04 * s), X(corner[0]), Y(corner[1]));
        c.quadraticCurveTo(X(0.5 * (sl[0] + corner[0])), Y(0.5 * (sl[1] + corner[1]) + 0.04 * s), X(sl[0]), Y(sl[1]));
        if (out >= 0) { c.lineTo(X(q4[0]), Y(q4[1])); c.lineTo(X(q4[0] + out * s), Y(q4[1])); }
        c.closePath();
      };
      // the teeth seen in the open mouth: the row of the top ones, and the bottom ones, which turn with the jaw
      const piv = geom.landmarks.jawPivot, ue = geom.landmarks.upperEdge, le = geom.landmarks.lowerEdge;
      const r0 = restGeom().landmarks.lowerEdge;
      const dJaw = Math.atan2(le[1] - piv[1], le[0] - piv[0]) - Math.atan2(r0[1] - piv[1], r0[0] - piv[0]);
      const cs = Math.cos(dJaw), sn = Math.sin(dJaw);
      const back = (x: number, y: number): [number, number] => [piv[0] + cs * (x - piv[0]) - sn * (y - piv[1]), piv[1] + sn * (x - piv[0]) + cs * (y - piv[1])];
      teeth = () => {
        const rows: [[number, number], [number, number], number][] = [[[ue[0], ue[1]], [ue[0] - 3.4 * s, ue[1] + 0.32 * s], 1], [[le[0], le[1]], back(r0[0] - 3.4 * s, r0[1] + 0.5 * s), -1]];
        for (const [from, to, up] of rows) {
          const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1;
          const nx = (-dy / L) * up, ny = (dx / L) * up; // toward the gum
          const n = 5;
          for (let i = 0; i < n; i++) {
            // each tooth a little shorter and darker than the one in front of it
            const a0 = i / n + 0.012, a1 = (i + 1) / n - 0.012, hgt = (0.62 - 0.05 * i) * s;
            const q = [from[0] + dx * a0, from[1] + dy * a0, from[0] + dx * a1, from[1] + dy * a1];
            lc.beginPath();
            lc.moveTo(X(q[0] - nx * hgt), Y(q[1] - ny * hgt));
            lc.lineTo(X(q[0] - nx * 0.08 * s), Y(q[1] - ny * 0.08 * s));
            lc.quadraticCurveTo(X(0.5 * (q[0] + q[2]) + nx * 0.04 * s), Y(0.5 * (q[1] + q[3]) + ny * 0.04 * s), X(q[2] - nx * 0.08 * s), Y(q[3] - ny * 0.08 * s));
            lc.lineTo(X(q[2] - nx * hgt), Y(q[3] - ny * hgt));
            lc.closePath();
            const sh = 236 - 26 * i;
            lc.fillStyle = `rgb(${sh},${sh - 8},${sh - 26})`;
            lc.fill();
          }
        }
      };
    }
  }

  // ---- cut to the head: its outline and the two lips with their faces, less the opening of the mouth
  if (mask.width !== cw || mask.height !== ch) { mask.width = cw; mask.height = ch; }
  const mc = mask.getContext('2d')!;
  mc.setTransform(dpr, 0, 0, dpr, 0, 0);
  mc.clearRect(0, 0, w, h);
  mc.fillStyle = '#fff';
  if (fromPhoto) mc.fillRect(0, 0, w, h);
  else for (const pts of [sc.outline, sc.upperFace, sc.lowerFace]) { if (pts.length >= 6) { poly(mc, pts); mc.fill(); } }
  if (wedge && !fromPhoto) { mc.globalCompositeOperation = 'destination-out'; wedge(mc); mc.fill(); mc.globalCompositeOperation = 'source-over'; }
  lc.save();
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'destination-in';
  lc.drawImage(mask, 0, 0);
  lc.restore();
  // inside the opening: the dark of the mouth and the teeth in it, then the lips' shade over them
  if (fromPhoto && ul && ll) {
    // under the photograph (it shows only between the parted lips): the dark of the mouth, soft at its edge
    const lf = geom.landmarks.lipFront, le = geom.landmarks.lowerEdge, ue = geom.landmarks.upperEdge;
    const cx = X(lf[0] - 1.5 * s), cy = Y(0.5 * (ue[1] + le[1]));
    lc.save();
    lc.globalCompositeOperation = 'destination-over';
    const g = lc.createRadialGradient(cx, cy, 0, cx, cy, 2.6 * k);
    g.addColorStop(0, 'rgba(14,7,8,1)'); g.addColorStop(0.7, 'rgba(14,7,8,1)'); g.addColorStop(1, 'rgba(14,7,8,0)');
    lc.fillStyle = g;
    lc.beginPath(); lc.ellipse(cx, cy, 2.6 * k, 2.2 * k, 0, 0, Math.PI * 2); lc.fill();
    lc.restore();
  } else if (wedge && teeth) {
    lc.save();
    wedge(lc, -1);
    lc.clip();
    lc.fillStyle = '#120a0b';
    lc.fill();
    teeth();
    const [x0, , x1] = [X(geom.landmarks.lipFront[0] - 2.4 * s), 0, X(geom.landmarks.lipFront[0])];
    const g = lc.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(10,5,6,0.85)'); g.addColorStop(1, 'rgba(10,5,6,0.05)');
    lc.fillStyle = g;
    wedge(lc, -1);
    lc.fill();
    lc.restore();
  }
}
