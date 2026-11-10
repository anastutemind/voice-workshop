/**
 * Measures, in a real browser, how far the picture of the tutor is from the
 * sound, frame by frame. Load it into the page of the dev server and drive it
 * from the console:
 *
 *   const p = await import('/tests/syncProbe.ts');
 *   await p.letter(3)            // picks the fourth letter (its sound plays), then plays its word
 *   await p.slow()               // the letter in slow motion (the model's voice)
 *   await p.typed('hello there') // a typed sentence (the model's voice)
 *   p.burn(150)                  // every frame takes 150 ms more: a slow computer (0: off)
 *
 * The player leaves a trace of every frame it draws while a voice plays
 * (window.tutorSync: the time of the sound heard, the time of the picture,
 * the wall clock). A frame drawn at w is taken to be on the screen from the
 * next refresh of the screen until the next frame is; its error is the
 * instant of the sound whose mouth it shows, less the instant heard in the
 * middle of that time (positive: the picture is ahead). The eye allows lips
 * some 45 ms late and some 125 ms early.
 */
interface Trace {
  kind: 'recording' | 'model';
  trace: number[];
  traj: { speech: number };
  fit?: { knots: { audio: number[]; model: number[] }; end: number; marked: boolean };
}
interface Player { playing: boolean }
type W = Window & { tutorSync?: Trace | null; tutorPlayer?: Player };
const w = window as W;

export interface Measure { kind: string; marked?: boolean; frames: number; gapMs: number; minMs: number; meanMs: number; maxMs: number; late45: number; early125: number; visible: boolean; label?: string }

/** The errors of the last clip played, in milliseconds. */
export function measure(refreshMs = 1000 / 60): Measure | null {
  const s = w.tutorSync;
  if (!s) return null;
  const n = Math.floor(s.trace.length / 3);
  const rows = Array.from({ length: n }, (_, k) => ({ now: s.trace[3 * k], t: s.trace[3 * k + 1], w: s.trace[3 * k + 2] }));
  const knots = s.fit?.knots;
  const soundOf = (t: number): number => {
    if (!knots) return t;
    const { audio: a, model: m } = knots;
    if (t <= m[0]) return a[0] + (t - m[0]);
    for (let i = 0; i + 1 < m.length; i++) if (t <= m[i + 1]) return m[i + 1] > m[i] ? a[i] + ((t - m[i]) / (m[i + 1] - m[i])) * (a[i + 1] - a[i]) : a[i + 1];
    return a[a.length - 1] + (t - m[m.length - 1]);
  };
  const start = knots ? knots.audio[0] + 0.02 : 0.02;
  const end = s.fit ? s.fit.end : s.traj.speech - 0.02;
  const errs: number[] = [], gaps: number[] = [];
  for (let k = 0; k + 1 < n; k++) {
    const r = rows[k], q = rows[k + 1];
    const mid = (r.w + q.w) / 2 + refreshMs;
    const heard = r.now + (mid - r.w) / 1000;
    if (heard < start || heard > end) continue;
    // (the model's mouth held on its last posture after the sentence is over is not a fault of timing)
    if (!knots && r.t >= s.traj.speech - 1e-6) continue;
    errs.push(1000 * (soundOf(r.t) - heard));
    gaps.push(q.w - r.w);
  }
  const sorted = [...errs].sort((x, y) => x - y);
  return {
    kind: s.kind, marked: s.fit?.marked, frames: errs.length,
    gapMs: Math.round(gaps.reduce((x, y) => x + y, 0) / Math.max(1, gaps.length)),
    minMs: Math.round(sorted[0] ?? NaN), meanMs: Math.round(errs.reduce((x, y) => x + y, 0) / Math.max(1, errs.length)), maxMs: Math.round(sorted[sorted.length - 1] ?? NaN),
    late45: errs.filter((e) => e < -45).length, early125: errs.filter((e) => e > 125).length, visible: document.visibilityState === 'visible',
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function played(timeout = 20000): Promise<void> {
  const p = w.tutorPlayer!, t0 = performance.now();
  while (!p.playing && performance.now() - t0 < 3000) await sleep(20);
  while (p.playing && performance.now() - t0 < timeout) await sleep(50);
  await sleep(150);
}
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('.tu-tile')];

/** Picks letter `i` (its sound plays), then plays its word: the errors of both. */
export async function letter(i: number): Promise<{ sound: Measure | null; word: Measure | null }> {
  w.tutorSync = null;
  tiles()[i].click();
  await played();
  const sound = measure();
  if (sound) sound.label = tiles()[i].textContent ?? '';
  w.tutorSync = null;
  button('Word')!.click();
  await played();
  const word = measure();
  if (word) word.label = document.querySelector('.tu-word .txt b')?.textContent ?? '';
  return { sound, word };
}

/** The letter open, in slow motion (the button 'Slow motion', or the word's slow button with `word`). */
export async function slow(word = false): Promise<Measure | null> {
  w.tutorSync = null;
  (word ? document.querySelector<HTMLButtonElement>('.tu-word .tu-icon-btn:not(.on)') : button('Slow motion'))!.click();
  await played(40000);
  return measure();
}

/** Says a typed sentence (at the speed chosen). */
export async function typed(text: string): Promise<Measure | null> {
  const input = document.querySelector<HTMLInputElement>('.tu-say input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(60);
  w.tutorSync = null;
  document.querySelector<HTMLButtonElement>('.tu-say button[type=submit]')!.click();
  await played(40000);
  const m = measure();
  if (m) m.label = text;
  return m;
}

/** Chooses a speed of the player (1, 0.5, 0.25). */
export function speed(s: 1 | 0.5 | 0.25): void { button(s === 1 ? '1×' : s === 0.5 ? '½×' : '¼×')?.click(); }

let burnMs = 0, burning = false;
/** A slow computer: every frame takes `ms` more work on the page (0: off). */
export function burn(ms: number): void {
  burnMs = ms;
  if (burning || !ms) return;
  burning = true;
  const step = () => {
    if (!burnMs) { burning = false; return; }
    const e = performance.now() + burnMs;
    while (performance.now() < e) { /* the work */ }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** One line of a measurement. */
export const line = (m: Measure | null): string => (m ? `${m.label ?? ''} [${m.kind}${m.marked === false ? ' UNMARKED' : ''}] ${m.frames} frames ~${m.gapMs} ms apart: error ${m.minMs}..${m.maxMs} ms (mean ${m.meanMs}); late>45: ${m.late45}, early>125: ${m.early125}${m.visible ? '' : ' (tab hidden)'}` : 'nothing played');
