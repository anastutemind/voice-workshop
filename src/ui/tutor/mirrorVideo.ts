/**
 * The mirror's speaking video, laid over the morphed photographs while a recording that has a clip is played
 * (the arithmetic is in mirrorClip.ts).
 *
 * The video is kept with the sound without being steered frame by frame. When the sound is heard the video is started at
 * the clip's moment that the sound is at, a little ahead by what a start takes to get going (learnt at every start and
 * jump), and left to run at its own rate, which is as steady as the sound's. Nothing of it is shown until it has landed
 * and runs; if it landed more than 40 ms late or 70 early (a start took longer or less than allowed for) it is jumped
 * right first.
 * From then on every look measures where the video's clock is against where the sound is (its `currentTime`, exact),
 * with what the frames on the screen add to it (`requestVideoFrameCallback` says which moment of the clip a frame is
 * and when it is shown), and only when the two have come 40 ms apart does it act: by running the video a little
 * faster or slower (4% at most) up to 70 ms, and beyond that by jumping (never twice within 350 ms).
 * A paused or scrubbed picture is a seek to the moment shown. The video fades in and out over the photograph (120 ms), so
 * that the head being a little elsewhere in the clip's first and last frames than in the photograph at rest does not show.
 *
 * It does not draw anything itself: the browser decodes and shows the video, off the page's own thread, so that a slow
 * page cannot make it stutter; this only says what to do with it. Without a clip, or with a clip that cannot be played,
 * nothing is done and the photographs are all there is.
 */
import { useSyncExternalStore } from 'react';
import { ClipEntry, ClipList, Cue, DRIFT_OK, DRIFT_SEEK, FADE, HALF_FRAME, SEEK_EVERY, SHOW_LEAD, correction, mediaAt, opacityAt, parseClipList } from './mirrorClip';

/** The part of a <video> that is used (so that a made-up one can stand in for it in tests). */
export interface VideoLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly seeking: boolean;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, fn: () => void): void;
  requestVideoFrameCallback?(cb: (now: number, meta: { mediaTime: number; expectedDisplayTime?: number }) => void): number;
  cancelVideoFrameCallback?(handle: number): void;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** the most that what the screen shows may be taken to lie off the video's clock, seconds */
const BIAS_MAX = 0.04;

export class VideoFollower {
  /** how much of the video shows (0..1): it moves toward what the clip's moment says at the speed of a fade */
  opacity = 0;
  /** the clips that could not be loaded or played (the photographs stand in for them) */
  readonly failed = new Set<string>();
  /** how many starts, jumps and changes of speed there were (for the tests and a look from the console) */
  readonly stats = { starts: 0, seeks: 0, nudges: 0 };
  /**
   * How long a start (from a stop: the decoder wakes) and a jump (while it runs) take before the video is running at the
   * place it was sent to, seconds. Learnt at every landing, and used to send the video that far ahead of where the sound is.
   */
  readonly lags = { start: 0.1, jump: 0.1 };
  private learnt = { start: false, jump: false };
  private file = '';
  private ready = false;
  private running = false;
  private asked = NaN;
  /**
   * A start or a jump was ordered and the video has not yet landed (is still seeking, or has not begun to run): what it
   * shows until then is an old picture. After a start, or a jump that puts a start right ('fix'), nothing of the video is
   * shown until it has landed.
   */
  private landing: 'start' | 'jump' | 'fix' | null = null;
  /** when (performance.now) it was ordered (later: when it landed), and to which moment of the clip */
  private began = 0;
  private ordered = 0;
  /** how many times a start has been put right (it came out far off) */
  private tries = 0;
  private lastSeek = -Infinity;
  private frame: { media: number; display: number; seen: number } | null = null;
  /** the frame last taken into account, and how the frames on the screen lie against the video's clock (seconds) */
  private counted: object | null = null;
  private bias = 0;
  private stamp = 0;
  private handle = 0;

  constructor(private readonly v: VideoLike, private readonly base = 'mirror/clips/') {
    v.addEventListener('loadeddata', () => { this.ready = true; });
    v.addEventListener('error', () => { if (this.file) this.failed.add(this.file); this.ready = false; this.running = false; });
    if (v.requestVideoFrameCallback) {
      const on = (now: number, meta: { mediaTime: number; expectedDisplayTime?: number }) => {
        // (a frame shown while the video is still jumping is the one it jumped from)
        if (!v.seeking) this.frame = { media: meta.mediaTime, display: meta.expectedDisplayTime ?? now, seen: now };
        this.handle = v.requestVideoFrameCallback!(on);
      };
      this.handle = v.requestVideoFrameCallback(on);
    }
  }

