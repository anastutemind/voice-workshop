/**
 * The mirror as a photograph: a real face seen from the front, in a handful
 * of mouth shapes (closed, a little open, wide open, rounded, spread, the
 * lower lip on the teeth, the tongue between the teeth, the tip up), each a
 * photograph of the same face in the same place. At every frame the mouth
 * the model has (how far the teeth and the lips are apart, rounded, spread,
 * the lip tucked, where the tongue's tip is: the same measures the side view
 * is drawn from) says how much of each shape is seen, and the photographs
 * are laid over one another by that much. Nothing has a clock of its own:
 * the mirror shows the pose it is given, in the frame it is given it.
 *
 * The photographs are in public/mirror; without them the three-dimensional
 * face takes its place.
 */
import { useEffect, useRef, useState } from 'react';
import type { Face } from './faces';
import { shapeOf } from './faces';
import { lipsOf, LipState } from './readout';
import { MORE, Shape, shapeAt, SHAPES } from './visemes';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const LIP_WORD: Record<LipState, string> = { closed: 'closed', teeth: 'on the top teeth', round: 'rounded', spread: 'spread', open: 'open' };
export function MirrorPhoto({ face, label, onFail }: { face: () => Face | null; label: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const word = useRef<HTMLSpanElement | null>(null);
  const getFace = useRef(face);
  getFace.current = face;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    let dead = false, raf = 0;
    const imgs = {} as Partial<Record<Shape, HTMLImageElement>>;
    const load = (k: Shape) => new Promise<void>((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { imgs[k] = im; res(); };
      im.onerror = () => rej(new Error(k));
      im.src = `mirror/${k}.jpg`;
    });
    for (const k of Object.keys(MORE) as Shape[]) void load(k).catch(() => { /* its stand-in is used */ });
    void Promise.all(SHAPES.map(load)).then(() => { if (!dead) { setReady(true); raf = requestAnimationFrame(frame); } }, () => { if (!dead) onFail(); });
    const pick = (k: Shape): HTMLImageElement => imgs[k] ?? imgs[MORE[k as keyof typeof MORE]]!;
    // one shape is shown at a time; going to the next takes the time lips take to move (a twentieth of a second),
    // long enough not to flicker, too short to be seen as a blur of two mouths
    const MOVE = 0.055;
    let from: Shape = 'rest', to: Shape = 'rest', since = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const f = getFace.current();
      const c = cv.getContext('2d');
      if (!f || !c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (!w || !h) return;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const want = shapeAt(f);
      if (want !== to) {
        // from what is on screen now (the shape arrived at, or the one being left if the move was not over)
        from = since >= 0 && (now - since) / 1000 < MOVE * 0.5 ? from : to;
        to = want;
        since = now;
      }
      const u = since < 0 ? 1 : clamp01((now - since) / 1000 / MOVE);
      const draw = (k: Shape, alpha: number) => {
        const im = pick(k);
        const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
        const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
        c.globalAlpha = alpha;
        c.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
      };
      if (u < 1) { draw(from, 1); draw(to, u); } else draw(to, 1);
      c.globalAlpha = 1;
      const st = lipsOf(f.pose.art, shapeOf(f.pose).geom).state;
      if (word.current && word.current.textContent !== LIP_WORD[st]) word.current.textContent = LIP_WORD[st];
    };
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className={ready ? 'mirror3d ready' : 'mirror3d'} role="img" aria-label={label}>
      <canvas ref={canvas} />
      <p className="mirror3d-state">Lips <span ref={word} /></p>
    </div>
  );
}
