import { useRef } from 'react';
import { store } from '../store';
import { voice } from '../voice/voice';
import { useAnimatedCanvas, C, label } from '../canvas';
import { lipWidth } from '../../dsp/tract/geometry';

interface Puff { x: number; y: number; vx: number; vy: number; life: number; voiced: boolean }

/**
 * The mouth seen from the front, as in a mirror: the lips (open, round,
 * pushed forward or tucked under the teeth), the teeth, the tongue where it
 * shows (between the teeth, up behind them, curled back), the air that comes
 * out of the mouth or the nose, and the buzz of the voice in the throat.
 * Everything comes from the posture that sounds, so it moves with the head.
 */
export function MouthFront({ caption }: { caption?: string }) {
  const puffs = useRef<Puff[]>([]);
  const ref = useAnimatedCanvas(({ ctx, w, h, dt, t: time }) => {
    const p = voice.sounding();
    const a = p.articulators;
    const an = p.anatomy;
    const { geom } = store.derived();
    const tel = store.ui.audioOn ? voice.live() : null;
    // ---- frame: a face about 9 cm wide
    const k = Math.min(w / 9.5, h / 8.5);
    const cx = w / 2, my = h * 0.56; // the mouth's middle
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, w, h);
    const face = ctx.createRadialGradient(cx, my - 1.5 * k, 0.5 * k, cx, my - 1.5 * k, 6 * k);
    face.addColorStop(0, '#3a2c3a');
    face.addColorStop(1, '#1b1622');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.ellipse(cx, my - 1.4 * k, 4.6 * k, 5.6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    // ---- the nose and the air through it
    const nx = cx, ny = my - 2.3 * k;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(nx + s * 0.55 * k, ny, 0.3 * k, 0.2 * k, s * 0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,220,225,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nx - 1.0 * k, ny - 0.1 * k); ctx.quadraticCurveTo(nx - 0.9 * k, ny + 0.45 * k, nx - 0.3 * k, ny + 0.35 * k);
    ctx.moveTo(nx + 1.0 * k, ny - 0.1 * k); ctx.quadraticCurveTo(nx + 0.9 * k, ny + 0.45 * k, nx + 0.3 * k, ny + 0.35 * k);
    ctx.stroke();
    const noseFlow = tel ? Math.min(1, Math.abs(tel.uNose) / 200) : 0;
    if (noseFlow > 0.05) {
      ctx.strokeStyle = `rgba(127,209,127,${(0.35 + 0.5 * noseFlow).toFixed(2)})`;
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const ph = (time * 2.5 + i / 3) % 1;
          const y0 = ny + 0.3 * k + ph * 1.2 * k;
          ctx.globalAlpha = 1 - ph;
          ctx.beginPath();
          ctx.moveTo(nx + s * 0.45 * k, y0);
          ctx.quadraticCurveTo(nx + s * (0.75 + 0.2 * Math.sin(time * 6 + i)) * k, y0 + 0.2 * k, nx + s * 0.6 * k, y0 + 0.45 * k);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    // ---- the mouth: width from the rounding, height from the opening area
    const scale = an.scale;
    const wCm = Math.max(0.8, lipWidth(a, scale));
    const area = Math.max(0, geom.lipArea);
    let hCm = area > 0.005 ? area / ((Math.PI / 4) * wCm) : 0;
    hCm = Math.min(3.2, hCm);
    const closed = hCm < 0.08;
    const mw = wCm * k, mh = Math.max(closed ? 0 : 0.08 * k, hCm * k);
    const protr = Math.max(0, a.lipProtrude);
    const thick = (0.55 + 0.35 * protr) * k * (0.8 + 0.2 * scale);
    const tuck = Math.max(0, Math.min(1, a.lipTuck));
    // dark cavity
    if (!closed) {
      ctx.fillStyle = '#05060a';
      ctx.beginPath();
      ctx.ellipse(cx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      ctx.clip();
      // the tongue: a pink mound whose height follows the tongue body, the tip when it is up or out
      const mound = 0.25 + 0.3 * Math.max(0, Math.min(1, (a.tongueY + 0.8) / 2.2));
      const tongueTop = my + mh / 2 - mound * mh;
      ctx.fillStyle = '#c9516a';
      ctx.beginPath();
      ctx.ellipse(cx, my + mh * 0.55, mw * 0.42, Math.max(2, mh * 0.55), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - mw, tongueTop - 40 * k, 2 * mw, 40 * k - 0.001);
      const tipUp = a.tipY > 1.3, retro = tipUp && a.tipX < -0.3, between = a.tipX > 0.8;
      if (tipUp) {
        // the tip against the roof, behind the top teeth (or its paler underside when it is curled back)
        ctx.fillStyle = retro ? '#e59aa8' : '#d96a80';
        ctx.beginPath();
        ctx.ellipse(cx, my - mh * 0.25, mw * (retro ? 0.22 : 0.3), Math.max(2, mh * 0.22), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // upper teeth, behind the upper lip
      const toothH = Math.min(0.75 * k, mh * 0.45);
      const upperY = my - mh / 2;
      for (let i = -3; i <= 2; i++) {
        const tw = (i === -1 || i === 0 ? 0.72 : 0.56) * k * 0.9;
        const x = cx + i * 0.62 * k + (i >= 0 ? 0.03 * k : -0.03 * k);
        ctx.fillStyle = C.tooth;
        ctx.beginPath(); ctx.roundRect(x, upperY - 2, tw - 2, toothH + 2, [0, 0, 4, 4]); ctx.fill();
      }
      // lower teeth, when the mouth opens enough
      if (mh > 0.6 * k) {
        for (let i = -3; i <= 2; i++) {
          const x = cx + i * 0.5 * k + 0.02 * k;
          ctx.fillStyle = '#e9e2d0';
          ctx.beginPath(); ctx.roundRect(x, my + mh / 2 - Math.min(0.55 * k, mh * 0.3), 0.46 * k, Math.min(0.55 * k, mh * 0.3) + 2, [3, 3, 0, 0]); ctx.fill();
        }
      }
      if (between) {
        // the tip between the teeth
        ctx.fillStyle = '#df6f87';
        ctx.beginPath();
        ctx.ellipse(cx, my + mh * 0.05, mw * 0.28, Math.max(3, mh * 0.3), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // the lips
    const lipGrad = ctx.createLinearGradient(0, my - mh / 2 - thick, 0, my + mh / 2 + thick);
    lipGrad.addColorStop(0, '#e98a9b'); lipGrad.addColorStop(1, '#b94f66');
    ctx.fillStyle = lipGrad;
    ctx.strokeStyle = 'rgba(255,220,225,0.25)';
    ctx.lineWidth = 1;
    const half = mw / 2 + 0.12 * k;
    // upper lip: a cupid's bow
    ctx.beginPath();
    ctx.moveTo(cx - half, my);
    ctx.quadraticCurveTo(cx - half * 0.55, my - mh / 2 - thick * 1.05, cx - 0.12 * k, my - mh / 2 - thick * 0.85);
    ctx.quadraticCurveTo(cx, my - mh / 2 - thick * 0.7, cx + 0.12 * k, my - mh / 2 - thick * 0.85);
    ctx.quadraticCurveTo(cx + half * 0.55, my - mh / 2 - thick * 1.05, cx + half, my);
    ctx.quadraticCurveTo(cx, my - mh / 2 + (closed ? 0 : 1), cx - half, my);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // lower lip: tucked up under the top teeth for f and v
    const lowBottom = my + mh / 2 + thick * (1.1 - 0.5 * tuck);
    const lowTop = my + mh / 2 - tuck * (mh / 2 + thick * 0.4);
    ctx.beginPath();
    ctx.moveTo(cx - half, my);
    ctx.quadraticCurveTo(cx - half * 0.6, lowBottom, cx, lowBottom);
    ctx.quadraticCurveTo(cx + half * 0.6, lowBottom, cx + half, my);
    ctx.quadraticCurveTo(cx, lowTop, cx - half, my);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (tuck > 0.3) {
      // the top teeth over the lower lip
      ctx.fillStyle = C.tooth;
      for (let i = -2; i <= 1; i++) { ctx.beginPath(); ctx.roundRect(cx + i * 0.62 * k + 0.04 * k, my - 0.1 * k, 0.5 * k, (0.35 + 0.25 * tuck) * k, [0, 0, 4, 4]); ctx.fill(); }
    }
    // pucker lines when the lips are pushed forward
    if (protr > 0.3) {
      ctx.strokeStyle = `rgba(80,30,45,${(0.3 * protr).toFixed(2)})`;
      for (let i = -2; i <= 2; i++) { if (!i) continue; ctx.beginPath(); ctx.moveTo(cx + i * half * 0.45, my - mh / 2 - thick * 0.9); ctx.lineTo(cx + i * half * 0.4, my - mh / 2 - thick * 0.3); ctx.stroke(); }
    }
    // ---- the air out of the mouth: puffs, white for breath, amber for voice
    const um = tel ? Math.abs(tel.uMouth) : 0;
    const voiced = tel ? tel.voicingAmp > 0.05 : false;
    const hiss = tel ? Math.min(1, (20 * Math.log10(tel.levels.wall + tel.levels.obstacle + tel.levels.aspiration + 1e-9) + 60) / 40) : 0;
    const flowing = um > 40 && !closed;
    if (flowing || hiss > 0.1) {
      const n = Math.min(6, Math.round(1 + um / 150 + 4 * hiss));
      for (let i = 0; i < n; i++) {
        const speed = (1.5 + Math.min(3, um / 200) + 3 * hiss) * k;
        puffs.current.push({ x: cx + (Math.random() - 0.5) * mw * 0.6, y: my + (Math.random() - 0.5) * mh * 0.5, vx: (Math.random() - 0.5) * 0.6 * k, vy: speed * (0.6 + 0.4 * Math.random()), life: 1, voiced: voiced && hiss < 0.4 });
      }
    }
    const ps = puffs.current;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt * 1.6;
      if (q.life <= 0) { ps.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.98;
      ctx.fillStyle = q.voiced ? `rgba(246,168,35,${(0.7 * q.life).toFixed(2)})` : `rgba(231,235,243,${(0.6 * q.life).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, 1.5 + 2.5 * (1 - q.life), 0, Math.PI * 2); ctx.fill();
    }
    if (ps.length > 300) ps.splice(0, ps.length - 300);
    // ---- the buzz of the voice in the throat
    const vAmp = tel ? tel.voicingAmp : 0;
    if (vAmp > 0.03) {
      const ty = my + 2.6 * k;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2 * Math.PI * 5);
      const g = ctx.createRadialGradient(cx, ty, 2, cx, ty, (0.9 + 0.4 * pulse) * k);
      g.addColorStop(0, `rgba(246,168,35,${(0.65 * Math.min(1, vAmp)).toFixed(2)})`); g.addColorStop(1, 'rgba(246,168,35,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, ty, (0.9 + 0.4 * pulse) * k, 0, Math.PI * 2); ctx.fill();
      label(ctx, 'voice on', cx, ty + 1.3 * k, C.amber);
    } else if (tel && (hiss > 0.15 || um > 60)) label(ctx, 'air only', cx, my + 3.9 * k, C.muted);
    // ---- what is being said
    if (tel?.phone) {
      ctx.font = '700 26px "Noto Sans", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = C.amber;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(tel.phone, w - 12, 10);
    }
    label(ctx, caption ?? 'in the mirror', cx, 14, C.muted);
  });
  return <canvas ref={ref} className="mouth-canvas" />;
}
