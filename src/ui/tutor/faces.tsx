/**
 * The tutor's two pictures of a sound. From the side: the painted anatomy of
 * the head (the same illustration the lab uses), posed by the model, with
 * what a learner needs drawn over it: where the part that works was at rest
 * and an arrow to where it goes, the place where the mouth is closed, the
 * air as a stream that waits behind a closure and leaves by the mouth or the
 * nose, and the voice in the larynx. From the front: the mouth as in a
 * mirror, lips, teeth and tongue. Both are drawn from the geometry of the
 * model at the pose they are given, so what they show is what the model does.
 */
import { useRef, useSyncExternalStore } from 'react';
import { useAnimatedCanvas } from '../canvas';
import { computeGeometry, canonToWorld, velumTip, TractGeometry } from '../../dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_TEETH } from '../../dsp/tract/types';
import { NASAL_CENTRE, chinWeight } from '../head/outline';
import { headScene, mul, Mat, HeadScene } from '../head/scene';
import { Backdrop, getBackdrop, paintPlate, cutAirOut, paintVelumOver, paintRim, paintGlow, fadeNeck } from '../head/painter';
import { AnatomyGL, CavityLook } from '../head/gl';
import type { Pose, Stage } from './motion';
import { CLOSED_AREA, Flow, flowOf, lipsOf, LipState, readout, Readout, REST_ART, restGeom } from './readout';
import type { Handle } from './guide';
import { paintSkin, skinCanvas, SkinFades, skinVersion } from './skin';
import { mouthFeatures } from './visemes';

/** What a picture shows: a pose, the part of the mouth to point at, and what it is doing. */
export interface Face {
  pose: Pose; focus: Handle | null; part: Stage['part'] | null;
  /** the sound being made at this instant (null between sounds, and at rest) */
  ipa?: string | null;
  /** which way the air goes: in (the breath before a sound), out (the sound), or idle: a picture left standing, which breathes out through its shape and in again */
  air?: 'in' | 'out' | 'idle';
}

const AN = DEFAULT_ANATOMY;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

let memo: { pose: Pose; geom: TractGeometry; flow: Flow; words: Readout } | null = null;
/** The geometry, the air and the words of a pose (kept for the pose last asked: the pictures and the readout share it). */
export function shapeOf(pose: Pose): { geom: TractGeometry; flow: Flow; words: Readout } {
  if (memo?.pose !== pose) {
    const geom = computeGeometry(pose.art, AN, DEFAULT_TEETH);
    const flow = flowOf(pose, geom);
    memo = { pose, geom, flow, words: readout(pose, geom, flow) };
  }
  return memo;
}

// ------------------------------------------------------------------ the layers

/**
 * What the side view shows, layer by layer: the skin over the anatomy (0 =
 * the anatomy alone, 1 = the face as seen from outside, anything between:
 * the face fading into what is under it), the names of the organs, the air,
 * the guides of the movement, and how close the view is.
 */
export interface Layers { skin: number; labels: boolean; air: boolean; guides: boolean; zoom: 'mouth' | 'head' }
const LAYERS_KEY = 'voice-workshop.tutor.layers';
let layers: Layers = { skin: 0, labels: false, air: true, guides: true, zoom: 'mouth' };
try {
  const r = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') as Partial<Layers> | null;
  if (r) layers = { ...layers, ...r, skin: Math.max(0, Math.min(1, Number(r.skin) || 0)), zoom: r.zoom === 'head' ? 'head' : 'mouth' };
} catch { /* nothing remembered */ }
const layerListeners = new Set<() => void>();
export function setLayers(patch: Partial<Layers>): void {
  layers = { ...layers, ...patch };
  try { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)); } catch { /* private mode */ }
  for (const l of layerListeners) l();
}
export function useLayers(): Layers {
  return useSyncExternalStore((fn) => { layerListeners.add(fn); return () => layerListeners.delete(fn); }, () => layers);
}
/** the frames of the two zooms (world cm): x0, x1, y0, y1 */
const FRAMES: Record<Layers['zoom'], [number, number, number, number]> = { mouth: [-2.9, 11.7, -1.2, 13.3], head: [-11.4, 13.0, -3.6, 27.6] };

// ------------------------------------------------------------ the drawing kit

const C = {
  air: '#9fe3ff', voice: '#ffb224', move: '#5ee6c8',
  ink: 'rgba(10,12,18,0.72)', line: 'rgba(255,255,255,0.14)', text: '#f5f7fb',
};
const HUD = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif';
const HANDLE_NAME: Record<Handle, string> = { lips: 'LIPS', tip: 'TONGUE TIP', tongue: 'TONGUE', jaw: 'JAW', velum: 'SOFT PALATE', larynx: 'VOICE BOX', teeth: 'TEETH' };
const PART_VERB: Record<Stage['part'], string> = { hold: 'HOLD', pop: 'RELEASE', puff: 'AIR', say: 'SHAPE' };

/** A small label of the display: dark glass, a coloured dot, small capitals. */
function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, align: 'left' | 'right' | 'center' = 'left', sub = ''): { w: number; x0: number } {
  ctx.letterSpacing = '0.6px';
  ctx.font = `600 10.5px ${HUD}`;
  const tw = ctx.measureText(text).width;
  const sw = sub ? ctx.measureText(sub).width + 9 : 0;
  const pw = tw + sw + 32, ph = 24;
  const x0 = align === 'left' ? x : align === 'right' ? x - pw : x - pw / 2;
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.roundRect(x0, y - ph / 2, pw, ph, ph / 2);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.beginPath(); ctx.arc(x0 + 12, y, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  ctx.fillText(text, x0 + 21, y + 0.5);
  if (sub) { ctx.fillStyle = colour; ctx.fillText(sub, x0 + 21 + tw + 9, y + 0.5); }
  ctx.letterSpacing = '0px';
  return { w: pw, x0 };
}

/** An arrow from where a part was to where it goes: it grows brighter toward its head. */
function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, colour: string, time: number, width = 3): void {
  const dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 6) return;
  const ux = dx / L, uy = dy / L;
  const head = Math.min(11, L * 0.45);
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, colour);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = colour;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = g;
  ctx.lineWidth = width;
  ctx.setLineDash([7, 6]);
  ctx.lineDashOffset = -time * 26;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.7, y1 - uy * head * 0.7);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.55, y1 - uy * head + ux * head * 0.55);
  ctx.lineTo(x1 - ux * head + uy * head * 0.55, y1 - uy * head - ux * head * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ----------------------------------------------------- the head from the side

interface Dot { u: number; nose: boolean; off: number; life: number; wig: number; dir: 1 | -1 }
interface Painted { cv: HTMLCanvasElement; pose: Pose | null; w: number; h: number; frame: string }
interface SideMem {
  dots: Dot[]; spawn: number; wasBlocked: boolean; burst: number;
  /** the frame shown now: it glides to the zoom's */
  frame: [number, number, number, number] | null;
  /** the painted anatomy and the skin, each painted again only when the pose, the size or the frame changes */
  layer: (Painted & { sc: HeadScene | null; /** nothing of it is seen (the skin is fully on): it was not painted */ hidden: boolean; /** how fine it is painted: 1, or 0.5 while a clip plays on a slow computer */ fine: number; /** what the graphics card's layer shows now */ glKey: string }) | null;
  /** the anatomy's layer on the graphics card (null: there is none, and the anatomy is painted by the processor) */
  gl?: AnatomyGL | null;
  /** seconds between frames, smoothed; and whether the anatomy is painted coarser for the clip that plays */
  gap: number; coarse: boolean;
  /** what the skin's own canvas shows */
  skin: { pose: Pose | null; key: string } | null;
}

/** A name on a line to a point: the label in a column at the side, the line to the point. */
function callout(ctx: CanvasRenderingContext2D, text: string, ax: number, ay: number, lx: number, ly: number, side: 'left' | 'right', colour: string, sub = '', r = 0): void {
  const box = chip(ctx, text, lx, ly, colour, side === 'right' ? 'right' : 'left', sub);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ex = side === 'right' ? box.x0 : box.x0 + box.w;
  ctx.moveTo(ex, ly);
  const elbow = side === 'right' ? Math.max(ax + r, ex - 14) : Math.min(ax - r, ex + 14);
  ctx.lineTo(elbow, ly);
  const ang = Math.atan2(ly - ay, elbow - ax);
  ctx.lineTo(ax + Math.cos(ang) * r, ay + Math.sin(ang) * r);
  ctx.stroke();
  if (!r) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ax, ay, 2.2, 0, Math.PI * 2); ctx.fill(); }
}

/** A colour of the painting (an `rgb(r,g,b)`) mixed toward another, 0..1. */
function mixRgb(from: string, to: [number, number, number], f: number): string {
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(from);
  const c = m ? [+m[1], +m[2], +m[3]] : [201, 96, 110];
  return `rgb(${c.map((v, i) => Math.round(v + (to[i] - v) * f)).join(',')})`;
}

/** A closed outline through the points, its corners rounded (curves between the middles of its edges). */
function roundPath(lc: CanvasRenderingContext2D, p: number[]): void {
  const n = p.length / 2;
  const mid = (i: number): [number, number] => { const j = (i + 1) % n; return [(p[2 * i] + p[2 * j]) / 2, (p[2 * i + 1] + p[2 * j + 1]) / 2]; };
  const m0 = mid(n - 1);
  lc.beginPath();
  lc.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(i); lc.quadraticCurveTo(p[2 * i], p[2 * i + 1], m[0], m[1]); }
  lc.closePath();
}

/** Clips to everything that is not air (the lumen, the opening of the mouth), in world units. */
function clipToTissue(lc: CanvasRenderingContext2D, sc: HeadScene): void {
  for (const q of [sc.lumen, sc.mouth]) {
    if (q.length < 6) continue;
    lc.beginPath();
    lc.rect(-200, -200, 400, 400);
    lc.moveTo(q[0], q[1]);
    for (let i = 2; i < q.length; i += 2) lc.lineTo(q[i], q[i + 1]);
    lc.closePath();
    lc.clip('evenodd');
  }
}

/**
 * A front tooth as it stands in the mouth: a crown with a blunt biting edge,
 * seated in its gum. The model's incisor is its acoustic obstacle, root and
 * crown in one long pointed wedge, which drawn whole reads as a fang. Its
 * two faces are kept where the model has them (every contact, the tip
 * behind the teeth, the lip on them, is unchanged); the point is blunted
 * into an edge, the root's part lies under a mound of gum that hides the
 * painting's own tooth, and the gum's margin arches on the crown.
 */
