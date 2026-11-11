/**
 * The mirror's speaking video (mirrorClip.ts, mirrorVideo.ts): which clip goes with a recording, which moment of it
 * is shown for a moment of the sound, when the video has drifted from the sound and what is done about it. And, with
 * the real player and a made-up video (that takes time to start, to jump, and shows 30 frames a second) on computers
 * that draw sixty, twenty and four frames a second, that the frame on the screen is the frame of what is heard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { stagesOf, trajectory, keyTime } from '../src/ui/tutor/motion';
import { fit } from '../src/ui/tutor/align';
import type { VoiceClip } from '../src/ui/tutor/clips';
import {
  clipOf, ClipEntry, correction, DRIFT_OK, DRIFT_SEEK, FADE, mediaAt, NUDGE_MAX, opacityAt, parseClipList, recTimeOf, SEEK_EVERY,
} from '../src/ui/tutor/mirrorClip';
import { VideoFollower, VideoLike } from '../src/ui/tutor/mirrorVideo';

// ------------------------------------------------------------------- the arithmetic

describe('the list of clips', () => {
  it('keeps the entries that can be played and leaves out the rest', () => {
    const list = parseClipList({
      a: { f: 'a.mp4', t0: 0.2, dur: 1.5 },
      noFile: { t0: 0.2, dur: 1.5 },
      negative: { f: 'n.mp4', t0: -0.1, dur: 1.5 },
      empty: { f: 'e.mp4', t0: 0.2, dur: 0.2 },
      text: { f: 't.mp4', t0: '0.2', dur: 1.5 },
      nothing: null,
    });
    expect(Object.keys(list)).toEqual(['a']);
    expect(parseClipList(null)).toEqual({});
    expect(parseClipList([1, 2])).toEqual({});
  });

  it('finds the clip of a recording by the recording\'s own name, and of nothing else', () => {
    const list = parseClipList({ 'Naqsh|0.82|आम': { f: 'x.mp4', t0: 0.03, dur: 1.26 } });
    expect(clipOf(list, 'Naqsh|0.82|आम')?.f).toBe('x.mp4');
    expect(clipOf(list, 'Naqsh|0.82|आमा')).toBeNull();
    expect(clipOf(list, 'Naqsh|0.75|आम')).toBeNull();
    expect(clipOf(list, 'constructor')).toBeNull();
    expect(clipOf(list, null)).toBeNull();
    expect(clipOf(null, 'x')).toBeNull();
  });

  it('is the one the clips are made with: every clip is of a recording that exists, and its file is there', () => {
    const dir = new URL('../public/mirror/clips/', import.meta.url).pathname;
    const raw = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) as Record<string, unknown>;
    const list = parseClipList(raw);
    // (nothing the list says is dropped)
    expect(Object.keys(list)).toEqual(Object.keys(raw));
    const recordings = JSON.parse(readFileSync(new URL('../public/audio/tutor/manifest.json', import.meta.url).pathname, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(list).length).toBeGreaterThan(0);
    for (const [id, e] of Object.entries(list)) {
      expect(id in recordings, id).toBe(true);
      expect(existsSync(dir + e.f), e.f).toBe(true);
    }
  });
});

describe('which moment of the clip is shown', () => {
  const e: ClipEntry = { f: 'x.mp4', t0: 0.2, dur: 1.4 };
  it('is the recording\'s time on from where the recording starts in the clip, and stays in the clip', () => {
    expect(mediaAt(e, 0)).toBeCloseTo(0.2, 9);
    expect(mediaAt(e, 0.5)).toBeCloseTo(0.7, 9);
    expect(mediaAt(e, -0.3)).toBe(0);
    expect(mediaAt(e, 9)).toBe(1.4);
  });
  it('fades the video in over the photograph at the start of the clip and out at its end, and is all of it between', () => {
    expect(opacityAt(e, 0)).toBe(0);
    expect(opacityAt(e, FADE / 2)).toBeCloseTo(0.5, 9);
    expect(opacityAt(e, FADE)).toBe(1);
    expect(opacityAt(e, 0.7)).toBe(1);
    expect(opacityAt(e, e.dur - FADE / 2)).toBeCloseTo(0.5, 9);
    expect(opacityAt(e, e.dur)).toBe(0);
    // (a clip that starts right at the sound is half faded in at the sound's start, not cut in)
    expect(opacityAt({ ...e, t0: 0.03 }, mediaAt({ ...e, t0: 0.03 }, 0))).toBeLessThan(0.3);
  });
});

describe('when the video has come away from the sound', () => {
  it('leaves a drift of up to 40 ms alone', () => {
    for (const d of [0, 0.01, -0.02, DRIFT_OK, -DRIFT_OK]) expect(correction(d)).toEqual({ rate: 1, seek: false });
  });
  it('takes a larger one up by a change of speed of 4% at most, the right way, up to 70 ms', () => {
    const ahead = correction(0.05), behind = correction(-0.05);
    expect(ahead.seek).toBe(false);
    expect(ahead.rate).toBeLessThan(1);
    expect(behind.rate).toBeGreaterThan(1);
    // (as small a change as will do: 50 ms in a second and a half)
    expect(ahead.rate).toBeCloseTo(1 - 0.05 / 1.5, 9);
    for (const d of [0.05, 0.06, DRIFT_SEEK, -DRIFT_SEEK]) expect(Math.abs(correction(d).rate - 1)).toBeLessThanOrEqual(NUDGE_MAX + 1e-12);
    expect(Math.abs(correction(DRIFT_SEEK).rate - 1)).toBeCloseTo(NUDGE_MAX, 9);
  });
  it('jumps beyond that, unless it has just jumped (then it runs as fast or slow as it may)', () => {
    expect(correction(0.2)).toEqual({ rate: 1, seek: true });
    expect(correction(-0.5)).toEqual({ rate: 1, seek: true });
    expect(correction(0.2, false)).toEqual({ rate: 1 - NUDGE_MAX, seek: false });
    expect(correction(-0.2, false)).toEqual({ rate: 1 + NUDGE_MAX, seek: false });
  });
});

// -------------------------------------------------------- the video with the real player

/** the wall clock of the made-up computer, milliseconds */
let wall = 0;
/** when the recording's first sample is heard, on that clock */
let heardAt = 0;
let rec: VoiceClip;
let hasRec = true;

