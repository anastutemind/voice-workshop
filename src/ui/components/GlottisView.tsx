import { useRef, useState } from 'react';
import { store } from '../store';
import { voice } from '../voice/voice';
import { useManual } from '../voice/hooks';
import { useL } from '../i18n';
import { useAnimatedCanvas, C, label } from '../canvas';
import { lfFlow, lfDerivative, rdToTiming, solveLF, timingFromQuotients, LFShape } from '../../dsp/glottis/lf';

let folds: { closed: HTMLImageElement; open: HTMLImageElement } | null = null;
let foldsAsked = false;
/** The two photographs of the folds (public/lab), once loaded; null until then or without them. */
function foldPhotos(): typeof folds {
  if (!foldsAsked && typeof Image !== 'undefined') {
    foldsAsked = true;
    const load = (name: string) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `lab/${name}.jpg`; });
    void Promise.all([load('folds-closed'), load('folds-open')]).then(([closed, open]) => { folds = { closed, open }; }, () => { /* the drawn folds stay */ });
  }
  return folds;
}

/**
 * The vocal folds in slow motion: a top view of the glottis opening and
 * closing, the puffs of air it lets out, and one cycle of the airflow and of
 * its derivative (Liljencrants-Fant model), or the self-oscillating two-mass
 * folds with the measured flow.
 */
