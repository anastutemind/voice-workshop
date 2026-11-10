import { useRef, useState } from 'react';
import { store, useUi, FieldMode } from '../store';
import { useT, useL } from '../i18n';
import { voice } from '../voice/voice';
import { useSoundOn, useVoice } from '../voice/hooks';
import type { ControlId } from '../voice/controls';
import { lockText } from './DriverBar';
import { useAnimatedCanvas, C, fieldColor, label } from '../canvas';
import {
  canonToWorld, tongueOffsetFromWorld, tipOffsetFromWorld, velumFromWorld, velumTip, GEOMETRY_CONST, TractGeometry, Solid,
} from '../../dsp/tract/geometry';
import { Anatomy, Articulators, ARTICULATOR_RANGES, Teeth } from '../../dsp/tract/types';
import { N_SECTIONS } from '../../dsp/tract/areaFunction';
import type { Telemetry } from '../../dsp/engine/engine';
import { HEAD_BACK, HEAD_FRONT_UP, CHIN, NASAL_CENTRE, NASAL_HALF, chinWeight } from '../head/outline';
import { headScene, mul, Mat, HeadScene } from '../head/scene';
import { getBackdrop, paintGlow, fadeNeck } from '../head/painter';
import { paintHead } from '../tutor/faces';

type HandleId = 'tongue' | 'tip' | 'jaw' | 'lips' | 'velum' | 'larynx' | 'teeth';

/** A hint on the head: which handle to drag and what to do, until it is dragged. A new
 *  `id` shows it again. */
export interface Guide { id: string; handle: HandleId; text: string }

/** Where the hint sits (world cm, at the scale of a man's head): above the face. */
const GUIDE_AT: [number, number] = [9.0, 15.4];

/** The control each handle moves (it is locked while someone else drives it). */
const HANDLE_CONTROL: Record<HandleId, ControlId> = { tongue: 'posture', tip: 'posture', jaw: 'posture', lips: 'posture', larynx: 'posture', velum: 'velum', teeth: 'teeth' };

interface Particle { s: number; off: number; nose: boolean; age: number }

const clampArt = (k: keyof Articulators, v: number) => Math.max(ARTICULATOR_RANGES[k][0], Math.min(ARTICULATOR_RANGES[k][1], v));

