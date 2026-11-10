/**
 * A contact sheet of the painted anatomy in many postures, drawn in the
 * browser exactly as the tutor's side view draws it (the plate stretched by
 * the graphics card, the air taken out, the velum and the rim over it), for
 * looking at seams, folds and cuts all at once. Development only: in the
 * browser's console on the dev server,
 *
 *   const { sheet, POSES } = await import('/scripts/anatomy-sheet.ts');
 *   await sheet(POSES, { cols: 5, cell: 340 });
 *
 * lays the sheet over the page (click it to take it away); `lines: true` draws over it what is taken out of the
 * plate (blue), what is kept (yellow), what is taken off whatever is kept (magenta) and the teeth (green). Each pose is a name
 * and the articulators that differ from the default ones (or from the tutor's
 * rest, with `base: 'rest'`); `frame` is the part of the head shown, canonical
 * cm (x0, x1, y0, y1).
 */
import { computeGeometry } from '../src/dsp/tract/geometry';
import { Articulators, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { headScene, Mat } from '../src/ui/head/scene';
import { getBackdrop } from '../src/ui/head/painter';
import { AnatomyGL } from '../src/ui/head/gl';
import { anatomyLayers } from '../src/ui/tutor/faces';
import { REST_ART } from '../src/ui/tutor/readout';

export const POSES: [string, Partial<Articulators>][] = [
  ['rest', {}], ['jaw shut', { jaw: 0 }], ['jaw half', { jaw: 0.5 }], ['jaw wide', { jaw: 1 }], ['jaw past wide', { jaw: 1.2 }],
  ['lips closed', { lipOpen: -0.3 }], ['lips pressed', { lipOpen: -0.6 }], ['lips round', { lipRound: 1, lipProtrude: 1, lipOpen: 0.2 }], ['lips spread', { lipProtrude: -0.6, lipOpen: 0.4 }], ['lip tucked', { lipTuck: 1, lipOpen: 0.3 }],
  ['tongue high', { tongueY: 1.6 }], ['tongue low', { tongueY: -1.6, jaw: 0.6 }], ['tongue front', { tongueX: 1.4, tongueY: 1.0 }], ['tongue back', { tongueX: -1.6, tongueY: 1.2 }], ['root back', { tongueRoot: -1.2, tongueX: -1 }],
  ['tip up', { tipY: 2.2, tipX: 1.4 }], ['tip curled', { tipY: 2.2, tipX: -1.2 }], ['velum low', { velum: 1 }], ['larynx up', { larynx: 1.2 }], ['larynx down', { larynx: -1.5 }],
];

let gl: AnatomyGL | null | undefined;

export async function sheet(poses: [string, Partial<Articulators>][], opts: { cols?: number; cell?: number; frame?: [number, number, number, number]; base?: 'rest' | 'default'; shrink?: number; lines?: boolean } = {}): Promise<HTMLCanvasElement | null> {
  let bd = getBackdrop();
  for (let i = 0; i < 50 && !(bd && bd.mask); i++) { await new Promise((r) => setTimeout(r, 100)); bd = getBackdrop(); }
  if (!bd?.mask) return null;
  if (gl === undefined) gl = AnatomyGL.make();
  if (!gl) return null;
  const cols = opts.cols ?? 4, cell = opts.cell ?? 360, fr = opts.frame ?? [1.0, 10.6, 1.5, 11.6];
  const rows = Math.ceil(poses.length / cols);
  let cv = document.getElementById('anatomy-sheet') as HTMLCanvasElement | null;
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'anatomy-sheet';
    cv.addEventListener('click', () => { cv!.style.display = 'none'; });
    document.body.appendChild(cv);
  }
  cv.width = cols * cell; cv.height = rows * cell;
  Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', zIndex: '99999', width: `${(cols * cell) / (opts.shrink ?? 1.25)}px`, background: '#0b0d12', display: 'block' });
  const g = cv.getContext('2d')!;
  g.fillStyle = '#0b0d12';
  g.fillRect(0, 0, cv.width, cv.height);
  const over = document.createElement('canvas');
  over.width = over.height = cell;
  const oc = over.getContext('2d')!;
  const k = Math.min(cell / (fr[1] - fr[0]), cell / (fr[3] - fr[2]));
  const world: Mat = [k, 0, 0, -k, -fr[0] * k, fr[3] * k];
  for (let i = 0; i < poses.length; i++) {
    const [name, art] = poses[i];
    const a = { ...(opts.base === 'rest' ? REST_ART : DEFAULT_ARTICULATORS), ...art };
    const geom = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
    const sc = headScene(geom, DEFAULT_ANATOMY, a);
    const L = anatomyLayers(sc, geom);
    gl.render(sc, world, cell, cell, { img: bd.img, mask: bd.mask }, L.cut, L.keep, { neck: [-1e6, -1e6 + 1] }, 1, L.clear, L.hard);
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    // (a picture of the graphics card's canvas is fetched back from it: slow, and fine for a sheet)
    g.drawImage(gl.cv, x, y);
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.clearRect(0, 0, cell, cell);
    L.over(oc, world, bd);
    g.drawImage(over, x, y);
    if (opts.lines) {
      // (what is taken out in blue, what is kept in yellow)
      g.save();
      g.setTransform(k, 0, 0, -k, x - fr[0] * k, y + fr[3] * k);
      g.lineWidth = 1 / k;
      for (const [list, colour] of [[L.cut, 'rgba(0,200,255,0.7)'], [L.keep, 'rgba(255,230,0,0.8)'], [L.clear, 'rgba(255,0,255,0.9)'], [L.hard, 'rgba(0,255,0,0.9)']] as const) {
        for (const p of list) {
          if (p.length < 6) continue;
          g.beginPath(); g.moveTo(p[0], p[1]);
          for (let j = 2; j < p.length; j += 2) g.lineTo(p[j], p[j + 1]);
          g.closePath(); g.strokeStyle = colour; g.stroke();
        }
      }
      g.restore();
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = '600 15px system-ui';
    g.fillText(name, x + 8, y + 20);
  }
  return cv;
}