vi.mock('../src/ui/tutor/clips', () => ({
  voiceClip: async () => (hasRec ? rec : null),
  playClip: () => { heardAt = wall + 40; return { now: () => (wall - heardAt) / 1000, ended: new Promise<void>(() => {}), latency: () => 0.02 }; },
  stopClip: () => {},
}));

/** A recording of "bāb" as the script makes them: silence, then sound, with the times of its sounds beside it. */
function recording(): VoiceClip {
  const fs = 22050, n = Math.round(0.9 * fs), x = new Float32Array(n);
  for (let i = Math.round(0.05 * fs); i < Math.round(0.82 * fs); i++) {
    const t = i / fs;
    x[i] = 0.3 * Math.sin(2 * Math.PI * 120 * t) + 0.2 * Math.sin(2 * Math.PI * 720 * t) + 0.1 * Math.sin(2 * Math.PI * 1200 * t);
  }
  const buffer = { duration: n / fs, sampleRate: fs, length: n, numberOfChannels: 1, getChannelData: () => x } as unknown as AudioBuffer;
  return { buffer, t0: 0.05, t1: 0.82, marks: [-0.01, 0.072, 0.113, 0.604, 0.71, 0.755] };
}

function clip() {
  const ps = compactPhones('baːb');
  const vi_ = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  ps[vi_].stress = true; ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  const score = buildScore(ps, { lang: 'ar', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  const traj = trajectory(score);
  const stages = stagesOf(score.phones, traj);
  return { key: 'test', what: 'word' as const, speed: 1 as const, score, traj, stages, keyT: keyTime(stages, 'b'), label: 'bāb' };
}

/** The clip that goes with that recording: starts 0.2 s before the sound, and ends 0.3 s after it. */
const ENTRY: ClipEntry = { f: 'bab.mp4', t0: 0.2, dur: 0.2 + 0.9 + 0.3 };
const SHOWN_AFTER = 17;

/**
 * A <video> that takes `start` ms to show its first frame after play(), `seek` ms to show a frame after a jump, `load` ms
 * to be fetched, and that shows a frame every 1/30 s, seen `SHOWN_AFTER` ms after it is composed. `snaps` remembers how its
 * picture moved, so that what was on the screen at any instant can be asked afterwards.
 */
class FakeVideo implements VideoLike {
  src = '';
  paused = true;
  readyState = 0;
  duration = NaN;
  private rate = 1;
  private t = 0;
  private from = 0;
  private hold = 0;
  private moving = false;
  private seekEnd = 0;
  private loadEnd = Infinity;
  private cb: ((now: number, m: { mediaTime: number; expectedDisplayTime?: number }) => void) | null = null;
  private ls: Record<string, (() => void)[]> = {};
  private snaps: { at: number; f: (x: number) => number }[] = [];
  seeks = 0;
  played = 0;
  private told = 0;
  constructor(private o: { start: number; seek: number; load: number; dur: number; stuck?: boolean; lies?: number }) {}
  private cont(x: number): number { return x < this.from ? this.hold : this.t + (this.moving ? this.rate * (x - this.from) / 1000 : 0); }
  private rebase(): void { const n = wall; if (n >= this.from) { this.t = this.cont(n); this.from = n; } }
  get playbackRate(): number { return this.rate; }
  set playbackRate(v: number) { this.rebase(); this.rate = v; }
  // (the clock of the video, which has the place it was sent to as soon as it is sent; what is on the screen is `cont`)
  get currentTime(): number { return wall < this.from ? this.t : this.cont(wall); }
  set currentTime(x: number) { this.seeks++; if (this.o.stuck) return; this.hold = this.cont(wall); this.t = x; this.from = wall + this.o.seek; this.seekEnd = this.from; }
  get seeking(): boolean { return wall < this.seekEnd; }
  play(): Promise<void> {
    if (!this.moving) { this.rebase(); this.moving = true; this.from = Math.max(this.from, wall + this.o.start); this.hold = this.cont(wall); }
    this.paused = false;
    this.played++;
    return Promise.resolve();
  }
  pause(): void { this.rebase(); this.moving = false; this.paused = true; }
  load(): void { this.readyState = 0; this.loadEnd = wall + this.o.load; this.moving = false; this.paused = true; this.t = 0; this.from = 0; this.hold = 0; }
  addEventListener(type: string, fn: () => void): void { (this.ls[type] ??= []).push(fn); }
  fire(type: string): void { for (const fn of this.ls[type] ?? []) fn(); }
  requestVideoFrameCallback(cb: (now: number, m: { mediaTime: number; expectedDisplayTime?: number }) => void): number { this.cb = cb; return 1; }
  cancelVideoFrameCallback(): void { this.cb = null; }
  /** the page draws a frame now: a fetched video is ready, and the callback for the latest frame is told of it */
  tick(): void {
    if (this.readyState === 0 && wall >= this.loadEnd) { this.readyState = 4; this.duration = this.o.dur; this.fire('loadeddata'); }
    if (!this.cb || this.readyState < 2) return;
    const cb = this.cb;
    this.cb = null;
    // (a frame is shown at the refresh after the one it is composed in, and is the latest one not past the clock then)
    // (and, for a video that is told wrongly now and then, one in `lies` frames a good deal ahead of where it is)
    const lie = this.o.lies && ++this.told % this.o.lies === 0 ? 0.15 : 0;
    cb(wall, { mediaTime: this.quant(this.cont(wall + SHOWN_AFTER)) + lie, expectedDisplayTime: wall + SHOWN_AFTER });
  }
  /** (called after the page has done what it does at this frame) */
  remember(): void { const t = this.t, from = this.from, hold = this.hold, moving = this.moving, rate = this.rate; this.snaps.push({ at: wall, f: (x) => (x < from ? hold : t + (moving ? rate * (x - from) / 1000 : 0)) }); }
  private quant(m: number): number { return Math.floor(Math.max(0, m) * 30 + 1e-9) / 30; }
  /** the moment of the clip that is on the screen at wall time x (as the page last said what to do with the video before the frame was composed) */
  onScreen(x: number): number {
    let s = this.snaps[0];
    for (const k of this.snaps) if (k.at <= x - SHOWN_AFTER) s = k; else break;
    return this.quant(s.f(x));
  }
}

interface Run {
  /** for every instant the video is on the screen by more than half (and the sound is heard): what is shown minus what the sound is, seconds */
  errors: number[];
  /** how long after the sound starts the video is more than half shown, seconds */
  inAfter: number;
  video: FakeVideo;
  follower: VideoFollower;
  /** how much of the video shows at the end */
  last: number;
}

/**
 * Plays the clip with the recording on a computer that starts a frame every `gap()` ms, and keeps a video with it,
 * as MirrorPhoto does at every frame and between them: the player's cue, the follower. `plays`: how many times it is played in turn.
 */
async function watch(gap: () => number, vo: { start: number; seek: number; load: number; lies?: number }, plays = 1): Promise<Run> {
  const { Player } = await import('../src/ui/tutor/player');
  const queue: (() => void)[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { queue.push(cb); return queue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { queue.length = 0; });
  vi.spyOn(performance, 'now').mockImplementation(() => wall);
  wall = 1000; heardAt = Infinity;
  rec = recording(); hasRec = true;
  const c = clip();
  const p = new Player();
  const video = new FakeVideo({ ...vo, dur: ENTRY.dur });
  const follower = new VideoFollower(video);
  const f = fit(c.traj, c.score.phones, rec);
  const errors: number[] = [];
  let inAfter = Infinity;
  const frame = () => {
    const from = wall, g = gap();
    // (between the page's frames, a timer of 30 ms looks at the video while a recording plays, as MirrorPhoto does)
    for (let s = 30; s < g; s += 30) {
      wall = from + s;
      if (p.cue()?.playing) { follower.update(p.cue(), ENTRY, true, wall); video.remember(); }
    }
    wall = from + g;
    for (const cb of queue.splice(0)) cb();
    video.tick();
    follower.update(p.cue(), ENTRY, true, wall);
    video.remember();
  };
  for (let k = 0; k < plays; k++) {
    p.load(c);
    void p.play({ kind: 'voice', id: 'x', speak: () => { throw new Error('the recording is there'); } });
    heardAt = Infinity;
    const shown: { x: number; opacity: number }[] = [];
    const start = wall;
    for (let i = 0; i < 4000 && wall < Math.max(start, Number.isFinite(heardAt) ? heardAt : start) + 1000 * (ENTRY.dur - ENTRY.t0) + 1200; i++) {
      frame();
      for (let j = 0; j < 6; j++) await Promise.resolve();
      if (Number.isFinite(heardAt)) shown.push({ x: wall, opacity: follower.opacity });
      if (Number.isFinite(heardAt) && wall > heardAt + 1000 * (ENTRY.dur - ENTRY.t0) + 700) break;
    }
    // (what was on the screen at every millisecond of the sound, against what the sound was then)
    errors.length = 0;
    inAfter = Infinity;
    const end = heardAt + 1000 * f.end;
    for (let x = heardAt; x < end; x += 5) {
      let o = 0;
      for (const s of shown) if (s.x <= x) o = s.opacity; else break;
      if (o > 0.5) {
        inAfter = Math.min(inAfter, (x - heardAt) / 1000);
        errors.push(video.onScreen(x) - (ENTRY.t0 + (x - heardAt) / 1000));
      }
    }
  }
  const last = follower.opacity;
  p.pause();
  return { errors, inAfter, video, follower, last };
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

describe('the video keeps to the sound', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('the player names the recording as it plays, and gives the moment heard', async () => {
    const { Player } = await import('../src/ui/tutor/player');
    const queue: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { queue.push(cb); return queue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { queue.length = 0; });
    vi.spyOn(performance, 'now').mockImplementation(() => wall);
    wall = 1000; heardAt = Infinity; rec = recording(); hasRec = true;
    const c = clip();
    const p = new Player();
    expect(p.cue()).toBeNull();
    p.load(c);
    // loaded, not played: nothing of a recording yet
    expect(p.cue()).toBeNull();
    void p.play({ kind: 'voice', id: 'Naqsh|0.82|bab', speak: () => { throw new Error('the recording is there'); } });
    // the breath in: the recording is named (the video can be fetched) but no moment of it is shown
    expect(p.cue()).toEqual({ id: 'Naqsh|0.82|bab', playing: true, at: null });
    for (let i = 0; i < 400 && !Number.isFinite(heardAt); i++) {
      wall += 20;
      for (const cb of queue.splice(0)) cb();
      for (let k = 0; k < 6; k++) await Promise.resolve();
    }
    expect(Number.isFinite(heardAt)).toBe(true);
    // heard: the recording's own time, which is negative until its first sample is heard
    const cue = p.cue()!;
    expect(cue.playing).toBe(true);
    expect(cue.at).toBeCloseTo((wall - heardAt) / 1000, 6);
    wall = heardAt + 300;
    expect(p.cue()!.at).toBeCloseTo(0.3, 6);
    // paused: the moment of the recording that the movement is at, and it stays
    p.pause();
    const f = fit(c.traj, c.score.phones, rec);
    const paused = p.cue()!;
    expect(paused.playing).toBe(false);
    expect(paused.id).toBe('Naqsh|0.82|bab');
    expect(f.at(paused.at!)).toBeCloseTo(p.t, 2);
    // scrubbed: the moment of the recording of the time asked for
    for (const t of [0.05, 0.2, 0.4, c.traj.speech * 0.9]) {
      p.seek(t);
      const q = p.cue()!;
      expect(q.playing).toBe(false);
      expect(f.at(q.at!)).toBeCloseTo(t, 2);
    }
    // at rest (before the movement): no moment is shown
    p.load(c, 0);
    expect(p.cue()).toBeNull();
  });

  it('has no cue for a clip said by the model\'s voice, in silence, or by a voice that has no recording', async () => {
    const { Player } = await import('../src/ui/tutor/player');
    const queue: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { queue.push(cb); return queue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { queue.length = 0; });
    vi.spyOn(performance, 'now').mockImplementation(() => wall);
    wall = 1000; heardAt = Infinity; rec = recording();
    const c = clip();
    const p = new Player();
    // (no recording to be had: the browser's voice says it, and the mirror keeps its photographs)
    hasRec = false;
    p.load(c);
    void p.play({ kind: 'voice', id: 'x', speak: () => ({ started: new Promise<void>(() => {}), ended: new Promise<void>(() => {}), cancel: () => {} }) });
    for (let i = 0; i < 100; i++) { wall += 20; for (const cb of queue.splice(0)) cb(); for (let k = 0; k < 6; k++) await Promise.resolve(); }
    expect(p.cue()).toBeNull();
    p.pause();
    // silence
    hasRec = true;
    p.load(c);
    void p.play({ kind: 'none' });
    expect(p.cue()).toBeNull();
    p.pause();
    // a clip put on the stage after a recording was played forgets it
    p.load(c);
    void p.play({ kind: 'voice', id: 'x', speak: () => { throw new Error('the recording is there'); } });
    expect(p.cue()?.id).toBe('x');
    p.load(c);
    expect(p.cue()).toBeNull();
  });

  it('the moment of the recording for a time of the movement is the fit the other way round', () => {
    rec = recording();
    const c = clip(), f = fit(c.traj, c.score.phones, rec);
    let n = 0;
    for (let x = f.knots.audio[0] + 0.02; x < f.end; x += 0.011) {
      const t = f.at(x);
      if (t >= c.traj.speech) break;
      expect(Math.abs(recTimeOf(f.knots, t) - x), `at ${x.toFixed(3)} s`).toBeLessThan(0.003);
      n++;
    }
    expect(n).toBeGreaterThan(30);
    // before the sound and after it the recording goes on in real time (as the fit does)
    const { audio, model } = f.knots;
    expect(recTimeOf(f.knots, model[model.length - 1] + 0.1)).toBeCloseTo(audio[audio.length - 1] + 0.1, 6);
    expect(recTimeOf({ audio: [0.1, 0.5], model: [0, 0.4] }, -0.05)).toBeCloseTo(0.05, 9);
    expect(recTimeOf({ audio: [], model: [] }, 0.3)).toBe(0.3);
  });

  const computers: [string, () => number][] = [
    ['a fast one (60 frames a second)', () => 16.7],
    ['an ordinary one under load (20 a second)', () => 50],
    ['a slow one (6 a second)', () => 165],
    ['a very slow one (4 a second)', () => 250],
  ];
  for (const [name, gap] of computers) {
    it(`on ${name} the frame on the screen is the frame of what is heard, and the video is started once and not put back`, async () => {
      const r = await watch(gap, { start: 70, seek: 120, load: 30 });
      const e = r.errors;
      console.log(name, `shown ${e.length} ms/5; in after ${r.inAfter.toFixed(3)} s; error ms min/mean/max`, Math.round(1000 * Math.min(...e)), Math.round(1000 * mean(e)), Math.round(1000 * Math.max(...e)), 'seeks', r.video.seeks, 'nudges', r.follower.stats.nudges);
      expect(e.length).toBeGreaterThan(50);
      // seen less than 45 ms after its sound and less than 90 ms before it, at every instant of the sound, however few frames the page draws
      for (const v of e) { expect(v).toBeGreaterThan(-0.045); expect(v).toBeLessThan(0.09); }
      // more than half faded in soon after the sound has started (the video starts a little before it, takes its time to show a frame, and fades in over 120 ms); a slow computer notices later, by a few of its frames
      expect(r.inAfter).toBeLessThan(0.3 + 2 * gap() / 1000);
      // played from the start: once, and the only jump that may be needed is to make up what a start took to show
      expect(r.follower.stats.starts).toBe(1);
      expect(r.video.seeks).toBeLessThanOrEqual(2);
    });
  }

  it('with a video that is slow to start (200 ms) and to jump (300 ms), it learns how slow and is with the sound the second time', async () => {
    const first = await watch(() => 33, { start: 200, seek: 300, load: 50 });
    const second = await watch(() => 33, { start: 200, seek: 300, load: 50 }, 2);
    console.log('slow video: first, mean error ms', Math.round(1000 * mean(first.errors)), 'second', Math.round(1000 * mean(second.errors)), 'lag learnt', second.follower.lags.start.toFixed(3), 'seeks', first.video.seeks, second.video.seeks);
    // (the first start came out 200 ms late: that is put right, a jump at a time, before the video is shown, so that it is never shown off.
    // Here it takes the whole clip: the photographs are all there is the first time, and the video from the second)
    for (const v of first.errors) { expect(v).toBeGreaterThan(-0.045); expect(v).toBeLessThan(0.09); }
    expect(second.errors.length).toBeGreaterThan(20);
    // (a start is a jump and then a play, 300 ms) is learnt, and the next one is made that much ahead
    expect(second.follower.lags.start).toBeGreaterThan(0.25);
    expect(second.follower.lags.start).toBeLessThan(0.45);
    for (const v of second.errors) { expect(v).toBeGreaterThan(-0.045); expect(v).toBeLessThan(0.09); }
  });

  const decoders: [string, { start: number; seek: number; load: number }][] = [
    ['one that is at once on its feet (10 ms to start, 20 to jump)', { start: 10, seek: 20, load: 10 }],
    ['one that takes its time (150 ms to start, 150 to jump)', { start: 150, seek: 150, load: 80 }],
    ['one whose start is slower than its jumps (250 ms, 60 ms)', { start: 250, seek: 60, load: 40 }],
  ];
  for (const [name, vo] of decoders) {
    it(`with ${name}, what is shown is never off the sound by more than the eye allows`, async () => {
      const r = await watch(() => 50, vo);
      console.log(name, `shown ${r.errors.length} ms/5; in after ${r.inAfter.toFixed(3)} s; error ms`, Math.round(1000 * Math.min(...r.errors)), Math.round(1000 * mean(r.errors)), Math.round(1000 * Math.max(...r.errors)), 'seeks', r.video.seeks);
      // (the video is shown for a good part of the sound on all of them, the first time, and what is shown is right)
      expect(r.errors.length).toBeGreaterThan(30);
      for (const v of r.errors) { expect(v).toBeGreaterThan(-0.045); expect(v).toBeLessThan(0.09); }
    });
  }

  it('a frame that is told wrongly now and then (a busy page says its frames late) does not move a video that is in step', async () => {
    const r = await watch(() => 50, { start: 70, seek: 120, load: 30, lies: 4 });
    console.log('wrongly told frames: seeks', r.video.seeks, 'nudges', r.follower.stats.nudges, 'error ms', Math.round(1000 * Math.min(...r.errors)), Math.round(1000 * Math.max(...r.errors)));
    expect(r.errors.length).toBeGreaterThan(50);
    expect(r.video.seeks).toBeLessThanOrEqual(2);
    for (const v of r.errors) { expect(v).toBeGreaterThan(-0.045); expect(v).toBeLessThan(0.09); }
  });

  it('does not put the video back every frame: with a steady video it is left alone from the start to the end', async () => {
    const r = await watch(() => 16.7, { start: 60, seek: 100, load: 30 });
    expect(r.follower.stats.starts).toBe(1);
    expect(r.video.seeks).toBeLessThanOrEqual(1);
    expect(r.follower.stats.nudges).toBeLessThanOrEqual(2);
  });

  it('fades the video out at the end of the clip, and the photographs are all there is after it', async () => {
    const r = await watch(() => 33, { start: 60, seek: 100, load: 30 });
    expect(r.last).toBe(0);
  });

  it('a video that cannot be played leaves the photographs: nothing is shown and it is not tried again', () => {
    wall = 5000;
    const video = new FakeVideo({ start: 60, seek: 100, load: 30, dur: ENTRY.dur });
    const follower = new VideoFollower(video);
    const cue = { id: 'x', playing: true, at: 0.1 };
    follower.update(cue, ENTRY, true, wall);
    wall += 40;
    video.tick();
    video.fire('error');
    expect(follower.failed.has(ENTRY.f)).toBe(true);
    for (let i = 0; i < 20; i++) { wall += 33; video.tick(); expect(follower.update(cue, ENTRY, true, wall)).toBe(0); }
    expect(video.played).toBe(0);
    expect(video.paused).toBe(true);
  });

  it('with the photographs chosen, or a recording without a clip, the video is never started', () => {
    wall = 5000;
    for (const [entry, show] of [[ENTRY, false], [null, true]] as [ClipEntry | null, boolean][]) {
      const video = new FakeVideo({ start: 60, seek: 100, load: 30, dur: ENTRY.dur });
      const follower = new VideoFollower(video);
      for (let i = 0; i < 30; i++) { wall += 33; video.tick(); expect(follower.update({ id: 'x', playing: true, at: 0.1 + i * 0.033 }, entry, show, wall)).toBe(0); }
      expect(video.played).toBe(0);
      // (and not even fetched: a clip is loaded when its recording is about to be shown with it)
      expect(video.src).toBe('');
    }
  });

  it('paused or scrubbed, the video shows the frame of that moment by a jump, and does not play', () => {
    wall = 5000;
    const video = new FakeVideo({ start: 60, seek: 100, load: 30, dur: ENTRY.dur });
    const follower = new VideoFollower(video);
    const at = (t: number) => ({ id: 'x', playing: false, at: t });
    const step = (t: number) => { wall += 150; video.tick(); return follower.update(at(t), ENTRY, true, wall); };
    for (let i = 0; i < 5; i++) step(0.4);
    // (it is fetched, is shown, and is at the moment asked for)
    for (let i = 0; i < 12; i++) step(0.4);
    expect(video.paused).toBe(true);
    expect(video.played).toBe(0);
    expect(follower.opacity).toBe(1);
    expect(video.currentTime).toBeCloseTo(ENTRY.t0 + 0.4, 6);
    // scrubbed to another moment
    for (const t of [0.1, 0.55, 0.7]) { for (let i = 0; i < 4; i++) step(t); expect(video.currentTime).toBeCloseTo(ENTRY.t0 + t, 6); }
    // the same moment asked for again is not a new jump
    const n = video.seeks;
    for (let i = 0; i < 10; i++) step(0.7);
    expect(video.seeks).toBe(n);
    // at the very start of the clip the photograph is what shows, and when the cue is gone (a new clip) the video fades off
    for (let i = 0; i < 4; i++) step(-ENTRY.t0);
    expect(follower.opacity).toBe(0);
    for (let i = 0; i < 4; i++) step(0.4);
    expect(follower.opacity).toBe(1);
    for (let i = 0; i < 6; i++) { wall += 33; video.tick(); follower.update(null, null, true, wall); }
    expect(follower.opacity).toBe(0);
  });

  it('a fade takes FADE seconds, by the clock and not by the frames', () => {
    wall = 5000;
    const video = new FakeVideo({ start: 60, seek: 100, load: 30, dur: ENTRY.dur });
    const follower = new VideoFollower(video);
    const at = (t: number) => ({ id: 'x', playing: false, at: t });
    // the clip is fetched while it shows its first frame, which is nothing of it
    for (let i = 0; i < 12; i++) { wall += 10; video.tick(); follower.update(at(-ENTRY.t0), ENTRY, true, wall); }
    expect(follower.opacity).toBe(0);
    // then a moment in the middle of it: half of the fade is half a fade
    const from = wall;
    let half = 0;
    for (let i = 0; i < 40 && follower.opacity < 1; i++) {
      wall += 10; video.tick();
      follower.update(at(0.4), ENTRY, true, wall);
      if (!half && follower.opacity >= 0.5) half = wall - from;
    }
    expect(follower.opacity).toBe(1);
    expect(wall - from).toBeCloseTo(FADE * 1000, -1);
    expect(half).toBeCloseTo(FADE * 500, -1);
  });

  it('the jumps are never closer together than SEEK_EVERY, even for a video that does not get where it is sent', () => {
    wall = 5000;
    const video = new FakeVideo({ start: 60, seek: 100, load: 30, dur: ENTRY.dur, stuck: true });
    const follower = new VideoFollower(video);
    const jumps: number[] = [];
    let seeks = 0;
    for (let i = 0; i < 150; i++) {
      wall += 20; video.tick();
      follower.update({ id: 'x', playing: true, at: i * 0.02 - 0.2 }, ENTRY, true, wall);
      if (video.seeks !== seeks) { seeks = video.seeks; jumps.push(wall); }
    }
    // (the first is the start's own, and up to two jumps put it right as soon as the video has landed; after those, they are spaced)
    expect(jumps.length).toBeGreaterThanOrEqual(4);
    for (let i = 3; i < jumps.length; i++) expect(jumps[i] - jumps[i - 1]).toBeGreaterThanOrEqual(SEEK_EVERY * 1000 - 1);
    expect(follower.stats.seeks).toBe(jumps.length - 1);
  });
});