  /** What to set the video's opacity to: 0 while nothing is shown, never quite 0 while it runs (a browser draws no frames of a video that is wholly clear). */
  get shown(): number { return this.opacity > 0 ? Math.max(0.01, this.opacity) : this.running ? 0.01 : 0; }

  /**
   * One frame of the page. `cue` is what the player says (null: no recording goes with the clip), `entry` the clip of that
   * recording (null: it has none), `show` that the video is wanted at all, `now` performance.now(). Returns how much of the
   * video shows.
   */
  update(cue: Cue | null, entry: ClipEntry | null, show: boolean, now: number): number {
    const dt = this.stamp ? clamp((now - this.stamp) / 1000, 0, 0.5) : 0;
    this.stamp = now;
    let goal = 0;
    if (show && cue && entry && !this.failed.has(entry.f)) {
      if (this.file !== entry.f) this.open(entry.f);
      if (!this.ready && this.v.readyState >= 2) this.ready = true;
      if (this.ready && cue.at !== null) goal = cue.playing ? this.follow(cue.at, entry, now) : this.still(cue.at, entry);
      else this.stop();
    } else this.stop();
    const step = dt / FADE;
    this.opacity = goal > this.opacity ? Math.min(goal, this.opacity + step) : Math.max(goal, this.opacity - step);
    return this.opacity;
  }

  /** Lets go of the video. */
  dispose(): void {
    this.stop();
    if (this.handle && this.v.cancelVideoFrameCallback) this.v.cancelVideoFrameCallback(this.handle);
    this.handle = 0;
  }

  private open(file: string): void {
    const v = this.v;
    this.file = file;
    this.ready = false;
    this.running = false;
    this.asked = NaN;
    this.landing = null;
    this.frame = null;
    v.src = this.base + file;
    v.load();
  }

  /** The sound is heard at `at` (recording time): the video runs with it. Returns how much of the video the clip's moment would show. */
  private follow(at: number, e: ClipEntry, now: number): number {
    const v = this.v;
    // where the video's clock should be as this frame of the page is seen
    const raw = e.t0 + at + SHOW_LEAD;
    const end = Math.min(e.dur, Number.isFinite(v.duration) && v.duration > 0 ? v.duration : e.dur);
    if (raw >= end) { this.stop(); return 0; }
    if (!this.running || v.paused) {
      // (not yet: the clip cannot be started before its first frame; nor is it started again for the last of it, which is faded out)
      if (raw + this.lags.start < 0 || raw + this.lags.start > end - FADE) { this.stop(); return 0; }
      this.start(Math.max(0, raw + this.lags.start), now);
      return 0;
    }
    const shown = (): number => (this.landing === 'start' || this.landing === 'fix' ? 0 : opacityAt(e, raw));
    if (this.landing) {
      // on its way to where it was sent (jumping, or starting to run)
      if (v.seeking || v.readyState < 2 || !(v.currentTime > this.ordered + 0.004)) {
        // (nothing for a long while: it is stuck, and is started again)
        if (now - this.began > 1500) this.start(clamp(raw + this.lags.start, 0, end), now);
        return shown();
      }
      // It is there and runs. Where is its clock against the aim? The two have run side by side since it landed, so the
      // difference is what the landing took more or less than was allowed for: the next one is sent that much ahead.
      const off = v.currentTime - raw;
      const kind = this.landing === 'start' ? 'start' : 'jump';
      this.lags[kind] = clamp(this.lags[kind] - off * (this.learnt[kind] ? 0.5 : 1), 0.02, 0.4);
      this.learnt[kind] = true;
      // (a jump has not been timed yet: it is taken to take as long as the start, which is what a slow video is likely to do)
      if (kind === 'start' && !this.learnt.jump) this.lags.jump = this.lags.start;
      const hidden = this.landing !== 'jump';
      this.landing = null;
      this.began = now;
      this.frame = null;
      // A start that came out late (by more than 40 ms), or very early (by more than 70), is put right (a few times) before
      // the video is shown at all: it costs nothing, the photographs are what is seen meanwhile, and the video cannot be
      // brought back with a change of speed in a short clip. (The aim is a little early already; early lips are allowed.)
      if (hidden && (off < -DRIFT_OK || off > DRIFT_SEEK) && this.tries++ < 2) {
        this.jump(clamp(raw + this.lags.jump, 0, end), now, 'fix');
        return 0;
      }
    }
    // Where the video's clock is against the aim: exact, and read at every look.
    const clockDrift = v.currentTime - raw;
    // What the frames on the screen add to that: how they lie against the clock (a frame is a half frame older than it on
    // average, and the screen may be slow to show it). That changes slowly, and a single frame says it with some noise (a
    // page that is busy tells of a frame late, and its display time is a guess), so it is taken a frame at a time, a
    // quarter of it each, and never more than 40 ms of it.
    const f = this.frame;
    if (f && f !== this.counted && f.seen >= this.began) {
      this.counted = f;
      const shownDrift = f.media + HALF_FRAME - (e.t0 + at + (f.display - now) / 1000 + SHOW_LEAD);
      this.bias += (clamp(shownDrift - clockDrift, -BIAS_MAX, BIAS_MAX) - this.bias) * 0.25;
    }
    const drift = clockDrift + this.bias;
    const c = correction(drift, now - this.lastSeek >= SEEK_EVERY * 1000);
    if (c.seek) this.jump(clamp(raw + this.lags.jump, 0, end), now, 'jump');
    else if (Math.abs(v.playbackRate - c.rate) > 1e-4) { v.playbackRate = c.rate; if (c.rate !== 1) this.stats.nudges++; }
    return shown();
  }