function paintTooth(lc: CanvasRenderingContext2D, sc: HeadScene, world: Mat, id: 'upperIncisor' | 'lowerIncisor', mucosa: string): void {
  const p0 = sc.sprites.find((q) => q.id === id)?.poly;
  if (!p0 || p0.length < 8) return;
  const s = sc.s;
  const upper = id === 'upperIncisor';
  // the tooth's edge: the lowest point of the top tooth, the highest of the bottom one
  let t = 0;
  for (let i = 2; i < p0.length; i += 2) if (upper ? p0[i + 1] < p0[t + 1] : p0[i + 1] > p0[t + 1]) t = i;
  const tx = p0[t], ty = p0[t + 1];
  // its root end: the points farthest from the edge
  let far = 0;
  for (let i = 0; i < p0.length; i += 2) far = Math.max(far, Math.hypot(p0[i] - tx, p0[i + 1] - ty));
  let bx = 0, by = 0, nb = 0;
  for (let i = 0; i < p0.length; i += 2) if (Math.hypot(p0[i] - tx, p0[i + 1] - ty) > 0.82 * far) { bx += p0[i]; by += p0[i + 1]; nb++; }
  bx /= nb; by /= nb;
  const L = Math.hypot(tx - bx, ty - by) || 1;
  const ux = (tx - bx) / L, uy = (ty - by) / L;   // along the tooth, root to edge
  const vx = -uy, vy = ux;                          // across it
  const at = (al: number, ac: number): [number, number] => [bx + ux * al * L + vx * ac, by + uy * al * L + vy * ac];
  const along = (x: number, y: number) => ((x - bx) * ux + (y - by) * uy) / L;
  const across = (x: number, y: number) => (x - bx) * vx + (y - by) * vy;
  // the outline with its point blunted: past nine tenths of its length the two faces end on a short edge
  const CUT = 0.9;
  const p: number[] = [];
  const n0 = p0.length / 2;
  for (let i = 0; i < n0; i++) {
    const x0 = p0[2 * i], y0 = p0[2 * i + 1], j = (i + 1) % n0, x1 = p0[2 * j], y1 = p0[2 * j + 1];
    const a0 = along(x0, y0), a1 = along(x1, y1);
    if (a0 <= CUT) p.push(x0, y0);
    if ((a0 - CUT) * (a1 - CUT) < 0) {
      const f = (CUT - a0) / (a1 - a0);
      const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f;
      const side = Math.sign(across(cx, cy)) || 1;
      // going up a face: the cut, then the corner of the edge; coming down the other: the corner, then the cut
      const corner = at(0.985, side * 0.075 * s);
      if (a1 > a0) p.push(cx, cy, corner[0], corner[1]); else p.push(corner[0], corner[1], cx, cy);
    }
  }
  if (p.length < 8) return;
  lc.save();
  lc.setTransform(world[0], world[1], world[2], world[3], world[4], world[5]);
  lc.lineJoin = 'round';
  lc.lineCap = 'round';
  const gumLight = mixRgb(mucosa, [226, 140, 148], 0.32), gumEdge = mixRgb(mucosa, [238, 166, 170], 0.6);

  // ---- the gum the tooth stands in: a soft mound around the root's part, never over the air
  lc.save();
  clipToTissue(lc, sc);
  const [mx, my] = at(0.16, 0);
  lc.translate(mx, my);
  lc.rotate(Math.atan2(uy, ux));
  lc.scale(1, 0.8);
  const mound = lc.createRadialGradient(0, 0, 0.1 * s, 0, 0, 0.55 * s);
  mound.addColorStop(0, gumLight); mound.addColorStop(0.6, gumLight); mound.addColorStop(1, gumLight.replace('rgb(', 'rgba(').replace(')', ',0)'));
  lc.fillStyle = mound;
  lc.beginPath(); lc.arc(0, 0, 0.55 * s, 0, Math.PI * 2); lc.fill();
  lc.restore();

  // ---- the crown: enamel, warmer toward the gum, a little glassy at the edge
  const en = lc.createLinearGradient(bx, by, tx, ty);
  en.addColorStop(0, '#d6c7aa'); en.addColorStop(0.5, '#e9dfca'); en.addColorStop(0.8, '#f3eee2'); en.addColorStop(1, '#dfe5e2');
  roundPath(lc, p);
  lc.fillStyle = en;
  lc.fill();
  lc.save();
  roundPath(lc, p);
  lc.clip();
  // rounder across: darker toward its two sides, a soft light down its middle
  const half = 0.42 * s;
  const sh = lc.createLinearGradient(...at(0.6, -half), ...at(0.6, half));
  sh.addColorStop(0, 'rgba(96,74,52,0.38)'); sh.addColorStop(0.32, 'rgba(96,74,52,0)'); sh.addColorStop(0.7, 'rgba(96,74,52,0)'); sh.addColorStop(1, 'rgba(96,74,52,0.34)');
  lc.fillStyle = sh;
  lc.fillRect(bx - 3 * s, by - 3 * s, 6 * s, 6 * s);
  lc.strokeStyle = 'rgba(255,255,255,0.42)';
  lc.lineWidth = 0.07 * s;
  lc.beginPath();
  lc.moveTo(...at(0.58, 0.03 * s));
  lc.lineTo(...at(0.84, 0.015 * s));
  lc.stroke();
  // the gum over the root's part: its margin arches toward the root in the middle of the tooth
  const cover = upper ? 0.47 : 0.45, arch = 0.1, hw = 0.3 * s;
  const margin = (ac: number) => { const q = Math.min(1, Math.abs(ac) / hw); return cover - arch * (1 - q * q); };
  lc.beginPath();
  for (let i = 0; i <= 16; i++) {
    const ac = -1.6 * hw + (3.2 * hw * i) / 16;
    const [x, y] = at(margin(ac), ac);
    if (i === 0) lc.moveTo(x, y); else lc.lineTo(x, y);
  }
  lc.lineTo(...at(-1.2, 1.6 * hw));
  lc.lineTo(...at(-1.2, -1.6 * hw));
  lc.closePath();
  const gg = lc.createLinearGradient(...at(0.1, 0), ...at(cover, 0));
  gg.addColorStop(0, gumLight); gg.addColorStop(1, gumEdge);
  lc.fillStyle = gg;
  lc.fill();
  // the rolled edge of the gum on the tooth: a thin shade under it, a thin light on it
  for (const [dal, colour, width] of [[0.02, 'rgba(110,46,52,0.4)', 0.03], [-0.014, 'rgba(255,220,222,0.55)', 0.03]] as [number, string, number][]) {
    lc.beginPath();
    for (let i = 0; i <= 14; i++) {
      const ac = -1.2 * hw + (2.4 * hw * i) / 14;
      const [x, y] = at(margin(ac) + dal, ac);
      if (i === 0) lc.moveTo(x, y); else lc.lineTo(x, y);
    }
    lc.strokeStyle = colour;
    lc.lineWidth = width * s;
    lc.stroke();
  }
  lc.restore();
  // a fine line around the crown that shows
  lc.save();
  lc.beginPath();
  for (let i = 0; i <= 16; i++) {
    const ac = -2 * hw + (4 * hw * i) / 16;
    const [x, y] = at(margin(ac), ac);
    if (i === 0) lc.moveTo(x, y); else lc.lineTo(x, y);
  }
  lc.lineTo(...at(1.3, 2 * hw));
  lc.lineTo(...at(1.3, -2 * hw));
  lc.closePath();
  lc.clip();
  roundPath(lc, p);
  lc.strokeStyle = 'rgba(104,84,62,0.6)';
  lc.lineWidth = 0.022 * s;
  lc.stroke();
  lc.restore();
  lc.restore();
}

/** Dev switches for the anatomy (window.tutorAnatomy in development): the teeth drawn from the model over the plate's own. */
const anatomyDev = { teeth: false };

/**
 * What is drawn over the air from the geometry of the instant, on the anatomy (`lc`, world mapped by `world`):
 * the wet rim of the air's walls as far forward as the teeth, and the velum (the plate's own is painted in
 * another posture than the model's).
 */
function paintOverAir(lc: CanvasRenderingContext2D, sc: HeadScene, world: Mat, bd: Backdrop, geom: TractGeometry, cavity = false): void {
  // under a raised blade (inside the model's tongue, which runs straight down to the floor, but under the tongue
  // as it is, and not in the air): the floor of the mouth, in the shadow of the blade
  const t = tongueShape(sc, geom);
  const mesh = sc.sprites.find((q) => q.id === 'tongue')?.poly;
  if (!cavity && t.outline !== sc.tongue && mesh) {
    const { keep } = airOf(sc, geom);
    lc.save();
    lc.setTransform(world[0], world[1], world[2], world[3], world[4], world[5]);
    for (const q of [sc.lumen, sc.mouth, ...keep]) {
      if (q.length < 6) continue;
      lc.beginPath(); lc.rect(-200, -200, 400, 400); lc.moveTo(q[0], q[1]);
      for (let i = 2; i < q.length; i += 2) lc.lineTo(q[i], q[i + 1]);
      lc.closePath(); lc.clip('evenodd');
    }
    const p = mesh;
    let top = -Infinity;
    for (let i = 1; i < p.length; i += 2) top = Math.max(top, p[i]);
    const deep = lc.createLinearGradient(0, top, 0, top - 2.6 * sc.s);
    deep.addColorStop(0, mixRgb(bd.tone.mucosa, [70, 18, 26], 0.55)); deep.addColorStop(1, mixRgb(bd.tone.mucosa, [30, 6, 10], 0.85));
    lc.fillStyle = deep;
    lc.beginPath(); lc.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) lc.lineTo(p[i], p[i + 1]);
    lc.closePath(); lc.fill();
    lc.restore();
  }
  // the free edge of a parted lip: the vermilion turning into the wet mucosa inside it, redder and darker toward
  // the edge, with a moist light along it
  for (const m of sc.margins()) {
    const lip = m.into[1] > 0 ? sc.lips().upper : sc.lips().lower;
    lc.save();
    lc.setTransform(world[0], world[1], world[2], world[3], world[4], world[5]);
    lc.beginPath();
    lc.moveTo(lip[0], lip[1]);
    for (let i = 2; i < lip.length; i += 2) lc.lineTo(lip[i], lip[i + 1]);
    lc.closePath();
    lc.clip();
    lc.beginPath(); lc.rect(-200, -200, 400, 400); lc.moveTo(m.off[0], m.off[1]);
    for (let i = 2; i < m.off.length; i += 2) lc.lineTo(m.off[i], m.off[i + 1]);
    lc.closePath(); lc.clip('evenodd');
    // (from a little behind the front, where the edge has rounded into the profile)
    const from = 2 * Math.round(0.15 * (m.edge.length / 2 - 1));
    const along = (dx: number) => {
      lc.beginPath();
      for (let i = from; i < m.edge.length; i += 2) {
        const x = m.edge[i] + m.into[0] * dx, y = m.edge[i + 1] + m.into[1] * dx;
        if (i === from) lc.moveTo(x, y); else lc.lineTo(x, y);
      }
    };
    lc.lineCap = 'butt';
    lc.lineJoin = 'round';
    // (soft layers, each narrower and a little darker: the surface turning away, no line of its own)
    for (const [w, colour] of [[0.5, 'rgba(170,58,70,0.07)'], [0.36, 'rgba(160,50,64,0.08)'], [0.24, 'rgba(146,40,56,0.09)'], [0.13, 'rgba(126,30,46,0.1)']] as [number, string][]) {
      along(0);
      lc.lineWidth = w * sc.s;
      lc.strokeStyle = colour;
      lc.stroke();
    }
    // a soft moist light on the roll of the edge
    along(0.09 * sc.s);
    lc.lineWidth = 0.06 * sc.s;
    lc.strokeStyle = 'rgba(255,226,230,0.07)';
    lc.stroke();
    lc.restore();
  }
  // (the graphics card's cavity has its own wet light along its walls)
  if (!cavity) {
    lc.save();
    lc.setTransform(world[0], world[1], world[2], world[3], world[4], world[5]);
    lc.beginPath();
    lc.rect(-200, -200, 200 + geom.landmarks.upperEdge[0] - 0.25 * sc.s, 400);
    lc.clip();
    paintRim(lc, sc, world);
    lc.restore();
  }
  if (!cavity) paintVelumOver(lc, sc, world, bd);
  if (anatomyDev.teeth) {
    paintTooth(lc, sc, world, 'lowerIncisor', bd.tone.mucosa);
    paintTooth(lc, sc, world, 'upperIncisor', bd.tone.mucosa);
  }
}

