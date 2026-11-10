/**
 * A sheet of frames of a clip, to look at: the mirror and the skin of the
 * side view at many instants, side by side, drawn by the page's own code.
 * Run inside the page (the dev server), with a clip on the tutor's player:
 *
 *   const { sheet } = await import('/scripts/mirror-sheet.ts');
 *   await sheet({ n: 16, save: 'http://127.0.0.1:5299/?name=word.png' });
 *
 * Each column is one instant (its time, the sound, the photographs mixed);
 * the top row the mirror, the bottom row the skin. Returns the sheet's
 * canvas; with `save`, it is also POSTed there as a PNG.
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { Articulators, DEFAULT_ANATOMY, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { REST_ART } from '../src/ui/tutor/readout';
import { stagesOf, trajectory } from '../src/ui/tutor/motion';
import { headScene, Mat } from '../src/ui/head/scene';
import { MirrorMorph } from '../src/ui/tutor/MirrorPhoto';
import { poseAt, stageAt, Trajectory, Stage } from '../src/ui/tutor/motion';
import { paintSkin, skinCanvas, skinMix, skinReady } from '../src/ui/tutor/skin';
import { mouthFeatures } from '../src/ui/tutor/visemes';
import { netKnots, NX, NY } from '../src/ui/tutor/skinNet';

/** The model's articulators at the instant that shows a sound best (as scripts/mirror-poses.ts has them). */
export function soundArt(ipa: string): Articulators {
  if (ipa === 'rest') return { ...REST_ART };
  const ps = compactPhones(ipa);
  const vi = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  if (vi >= 0) ps[vi].stress = true;
  ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  const score = buildScore(ps, { lang: 'hi', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  const traj = trajectory(score);
  const stages = stagesOf(score.phones, traj);
  const st = stages.find((s) => s.part === 'hold') ?? stages[0];
  return { ...poseAt(traj, st.key)!.art };
}

interface Opts {
  /** sounds, each at its own instant, instead of a clip's instants */
  sounds?: string[];
  /** instants, seconds (default: n of them across the clip) */
  times?: number[];
  n?: number;
  /** from and to, seconds (default: the whole clip) */
  from?: number;
  to?: number;
  /** size of a tile, pixels */
  w?: number;
  h?: number;
  /** the part of the front photograph shown, its pixels */
  box?: [number, number, number, number];
  /** the part of the side shown, world cm: x0, x1, y0, y1 */
  frame?: [number, number, number, number];
  /** how much of the photographed inside of the mouth the side shows (1: the skin fully on) */
  inside?: number;
  save?: string;
  rows?: ('front' | 'side')[];
  /** draw the side's net (its knots) and the model's lip profile over it */
  net?: boolean;
}

let morph: MirrorMorph | null = null;

export async function sheet(o: Opts = {}): Promise<HTMLCanvasElement> {
  const player = (window as unknown as { tutorPlayer?: { clip: { traj: Trajectory; stages: Stage[]; key: string } | null } }).tutorPlayer;
  const clip = player?.clip ?? null;
  if (!clip && !o.sounds) throw new Error('no clip on the player');
  const w = o.w ?? 240, h = o.h ?? 270;
  const from = o.from ?? 0, to = o.to ?? clip?.traj.duration ?? 1;
  const n = o.sounds?.length ?? o.n ?? 16;
  const times = o.times ?? Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
  const rows = o.rows ?? ['front', 'side'];
  const out = document.createElement('canvas');
  const lab = 30;
  out.width = w * times.length;
  out.height = (h + 0) * rows.length + lab;
  const c = out.getContext('2d')!;
  c.fillStyle = '#111';
  c.fillRect(0, 0, out.width, out.height);
  if (!morph && rows.includes('front')) {
    const cv = document.createElement('canvas');
    morph = MirrorMorph.create(cv);
    if (!morph) throw new Error('no WebGL');
    await morph.load();
    await morph.uploadAll();
  }
  if (rows.includes('side')) {
    // (the skin's photographs are fetched the first time it is painted: wait for them all)
    const art = soundArt('rest'), g = computeGeometry(art, DEFAULT_ANATOMY, DEFAULT_TEETH), sc0 = headScene(g, DEFAULT_ANATOMY, art);
    // (waited for without timers, which a page in the background hardly runs)
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      paintSkin(sc0, [30, 0, 0, -30, 0, 400], 64, 64, 1, { neck: [0, 1] });
      if (skinReady(true)) break;
      await new Promise<void>((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
      await fetch('skin/net.json', { cache: 'force-cache' });
    }
  }
  const box = o.box ?? [150, 250, 530, 680];
  const [X0, X1, Y0, Y1] = o.frame ?? [2.6, 11.6, 1.2, 12.6];
  const k = Math.min(w / (X1 - X0), h / (Y1 - Y0));
  const world: Mat = [k, 0, 0, -k, (w - (X1 - X0) * k) / 2 - X0 * k, h - (h - (Y1 - Y0) * k) / 2 + Y0 * k];
  times.forEach((t, i) => {
    const pose = o.sounds ? { art: soundArt(o.sounds[i]) } : clip ? poseAt(clip.traj, t) : null;
    if (!pose) return;
    const geom = computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH);
    const st = o.sounds ? { ipa: o.sounds[i], t1: Infinity } : clip!.stages[stageAt(clip!.stages, t)];
    let mix = '';
    rows.forEach((row, r) => {
      if (row === 'front' && morph) {
        const cv = morph.gl.canvas as HTMLCanvasElement;
        cv.width = w; cv.height = h;
        const wts = morph.draw(pose.art, geom, w, h, box);
        c.drawImage(cv, i * w, r * h);
        mix = Object.entries(wts ?? {}).sort((a, b) => b[1] - a[1]).map(([nm, v]) => `${nm} ${Math.round(v * 100)}`).join(' ');
      } else if (row === 'side') {
        const sc = headScene(geom, DEFAULT_ANATOMY, pose.art);
        const yOf = (y: number) => world[3] * y + world[5];
        if (paintSkin(sc, world, w, h, o.inside ?? 1, { neck: [yOf(sc.neckEnd), yOf(sc.neckEnd + 1.6 * sc.s)] }, mouthFeatures(pose.art, geom))) c.drawImage(skinCanvas()!, i * w, r * h);
        if (!rows.includes('front')) mix = Object.entries(skinMix.face).sort((a, b) => b[1] - a[1]).map(([nm, v]) => `${nm} ${Math.round(v * 100)}`).join(' ') + ' | ' + Object.entries(skinMix.inside).sort((a, b) => b[1] - a[1]).map(([nm, v]) => `${nm} ${Math.round(v * 100)}`).join(' ');
        if (o.net) {
          const kn = netKnots(sc);
          const X = (x: number) => i * w + world[0] * x + world[4], Y = (y: number) => r * h + world[3] * y + world[5];
          c.lineWidth = 0.6;
          c.strokeStyle = 'rgba(0,220,255,0.55)';
          for (let jj = 0; jj < NY; jj++) { c.beginPath(); for (let ii = 0; ii < NX; ii++) { const q = 2 * (jj * NX + ii); if (ii) c.lineTo(X(kn[q]), Y(kn[q + 1])); else c.moveTo(X(kn[q]), Y(kn[q + 1])); } c.stroke(); }
          for (let ii = 0; ii < NX; ii++) { c.beginPath(); for (let jj = 0; jj < NY; jj++) { const q = 2 * (jj * NX + ii); if (jj) c.lineTo(X(kn[q]), Y(kn[q + 1])); else c.moveTo(X(kn[q]), Y(kn[q + 1])); } c.stroke(); }
          c.lineWidth = 1.2;
          for (const [pts, col] of [[sc.upperFace, '#ff0'], [sc.lowerFace, '#f0f']] as const) {
            c.strokeStyle = col; c.beginPath();
            for (let q = 0; q < pts.length; q += 2) { if (q) c.lineTo(X(pts[q]), Y(pts[q + 1])); else c.moveTo(X(pts[q]), Y(pts[q + 1])); }
            c.stroke();
          }
        }
      }
    });
    c.fillStyle = '#ddd';
    c.font = '12px system-ui';
    c.fillText(o.sounds ? `/${o.sounds[i]}/` : `${t.toFixed(3)} s  ${st && t <= st.t1 ? st.ipa : ''}`, i * w + 4, rows.length * h + 12);
    c.fillStyle = '#999';
    c.font = '10px system-ui';
    c.fillText(mix, i * w + 4, rows.length * h + 25);
    c.strokeStyle = '#000';
    c.strokeRect(i * w + 0.5, 0.5, w - 1, rows.length * h - 1);
  });
  if (o.save) {
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
    if (blob) await fetch(o.save, { method: 'POST', body: blob });
  }
  return out;
}