export function GlottisView() {
  const L = useL();
  const p = useManual();
  const [speed, setSpeed] = useState(0.6);
  const phase = useRef(0);
  const puffs = useRef<{ y: number; a: number; x: number }[]>([]);
  const lastOpen = useRef(false);
  const shapeRef = useRef<{ key: string; sh: LFShape | null }>({ key: '', sh: null });
  const tmCycle = useRef<Float32Array | null>(null);
  const tmTime = useRef(0);

  const ref = useAnimatedCanvas(({ ctx, w, h, dt }) => {
    const prm = voice.sounding();
    const s = prm.source;
    const tel = store.ui.audioOn ? store.telemetry : null;
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, w, h);
    phase.current = (phase.current + dt * speed) % 1;
    const ph = phase.current;
    const lf = s.model === 'lf';
    const timing = s.advanced ? timingFromQuotients(s.oq, s.alphaM, s.ra) : rdToTiming(s.rd);
    const key = `${timing.tp}|${timing.te}|${timing.ta}`;
    if (shapeRef.current.key !== key) shapeRef.current = { key, sh: solveLF(timing) };
    const sh = shapeRef.current.sh!;
    // cycle waveform: LF analytic, or the measured flow for the two-mass model
    let cyc: Float32Array;
    const N = 240;
    if (lf) {
      cyc = new Float32Array(N);
      for (let i = 0; i < N; i++) cyc[i] = Math.max(0, lfFlow(sh, i / N) / sh.upeak);
    } else {
      tmTime.current += dt;
      if ((!tmCycle.current || tmTime.current > 0.5) && tel && tel.f0 > 0 && store.ring.total > 8192) {
        tmTime.current = 0;
        const fs = voice.sampleRate;
        const per = Math.round(fs / tel.f0);
        const x = store.readRing('flow', per * 3 + 10);
        // align on the minimum
        let mi = 0; for (let i = 0; i < per; i++) if (x[i] < x[mi]) mi = i;
        const c = new Float32Array(N);
        let mx = -1e9, mn = 1e9;
        for (let i = 0; i < N; i++) { const v = x[mi + Math.floor((i / N) * per)]; c[i] = v; mx = Math.max(mx, v); mn = Math.min(mn, v); }
        for (let i = 0; i < N; i++) c[i] = (c[i] - mn) / Math.max(1e-9, mx - mn);
        tmCycle.current = c;
      }
      cyc = tmCycle.current ?? new Float32Array(N);
    }
    const voicing = tel ? tel.voicingAmp : prm.voicing ? 1 : 0;
    const steady = Math.min(1, (s.chink + 0.55 * prm.abduction) / 0.2);
    const open = cyc[Math.floor(ph * N) % N] * voicing;

    // ---- top view of the glottis (left half)
    const cx = w * 0.25, cy = h * 0.5;
    const len = Math.min(w * 0.36, h * 0.8);
    const halfW = 0.5 * len;
    ctx.save();
    ctx.translate(cx, cy);
    const gap = (open * 0.2 + steady * 0.15) * halfW;
    const back = steady * 0.22 * halfW + gap * 0.25;
    const photos = foldPhotos();
    if (photos) {
      // the folds as a laryngoscope sees them: a photograph of them together, and one of them apart laid
      // over it by as much as they are open at this instant of the cycle
      const R = halfW * 1.12;
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
      const show = (im: HTMLImageElement, alpha: number) => {
        const k = (2 * R) / Math.min(im.naturalWidth, im.naturalHeight);
        ctx.globalAlpha = alpha;
        ctx.drawImage(im, (-im.naturalWidth * k) / 2, (-im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      };
      show(photos.closed, 1);
      show(photos.open, Math.max(0, Math.min(1, open * 0.8 + steady * 0.9)));
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
    // laryngeal ring
    ctx.fillStyle = '#2a1c26';
    ctx.beginPath(); ctx.ellipse(0, 0, halfW * 0.85, halfW * 1.1, 0, 0, Math.PI * 2); ctx.fill();
    // folds: anterior commissure at the top (front), arytenoids at the bottom (back)
    const foldPath = (side: number) => {
      ctx.beginPath();
      ctx.moveTo(0, -halfW * 0.9);
      ctx.quadraticCurveTo(side * (gap * 1.2 + 4), 0, side * (back + 6), halfW * 0.75);
      ctx.lineTo(side * halfW * 0.7, halfW * 0.75);
      ctx.quadraticCurveTo(side * halfW * 0.75, 0, side * halfW * 0.25, -halfW * 0.85);
      ctx.closePath();
    };
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient(side * halfW * 0.7, 0, 0, 0);
      g.addColorStop(0, '#b25a6f'); g.addColorStop(1, '#f2c4cc');
      ctx.fillStyle = g;
      foldPath(side); ctx.fill();
      // asymmetry hint for the two-mass model
    }
    // the glottis (air)
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.moveTo(0, -halfW * 0.9);
    ctx.quadraticCurveTo(gap * 1.2, 0, back + 1, halfW * 0.75);
    ctx.lineTo(-back - 1, halfW * 0.75);
    ctx.quadraticCurveTo(-gap * 1.2, 0, 0, -halfW * 0.9);
    ctx.fill();
    // arytenoids
    ctx.fillStyle = '#8e4559';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * (back + halfW * 0.22), halfW * 0.82, halfW * 0.2, halfW * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    // arrows: pressure pushes apart while opening, elasticity pulls back
    const opening = ph < (lf ? sh.tp : 0.4);
    ctx.strokeStyle = opening ? C.sky : C.rose; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const x0 = side * (gap + 10), x1 = side * (gap + 30);
      const [a0, a1] = opening ? [x0, x1] : [x1, x0];
      ctx.beginPath(); ctx.moveTo(a0, 0); ctx.lineTo(a1, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a1, 0); ctx.lineTo(a1 - Math.sign(a1 - a0) * 6, -4); ctx.lineTo(a1 - Math.sign(a1 - a0) * 6, 4); ctx.fill();
    }
    ctx.restore();
    label(ctx, opening ? L({ it: 'la pressione dei polmoni le apre', en: 'lung pressure pushes them apart' }) : L({ it: 'elasticità e risucchio le richiudono', en: 'elasticity and suction close them' }), cx, h - 16, opening ? C.sky : C.rose);
    label(ctx, L({ it: 'davanti', en: 'front' }), cx, cy - halfW * 0.98, C.muted);
    // puffs
    const isOpen = open > 0.3;
    if (isOpen && !lastOpen.current) puffs.current.push({ y: 0, a: 1, x: 0 });
    lastOpen.current = isOpen;
    for (let i = puffs.current.length - 1; i >= 0; i--) {
      const q = puffs.current[i];
      q.y += dt * 40; q.a -= dt * 0.5;
      if (q.a <= 0) { puffs.current.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(246,168,35,${0.5 * q.a})`;
      ctx.beginPath(); ctx.arc(cx + halfW * 0.95, cy + halfW * 0.6 - q.y, 6 + q.y * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    label(ctx, L({ it: 'sbuffi', en: 'puffs' }), cx + halfW * 0.95, cy + halfW * 0.6 + 14, C.amber);

    // ---- one cycle (right half)
    const x0 = w * 0.52, x1 = w - 12, y0 = 40, y1 = h - 28;
    const PX = (u: number) => x0 + u * (x1 - x0);
    const midY = (y0 + y1) / 2;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    if (lf) {
      // open phase shading
      ctx.fillStyle = 'rgba(246,168,35,0.08)';
      ctx.fillRect(PX(0), y0, PX(sh.te + sh.ta) - PX(0), y1 - y0);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N; const v = Math.max(0, lfFlow(sh, u) / sh.upeak); const y = midY - v * (midY - y0 - 4); if (i) ctx.lineTo(PX(u), y); else ctx.moveTo(PX(u), y); }
      ctx.stroke();
      let dmax = 1e-9;
      for (let i = 0; i <= N; i++) dmax = Math.max(dmax, Math.abs(lfDerivative(sh, i / N)));
      ctx.strokeStyle = C.violet; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N; const v = lfDerivative(sh, u) / dmax; const y = y1 - (y1 - midY) * 0.5 - v * (y1 - midY) * 0.45; if (i) ctx.lineTo(PX(u), y); else ctx.moveTo(PX(u), y); }
      ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.setLineDash([3, 3]); ctx.strokeStyle = C.grid2;
      for (const [u, name] of [[sh.tp, 'tp'], [sh.te, 'te'], [sh.te + sh.ta, 'te+ta']] as [number, string][]) {
        ctx.beginPath(); ctx.moveTo(PX(u), y0); ctx.lineTo(PX(u), y1); ctx.stroke();
        ctx.fillText(name, PX(u), y1 + 3);
      }
      ctx.setLineDash([]);
      label(ctx, L({ it: 'flusso U(t)', en: 'flow U(t)' }), PX(0.82), y0 + 12, C.amber);
      label(ctx, L({ it: 'derivata dU/dt', en: 'derivative dU/dt' }), PX(0.82), y1 - 12, C.violet);
      const oq = sh.te, am = sh.tp / sh.te;
      label(ctx, `Oq ${oq.toFixed(2)} · αm ${am.toFixed(2)} · Ra ${sh.ta.toFixed(3)}`, (x0 + x1) / 2, h - 10, C.text);
    } else {
      ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < N; i++) { const y = midY + (y1 - midY) * 0.6 - cyc[i] * (y1 - y0) * 0.7; if (i) ctx.lineTo(PX(i / N), y); else ctx.moveTo(PX(i / N), y); }
      ctx.stroke();
      // two-mass schematic (coronal view): lower mass leads the upper one
      const tm = tel?.twoMass;
      const bx = PX(0.5), by = y0 + 30;
      const ofs = (k: number) => cyc[Math.floor(((ph + k) % 1) * N) % N] * voicing;
      const m1 = ofs(0.08) * 14, m2 = ofs(0) * 14;
      ctx.fillStyle = '#d78a9a';
      for (const side of [-1, 1]) {
        const asym = side > 0 ? 1 - 0.5 * s.asym : 1;
        ctx.fillRect(bx + side * (6 + m1 * asym) - (side < 0 ? 26 : 0), by + 16, 26, 14);
        ctx.fillRect(bx + side * (6 + m2 * asym) - (side < 0 ? 22 : 0), by, 22, 12);
      }
      label(ctx, L({ it: 'due masse per lato', en: 'two masses per side' }), bx, by - 10, C.text);
      label(ctx, `${L({ it: 'tensione', en: 'tension' })} Q ${(tm?.q ?? s.q).toFixed(2)} · F0 ${tel?.f0 ? tel.f0.toFixed(0) + ' Hz' : '–'}`, (x0 + x1) / 2, h - 10, C.text);
    }
    // cursor
    ctx.strokeStyle = 'rgba(231,235,243,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PX(ph), y0); ctx.lineTo(PX(ph), y1); ctx.stroke();
  });

  return (
    <div className="view-panel">
      <canvas ref={ref} className="fill" />
      <div className="overlay-top right">
        <span className="mini">{p.source.model === 'lf' ? 'Liljencrants–Fant' : L({ it: 'due masse', en: 'two-mass' })}</span>
        <label className="mini">{L({ it: 'rallentatore', en: 'slow motion' })}<input type="range" min={0.1} max={2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
      </div>
    </div>
  );
}