/**
 * The tongue as it is (world): a thick blade with a round tip, its underside running back to the floor of the
 * mouth behind the bottom teeth. The model's tongue is the surface the air meets (its back and the top of its
 * blade, kept here exactly) closed by a thin point and a straight wall down to the floor, which never meet the
 * air: low, its front lies on the bottom teeth; raised, the blade keeps its thickness and the space under it is
 * open. Also the space in front of the tongue, between it and the bottom teeth, which is air wherever the tongue
 * does not fill it.
 */
function tongueShape(sc: HeadScene, geom: TractGeometry): { outline: number[]; front: number[] } {
  const p = sc.sprites.find((q) => q.id === 'tongue')?.poly;
  const li = geom.solids.find((q) => q.id === 'lowerIncisor')?.pts, floor = geom.solids.find((q) => q.id === 'floor')?.pts;
  const ll = geom.solids.find((q) => q.id === 'lowerLip')?.pts;
  if (!p || p.length !== 80 || !li || !floor || !ll) return { outline: sc.tongue, front: [] };
  const s = sc.s;
  const pt = (i: number): [number, number] => [p[2 * i], p[2 * i + 1]];
  // the model's mesh: the root's foot, 24 points over the body, 6 round the tip, 8 down the front, the deep end
  const A = pt(24), T = pt(25), D = pt(39);
  let bxv = T[0] - A[0], byv = T[1] - A[1];
  if (Math.hypot(bxv, byv) < 0.4 * s) { bxv = T[0] - p[46]; byv = T[1] - p[47]; }
  const bl = Math.hypot(bxv, byv) || 1;
  const b: [number, number] = [bxv / bl, byv / bl];
  let nrm: [number, number] = [b[1], -b[0]];
  if (nrm[0] * (D[0] - T[0]) + nrm[1] * (D[1] - T[1]) < 0) nrm = [-nrm[0], -nrm[1]];
  // the space in front of the tongue: from over its blade along the air's floor to the lips, down the bottom
  // teeth, and back to the middle of the tongue
  const from = pt(23);
  let k0 = 0;
  for (let i = 0, best = Infinity; i < sc.lower.length; i += 2) { const d = Math.hypot(sc.lower[i] - from[0], sc.lower[i + 1] - from[1]); if (d < best) { best = d; k0 = i; } }
  // (from the tongue's middle, and along the air's own floor from a little behind that point: the two share
  // their edge there exactly, and no sliver is left between them)
  const front: number[] = [geom.tongueCenter[0], geom.tongueCenter[1]];
  for (let i = Math.max(0, k0 - 6); i < sc.lower.length; i += 2) front.push(sc.lower[i], sc.lower[i + 1]);
  for (const i of [4, 3, 2]) front.push(ll[2 * i], ll[2 * i + 1]);
  for (const i of [5, 4, 3, 2, 1, 0]) front.push(li[2 * i], li[2 * i + 1]);
  if (b[0] <= 0.2) return { outline: sc.tongue, front };
  let fwd = -Infinity;
  for (let i = 25; i <= 30; i++) fwd = Math.max(fwd, p[2 * i] * b[0] + p[2 * i + 1] * b[1]);
  const R = 0.24 * s;
  const back = fwd - R - (T[0] * b[0] + T[1] * b[1]);
  const T1: [number, number] = [T[0] + b[0] * back, T[1] + b[1] * back];
  const c: [number, number] = [T1[0] + nrm[0] * R, T1[1] + nrm[1] * R];
  const le = geom.landmarks.lowerEdge;
  const F: [number, number] = [li[0], li[1]];
  // round the tip as far as the point from which the front runs straight down to the foot of the bottom teeth
  const cap: [number, number][] = [];
  let E: [number, number] = [c[0] + nrm[0] * R, c[1] + nrm[1] * R];
  for (let i = 1; i <= 20; i++) {
    const th = (Math.PI * i) / 20;
    const q: [number, number] = [c[0] - nrm[0] * R * Math.cos(th) + b[0] * R * Math.sin(th), c[1] - nrm[1] * R * Math.cos(th) + b[1] * R * Math.sin(th)];
    cap.push(q);
    const tx = nrm[0] * Math.sin(th) + b[0] * Math.cos(th), ty = nrm[1] * Math.sin(th) + b[1] * Math.cos(th);
    E = q;
    // (the foot is now on the tangent's side the tongue is on: from here the front is convex)
    if ((tx * (F[1] - q[1]) - ty * (F[0] - q[0])) * (b[0] * nrm[1] - b[1] * nrm[0]) <= 0) break;
  }
  // raised above the bottom teeth, the blade is free of the floor: its front hollows a little under it
  const w = clamp01((T[1] - le[1] - 0.25 * s) / (1.5 * s));
  const fx = F[0] - E[0], fy = F[1] - E[1], fl = Math.hypot(fx, fy) || 1;
  let inx = -fy / fl, iny = fx / fl;
  if (inx * (geom.tongueCenter[0] - E[0]) + iny * (geom.tongueCenter[1] - E[1]) < 0) { inx = -inx; iny = -iny; }
  const bend = (0.42 * w - 0.07 * (1 - w)) * Math.min(1, fl / (1.2 * s)) * s;
  const Cq: [number, number] = [0.5 * (E[0] + F[0]) + inx * bend, 0.5 * (E[1] + F[1]) + iny * bend];
  // low, it lies on the bottom teeth: its front follows their inner face down to the gum, with no gap behind them
  // (up to the middle of their crowns: above that the painting has no tongue to lay there, only what lies between
  // it and the teeth, which drawn up to the edge would stand on the tooth as a red spike)
  const Lt: [number, number] = [li[2] - 0.02 * s, li[3]], Lm: [number, number] = [0.5 * (li[0] + li[2]) - 0.02 * s, 0.5 * (li[1] + li[3])];
  const near = clamp01(1 - (Math.hypot(E[0] - Lt[0], E[1] - Lt[1]) - 0.3 * s) / (1.3 * s));
  const hug = (1 - w) * near;
  const mixP = (u: number[], v: number[], t: number): [number, number] => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
  // raised: the underside runs back under the blade before it turns down to the floor behind the bottom teeth
  const under0 = Math.min(1.9 * s, 0.75 * fl);
  const R1: [number, number] = [E[0] - b[0] * under0, E[1] - b[1] * under0], R2: [number, number] = [F[0] - 1.0 * s, F[1] + 0.35 * s];
  const C1 = mixP(mixP(mixP(E, Cq, 2 / 3), mixP(E, Lt, 0.9), hug), R1, w), C2 = mixP(mixP(mixP(F, Cq, 2 / 3), Lm, hug), R2, w);
  const outline = p.slice(0, 50);
  outline.push(T1[0], T1[1]);
  for (const q of cap) outline.push(q[0], q[1]);
  for (let i = 1; i <= 12; i++) {
    const u = i / 12, v = 1 - u;
    outline.push(v * v * v * E[0] + 3 * v * v * u * C1[0] + 3 * v * u * u * C2[0] + u * u * u * F[0], v * v * v * E[1] + 3 * v * v * u * C1[1] + 3 * v * u * u * C2[1] + u * u * u * F[1]);
  }
  outline.push(floor[0], floor[1], p[76], p[77], D[0], D[1]);
  // (a tip curled back makes the blade's underside loop over itself: the model's own outline stands then)
  return { outline: simple(outline) ? outline : sc.tongue, front };
}