  /** Paused, or being scrubbed: the frame of the moment. */
  private still(at: number, e: ClipEntry): number {
    const v = this.v;
    if (this.running || !v.paused) { v.pause(); this.running = false; this.asked = NaN; this.landing = null; }
    const m = mediaAt(e, at);
    if (!(Math.abs(this.asked - m) < 0.001)) { v.currentTime = m; this.asked = m; }
    return opacityAt(e, m);
  }

  private start(to: number, now: number): void {
    const v = this.v;
    this.running = true;
    this.landing = 'start';
    this.began = now;
    this.ordered = to;
    this.tries = 0;
    this.frame = null;
    this.stats.starts++;
    v.playbackRate = 1;
    if (Math.abs(v.currentTime - to) > 0.002) v.currentTime = to;
    this.asked = NaN;
    v.play().catch((err: unknown) => {
      // (a play that was cut short by a pause or by a new clip is not a failure)
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      if (this.file) this.failed.add(this.file);
      this.running = false;
    });
  }

  private jump(to: number, now: number, kind: 'jump' | 'fix'): void {
    this.stats.seeks++;
    this.lastSeek = now;
    this.landing = kind;
    this.began = now;
    this.ordered = to;
    this.frame = null;
    this.v.playbackRate = 1;
    this.v.currentTime = to;
  }

  private stop(): void {
    if (this.running || !this.v.paused) this.v.pause();
    this.running = false;
    this.asked = NaN;
    this.landing = null;
  }
}

// ------------------------------------------------------------ the list of clips

const LIST_URL = 'mirror/clips/manifest.json';
let known: ClipList | null = null;
let listing: Promise<ClipList> | null = null;
const listeners = new Set<() => void>();

/** Fetches the list of the clips once (an empty one if there is none or it cannot be read). */
export function loadClipList(): Promise<ClipList> {
  listing ??= fetch(LIST_URL)
    .then((r) => (r.ok ? r.json() : {}))
    .then(parseClipList, () => ({} as ClipList))
    .then((l) => { known = l; for (const fn of listeners) fn(); return l; });
  return listing;
}

const subscribeList = (fn: () => void): (() => void) => { listeners.add(fn); void loadClipList(); return () => listeners.delete(fn); };
const listNow = (): ClipList | null => known;

/** The list of the clips (null until it has been fetched). */
export function useClipList(): ClipList | null {
  return useSyncExternalStore(subscribeList, listNow);
}

// ------------------------------------------------------------ video or photograph

/** What the mirror shows for a recording that has a clip: the video, or the morphed photographs (to be compared). */
export type MirrorMode = 'video' | 'photo';
const MODE_KEY = 'voice-workshop.tutor.mirror';
// (the photo morph is what the mirror shows unless the video is chosen: a Kling clip's head and skin do not match the rest photograph)
let mode: MirrorMode = 'photo';
try { if (localStorage.getItem(MODE_KEY) === 'video') mode = 'video'; } catch { /* nothing remembered */ }
const modeListeners = new Set<() => void>();

export function setMirrorMode(m: MirrorMode): void {
  if (m === mode) return;
  mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  for (const fn of modeListeners) fn();
}

const subscribeMode = (fn: () => void): (() => void) => { modeListeners.add(fn); return () => modeListeners.delete(fn); };
const modeNow = (): MirrorMode => mode;

export function useMirrorMode(): MirrorMode {
  return useSyncExternalStore(subscribeMode, modeNow);
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { tutorMirrorMode: setMirrorMode });
