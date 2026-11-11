/**
 * The mirror's speaking video, the part that is only arithmetic (mirrorVideo.ts
 * is the part that touches the <video>).
 *
 * Every recording of the teacher may have a clip: the man of the mirror,
 * filmed saying it (scripts/mirror-kling.ts, public/mirror/clips). The list of
 * the clips is keyed like the list of the recordings (clips.ts: voice, speed
 * and text), and says, for each, its file, where in the clip the recording's
 * own time zero lies (`t0`: the clip starts a little before the sound) and how
 * long the clip is.
 *
 * The clip is shown at media time `t0 + (the recording's time)`, the
 * recording's time being the one the sound is heard at (`Player.cue`). The
 * video then runs by itself at its own rate, as steady as the sound: it is
 * never put back at every frame (that would stutter), only when it has come
 * away from the sound, a little by a little change of its speed, a lot by a
 * jump.
 */

/** What public/mirror/clips/manifest.json says of one recording. */
export interface ClipEntry {
  /** the file, in the folder of the manifest */
  f: string;
  /** where in the clip the recording's first sample lies, seconds */
  t0: number;
  /** how long the clip is, seconds */
  dur: number;
}
export type ClipList = Record<string, ClipEntry>;

/** What the player tells the mirror: which recording is (or was last) played with the clip on the stage, and where its sound is. */
export interface Cue {
  /** the recording, as the list of the recordings names it (and the list of the clips) */
  id: string;
  /** the sound is running: `at` is the time heard now. Otherwise the picture is paused, or being scrubbed: `at` is the time of the moment shown */
  playing: boolean;
  /** the recording's time (seconds from its first sample; negative until it is heard); null: no moment of it is shown now (at rest, in the breath before it) */
  at: number | null;
}

/** how long the video fades in over the photograph at its start, and out at its end, seconds */
export const FADE = 0.12;
/** the clips are filmed at 30 frames a second: half a frame, seconds */
export const HALF_FRAME = 1 / 60;
/**
 * How far ahead of the sound the clock of the video is aimed, seconds. The frame on the screen is the latest one that is
 * not past the video's clock, so on average a half frame older than it, and it stays on the screen for a frame: seen at its
 * middle it is a whole frame behind the clock. Aimed a little more than that ahead, the lips are a little early, never late
 * (late lips are seen from 45 ms; early ones are allowed more than twice that).
 */
export const SHOW_LEAD = 0.035;
/** a drift (shown minus wanted, seconds) smaller than this is left alone (the frames of a video, 33 ms apart, make a steady one read 17 ms either way) */
export const DRIFT_OK = 0.04;
/** ...larger than this is taken out by jumping (a speed change of 4% takes up 40 ms in a second, 50 in a whole clip: not enough) */
export const DRIFT_SEEK = 0.07;
/** the video runs this much faster or slower than the sound, at most (a fraction) */
export const NUDGE_MAX = 0.04;
/** the drift is meant to be taken up in this many seconds */
export const NUDGE_SPAN = 1.5;
/** two jumps are at least this far apart, seconds (a jump needs the video to be decoded again from a key frame) */
export const SEEK_EVERY = 0.35;

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Reads public/mirror/clips/manifest.json; an entry that cannot be played (no file, no length) is left out. */
export function parseClipList(json: unknown): ClipList {
  const out: ClipList = {};
  if (!json || typeof json !== 'object') return out;
  for (const [id, e] of Object.entries(json as Record<string, unknown>)) {
    const v = e as Partial<ClipEntry> | null;
    if (v && typeof v.f === 'string' && v.f && finite(v.t0) && finite(v.dur) && v.t0 >= 0 && v.dur > v.t0) out[id] = { f: v.f, t0: v.t0, dur: v.dur };
  }
  return out;
}

/** The clip of a recording, or null if it has none. */
export function clipOf(list: ClipList | null | undefined, id: string | null | undefined): ClipEntry | null {
  return list && id && Object.prototype.hasOwnProperty.call(list, id) ? list[id] : null;
}

/** The moment of the clip for a moment of the recording (kept inside the clip). */
export function mediaAt(e: ClipEntry, rec: number): number {
  return Math.max(0, Math.min(e.dur, e.t0 + rec));
}

/** How much of the video shows (0: the photograph alone, 1: the video alone) at a moment of the clip: it fades in over its first FADE seconds and out over its last. */
export function opacityAt(e: ClipEntry, media: number): number {
  return Math.max(0, Math.min(1, media / FADE, (e.dur - media) / FADE));
}

/**
 * The moment of the recording that the model's movement is at `t` seconds into it: what `Fit.at` (align.ts) gives the
 * other way round, from the same knots. It is what a paused or scrubbed picture asks the video for.
 */
export function recTimeOf(knots: { audio: number[]; model: number[] }, t: number): number {
  const { audio: a, model: m } = knots;
  const S = m.length - 1;
  if (S < 0) return t;
  // (as Fit.at does: the stretches that lie before the recording's sound have no time in it)
  let first = 0;
  while (first < S - 1 && a[first + 1] <= a[first]) first++;
  if (t <= m[first]) return a[first] + (t - m[first]);
  if (t >= m[S]) return a[S] + (t - m[S]);
  let s = first;
  while (s < S - 1 && t >= m[s + 1]) s++;
  const len = m[s + 1] - m[s];
  return len > 0 ? a[s] + ((t - m[s]) / len) * (a[s + 1] - a[s]) : a[s + 1];
}

/** What to do about a drift: the speed of the video (1: its own), or a jump to where it should be. */
export interface Correction { rate: number; seek: boolean }

/**
 * `drift` is where the video is minus where it should be (seconds; positive: ahead of the sound). Within 40 ms it is
 * left alone; up to 70 ms it is taken up by a change of speed that is as small as will do (4% at most); beyond that
 * the video jumps. (`canSeek`: a jump was made not long ago: the largest change of speed is used instead.)
 */
export function correction(drift: number, canSeek = true): Correction {
  const d = Math.abs(drift);
  if (d <= DRIFT_OK) return { rate: 1, seek: false };
  if (d > DRIFT_SEEK && canSeek) return { rate: 1, seek: true };
  const nudge = Math.min(NUDGE_MAX, d / NUDGE_SPAN);
  return { rate: 1 - Math.sign(drift) * nudge, seek: false };
}