/** Whether a closed polygon's edges cross nowhere but at shared corners. */
function simple(p: number[]): boolean {
  const n = p.length / 2;
  const cross = (a: number, b: number, c: number, d: number) => {
    const o = (i: number, j: number, k: number) => Math.sign((p[2 * j] - p[2 * i]) * (p[2 * k + 1] - p[2 * i + 1]) - (p[2 * j + 1] - p[2 * i + 1]) * (p[2 * k] - p[2 * i]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cross(i, (i + 1) % n, j, (j + 1) % n)) return false;
  }
  return true;
}

/**
 * The polygons of air taken out of the anatomy, and what is kept of it inside them: the tongue as it is, the
 * front teeth and the painted lips as the sheet carries them, whose curves the acoustic grid's straight steps
 * would cut square (and whose last steps reach between the lips and the teeth, where there is no air). And what
 * is taken out whatever is kept (but the teeth): the flat faces where parted lips met, rounded off.
 */
const airOf = (sc: HeadScene, geom: TractGeometry): { cut: number[][]; keep: number[][]; clear: number[][]; hard: number[][] } => {
  const solid = (id: string) => sc.sprites.find((q) => q.id === id)?.poly ?? [];
  const t = tongueShape(sc, geom);
  const li = solid('lowerIncisor'), lips = sc.lips();
  // the air of the grid as its strip of quads, one between each two grid lines: drawn as one outline it folds over
  // itself where its floor or its roof turns back, and a fold would be left uncut
  const strip: number[][] = [];
  // (not where the walls all but touch, under a millimetre: there the tongue lies on the roof of the mouth, and a hairline of
  // air between them, cut across the plate's curves, would only show as a row of dark slivers)
  const shut = 0.08 * sc.s;
  // (and where the air lies on the tongue its strip reaches a little into it: what the tongue keeps is its outline, a
  // smooth curve that the strip's own edge, made of the grid's steps, is not, and between them the air would be cut
  // across the curve in slivers; the tongue's own outline then bounds the air exactly)
  const into = 0.07 * sc.s;
  const low = (i: number): [number, number] => {
    const r = geom.rays[i / 2];
    return geom.hits[i / 2].lowId === 'tongue' ? [sc.lower[i] - r.nx * into, sc.lower[i + 1] - r.ny * into] : [sc.lower[i], sc.lower[i + 1]];
  };
  for (let i = 0; i + 3 < sc.lower.length; i += 2) {
    const wi = Math.hypot(sc.upper[i] - sc.lower[i], sc.upper[i + 1] - sc.lower[i + 1]), wj = Math.hypot(sc.upper[i + 2] - sc.lower[i + 2], sc.upper[i + 3] - sc.lower[i + 3]);
    if (wi < shut && wj < shut) continue;
    strip.push([...low(i), ...low(i + 2), sc.upper[i + 2], sc.upper[i + 3], sc.upper[i], sc.upper[i + 1]]);
  }
  return { cut: [sc.mouth, t.front, ...strip], keep: [t.outline, solid('upperIncisor'), li, lips.upper, lips.lower, ...lips.gums], clear: sc.margins().map((m) => m.off), hard: lips.gums };
};

/** How the air is lit as a cavity (see gl.ts): the light comes from the mouth, and is gone from the cavity where the mouth opens onto the room. */
const cavityLook = (sc: HeadScene, geom: TractGeometry): CavityLook => {
  const lip = geom.landmarks.lipFront, s = sc.s;
  return { mouth: [lip[0], lip[1]], reach: 7 * s, fade: [geom.landmarks.upperEdge[0] - 1.3 * s, geom.landmarks.upperEdge[0] - 0.15 * s], vanish: 0.8 * s, spread: 0.28 * s };
};

/**
 * The anatomy of a posture in layers, for a view that draws the stretched plate itself (on the graphics card, as
 * the side view does): the air to take out of the plate, what to keep of it inside the air, and what to draw over
 * the air afterwards.
 */
export function anatomyLayers(sc: HeadScene, geom: TractGeometry): { cut: number[][]; keep: number[][]; clear: number[][]; hard: number[][]; look: CavityLook; over: (lc: CanvasRenderingContext2D, world: Mat, bd: Backdrop) => void } {
  const { cut, keep, clear, hard } = airOf(sc, geom);
  return { cut, keep, clear, hard, look: cavityLook(sc, geom), over: (lc, world, bd) => paintOverAir(lc, sc, world, bd, geom, true) };
}

/**
 * The painted head for a posture, on a 2D canvas: the plate stretched by the model (the skull still, the jaw
 * turned, the soft tissue between stretched, the tongue and the lips led by the model's), the air taken out of
 * it, and what is drawn from the geometry over the air. What is drawn behind the layer (the air, coloured or
 * dark) shows through the air. The tutor's side view draws the plate with the graphics card instead (the same
 * sheet, the same air); the lab's head view and its 3D view draw it with this.
 */
export function paintHead(lc: CanvasRenderingContext2D, sc: HeadScene, world: Mat, bd: Backdrop, geom: TractGeometry, _a?: Pose['art']): void {
  if (!paintPlate(lc, sc, world, bd)) return;
  const { cut, keep, clear, hard } = airOf(sc, geom);
  cutAirOut(lc, world, cut, keep, clear, hard);
  paintOverAir(lc, sc, world, bd, geom);
}

/**
 * The side view, on three canvases laid over one another: the anatomy and the air (`ctx`), the skin (its own
 * canvas, put in `skinHost` and made as clear as the layer is turned down), and over them what is written and
 * pointed at (`over`). Each is painted only when what it shows changes.
 */
function drawSide(ctx: CanvasRenderingContext2D, over: CanvasRenderingContext2D, skinHost: HTMLElement | null, w: number, h: number, dpr: number, time: number, dt: number, face: Face, mem: SideMem): void {
  ctx.clearRect(0, 0, w, h);
  over.clearRect(0, 0, w, h);
  over.lineJoin = 'round';
  over.lineCap = 'round';
  const a = face.pose.art;
  const shape = shapeOf(face.pose);
  const geom = shape.geom;
  // ---- the breath. Nobody breathes out without end: a sound is made on one breath out, after a breath in.
  // A clip that plays says which; a picture left standing breathes out through its shape, stops, and breathes in.
  const CYCLE = 5.4, OUT = 2.9, IN0 = 3.4, IN1 = 4.9;
  const ph = time % CYCLE;
  const idle = face.air !== 'in' && face.air !== 'out';
  const outK = idle ? clamp01(ph / 0.3) * clamp01((OUT - ph) / 0.3) : face.air === 'out' ? 1 : 0;
  const mouthOpen = !shape.flow.blocked, noseOpen = a.velum > 0.08;
  const inhaling = (face.air === 'in' || (idle && ph > IN0 && ph < IN1)) && (mouthOpen || noseOpen);
  const flow: Flow = { ...shape.flow, breath: shape.flow.breath * outK, mouth: shape.flow.mouth * outK, nose: shape.flow.nose * outK, voice: shape.flow.voice * outK };
  // the frame: close on the mouth (from the larynx to below the eye, with room in front of the lips
  // for the air) or the whole head; it glides from one to the other
  const want = FRAMES[layers.zoom];
  const fr = (mem.frame ??= [...want]);
  for (let i = 0; i < 4; i++) { fr[i] += (want[i] - fr[i]) * (1 - Math.exp(-dt * 7)); if (Math.abs(want[i] - fr[i]) < 0.004) fr[i] = want[i]; }
  const [X0, X1, Y0, Y1] = fr;
  const frameKey = fr.join(',');
  const skin = layers.skin;
  const k = Math.min(w / (X1 - X0), h / (Y1 - Y0));
  const ox = (w - (X1 - X0) * k) / 2 - X0 * k;
  const oy = h - (h - (Y1 - Y0) * k) / 2 + Y0 * k;
  const X = (x: number) => ox + x * k, Y = (y: number) => oy - y * k;
  const path = (pts: number[], close = true) => {
    ctx.beginPath();
    ctx.moveTo(X(pts[0]), Y(pts[1]));
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(X(pts[i]), Y(pts[i + 1]));
    if (close) ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---- the painted head, with everything that bounds the air drawn from the geometry
  const bd = getBackdrop();
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  /** where the head runs past the frame the picture fades instead of being cut: where it is clear, then where it is whole (device pixels) */
  const edges: Pick<SkinFades, 'left' | 'top' | 'bottom'> = {};
  {
    const left = X(X0) * dpr, top = Y(Y1) * dpr, bottom = Y(Y0) * dpr;
    if (X0 > -9.4) edges.left = [left, left + Math.min(3.2, X0 + 9.4 + 0.4) * k * dpr];
    if (Y1 < 24.5) edges.top = [top, top + Math.min(2.4, 24.5 - Y1 + 0.3) * k * dpr];
    if (Y0 > -3.3) edges.bottom = [bottom, bottom - Math.min(1.2, Y0 + 3.3 + 0.2) * k * dpr];
  }
  const fadeEdges = (lc: CanvasRenderingContext2D, q: number) => {
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'destination-out';
    for (const [pair, along] of [[edges.left, 'x'], [edges.top, 'y'], [edges.bottom, 'y']] as const) {
      if (!pair) continue;
      const g = along === 'x' ? lc.createLinearGradient(pair[0] * q, 0, pair[1] * q, 0) : lc.createLinearGradient(0, pair[0] * q, 0, pair[1] * q);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(0, 0, lc.canvas.width, lc.canvas.height);
    }
    lc.globalCompositeOperation = 'source-over';
  };
  let scene: HeadScene | null = null;
  const world: Mat = mul([dpr, 0, 0, dpr, 0, 0], [k, 0, 0, -k, ox, oy]);
  if (bd) {
    const lay = (mem.layer ??= { cv: document.createElement('canvas'), pose: null, w: 0, h: 0, frame: '', sc: null, hidden: false, fine: 1, glKey: '' });
    // (under a skin that is fully on, nothing of the anatomy is seen: it is not painted)
    const hidden = skin >= 0.999;
    // with the skin fully on, nothing of what is under it is seen, not even where the face's edge and the model's differ
    const shown = clamp01(1 - (skin - 0.6) / 0.4);
    if (lay.pose !== face.pose || !lay.sc) { lay.sc = headScene(geom, AN, a); lay.pose = face.pose; lay.glKey = ''; lay.frame = ''; }
    const sc = lay.sc;
    scene = sc;
    const yOf = (y: number) => world[3] * y + world[5];
    const { cut, keep, clear, hard } = airOf(sc, geom);
    // The plate is stretched by the graphics card, on a canvas of its own under this one (laid in the page the
    // first time): a few milliseconds whatever the computer. Without a card it is painted here, pixel by pixel.
    if (mem.gl === undefined) mem.gl = AnatomyGL.make();
    const gl = mem.gl, host = ctx.canvas.parentElement;
    const onCard = !!gl && !gl.lost && !!host && !!bd.mask;
    if (gl && onCard && host) {
      if (gl.cv.parentElement !== host) {
        gl.cv.className = 'face-canvas';
        gl.cv.setAttribute('aria-hidden', 'true');
        gl.cv.style.pointerEvents = 'none';
        host.insertBefore(gl.cv, ctx.canvas);
      }
      const key = `${cw}x${ch}|${frameKey}|${shown.toFixed(3)}`;
      if (!hidden && lay.glKey !== key) {
        gl.render(sc, world, cw, ch, { img: bd.img, mask: bd.mask! }, cut, keep, { ...edges, neck: [yOf(sc.neckEnd), yOf(sc.neckEnd + 1.6 * sc.s)] }, shown, clear, hard, cavityLook(sc, geom));
        lay.glKey = key;
      }
      const display = hidden ? 'none' : '';
      if (gl.cv.style.display !== display) gl.cv.style.display = display;
    } else {
      if (gl?.cv.parentElement) gl.cv.remove();
      // (painted on a canvas in the computer's own memory, drawn onto this one at every frame)
      if (lay.w !== cw || lay.h !== ch || lay.frame !== frameKey || lay.hidden !== hidden) {
        if (lay.cv.width !== cw || lay.cv.height !== ch) { lay.cv.width = cw; lay.cv.height = ch; }
        const lc = lay.cv.getContext('2d', { willReadFrequently: true })!;
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.clearRect(0, 0, cw, ch);
        if (!hidden) {
          paintHead(lc, sc, world, bd, geom, a);
          fadeNeck(lc, sc, world);
          fadeEdges(lc, 1);
        }
        lay.w = cw; lay.h = ch; lay.frame = frameKey; lay.hidden = hidden;
      }
    }
    // the air, seen through the anatomy where it is taken out: dark in the throat, and fading to the room's
    // own dark between the lips, where the mouth opens onto it
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = shown;
    const lipX = geom.landmarks.lipFront[0];
    const ag = ctx.createLinearGradient(X(lipX - 3.4), 0, X(geom.landmarks.upperEdge[0] - 0.15), 0);
    ag.addColorStop(0, 'rgba(3,4,7,0.92)'); ag.addColorStop(1, 'rgba(3,4,7,0)');
    ctx.fillStyle = ag;
    // (not between the lips: there the mouth is open onto the room, and a darker slab would stand in front of the
    // face; and, over the anatomy's own layer, only where the anatomy is open: not over the tongue)
    ctx.save();
    if (onCard) {
      ctx.setTransform(world[0], world[1], world[2], world[3], world[4], world[5]);
      for (const q of keep) { ctx.beginPath(); ctx.rect(-200, -200, 400, 400); ctx.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i + 1]); ctx.closePath(); ctx.clip('evenodd'); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // (the graphics card draws the air as a cavity, in the anatomy's own layer)
    if (!onCard) for (const q of [sc.lumen, sc.port]) if (q.length >= 6) { path(q); ctx.fill(); }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!hidden) {
      if (onCard) paintOverAir(ctx, sc, world, bd, geom, true);
      else ctx.drawImage(lay.cv, 0, 0, cw, ch);
    }
    paintGlow(ctx, sc, world, flow.nose > 0.05 ? 0.35 + 0.65 * flow.nose : 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    // ---- the skin for this posture, on its own canvas (painted when the posture changes)
    if (skin > 0.01) {
      const sk = (mem.skin ??= { pose: null, key: '' });
      // (with the skin fully on the mouth has its own inside; half on, the anatomy is seen between the lips)
      const inside = Math.round(20 * clamp01((skin - 0.6) / 0.4)) / 20;
      const key = `${cw}x${ch}|${frameKey}|${skinVersion()}|${inside}`;
      const cv = skinCanvas();
      if (cv && (sk.pose !== face.pose || sk.key !== key || cv.width !== cw || cv.height !== ch)) {
        const yOf = (y: number) => world[3] * y + world[5];
        // (the photographs of the mouth are chosen by its measures: the same the mirror's are chosen by)
        paintSkin(sc, world, cw, ch, inside, { ...edges, neck: [yOf(sc.neckEnd), yOf(sc.neckEnd + 1.6 * sc.s)] }, mouthFeatures(a, geom));
        sk.pose = face.pose; sk.key = key;
      }
      if (skinHost && cv && cv.parentElement !== skinHost) skinHost.replaceChildren(cv);
    }
  }
  if (skinHost) {
    // (turned off, it is taken out of the page: a clear canvas still costs the browser a layer)
    const on = !!scene && skin > 0.01, shown = on ? String(Math.round(skin * 100) / 100) : '0';
    if (skinHost.style.opacity !== shown) skinHost.style.opacity = shown;
    if ((skinHost.style.display === 'none') === on) skinHost.style.display = on ? '' : 'none';
  }

  // ---- the air, as a stream of dots: it waits behind a closure, and leaves by the mouth or the nose
  const n = geom.lastRay;
  const nc = canonToWorld(NASAL_CENTRE, AN, a);
  const mid: [number, number][] = [];
  for (let i = 0; i <= n; i++) mid.push([geom.hits[i].mx, geom.hits[i].my]);
  const lipEnd = mid[n];
  for (let j = 1; j <= 6; j++) mid.push([lipEnd[0] + j * 0.7, lipEnd[1] - j * j * 0.025]);
  // where the way to the nose leaves the throat
  let vi = 0, vd = Infinity;
  for (let i = 0; i <= n; i++) { const d = Math.hypot(mid[i][0] - nc[0], mid[i][1] - nc[1]); if (d < vd) { vd = d; vi = i; } }
  const nosePath: [number, number][] = mid.slice(0, vi + 1);
  for (let i = 0; i < nc.length; i += 2) nosePath.push([nc[i], nc[i + 1]]);
  const tipN = nosePath[nosePath.length - 1];
  for (let j = 1; j <= 5; j++) nosePath.push([tipN[0] + j * 0.5, tipN[1] - j * 0.45]);
  const at = (pth: [number, number][], u: number): [number, number, number, number] => {
    const x = Math.max(0, Math.min(pth.length - 1.001, u));
    const i = Math.floor(x), f = x - i;
    const p = pth[i], q = pth[i + 1];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy) || 1;
    return [p[0] + dx * f, p[1] + dy * f, -dy / L, dx / L];
  };
  const dots = mem.dots;
  // a closure that opens lets a burst of air out
  if (mem.wasBlocked && !flow.blocked && flow.breath > 0.2) mem.burst = 0.25;
  mem.wasBlocked = flow.blocked;
  mem.burst = Math.max(0, mem.burst - dt);
  mem.spawn += dt * (inhaling ? 34 : flow.breath > 0.05 ? 22 + 44 * Math.max(flow.mouth, flow.nose) + (mem.burst > 0 ? 90 : 0) : 0);
  while (mem.spawn >= 1 && dots.length < 170) {
    mem.spawn -= 1;
    if (inhaling) {
      // the air comes in from outside: by the nose when the mouth is shut, by both when it is open
      const nose = noseOpen && (!mouthOpen || Math.random() < 0.6);
      dots.push({ u: (nose ? nosePath.length : mid.length) - 1.05, nose, off: Math.random() * 2 - 1, life: 1, wig: Math.random() * 6.28, dir: -1 });
    } else {
      const nose = flow.nose > 0.05 && (flow.blocked || Math.random() < 0.5);
      dots.push({ u: 0, nose, off: Math.random() * 2 - 1, life: 1, wig: Math.random() * 6.28, dir: 1 });
    }
  }
  if (mem.spawn > 3) mem.spawn = 3;
  const speed = 24 + 36 * Math.max(flow.mouth, flow.nose) + (mem.burst > 0 ? 55 : 0);
  const wall = flow.blocked ? flow.at - 0.6 : Infinity;
  const voicedAir = flow.voice > 0.3;
  ctx.save();
  ctx.shadowColor = voicedAir ? C.voice : C.air;
  ctx.shadowBlur = 6;
  for (let i = dots.length - 1; i >= 0; i--) {
    const d = dots[i];
    const pth = d.nose ? nosePath : mid;
    const inside = d.nose ? nosePath.length - 6 : n;
    if (d.dir < 0) {
      // breathed in: from outside down to the lungs; it fades if the breath in stops
      if (!inhaling) d.life -= dt * 3;
      d.u -= 30 * dt * (0.75 + 0.25 * Math.abs(d.off));
      if (d.life <= 0 || d.u <= 0.4 || d.u >= pth.length - 1.01) { dots.splice(i, 1); continue; }
    } else {
      if (flow.breath < 0.05) d.life -= dt * 2.5;
      let u = d.u + speed * dt * (0.75 + 0.25 * Math.abs(d.off));
      // the dots in the mouth stop where it is closed; if the way to the nose is shut too they wait there
      if (!d.nose && d.u <= wall && u > wall) u = wall - Math.random() * 1.5;
      if (d.nose && flow.nose < 0.05 && d.u <= vi && u > vi) u = vi - Math.random() * 1.5;
      d.u = Math.max(0, u);
      if (d.u > inside) d.life -= dt * 2.2;
      if (d.life <= 0 || d.u >= pth.length - 1.01) { dots.splice(i, 1); continue; }
    }
    const [px, py, nx, ny] = at(pth, d.u);
    const ri = Math.min(n, Math.round(d.u));
    const half = d.nose && d.u > vi ? 0.22 : Math.max(0.04, Math.min(0.62, geom.hits[ri].d * 0.3));
    const buzz = voicedAir && d.dir > 0 ? Math.sin(time * 40 + d.wig) * 0.05 : 0;
    const spread = d.u > inside ? 1 + (d.u - inside) * 0.5 : 1;
    const x = X(px + nx * (d.off * half * spread + buzz)), y = Y(py + ny * (d.off * half * spread + buzz));
    if (!layers.air) continue;
    // under the skin the air inside is not seen: only what leaves or enters by the mouth and the nose
    const edge = d.dir < 0 ? clamp01((pth.length - 1.05 - d.u) / 1.2) : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, d.life)) * 0.9 * edge * (d.u > inside ? 1 : 1 - 0.95 * skin);
    ctx.fillStyle = voicedAir && d.dir > 0 ? '#ffd27a' : '#d9f4ff';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.3, 0.075 * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ---- the larynx: the voice
  const gl = geom.landmarks.glottis;
  const gx = X(gl[0]), gy = Y(gl[1]);
  if (flow.voice > 0.08) {
    const rg = ctx.createRadialGradient(gx, gy, 1, gx, gy, 1.5 * k);
    rg.addColorStop(0, `rgba(255,178,36,${(0.8 * flow.voice).toFixed(2)})`);
    rg.addColorStop(1, 'rgba(255,178,36,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(gx, gy, 1.5 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.voice;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const ph = (time * 2.2 + i / 3) % 1;
      ctx.globalAlpha = (1 - ph) * flow.voice;
      ctx.beginPath();
      ctx.arc(gx + 1.9 * k, gy, (0.4 + ph * 1.5) * k, -0.7, 0.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // the vocal folds: together and shaking for the voice, apart for breath
  {
    const apart = flow.voice > 0.08 ? Math.abs(Math.sin(time * 55)) * 1.2 : 1 + 4 * clamp01(face.pose.abduction);
    ctx.fillStyle = flow.voice > 0.08 ? C.voice : 'rgba(255,255,255,0.75)';
    // (not seen through the skin)
    ctx.globalAlpha = clamp01(1 - (skin - 0.6) / 0.4);
    const gw = 0.42 * k;
    ctx.beginPath(); ctx.moveTo(gx - gw, gy - 2.5); ctx.lineTo(gx - apart, gy); ctx.lineTo(gx - gw, gy + 2.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(gx + gw, gy - 2.5); ctx.lineTo(gx + apart, gy); ctx.lineTo(gx + gw, gy + 2.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- the skin, over the anatomy as far as the layer is turned up
  // ---- over the skin: what is felt through it, written on it and pointed at
  ctx = over;
  if (scene && skin > 0.01) {
    // the voice felt through the skin of the throat
    if (flow.voice > 0.08) {
      const rg = ctx.createRadialGradient(gx + 1.2 * k, gy, 1, gx + 1.2 * k, gy, 2.0 * k);
      rg.addColorStop(0, `rgba(255,178,36,${(0.55 * flow.voice * skin).toFixed(2)})`);
      rg.addColorStop(1, 'rgba(255,178,36,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(gx + 1.2 * k, gy, 2.0 * k, 0, Math.PI * 2); ctx.fill();
    }
  }
  const vx = Math.min(w - 8, gx + 3.4 * k);
  if (inhaling) chip(ctx, 'BREATHE IN', vx, gy, C.air, 'left', mouthOpen ? '' : 'THROUGH THE NOSE');
  else if (outK > 0.5 && shape.flow.voice > 0.3) chip(ctx, 'VOICE', vx, gy, C.voice, 'left', 'ON');
  else if (outK > 0.5 && shape.flow.breath > 0.25) chip(ctx, 'VOICE', vx, gy, C.air, 'left', 'OFF · AIR ONLY');
  if (outK > 0.5 && shape.flow.nose > 0.3) chip(ctx, 'AIR', Math.min(w - 8, X(tipN[0]) + 3.2 * k), Y(tipN[1]) - 1.2 * k, C.air, 'right', 'THROUGH THE NOSE');

  // ---- where the mouth is closed: a point of light
  if (flow.blocked && flow.breath > 0.1 && flow.at >= 0 && flow.at <= n && skin < 0.95) {
    const [sx, sy] = flow.at >= n ? [geom.landmarks.lipFront[0] - 0.3, lipEnd[1]] : mid[flow.at];
    const cx = X(sx), cy = Y(sy);
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, (0.55 + 0.12 * pulse) * k);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.35, 'rgba(159,227,255,0.6)'); rg.addColorStop(1, 'rgba(159,227,255,0)');
    ctx.globalAlpha = 1 - 0.8 * skin;
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, 0.7 * k, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- the names of the organs
  const sideL = Math.max(10, X(X0 + 0.35)), sideR = Math.min(w - 10, X(X1 - 0.35));
  /** names on lines from the two sides: gathered first, so that no two share a line */
  const notes: { text: string; ax: number; ay: number; y: number; side: 'left' | 'right'; colour: string; sub: string; r: number }[] = [];
  if (layers.labels && scene) {
    const W = (x: number, y: number): [number, number] => { const q = scene!.warp(x, y); return [X(q[0]), Y(q[1])]; };
    const vt = velumTip(a, AN);
    const vm: [number, number] = [X(0.5 * (vt[0] + 0.9 * 0.78)), Y(0.5 * (vt[1] + 0.9 * 10.38))];
    const ue = geom.landmarks.upperEdge, lf = geom.landmarks.lipFront;
    const ph = mid[Math.max(1, Math.round(n * 0.22))];
    // on the organ itself, for the large ones
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '1.4px';
    ctx.font = `600 10px ${HUD}`;
    for (const [name, q] of [['NASAL CAVITY', W(5.1, 12.75)], ['HARD PALATE', W(5.5, 10.72)], ['TONGUE', [X(geom.tongueCenter[0] - 0.2), Y(geom.tongueCenter[1] - 0.9)]], ['SPINE', W(-2.2, 6.2)]] as [string, [number, number]][]) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(name, q[0] + 0.8, q[1] + 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(name, q[0], q[1]);
    }
    ctx.letterSpacing = '0px';
    // on a line from the side, for the small ones
    const left: [string, [number, number]][] = [['SOFT PALATE', vm], ['PHARYNX', [X(ph[0]), Y(ph[1])]], ['EPIGLOTTIS', W(0.55, 5.35)], ['VOCAL FOLDS', [gx, gy]]];
    const right: [string, [number, number]][] = [['NOSTRIL', W(9.6, 11.15)], ['TEETH', [X(ue[0]), Y(ue[1] + 0.25)]], ['LIPS', [X(lf[0] - 0.15), Y(lf[1])]], ['JAW', W(7.0, 4.9)]];
    for (const [list, side] of [[left, 'left'], [right, 'right']] as [[string, [number, number]][], 'left' | 'right'][]) {
      for (const [name, q] of list) {
        if (face.focus && layers.guides && HANDLE_NAME[face.focus] === name) continue;
        notes.push({ text: name, ax: q[0], ay: q[1], y: q[1], side, colour: 'rgba(255,255,255,0.75)', sub: '', r: 0 });
      }
    }
  }

  // ---- how to move: where the part was at rest, an arrow to where it is, and its name
  if (face.focus && layers.guides) {
    const rg0 = restGeom();
    const still = { ...a, larynx: 0 };
    const chinNow = canonToWorld([8.45, 5.05], AN, still, chinWeight);
    const chinRest = canonToWorld([8.45, 5.05], AN, { ...REST_ART, larynx: 0 }, chinWeight);
    const lf = geom.landmarks.lipFront, ue = geom.landmarks.upperEdge, le = geom.landmarks.lowerEdge;
    const now: Record<Handle, [number, number]> = {
      lips: [lf[0] - 0.1, lf[1]], tip: geom.tipPoint, tongue: geom.tongueCenter, jaw: [chinNow[0], chinNow[1]],
      velum: velumTip(a, AN), larynx: [gl[0], gl[1]], teeth: [0.5 * (ue[0] + le[0]), 0.5 * (ue[1] + le[1])],
    };
    const was: Record<Handle, [number, number]> = {
      lips: [rg0.landmarks.lipFront[0] - 0.1, rg0.landmarks.lipFront[1]], tip: rg0.tipPoint, tongue: rg0.tongueCenter, jaw: [chinRest[0], chinRest[1]],
      velum: velumTip(REST_ART, AN), larynx: [gl[0], gl[1]], teeth: now.teeth,
    };
    const f = face.focus;
    const [fx, fy] = now[f];
    const cx = X(fx), cy = Y(fy);
    // the tongue where it rests, as a faint dashed line
    if (f === 'tip' || f === 'tongue') {
      const t0 = rg0.solids.find((s) => s.id === 'tongue');
      if (t0) {
        path(t0.pts);
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const [rx, ry] = was[f];
    if (f === 'lips') {
      const closed = geom.lipArea < CLOSED_AREA;
      if (closed) {
        // the lips press together
        arrow(ctx, cx - 0.2 * k, cy - 2.1 * k, cx - 0.2 * k, cy - 0.75 * k, C.move, time);
        arrow(ctx, cx - 0.2 * k, cy + 2.1 * k, cx - 0.2 * k, cy + 0.75 * k, C.move, time);
      } else if (a.lipTuck > 0.4) arrow(ctx, cx + 0.4 * k, cy - 2.0 * k, cx - 0.5 * k, cy - 0.6 * k, C.move, time);
      else if (a.lipProtrude > 0.3 || a.lipRound > 0.5) arrow(ctx, cx - 0.6 * k, cy, cx + 1.5 * k, cy, C.move, time);
      else if (Math.hypot(fx - rx, fy - ry) > 0.25) arrow(ctx, X(rx), Y(ry), cx, cy, C.move, time);
    } else if (f === 'jaw') {
      if (a.jaw - REST_ART.jaw > 0.15) arrow(ctx, X(rx), Y(ry) - 0.2 * k, cx, cy + 0.6 * k, C.move, time);
      else if (REST_ART.jaw - a.jaw > 0.1) arrow(ctx, cx, cy + 1.6 * k, cx, cy + 0.3 * k, C.move, time);
    } else if (f !== 'larynx' && f !== 'teeth' && Math.hypot(fx - rx, fy - ry) > 0.22) {
      arrow(ctx, X(rx), Y(ry), cx, cy, C.move, time);
    }
    // a ring on the part, and its name on a line
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    const r = (f === 'tongue' ? 0.55 : 0.4) * k * (1 + 0.12 * pulse);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.move;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    const front = f === 'lips' || f === 'jaw' || f === 'teeth';
    const ly = front ? Math.max(cy + 1.5 * k, Y(f === 'jaw' ? 3.4 : 5.4)) : f === 'larynx' ? cy - 1.6 * k : cy - (f === 'velum' ? 0.4 : 0.2) * k;
    notes.push({ text: HANDLE_NAME[f], ax: cx, ay: cy, y: ly, side: front ? 'right' : 'left', colour: C.move, sub: face.part ? PART_VERB[face.part] : '', r });
  }
  for (const side of ['left', 'right'] as const) {
    const list = notes.filter((q) => q.side === side).sort((u, v) => u.y - v.y);
    let last = -Infinity;
    for (const q of list) {
      const y = Math.min(h - 14, Math.max(q.y, last + 29, 16));
      last = y;
      callout(ctx, q.text, q.ax, q.ay, side === 'left' ? sideL : sideR, y, side, q.colour, q.sub, q.r);
    }
  }
}

// ---------------------------------------------------- the mouth in the mirror

interface Puff { x: number; y: number; vx: number; vy: number; life: number; r: number }
interface FrontMem { puffs: Puff[] }

const SKIN = { light: '#f0c7ae', base: '#dda88d', shade: '#b98268', deep: '#8a5746', dark: '#5e382d' };
const LIP_WORD: Record<LipState, string> = { closed: 'CLOSED', teeth: 'ON THE TOP TEETH', round: 'ROUNDED', spread: 'SPREAD', open: 'OPEN' };

/**
 * The mouth from the front. Nothing here is invented for the front view:
 * how far apart the lips are, how much of the top and bottom teeth shows,
 * where the tongue is behind them, how far the chin has dropped are all
 * measured on the side view's geometry (lipsOf), so the two pictures show
 * one and the same mouth.
 */
function drawFront(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number, face: Face, mem: FrontMem): void {
  ctx.clearRect(0, 0, w, h);
  const a = face.pose.art;
  const { geom, flow } = shapeOf(face.pose);
  const m = lipsOf(a, geom);
  const k = Math.max(w / 9.6, h / 13.2);
  const cx = w / 2;
  const y0 = h * 0.42; // the line where the lips meet at rest
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---- the measures of the mouth, in pixels
  const protr = Math.max(0, a.lipProtrude);
  const round = clamp01(a.lipRound);
  const spread = clamp01(-a.lipProtrude / 0.35);
  const tuck = clamp01(a.lipTuck);
  const closed = m.state === 'closed';
  const press = closed ? clamp01((-a.lipOpen - 0.1) / 0.25) : 0;
  const Yu = y0 - Math.max(-0.1, Math.min(0.35, m.lift)) * k;   // the lower border of the upper lip
  const gap = m.gap * k;
  const Yl = Yu + gap;                                          // the upper border of the lower lip
  const Tu = Yu + m.upperTeeth * k;                             // the edge of the top teeth
  const Tl = Yu + m.lowerTeeth * k;                             // the edge of the bottom teeth
  const Tt = Yu + m.tongueTop * k;                              // the top of the tongue's front
  const drop = Math.max(0, m.drop) * 0.9 * k;                   // the chin's drop
  const half = (m.width * k) / 2;                               // from the middle to a corner of the mouth
  // the lips stay together near the corners: the opening is narrower than the mouth until it opens wide
  const ho = closed ? half * 0.98 : Math.max(0.28 * k, half - (0.22 + 0.5 * round) * k) * Math.min(1, 0.6 + gap / (1.3 * k));
  const cornerY = closed ? Yu + 0.03 * k : Yu + Math.min(gap, 1.4 * k) * 0.42; // the corners sink a little as the mouth opens
  const tU = (0.5 + 0.3 * protr + 0.12 * round - 0.07 * spread - 0.06 * press) * k;                  // the height of the upper lip
  const tL = (0.76 + 0.36 * protr + 0.16 * round - 0.1 * spread - 0.08 * press - 0.3 * tuck) * k;    // and of the lower one
  const lowB = Yl + tL;
  const chinY = y0 + 3.55 * k + drop;

  // ---- the skin, lit from the upper left
  const sg = ctx.createRadialGradient(cx - 1.4 * k, y0 - 2.4 * k, 0.5 * k, cx, y0, 7.5 * k);
  sg.addColorStop(0, SKIN.light); sg.addColorStop(0.45, SKIN.base); sg.addColorStop(1, SKIN.shade);
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);

  // ---- the neck under the jaw, in shadow
  ctx.beginPath();
  ctx.moveTo(-10, y0 + 0.9 * k);
  ctx.bezierCurveTo(cx - 4.4 * k, y0 + 2.2 * k + drop * 0.6, cx - 2.6 * k, chinY + 0.35 * k, cx, chinY + 0.42 * k);
  ctx.bezierCurveTo(cx + 2.6 * k, chinY + 0.35 * k, cx + 4.4 * k, y0 + 2.2 * k + drop * 0.6, w + 10, y0 + 0.9 * k);
  ctx.lineTo(w + 10, h + 10); ctx.lineTo(-10, h + 10);
  ctx.closePath();
  const ng = ctx.createLinearGradient(0, chinY, 0, chinY + 4.5 * k);
  ng.addColorStop(0, SKIN.dark); ng.addColorStop(0.22, SKIN.deep); ng.addColorStop(1, SKIN.shade);
  ctx.fillStyle = ng;
  ctx.fill();
  // the larynx under the skin, and the voice in it
  const ly = chinY + 2.9 * k;
  const lg = ctx.createRadialGradient(cx - 0.2 * k, ly - 0.3 * k, 0, cx, ly, 1.3 * k);
  lg.addColorStop(0, 'rgba(240,199,174,0.5)'); lg.addColorStop(1, 'rgba(240,199,174,0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.ellipse(cx, ly, 0.9 * k, 1.3 * k, 0, 0, Math.PI * 2); ctx.fill();
  if (flow.voice > 0.08) {
    const g = ctx.createRadialGradient(cx, ly, 1, cx, ly, 1.7 * k);
    g.addColorStop(0, `rgba(255,178,36,${(0.85 * flow.voice).toFixed(2)})`); g.addColorStop(1, 'rgba(255,178,36,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, ly, 1.7 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.voice;
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const ph = (time * 2.2 + i / 2) % 1;
      ctx.globalAlpha = (1 - ph) * flow.voice;
      ctx.beginPath();
      ctx.arc(cx + s * 1.1 * k, ly, (0.4 + ph * 1.3) * k, s > 0 ? -0.7 : Math.PI - 0.7, s > 0 ? 0.7 : Math.PI + 0.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- the chin and the fold above it
  const cg = ctx.createRadialGradient(cx - 0.4 * k, chinY - 1.25 * k, 0, cx, chinY - 1.0 * k, 1.9 * k);
  cg.addColorStop(0, 'rgba(255,226,206,0.55)'); cg.addColorStop(1, 'rgba(255,226,206,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(cx, chinY - 1.0 * k, 1.9 * k, 1.3 * k, 0, 0, Math.PI * 2); ctx.fill();
  const fold = lowB + 0.42 * k;
  const fg = ctx.createRadialGradient(cx, fold, 0, cx, fold, 1.7 * k);
  fg.addColorStop(0, 'rgba(120,70,55,0.42)'); fg.addColorStop(1, 'rgba(120,70,55,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.ellipse(cx, fold, 1.7 * k, 0.5 * k, 0, 0, Math.PI * 2); ctx.fill();

  // ---- the nose from below, the groove under it, the folds beside the mouth
  const ny = y0 - 2.75 * k;
  const tipG = ctx.createRadialGradient(cx - 0.25 * k, ny - 0.75 * k, 0, cx, ny - 0.5 * k, 1.5 * k);
  tipG.addColorStop(0, 'rgba(255,232,214,0.7)'); tipG.addColorStop(1, 'rgba(255,232,214,0)');
  ctx.fillStyle = tipG;
  ctx.beginPath(); ctx.ellipse(cx, ny - 0.55 * k, 1.45 * k, 1.0 * k, 0, 0, Math.PI * 2); ctx.fill();
  for (const s of [-1, 1]) {
    // the wing of the nose and its nostril
    ctx.strokeStyle = 'rgba(120,70,55,0.5)';
    ctx.lineWidth = 0.09 * k;
    ctx.beginPath();
    ctx.moveTo(cx + s * 1.5 * k, ny - 0.85 * k);
    ctx.bezierCurveTo(cx + s * 1.95 * k, ny - 0.5 * k, cx + s * 1.75 * k, ny + 0.2 * k, cx + s * 1.15 * k, ny + 0.12 * k);
    ctx.stroke();
    const ng2 = ctx.createRadialGradient(cx + s * 0.72 * k, ny - 0.02 * k, 0, cx + s * 0.72 * k, ny - 0.02 * k, 0.5 * k);
    ng2.addColorStop(0, 'rgba(40,14,12,0.92)'); ng2.addColorStop(0.7, 'rgba(60,24,20,0.6)'); ng2.addColorStop(1, 'rgba(60,24,20,0)');
    ctx.fillStyle = ng2;
    ctx.beginPath(); ctx.ellipse(cx + s * 0.72 * k, ny - 0.02 * k, 0.5 * k, 0.26 * k, s * 0.35, 0, Math.PI * 2); ctx.fill();
    // the fold from the nose to beside the mouth: it deepens when the lips spread
    ctx.strokeStyle = `rgba(120,70,55,${(0.18 + 0.14 * spread).toFixed(2)})`;
    ctx.lineWidth = 0.22 * k;
    ctx.beginPath();
    ctx.moveTo(cx + s * 1.85 * k, ny + 0.1 * k);
    ctx.bezierCurveTo(cx + s * 2.9 * k, ny + 1.3 * k, cx + s * (half / k + 0.75) * k, y0 - 0.5 * k, cx + s * (half / k + 0.95) * k, cornerY + 1.0 * k + drop * 0.4);
    ctx.stroke();
  }
  // the groove between the nose and the lip
  const pg = ctx.createLinearGradient(cx - 0.55 * k, 0, cx + 0.55 * k, 0);
  pg.addColorStop(0, 'rgba(255,232,214,0.35)'); pg.addColorStop(0.5, 'rgba(120,70,55,0.28)'); pg.addColorStop(1, 'rgba(255,232,214,0.3)');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.moveTo(cx - 0.3 * k, ny + 0.3 * k);
  ctx.lineTo(cx + 0.3 * k, ny + 0.3 * k);
  ctx.lineTo(cx + 0.55 * k, Yu - tU * 0.9);
  ctx.lineTo(cx - 0.55 * k, Yu - tU * 0.9);
  ctx.closePath();
  ctx.fill();

  // ---- the shapes: the two lips and the opening between them
  const bow = Math.min(0.5 * k, half * 0.3);
  const ob = Math.min(bow, ho * 0.32);
  /** the upper edge of the opening, right to left: nearly straight, with the small bulge of the lip in the middle */
  const topEdge = () => {
    ctx.bezierCurveTo(cx + ho * 0.62, Yu - 0.01 * k, cx + ob * 1.1, Yu - 0.03 * k, cx, Yu + 0.06 * k);
    ctx.bezierCurveTo(cx - ob * 1.1, Yu - 0.03 * k, cx - ho * 0.62, Yu - 0.01 * k, cx - ho, cornerY);
  };
  /** the lower edge of the opening, left to right: a deeper curve, down to the lower lip */
  const bottomEdge = (y: number) => {
    ctx.bezierCurveTo(cx - ho * 0.72, y - 0.02 * k, cx - ho * 0.36, y, cx, y);
    ctx.bezierCurveTo(cx + ho * 0.36, y, cx + ho * 0.72, y - 0.02 * k, cx + ho, cornerY);
  };
  const upperLip = () => {
    ctx.beginPath();
    ctx.moveTo(cx - half, cornerY);
    ctx.bezierCurveTo(cx - half * 0.72, Yu - tU * 0.58, cx - bow * 1.6, Yu - tU * 1.02, cx - bow, Yu - tU);
    ctx.quadraticCurveTo(cx, Yu - tU * 0.74, cx + bow, Yu - tU);
    ctx.bezierCurveTo(cx + bow * 1.6, Yu - tU * 1.02, cx + half * 0.72, Yu - tU * 0.58, cx + half, cornerY);
    ctx.lineTo(cx + ho, cornerY);
    topEdge();
    ctx.closePath();
  };
  /** the top of the lower lip: at the opening's lower edge; tucked under the top teeth it rises to them */
  const lipTop = closed ? Yu + 0.06 * k : Yl;
  const lowerLip = () => {
    ctx.beginPath();
    ctx.moveTo(cx - half, cornerY);
    ctx.lineTo(cx - ho, cornerY);
    bottomEdge(lipTop);
    ctx.lineTo(cx + half, cornerY);
    ctx.bezierCurveTo(cx + half * 0.76, lowB * 0.62 + cornerY * 0.38, cx + half * 0.44, lowB, cx, lowB);
    ctx.bezierCurveTo(cx - half * 0.44, lowB, cx - half * 0.76, lowB * 0.62 + cornerY * 0.38, cx - half, cornerY);
    ctx.closePath();
  };
  const opening = () => {
    ctx.beginPath();
    ctx.moveTo(cx + ho, cornerY);
    topEdge();
    bottomEdge(lipTop);
    ctx.closePath();
  };
  // a soft shadow under the lower lip
  ctx.save();
  ctx.shadowColor = 'rgba(70,30,22,0.55)';
  ctx.shadowBlur = 0.5 * k;
  ctx.shadowOffsetY = 0.12 * k;
  lowerLip();
  ctx.fillStyle = '#b4555c';
  ctx.fill();
  ctx.restore();

  // ---- inside the mouth: the dark behind, the tongue, the teeth in front of it
  const tooth = (x: number, y: number, wpx: number, hpx: number, up: boolean, side: number) => {
    const r = wpx * 0.3;
    const eg = ctx.createLinearGradient(0, y, 0, y + hpx);
    if (up) { eg.addColorStop(0, '#d9d0be'); eg.addColorStop(0.4, '#f3eee1'); eg.addColorStop(1, '#fbf9f2'); }
    else { eg.addColorStop(0, '#f2ecde'); eg.addColorStop(1, '#cfc5b1'); }
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.roundRect(x + 0.5, y, wpx - 1, hpx, up ? [0, 0, r, r] : [r, r, 0, 0]); ctx.fill();
    // the teeth toward the sides turn away from the light
    ctx.fillStyle = `rgba(40,12,14,${((up ? 0.4 : 0.5) * side * side + (up ? 0 : 0.14)).toFixed(2)})`;
    ctx.beginPath(); ctx.roundRect(x + 0.5, y, wpx - 1, hpx, up ? [0, 0, r, r] : [r, r, 0, 0]); ctx.fill();
  };
  const upperTeeth = (clipTop: number) => {
    const widths = [0.52, 0.6, 0.68, 0.86, 0.86, 0.68, 0.6, 0.52];
    let tx = cx - (widths.reduce((s, x) => s + x, 0) * k) / 2;
    widths.forEach((tw, i) => {
      const side = Math.abs(i - 3.5) / 3.5;
      // the arch of the teeth curves away: the ones at the sides sit a little higher
      const edge = Tu - (0.05 + 0.16 * side * side) * k - (i === 2 || i === 5 ? -0.02 * k : 0);
      tooth(tx, clipTop, tw * k, Math.max(0, edge - clipTop), true, side);
      tx += tw * k;
    });
  };
  if (!closed) {
    ctx.save();
    opening();
    ctx.clip();
    const og = ctx.createRadialGradient(cx, lipTop - gap * 0.25, 0, cx, Yu + gap / 2, Math.max(ho, gap));
    og.addColorStop(0, '#3a0f12'); og.addColorStop(1, '#100304');
    ctx.fillStyle = og;
    ctx.fillRect(cx - ho - 4, Yu - 6, 2 * ho + 8, gap + 12);
    // the tongue: its top where the side view has it
    const top = Math.max(Yu - 0.2 * k, Tt);
    if (top < lipTop + 0.1 * k) {
      const tg = ctx.createLinearGradient(0, top, 0, lipTop + 0.3 * k);
      const under = m.curled; // curled back, the tongue shows its paler underside
      tg.addColorStop(0, under ? '#e6a3ad' : '#d98590'); tg.addColorStop(0.55, under ? '#cf8590' : '#c0636f'); tg.addColorStop(1, '#8f3a48');
      ctx.fillStyle = tg;
      const rx = Math.min(2.3 * k, ho * 0.92), ry = Math.max(0.5 * k, (lipTop - top) * 1.25 + 0.4 * k);
      ctx.beginPath();
      ctx.ellipse(cx, top + ry, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,35,50,0.45)';
      ctx.lineWidth = 0.06 * k;
      ctx.beginPath(); ctx.moveTo(cx, top + 0.12 * k); ctx.lineTo(cx, lipTop + 0.2 * k); ctx.stroke();
      const hl = ctx.createRadialGradient(cx - rx * 0.25, top + 0.22 * k, 0, cx - rx * 0.25, top + 0.22 * k, rx * 0.55);
      hl.addColorStop(0, 'rgba(255,222,226,0.32)'); hl.addColorStop(1, 'rgba(255,222,226,0)');
      ctx.fillStyle = hl;
      ctx.beginPath(); ctx.ellipse(cx - rx * 0.25, top + 0.24 * k, rx * 0.55, 0.2 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    // the bottom teeth, behind the lower lip up to their edge
    if (Tl < lipTop - 1) {
      const cw = [0.5, 0.52, 0.5, 0.5, 0.52, 0.5];
      let lx = cx - (cw.reduce((s, x) => s + x, 0) * k) / 2;
      cw.forEach((tw, i) => {
        const side = Math.abs(i - 2.5) / 2.5;
        const y = Tl + 0.1 * k * side * side;
        tooth(lx, y, tw * k, lipTop - y + 6, false, side);
        lx += tw * k;
      });
    }
    // the top teeth, hanging below the upper lip as far as the side view says
    if (Tu > Yu + 1) {
      ctx.fillStyle = '#b9616b'; // the gum above them, when the lip lifts off it
      ctx.fillRect(cx - ho, Yu - 4, 2 * ho, Math.max(0, Math.min(0.25 * k, (Tu - Yu) * 0.2)) + 4);
      upperTeeth(Yu - 3);
    }
    if (m.between) {
      // the tip out between the teeth: over their edges
      const bg = ctx.createLinearGradient(0, Tu - 0.2 * k, 0, Tu + 0.5 * k);
      bg.addColorStop(0, '#de8a95'); bg.addColorStop(1, '#b9596a');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.ellipse(cx, Tu + 0.06 * k, Math.min(1.05 * k, ho * 0.7), Math.max(0.2 * k, (Tl - Tu) * 0.5 + 0.16 * k), 0, 0, Math.PI * 2); ctx.fill();
    }
    // the shade the upper lip casts into the mouth
    const sh = ctx.createLinearGradient(0, Yu, 0, Yu + Math.min(gap, 0.45 * k));
    sh.addColorStop(0, 'rgba(20,4,6,0.5)'); sh.addColorStop(1, 'rgba(20,4,6,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - ho, Yu - 2, 2 * ho, Math.min(gap, 0.45 * k) + 2);
    ctx.restore();
  }

  // ---- the lips themselves
  const lipFill = (ya: number, yb: number, stops: [number, string][]) => {
    const g = ctx.createLinearGradient(0, ya, 0, yb);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  };
  upperLip();
  ctx.fillStyle = lipFill(Yu - tU, Yu + 0.1 * k, [[0, '#b9616a'], [0.55, '#a94e58'], [1, '#8f3c47']]);
  ctx.fill();
  lowerLip();
  ctx.fillStyle = lipFill(lipTop, lowB, [[0, '#a84c57'], [0.3, '#c66d76'], [0.7, '#c4666f'], [1, '#a04a55']]);
  ctx.fill();
  // the fine creases of the lips: they gather when the lips are pursed
  const creases = 0.2 + 0.25 * Math.max(round, protr);
  ctx.save();
  upperLip(); ctx.clip();
  ctx.strokeStyle = `rgba(90,30,40,${creases.toFixed(2)})`;
  ctx.lineWidth = 0.035 * k;
  for (let i = -7; i <= 7; i++) {
    const x = cx + (i / 7.5) * half * 0.92;
    ctx.beginPath(); ctx.moveTo(x, Yu - tU * 1.1); ctx.quadraticCurveTo(x - (i / 7.5) * 0.12 * k, Yu - tU * 0.5, x - (i / 7.5) * 0.22 * k, Yu + 0.1 * k); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  lowerLip(); ctx.clip();
  ctx.strokeStyle = `rgba(90,30,40,${(creases - 0.02).toFixed(2)})`;
  ctx.lineWidth = 0.035 * k;
  for (let i = -8; i <= 8; i++) {
    const x = cx + (i / 8.5) * half * 0.9;
    ctx.beginPath(); ctx.moveTo(x - (i / 8.5) * 0.2 * k, lipTop - 0.1 * k); ctx.quadraticCurveTo(x, (lipTop + lowB) / 2, x + (i / 8.5) * 0.1 * k, lowB + 0.1 * k); ctx.stroke();
  }
  // the light on the lower lip
  const hy = lipTop + (lowB - lipTop) * 0.42;
  const hg = ctx.createRadialGradient(cx - half * 0.18, hy, 0, cx - half * 0.18, hy, half * 0.62);
  hg.addColorStop(0, 'rgba(255,235,235,0.5)'); hg.addColorStop(1, 'rgba(255,235,235,0)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(cx - half * 0.18, hy, half * 0.62, Math.max(1, (lowB - lipTop) * 0.26), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // the line where the lips meet: across the whole mouth when it is closed, from the opening to the corners otherwise
  ctx.strokeStyle = 'rgba(70,18,26,0.8)';
  ctx.lineWidth = (0.06 + 0.03 * press) * k;
  ctx.beginPath();
  if (closed) {
    ctx.moveTo(cx + half, cornerY);
    ctx.bezierCurveTo(cx + half * 0.62, Yu + 0.02 * k, cx + bow * 1.1, Yu - 0.01 * k, cx, Yu + 0.07 * k);
    ctx.bezierCurveTo(cx - bow * 1.1, Yu - 0.01 * k, cx - half * 0.62, Yu + 0.02 * k, cx - half, cornerY);
  } else {
    ctx.moveTo(cx - half, cornerY); ctx.lineTo(cx - ho, cornerY);
    ctx.moveTo(cx + ho, cornerY); ctx.lineTo(cx + half, cornerY);
  }
  ctx.stroke();
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(cx + s * half, cornerY, 0, cx + s * half, cornerY, 0.42 * k);
    g.addColorStop(0, 'rgba(70,25,25,0.55)'); g.addColorStop(1, 'rgba(70,25,25,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx + s * half, cornerY, 0.42 * k, 0, Math.PI * 2); ctx.fill();
  }
  if (tuck > 0.3 && !closed) {
    // the top teeth rest on the lower lip: their edges in front of it
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - Math.min(ho, 1.5 * k), Yu - 2, 2 * Math.min(ho, 1.5 * k), Tu - Yu + 0.14 * k);
    ctx.clip();
    upperTeeth(Yu - 3);
    ctx.restore();
  }

  // ---- a close-up in a pool of light: the picture darkens toward its edges
  ctx.save();
  ctx.translate(cx, h * 0.46);
  ctx.scale(1, h / w);
  const mg = ctx.createRadialGradient(0, 0, w * 0.34, 0, 0, w * 0.86);
  mg.addColorStop(0, 'rgba(10,6,6,0)'); mg.addColorStop(0.6, 'rgba(10,6,6,0.42)'); mg.addColorStop(1, 'rgba(10,6,6,0.88)');
  ctx.fillStyle = mg;
  ctx.fillRect(-w, -w, 2 * w, 2 * w);
  ctx.restore();

  // ---- the air out of the mouth and of the nose, as fine streaks
  const ps = mem.puffs;
  if (flow.mouth > 0.08 && !closed) {
    const rate = 30 * flow.mouth * (1 - 0.55 * flow.voice);
    if (Math.random() < rate * dt) {
      const speed = (2.2 + 5 * flow.mouth * (1 - 0.5 * flow.voice)) * k;
      ps.push({ x: cx + (Math.random() - 0.5) * ho * 1.2, y: Yu + gap * (0.3 + 0.4 * Math.random()), vx: (Math.random() - 0.5) * 1.4 * k, vy: speed * (0.6 + 0.4 * Math.random()), life: 1, r: 0.5 + Math.random() });
    }
  }
  if (flow.nose > 0.08 && Math.random() < 18 * flow.nose * dt) {
    const s = Math.random() < 0.5 ? -1 : 1;
    ps.push({ x: cx + s * 0.72 * k, y: ny + 0.1 * k, vx: s * 0.5 * k, vy: 1.6 * k, life: 1, r: 0.5 });
  }
  ctx.strokeStyle = flow.voice > 0.3 ? 'rgba(255,214,140,0.9)' : 'rgba(217,244,255,0.9)';
  ctx.lineCap = 'round';
  for (let i = ps.length - 1; i >= 0; i--) {
    const q = ps[i];
    q.life -= dt * 1.7;
    if (q.life <= 0) { ps.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    ctx.globalAlpha = 0.7 * q.life;
    ctx.lineWidth = 1 + q.r;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.09, q.y - q.vy * 0.09); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (ps.length > 160) ps.splice(0, ps.length - 160);

  // ---- what the lips are doing, in a word, and the way they move
  chip(ctx, 'LIPS', w - 8, 20, C.move, 'right', w < 190 && m.state === 'teeth' ? 'ON TEETH' : LIP_WORD[m.state]);
  if (layers.guides) {
    if (m.state === 'closed') {
      arrow(ctx, cx, Yu - tU - 1.5 * k, cx, Yu - tU - 0.2 * k, C.move, time);
      arrow(ctx, cx, lowB + 1.5 * k, cx, lowB + 0.2 * k, C.move, time);
    } else if (m.state === 'round') {
      for (const s of [-1, 1]) arrow(ctx, cx + s * (half + 1.7 * k), cornerY, cx + s * (half + 0.3 * k), cornerY, C.move, time);
    } else if (m.state === 'spread') {
      for (const s of [-1, 1]) arrow(ctx, cx + s * (half - 0.5 * k), cornerY - 0.9 * k, cx + s * (half + 0.9 * k), cornerY - 1.1 * k, C.move, time);
    } else if (m.state === 'teeth') {
      arrow(ctx, cx, lowB + 1.5 * k, cx, lowB + 0.2 * k, C.move, time);
    } else if (m.gap > 1.2) {
      arrow(ctx, cx, chinY - 1.6 * k, cx, chinY - 0.3 * k, C.move, time);
    }
  }
  if (flow.voice > 0.3) chip(ctx, 'VOICE', cx, Math.min(h - 24, ly + 2.2 * k), C.voice, 'center', 'ON');
  else if (flow.breath > 0.25) chip(ctx, 'VOICE', cx, Math.min(h - 24, ly + 2.2 * k), C.air, 'center', 'OFF');
  if (flow.nose > 0.3) chip(ctx, 'AIR', cx, ny + 1.1 * k, C.air, 'center', 'NOSE');
}

/** One of the two pictures, redrawn every frame from the face it is given. */
export function FaceCanvas({ kind, face, label }: { kind: 'side' | 'front'; face: () => Face | null; label: string }) {
  const side = useRef<SideMem>({ dots: [], spawn: 0, wasBlocked: false, burst: 0, frame: null, layer: null, skin: null, gap: 1 / 60, coarse: false });
  const front = useRef<FrontMem>({ puffs: [] });
  const over = useRef<HTMLCanvasElement | null>(null);
  const skinHost = useRef<HTMLDivElement | null>(null);
  const ref = useAnimatedCanvas(({ ctx, w, h, t, dt, dpr }) => {
    const f = face();
    if (kind !== 'side') {
      if (!f) ctx.clearRect(0, 0, w, h); else drawFront(ctx, w, h, t, dt, f, front.current);
      return;
    }
    // the canvas over the skin has the size of the one under it
    const oc = over.current, top = oc?.getContext('2d');
    if (!oc || !top) return;
    if (oc.width !== ctx.canvas.width || oc.height !== ctx.canvas.height) { oc.width = ctx.canvas.width; oc.height = ctx.canvas.height; }
    top.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!f) { ctx.clearRect(0, 0, w, h); top.clearRect(0, 0, w, h); return; }
    drawSide(ctx, top, skinHost.current, w, h, dpr, t, dt, f, side.current);
  });
  if (kind !== 'side') return <canvas ref={ref} className={`face-canvas face-${kind}`} role="img" aria-label={label} />;
  return (
    <div className="face-stack">
      <canvas ref={ref} className="face-canvas face-side" role="img" aria-label={label} />
      <div ref={skinHost} className="face-skin" aria-hidden="true" />
      <canvas ref={over} className="face-canvas face-over" aria-hidden="true" />
    </div>
  );
}

// handy for debugging in the browser console during development
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { tutorLayers: setLayers });
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { tutorAnatomy: (o: Partial<typeof anatomyDev>) => Object.assign(anatomyDev, o) });