export function HeadView({ guide }: { guide?: Guide } = {}) {
  const t = useT();
  const L = useL();
  const ui = useUi();
  const sound = useSoundOn();
  const postureLock = useVoice((v) => v.lock('posture'));
  const [labels, setLabels] = useState(true);
  // the hint that was followed: it stays hidden until another one comes
  const followed = useRef<string | null>(null);
  const drag = useRef<{ id: HandleId; x0: number; y0: number; a0: Articulators; t0: Teeth; ang0: number } | null>(null);
  const hover = useRef<HandleId | null>(null);
  const view = useRef({ ox: 0, oy: 0, k: 1 });
  const handles = useRef<Record<HandleId, [number, number]>>({} as Record<HandleId, [number, number]>);
  const parts = useRef<Particle[]>([]);
  const sparks = useRef<{ x: number; y: number; vx: number; vy: number; life: number; c: string }[]>([]);
  // the painted head on a layer of its own, painted again only when the posture or the view changes
  const layer = useRef<{ cv: HTMLCanvasElement; key: string; sc: HeadScene | null }>({ cv: document.createElement('canvas'), key: '', sc: null });

  const ref = useAnimatedCanvas(({ ctx, w, h, dt, t: time, dpr }) => {
    // what sounds: a sentence or a clip moves the head by itself
    const p = voice.sounding();
    const an = p.anatomy;
    const a = p.articulators;
    const { geom } = store.derived();
    const tel = store.ui.audioOn ? store.telemetry : null;
    const s = an.scale * 0.9;
    // fixed frame (for scale 1) so a child's head looks smaller; a tall view shows the whole head
    const X0 = -5.4, X1 = 11.8, Y0 = -3.4;
    let Y1 = 16.8;
    if (h / w > (Y1 - Y0) / (X1 - X0)) Y1 = Math.min(19.9, Y0 + (h / w) * (X1 - X0));
    const k = Math.min(w / (X1 - X0), h / (Y1 - Y0));
    const ox = (w - (X1 - X0) * k) / 2 - X0 * k;
    const oy = h - ((h - (Y1 - Y0) * k) / 2) + Y0 * k;
    view.current = { ox, oy, k };
    const X = (x: number) => ox + x * k;
    const Y = (y: number) => oy - y * k;
    const path = (pts: number[], close = true) => {
      ctx.beginPath();
      ctx.moveTo(X(pts[0]), Y(pts[1]));
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(X(pts[i]), Y(pts[i + 1]));
      if (close) ctx.closePath();
    };

    // background
    const bg = ctx.createRadialGradient(w * 0.55, h * 0.45, 10, w * 0.55, h * 0.45, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#141a26');
    bg.addColorStop(1, C.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const nc = canonToWorld(NASAL_CENTRE, an, a);
    const nasalFlow = tel ? Math.min(1, Math.abs(tel.uNose) / 250) : 0;
    const port = tel ? tel.nasalPort : 0;
    const bd = getBackdrop();
    if (bd) {
      // the painted head, with everything that bounds the air drawn from the geometry
      const world: Mat = mul([dpr, 0, 0, dpr, 0, 0], [k, 0, 0, -k, ox, oy]);
      const lay = layer.current;
      const key = JSON.stringify([w, h, dpr, a, an, p.teeth]);
      if (lay.key !== key || !lay.sc) {
        const cw = ctx.canvas.width, ch = ctx.canvas.height;
        if (lay.cv.width !== cw || lay.cv.height !== ch) { lay.cv.width = cw; lay.cv.height = ch; }
        const lc = lay.cv.getContext('2d')!;
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.clearRect(0, 0, cw, ch);
        lay.sc = headScene(geom, an, a);
        paintHead(lc, lay.sc, world, bd, geom, a);
        fadeNeck(lc, lay.sc, world);
        // the crown fades into the top edge instead of being cut by it
        const top = lc.createLinearGradient(0, 0, 0, 36 * dpr);
        top.addColorStop(0, 'rgba(0,0,0,1)');
        top.addColorStop(1, 'rgba(0,0,0,0)');
        lc.globalCompositeOperation = 'destination-out';
        lc.fillStyle = top;
        lc.fillRect(0, 0, cw, 36 * dpr);
        lc.globalCompositeOperation = 'source-over';
        lay.key = key;
      }
      const sc = lay.sc;
      // the air first, coloured by the sound field; then the painted head over it, with the air cut out of it:
      // the tongue, the teeth and the lips keep their own outlines, the straight steps of the grid never cut them
      drawChannel(ctx, geom, X, Y, store.ui.field, tel);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(lay.cv, 0, 0);
      paintGlow(ctx, sc, world, port > 0.02 ? Math.min(1, port / 1.2) * (0.35 + 0.65 * nasalFlow) : 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      paintFlat(ctx, geom, an, a, X, Y, path, k, s, tel, nc, port, nasalFlow);
    }

    // glottis pulse
    const gl = geom.landmarks.glottis;
    const voicing = tel ? tel.voicingAmp : 0;
    if (voicing > 0.02) {
      const f0 = tel?.f0 || 120;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2 * Math.PI * Math.min(6, f0 / 30));
      const rg = ctx.createRadialGradient(X(gl[0]), Y(gl[1]), 1, X(gl[0]), Y(gl[1]), (0.9 + 0.4 * pulse) * k);
      rg.addColorStop(0, `rgba(246,168,35,${0.75 * voicing})`);
      rg.addColorStop(1, 'rgba(246,168,35,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(X(gl[0]), Y(gl[1]), (0.9 + 0.4 * pulse) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // vocal folds (two small wedges)
    {
      const open = tel ? Math.min(1, tel.glottalArea / 0.25) : 0.3;
      ctx.fillStyle = C.amber;
      const gx = X(gl[0]), gy = Y(gl[1]);
      const gw = 0.42 * k * s;
      ctx.beginPath();
      ctx.moveTo(gx - gw, gy - 2); ctx.lineTo(gx - 1 - open * 2.5, gy); ctx.lineTo(gx - gw, gy + 2); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(gx + gw, gy - 2); ctx.lineTo(gx + 1 + open * 2.5, gy); ctx.lineTo(gx + gw, gy + 2); ctx.closePath(); ctx.fill();
    }

    // airflow particles
    drawParticles(ctx, geom, X, Y, s, tel, parts.current, dt, nc);

    // turbulence sparkles
    if (tel) emitSparks(geom, tel, sparks.current, s);
    const sp = sparks.current;
    for (let i = sp.length - 1; i >= 0; i--) {
      const q = sp[i];
      q.life -= dt * 2.2;
      if (q.life <= 0) { sp.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = q.c.replace('A', (0.9 * q.life).toFixed(2));
      ctx.beginPath();
      ctx.arc(X(q.x), Y(q.y), 1.2 + 1.6 * q.life, 0, Math.PI * 2);
      ctx.fill();
    }

    // handles
    const lipFront = geom.landmarks.lipFront;
    const ue = geom.landmarks.upperEdge, le = geom.landmarks.lowerEdge;
    const chinPt = canonToWorld([8.45, 5.05], { ...an, pharynx: 1 }, { ...a, larynx: 0 }, chinWeight);
    const H: Record<HandleId, [number, number]> = {
      tongue: geom.tongueCenter,
      tip: geom.tipPoint,
      jaw: [chinPt[0], chinPt[1]],
      lips: [lipFront[0] + 0.35 * s, lipFront[1] - 0.12 * s],
      velum: velumTip(a, an),
      larynx: [gl[0] + 1.6 * s, gl[1] - 0.2 * s],
      teeth: [0.5 * (ue[0] + le[0]) + 0.05, 0.5 * (ue[1] + le[1])],
    };
    handles.current = H;
    // the hint, until its handle is dragged (and not while someone else drives it)
    const guided = guide && followed.current !== guide.id && !voice.lock(HANDLE_CONTROL[guide.handle]) ? guide : null;
    const names: Record<HandleId, string> = { tongue: t('hTongue'), tip: t('hTip'), jaw: t('hJaw'), lips: t('hLips'), velum: t('hVelum'), larynx: t('hLarynx'), teeth: t('hTeeth') };
    const col: Record<HandleId, string> = { tongue: C.teal, tip: C.teal, jaw: C.teal, lips: C.teal, velum: C.teal, larynx: C.amber, teeth: C.teal };
    for (const id of Object.keys(H) as HandleId[]) {
      const [hx, hy] = H[id];
      // a handle someone else drives is hollow and grey
      const locked = !!voice.lock(HANDLE_CONTROL[id]);
      const active = !locked && (drag.current?.id === id || hover.current === id);
      const c = locked ? C.muted : col[id];
      ctx.save();
      if (!locked) { ctx.shadowColor = c; ctx.shadowBlur = active ? 16 : 9; }
      ctx.beginPath();
      ctx.arc(X(hx), Y(hy), active ? 9 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = active ? c : locked ? 'rgba(11,14,20,0.2)' : 'rgba(8,20,24,0.7)';
      ctx.fill();
      ctx.lineWidth = locked ? 1.5 : 2.2;
      if (locked) ctx.setLineDash([2.5, 2.5]);
      ctx.strokeStyle = c;
      ctx.stroke();
      ctx.restore();
      if ((labels || active) && guided?.handle !== id) {
        const dxl = id === 'larynx' ? 34 : id === 'lips' || id === 'jaw' ? 30 : 0;
        const dyl = id === 'larynx' || id === 'lips' || id === 'jaw' ? 0 : -16;
        label(ctx, names[id], X(hx) + dxl, Y(hy) + dyl, c);
      }
    }
    if (id_larynxLine) {
      ctx.strokeStyle = 'rgba(246,168,35,0.45)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(gl[0]), Y(gl[1])); ctx.lineTo(X(H.larynx[0]), Y(H.larynx[1])); ctx.stroke();
      ctx.setLineDash([]);
    }
    // the hint: the handle to drag, a curved arrow to it and what to do
    if (guided) drawGuide(ctx, guided.text, X(H[guided.handle][0]), Y(H[guided.handle][1]), X(GUIDE_AT[0]), Y(GUIDE_AT[1]), w, h, time);

    // phone being spoken
    if (tel?.phone) label(ctx, `/${tel.phone}/`, w - 40, 22, C.amber);
  });

  const toWorld = (e: React.PointerEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const v = view.current;
    return [(e.clientX - r.left - v.ox) / v.k, (v.oy - (e.clientY - r.top)) / v.k] as [number, number];
  };
  const hit = (x: number, y: number): HandleId | null => {
    let best: HandleId | null = null, bd = 0.7 * Math.max(0.6, voice.sounding().anatomy.scale);
    for (const id of Object.keys(handles.current) as HandleId[]) {
      const [hx, hy] = handles.current[id];
      const d = Math.hypot(hx - x, hy - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  };
  const onDown = (e: React.PointerEvent) => {
    const [x, y] = toWorld(e);
    const id = hit(x, y);
    if (!id || voice.lock(HANDLE_CONTROL[id])) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (guide?.handle === id) followed.current = guide.id;
    // the drag starts from the posture you see, and gives it air if the audio runs
    voice.grab({ blow: true });
    const J = store.derived().geom.landmarks.jawPivot;
    const m = voice.manual;
    drag.current = { id, x0: x, y0: y, a0: { ...m.articulators }, t0: { ...m.teeth }, ang0: Math.atan2(y - J[1], x - J[0]) };
  };
  const onMove = (e: React.PointerEvent) => {
    const [x, y] = toWorld(e);
    const d = drag.current;
    if (!d) {
      const h = hit(x, y);
      if (h !== hover.current) {
        hover.current = h;
        const el = e.target as HTMLElement;
        const lk = h ? voice.lock(HANDLE_CONTROL[h]) : null;
        el.style.cursor = !h ? 'default' : lk ? 'not-allowed' : 'grab';
        el.title = lk ? L(lockText(lk)) : '';
      }
      return;
    }
    const an = voice.manual.anatomy;
    const setArt = (o: Partial<Articulators>) => voice.edit((q) => { Object.assign(q.articulators, o); });
    const s = an.scale * 0.9;
    const a0 = d.a0;
    const dx = x - d.x0, dy = y - d.y0;
    switch (d.id) {
      case 'tongue': {
        const o = tongueOffsetFromWorld(x, y, a0, an);
        setArt({ tongueX: clampArt('tongueX', o.tongueX), tongueY: clampArt('tongueY', o.tongueY) });
        break;
      }
      case 'tip': {
        const o = tipOffsetFromWorld(x, y, a0, an);
        setArt({ tipX: clampArt('tipX', o.tipX), tipY: clampArt('tipY', o.tipY) });
        break;
      }
      case 'jaw': {
        const J = store.derived().geom.landmarks.jawPivot;
        const ang = Math.atan2(y - J[1], x - J[0]);
        setArt({ jaw: clampArt('jaw', a0.jaw + (d.ang0 - ang) / GEOMETRY_CONST.JAW_MAX) });
        break;
      }
      case 'lips': {
        const r = clampArt('lipRound', a0.lipRound + dx / (0.9 * s));
        setArt({ lipOpen: clampArt('lipOpen', a0.lipOpen - dy / s), lipRound: r, lipProtrude: clampArt('lipProtrude', a0.lipProtrude + dx / (0.9 * s)) });
        break;
      }
      case 'velum': setArt({ velum: velumFromWorld(x, y, an) }); break;
      case 'larynx': setArt({ larynx: clampArt('larynx', a0.larynx + dy / an.scale) }); break;
      case 'teeth':
        voice.edit((p) => {
          p.teeth.slitOpen = Math.max(-0.15, Math.min(0.8, d.t0.slitOpen - dy / s));
          p.teeth.advance = Math.max(-0.3, Math.min(0.4, d.t0.advance + dx / s));
        });
        break;
    }
  };
  const onUp = () => { drag.current = null; voice.letGo(); };

  const fields: [FieldMode, string][] = [['pressure', t('fieldPressure')], ['velocity', t('fieldVelocity')], ['air', t('fieldAir')]];
  return (
    <div className="head-view">
      <canvas ref={ref} className="fill" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div className="overlay-top">
        <div className="seg">
          {fields.map(([id, name]) => (
            <button key={id} className={ui.field === id ? 'on' : ''} onClick={() => store.setUi({ field: id })}>{name}</button>
          ))}
        </div>
        <button className={labels ? 'chip on' : 'chip'} onClick={() => setLabels(!labels)}>Aa</button>
      </div>
      <div className="overlay-bottom hint">
        {postureLock ? <span className="locked-note">{L(lockText(postureLock, 'head'))}</span>
          : !sound ? <span className="sound-note">{L({ it: 'In silenzio: premi «▶ Suono» o trascina una maniglia per sentirla.', en: 'Silent: press “▶ Sound” or drag a handle to hear it.' })}</span>
          : t('headHint')}
      </div>
    </div>
  );
}

const id_larynxLine = true;

/**
 * The hint of the Learn mode: a ring breathing around the handle at (hx, hy), a pill
 * with the text near (gx, gy), kept inside the w x h canvas, and a curved arrow from
 * the pill down to the handle (all in CSS pixels).
 */
function drawGuide(ctx: CanvasRenderingContext2D, text: string, hx: number, hy: number, gx: number, gy: number, w: number, h: number, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(246,168,35,${(0.35 + 0.5 * pulse).toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, hy, 12 + 5 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = '600 13px system-ui, sans-serif';
  const pw = ctx.measureText(text).width + 24, ph = 26;
  const px = Math.max(8, Math.min(w - pw - 8, gx - pw / 2));
  const py = Math.max(8, Math.min(h - ph - 8, gy - ph / 2));
  // the arrow leaves the pill downwards and bends towards the handle
  const sx = Math.max(px + 14, Math.min(px + pw - 14, hx + 0.35 * (px + pw / 2 - hx))), sy = py + ph;
  const d = Math.hypot(hx - sx, hy - sy) || 1;
  const ex = hx + ((sx - hx) / d) * 20, ey = hy + ((sy - hy) / d) * 20;
  const cx = sx, cy = ey;
  const ang = Math.hypot(ex - cx, ey - cy) > 1 ? Math.atan2(ey - cy, ex - cx) : Math.atan2(ey - sy, ex - sx);
  const arrow = () => {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.moveTo(ex - 9 * Math.cos(ang - 0.45), ey - 9 * Math.sin(ang - 0.45));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - 9 * Math.cos(ang + 0.45), ey - 9 * Math.sin(ang + 0.45));
  };
  if (Math.hypot(ex - sx, ey - sy) > 24) {
    arrow();
    ctx.strokeStyle = 'rgba(11,14,20,0.6)';
    ctx.lineWidth = 5;
    ctx.stroke();
    arrow();
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, ph / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1a1206';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px + pw / 2, py + ph / 2 + 0.5);
  ctx.restore();
}

/** The plain drawing, while the painted head loads (or if it cannot). */
function paintFlat(
  ctx: CanvasRenderingContext2D, geom: TractGeometry, an: Anatomy, a: Articulators, X: (x: number) => number, Y: (y: number) => number,
  path: (pts: number[], close?: boolean) => void, k: number, s: number, tel: Telemetry | null, nc: number[], port: number, nasalFlow: number,
): void {
  // head silhouette
  const back = canonToWorld(HEAD_BACK, { ...an, pharynx: 1 }, { ...a, larynx: 0 });
  const frontUp = canonToWorld(HEAD_FRONT_UP, an, a);
  const chin = canonToWorld(CHIN, { ...an, pharynx: 1 }, { ...a, larynx: 0 }, chinWeight);
  const silhouette = [...back, ...frontUp, ...chin];
  const sk = ctx.createLinearGradient(X(-5), 0, X(10), 0);
  sk.addColorStop(0, '#1a1622');
  sk.addColorStop(0.6, '#2a2130');
  sk.addColorStop(1, '#3a2836');
  path(silhouette);
  ctx.fillStyle = sk;
  ctx.fill();
  ctx.strokeStyle = 'rgba(247,112,138,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // eye and ear (decorative)
  const eye = canonToWorld([7.4, 15.9], an, a);
  ctx.strokeStyle = 'rgba(231,235,243,0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(X(eye[0]), Y(eye[1]), 0.55 * k * s, 0.22 * k * s, 0, Math.PI * 0.05, Math.PI * 0.95);
  ctx.stroke();
  const ear = canonToWorld([-2.6, 13.4], an, a);
  ctx.beginPath();
  ctx.ellipse(X(ear[0]), Y(ear[1]), 0.9 * k * s, 1.5 * k * s, -0.15, 0, Math.PI * 2);
  ctx.stroke();

  // vertebrae (decorative)
  ctx.fillStyle = 'rgba(216,210,194,0.07)';
  for (let i = 0; i < 6; i++) {
    const v = canonToWorld([-2.9, -2.6 + i * 1.9, -1.7, -1.1 + i * 1.9], an, a);
    ctx.beginPath();
    ctx.roundRect(X(v[0]), Y(v[3]), (v[2] - v[0]) * k, (v[3] - v[1]) * k, 4);
    ctx.fill();
  }

  // nasal cavity
  const up: number[] = [], lo: number[] = [];
  for (let i = 0; i < NASAL_HALF.length; i++) {
    const j = Math.min(NASAL_HALF.length - 2, i);
    const dx = nc[2 * j + 2] - nc[2 * j], dy = nc[2 * j + 3] - nc[2 * j + 1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const hw = NASAL_HALF[i] * s;
    up.push(nc[2 * i] + nx * hw, nc[2 * i + 1] + ny * hw);
    lo.unshift(nc[2 * i + 1] - ny * hw);
    lo.unshift(nc[2 * i] - nx * hw);
  }
  path([...up, ...lo]);
  ctx.fillStyle = '#06080d';
  ctx.fill();
  if (port > 0.02) {
    ctx.fillStyle = `rgba(42,212,189,${0.1 + 0.45 * Math.min(1, port / 1.2) * (0.35 + 0.65 * nasalFlow)})`;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,107,124,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // turbinates
  ctx.strokeStyle = 'rgba(200,107,124,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const c0 = canonToWorld([3.0 + i * 1.6, 12.95 + 0.05 * i], an, a);
    ctx.beginPath();
    ctx.ellipse(X(c0[0]), Y(c0[1]), 0.75 * k * s, 0.16 * k * s, 0.06, 0, Math.PI * 2);
    ctx.stroke();
  }

  // vocal tract air channel coloured by the sound field
  drawChannel(ctx, geom, X, Y, store.ui.field, tel);

  // solids (the soft tissue behind and below the tract is clipped to the head)
  for (const sol of geom.solids) {
    const soft = sol.id === 'wall' || sol.id === 'larynx' || sol.id === 'floor';
    if (soft) { ctx.save(); path(silhouette); ctx.clip(); }
    drawSolid(ctx, sol, path, X, s);
    if (soft) ctx.restore();
  }
}

function drawSolid(ctx: CanvasRenderingContext2D, sol: Solid, path: (pts: number[], close?: boolean) => void, X: (x: number) => number, s: number): void {
  const pts = sol.pts;
  path(pts);
  switch (sol.id) {
    case 'tongue': {
      const g = ctx.createLinearGradient(X(sol.minX), 0, X(sol.maxX), 0);
      g.addColorStop(0, '#f08aa0'); g.addColorStop(1, '#a8445e');
      ctx.fillStyle = g; break;
    }
    case 'upperIncisor': case 'lowerIncisor': ctx.fillStyle = C.tooth; break;
    case 'palate': ctx.fillStyle = '#cdbfa6'; break;
    case 'velum': ctx.fillStyle = '#c4687d'; break;
    case 'upperLip': case 'lowerLip': ctx.fillStyle = C.lip; break;
    case 'wall': {
      const g = ctx.createLinearGradient(X(-2.4 * s), 0, X(-0.45 * s), 0);
      g.addColorStop(0, 'rgba(120,60,80,0)'); g.addColorStop(0.55, 'rgba(150,72,94,0.35)'); g.addColorStop(1, '#a24f66');
      ctx.fillStyle = g; break;
    }
    case 'larynx': {
      const g = ctx.createLinearGradient(X(0.4 * s), 0, X(2.6 * s), 0);
      g.addColorStop(0, '#a24f66'); g.addColorStop(1, 'rgba(120,60,80,0)');
      ctx.fillStyle = g; break;
    }
    case 'floor': ctx.fillStyle = 'rgba(147,72,92,0.75)'; break;
  }
  ctx.fill();
  if (sol.id === 'upperIncisor' || sol.id === 'lowerIncisor') { ctx.strokeStyle = '#b9b09b'; ctx.lineWidth = 1; ctx.stroke(); }
  else if (sol.id === 'tongue' || sol.id === 'upperLip' || sol.id === 'lowerLip' || sol.id === 'velum') { ctx.strokeStyle = 'rgba(255,220,225,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
}

function rayPoints(geom: TractGeometry, i: number): [number, number, number, number] {
  const r = geom.rays[i], h = geom.hits[i];
  return [r.sx + r.nx * (r.t0 + h.tLow), r.sy + r.ny * (r.t0 + h.tLow), r.sx + r.nx * (r.t0 + h.tUp), r.sy + r.ny * (r.t0 + h.tUp)];
}

function drawChannel(ctx: CanvasRenderingContext2D, geom: TractGeometry, X: (x: number) => number, Y: (y: number) => number, mode: FieldMode, tel: Telemetry | null): void {
  const n = geom.lastRay;
  // dark air first
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const q = rayPoints(geom, i); if (i === 0) ctx.moveTo(X(q[0]), Y(q[1])); else ctx.lineTo(X(q[0]), Y(q[1])); }
  for (let i = n; i >= 0; i--) { const q = rayPoints(geom, i); ctx.lineTo(X(q[2]), Y(q[3])); }
  ctx.closePath();
  ctx.fillStyle = '#05070c';
  ctx.fill();
  const L = geom.length;
  for (let i = 0; i < n; i++) {
    const h = geom.hits[i], h2 = geom.hits[i + 1];
    if (h.d <= 0 && h2.d <= 0) continue;
    const k = Math.max(0, Math.min(N_SECTIONS - 1, Math.floor((geom.s[i] / L) * N_SECTIONS)));
    // silent air stays dark, with a hint of the field's colour
    let v = 0.12;
    let alpha = 0.28;
    if (tel) {
      if (mode === 'pressure') v = tel.pRms[k];
      else if (mode === 'velocity') v = tel.uRms[k];
      else {
        const u = k <= tel.constrictionIndex ? tel.ug : tel.uMouth;
        const vel = u / Math.max(h.area, 0.02);
        v = Math.min(1, Math.log10(1 + vel / 30) / 2.3);
      }
      alpha = 0.85;
    }
    const a = rayPoints(geom, i), b = rayPoints(geom, i + 1);
    ctx.beginPath();
    ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(a[2]), Y(a[3])); ctx.lineTo(X(b[2]), Y(b[3])); ctx.lineTo(X(b[0]), Y(b[1]));
    ctx.closePath();
    ctx.fillStyle = fieldColor(v, alpha);
    ctx.fill();
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D, geom: TractGeometry, X: (x: number) => number, Y: (y: number) => number, s: number,
  tel: Telemetry | null, parts: Particle[], dt: number, nc: number[],
): void {
  const n = geom.lastRay;
  const L = geom.length;
  const ug = tel ? tel.ug : 0, um = tel ? tel.uMouth : 0, un = tel ? tel.uNose : 0;
  const flowing = ug > 5;
  const target = flowing ? 110 : 0;
  while (parts.length < target) parts.push({ s: Math.random() * L, off: Math.random() - 0.5, nose: false, age: Math.random() });
  if (!flowing) { parts.length = Math.max(0, parts.length - 4); }
  const ci = tel ? tel.constrictionIndex : 0;
  // locate ray by arc length
  const rayAt = (sv: number) => {
    let lo2 = 0, hi = n;
    while (hi - lo2 > 1) { const m = (lo2 + hi) >> 1; if (geom.s[m] < sv) lo2 = m; else hi = m; }
    return lo2;
  };
  ctx.fillStyle = 'rgba(231,235,243,0.75)';
  for (const q of parts) {
    q.age += dt;
    if (q.nose) {
      // along the nasal cavity centreline (param 0..1)
      const sp = 0.25 + 0.6 * Math.min(1, Math.abs(un) / 200);
      q.s += sp * dt;
      if (q.s >= 1 || Math.abs(un) < 3) { q.nose = false; q.s = 0; continue; }
      const m = NASAL_CENTRE.length / 2 - 1;
      const f = q.s * m, j = Math.min(m - 1, Math.floor(f)), u = f - j;
      const x = nc[2 * j] + (nc[2 * j + 2] - nc[2 * j]) * u, y = nc[2 * j + 1] + (nc[2 * j + 3] - nc[2 * j + 1]) * u;
      ctx.beginPath(); ctx.arc(X(x), Y(y + q.off * 0.6 * s), 1.4, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (q.s > L) {
      // plume beyond the lips
      const last = geom.hits[n];
      const prev = geom.hits[Math.max(0, n - 3)];
      const dx = last.mx - prev.mx, dy = last.my - prev.my;
      const dl = Math.hypot(dx, dy) || 1;
      const ex = q.s - L;
      if (ex > 3.5 * s || um < 2) { q.s = 0; q.off = Math.random() - 0.5; continue; }
      const sp = 2 + 5 * Math.log10(1 + Math.abs(um) / Math.max(geom.lipArea, 0.05) / 50);
      q.s += sp * dt;
      const x = last.mx + (dx / dl) * ex - (dy / dl) * q.off * (0.3 + ex * 0.5);
      const y = last.my + (dy / dl) * ex + (dx / dl) * q.off * (0.3 + ex * 0.5);
      ctx.globalAlpha = Math.max(0, 1 - ex / (3.5 * s));
      ctx.beginPath(); ctx.arc(X(x), Y(y), 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    const r = rayAt(q.s);
    const h = geom.hits[r];
    const sec = Math.floor((q.s / L) * N_SECTIONS);
    const u = sec <= ci ? ug : um;
    const vel = u / Math.max(h.area, 0.03);
    const sp = 1.5 + 5 * Math.log10(1 + vel / 50);
    q.s += sp * dt * s;
    // divert into the nose at the velum when the port is open
    if (tel && tel.nasalPort > 0.05 && Math.abs(un) > 3 && Math.abs(q.s - geom.s[Math.round(0.43 * n)]) < 0.15 && Math.random() < Math.abs(un) / (Math.abs(un) + Math.abs(um) + 1)) {
      q.nose = true; q.s = 0; continue;
    }
    if (h.d <= 0.001) { q.s = 0; continue; }
    const pts = rayPoints(geom, r);
    const t = 0.5 + q.off * 0.8;
    const x = pts[0] + (pts[2] - pts[0]) * t, y = pts[1] + (pts[3] - pts[1]) * t;
    ctx.beginPath(); ctx.arc(X(x), Y(y), 1.3, 0, Math.PI * 2); ctx.fill();
  }
}

function emitSparks(geom: TractGeometry, tel: Telemetry, out: { x: number; y: number; vx: number; vy: number; life: number; c: string }[], s: number): void {
  if (out.length > 400) return;
  const L = geom.length;
  const at = (sv: number) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= geom.lastRay; i++) { const d = Math.abs(geom.s[i] - sv); if (d < bd) { bd = d; best = i; } }
    return geom.hits[best];
  };
  const lv = tel.levels;
  const rate = (x: number) => Math.max(0, Math.min(6, (20 * Math.log10(x + 1e-9) + 70) / 8));
  const emit = (h: { mx: number; my: number }, n: number, c: string, spread: number) => {
    const m = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    for (let i = 0; i < m; i++) out.push({ x: h.mx + (Math.random() - 0.5) * spread * s, y: h.my + (Math.random() - 0.5) * spread * s, vx: (Math.random() + 0.3) * 1.5 * s, vy: (Math.random() - 0.5) * 1.2 * s, life: 1, c });
  };
  const violet = 'rgba(169,139,250,A)';
  emit(at(((tel.constrictionIndex + 1.5) / N_SECTIONS) * L), rate(lv.wall), violet, 0.4);
  if (geom.teethPos > 0) emit(at(geom.teethPos + 0.2), rate(lv.obstacle), violet, 0.35);
  emit(at(0.6 * s), rate(lv.aspiration) * 0.8, 'rgba(246,168,35,A)', 0.4);
  emit(at(geom.teethPos > 0 ? geom.teethPos : L * 0.9), rate(lv.user) * 0.7, 'rgba(69,184,245,A)', 0.5);
}
