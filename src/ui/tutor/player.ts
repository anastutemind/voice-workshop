/**
 * The tutor's player: one clip (a letter's sound or its word, at a speed) and
 * one time in it. Play runs the time from the start, with the teacher's
 * voice, the model's own voice, or in silence; pause freezes it; seek moves
 * it by hand. The pictures draw the pose at that time, so playing, pausing,
 * stepping and scrubbing are the same thing seen at different times.
 */
import { useSyncExternalStore } from 'react';
import type { Score } from '../../dsp/engine/params';
import type { TutorSpeed } from '../store';
import { voice } from '../voice/voice';
import { Pose, poseAt, stageAt, Stage, Trajectory } from './motion';
import type { Handle } from './guide';
import type { Face } from './faces';
import { hush, Utterance } from './speech';
import { playClip, stopClip, voiceClip } from './clips';
import { fit } from './align';
import { Pace } from './sync';

export type What = 'sound' | 'word';

export interface Clip {
  key: string;
  what: What;
  speed: TutorSpeed;
  score: Score;
  traj: Trajectory;
  stages: Stage[];
  /** the instant that shows the letter best: where the picture rests */
  keyT: number;
  label: string;
}

/** What is heard while a clip plays: nothing, the model's voice (in step with the picture), or the teacher's voice. */
export type Sound = { kind: 'none' } | { kind: 'model' } | {
  kind: 'voice';
  /** the browser's own voice says it, when there is no recording (none: the model's voice does) */
  speak?: () => Utterance;
  /** names what is said, with which voice: its recording is looked up, and its length remembered, under it */
  id?: string;
};
export type Outcome = 'done' | 'stopped';

/** How long the breath in before a sound lasts, seconds: the mouth gets ready in the last part of it. */
const LEAD_IN = 0.9;
/** The teacher's voice is heard a little after it reports starting, and reports ending a little after it stops. */
const VOICE_LATENCY = 0.09, VOICE_TRAIL = 0.07;

/** How long the teacher's voice takes to say each thing it has said, seconds: learnt by saying it. */
const SPOKEN_KEY = 'voice-workshop.tutor.spoken';
const spoken = new Map<string, number>();
try { for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem(SPOKEN_KEY) ?? '{}') as Record<string, number>)) if (v > 0.1 && v < 8) spoken.set(k, v); } catch { /* nothing kept */ }
function remember(id: string, seconds: number): void {
  if (!(seconds > 0.1 && seconds < 8)) return;
  if (spoken.size > 400) spoken.clear();
  spoken.set(id, seconds);
  try { localStorage.setItem(SPOKEN_KEY, JSON.stringify(Object.fromEntries(spoken))); } catch { /* private mode */ }
}

export class Player {
  clip: Clip | null = null;
  t = 0;
  playing = false;
  version = 0;
  private token = 0;
  private raf = 0;
  private settle: ((r: Outcome) => void) | null = null;
  private listeners = new Set<() => void>();
  /** a part of the mouth pointed at by hand (the explanation, a row of the guide): it wins over the step's own */
  pin: Handle | null = null;
  /** the breath in before a sound: the mouth is still at rest, the air goes in */
  inhaling = false;
  private cache: { clip: Clip; t: number; pin: Handle | null; air: Face['air']; pose: Pose | null; face: Face | null } | null = null;
  /**
   * Where the time is now, while a clip plays: read from the clock of what is heard (the audio's for a voice,
   * the wall's in silence) every time a picture asks, never added up frame by frame. A computer that draws
   * few frames draws each of them at the right instant; it cannot fall behind the sound.
   */
  private clock: (() => number) | null = null;
  /** how far apart the frames come: a frame is drawn that much ahead of the sound, to be seen with it */
  readonly pace = new Pace();
  /** Runs `loop` at every frame, the time read first. */
  private run(my: number, loop: () => void): void {
    const frame = () => {
      if (my !== this.token) return;
      this.pace.frame(performance.now());
      if (this.clock) this.t = this.clock();
      loop();
    };
    this.raf = requestAnimationFrame(frame);
  }

  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  /** counts the times the time has been told while playing: what follows the time itself (the scrubber, the words of the readout) reads this */
  beat = 0;
  private timeListeners = new Set<() => void>();
  subscribeTime = (fn: () => void): (() => void) => { this.timeListeners.add(fn); return () => this.timeListeners.delete(fn); };
  private emit(): void { this.told = performance.now(); this.version++; this.beat++; for (const l of this.listeners) l(); for (const l of this.timeListeners) l(); }
  private told = 0;
  /** the step that is lit, as the page last heard it */
  private lit = -1;
  /**
   * Time has moved while playing. The pictures read the time themselves at every frame. The page around them is
   * told only when something it shows has changed: the step that is lit. The few things that follow the time
   * itself (the scrubber, the words of the readout) are told fifteen times a second, on a line of their own, so
   * that the whole page is not worked through again for them: on a slow computer that work took as long as
   * drawing a frame, and cost the mouth every third picture.
   */
  private tick(): void {
    const i = this.stage, st = this.clip?.stages[i];
    const lit = st && this.t <= st.t1 + 1e-6 ? i : -1 - i;
    if (lit !== this.lit) { this.lit = lit; this.emit(); return; }
    if (performance.now() - this.told >= 66) { this.told = performance.now(); this.beat++; for (const l of this.timeListeners) l(); }
  }

  /** The step the time is in (-1 before the first). */
  get stage(): number { return this.clip ? stageAt(this.clip.stages, this.t) : -1; }

  /** What the pictures show now. */
  face = (): Face | null => {
    const c = this.clip;
    if (!c) return null;
    // the time is read when the picture is drawn, not when some other loop last ran
    if (this.playing && this.clock) this.t = this.clock();
    // a person breathes in, speaks on the air going out, and stops: the air of a clip that plays follows that
    const air: Face['air'] = this.inhaling ? 'in' : this.playing ? 'out' : 'idle';
    if (this.cache?.clip !== c || this.cache.t !== this.t || this.cache.pin !== this.pin || this.cache.air !== air) {
      // the same pose while the time stands still, so the pictures keep what they painted
      const pose = this.cache?.clip === c && this.cache.t === this.t ? this.cache.pose : poseAt(c.traj, this.t);
      const s = c.stages[this.stage];
      const on = s && this.t <= s.t1 + 1e-6 ? s : null;
      this.cache = { clip: c, t: this.t, pin: this.pin, air, pose, face: pose ? { pose, focus: this.pin ?? on?.handle ?? null, part: this.pin ? null : on?.part ?? null, ipa: on?.ipa ?? null, air } : null };
    }
    return this.cache.face;
  };

  /** Points at a part of the mouth (null: back to the step's own). */
  point(handle: Handle | null): void {
    if (this.pin === handle) return;
    this.pin = handle;
    this.emit();
  }

  /** Puts a clip on the stage, at rest on its key instant (or at a time). */
  load(clip: Clip, t?: number): void {
    this.halt();
    this.clip = clip;
    // (left alone, a clip shows the mouth at rest, closed: the sound's own shape is seen when it is played or stepped to)
    this.t = t === undefined ? -LEAD_IN : Math.max(0, Math.min(clip.traj.duration, t));
    this.emit();
  }

  /**
   * Plays the clip from its start; resolves when it has ended or was stopped.
   * First a breath in with the mouth at rest, the mouth getting ready at the
   * end of it (the times below zero); then the sound. The picture keeps to
   * the sound's own clock: the engine's time for the model's voice; for the
   * teacher's voice, the moment it starts to sound and how long it lasts
   * (learnt the first time a sound is said, and used from then on).
   */
  play(sound: Sound): Promise<Outcome> {
    this.halt();
    const clip = this.clip;
    if (!clip) return Promise.resolve('stopped');
    const my = ++this.token;
    const end = clip.traj.duration, speech = clip.traj.speech;
    this.t = -LEAD_IN;
    this.playing = true;
    this.inhaling = true;
    this.pace.rest();
    this.emit();
    return new Promise<Outcome>((resolve) => {
      this.settle = resolve;
      const finish = (r: Outcome) => {
        if (my !== this.token) return;
        this.token++;
        cancelAnimationFrame(this.raf);
        this.clock = null;
        this.playing = false;
        this.inhaling = false;
        this.settle = null;
        if (r === 'done') this.t = -LEAD_IN;
        this.emit();
        resolve(r);
      };
      /** after the sound: the mouth goes back to rest, then the clip is over */
      const rest = (after: Promise<unknown> = Promise.resolve()) => {
        cancelAnimationFrame(this.raf);
        // (from where the picture is: a recording may end a little before the model's own sounds do)
        const from = Math.min(end, Math.max(0, this.t)), at = performance.now();
        this.clock = () => Math.min(end, from + (performance.now() - at) / 1000);
        const loop = () => {
          this.tick();
          if (this.t >= end) { this.clock = null; void after.then(() => setTimeout(() => finish('done'), 200)); }
          else this.run(my, loop);
        };
        this.run(my, loop);
      };
      const begin = async () => {
        // the teacher's voice is a recording when there is one (fetched during the breath in); without one,
        // the browser's voice if it has one for the language, and the model's own if not
        const got = recorded ? await recorded : null;
        // a recording made for other sounds (two letters written alike, said differently by the tutor) is not
        // played with this clip: its times would not be this clip's, and the mouth would be out of step with it
        const rec = got && (!got.marks || fit(clip.traj, clip.score.phones, got).marked) ? got : null;
        if (my !== this.token) return;
        if (sound.kind === 'model' || (sound.kind === 'voice' && !rec && !sound.speak)) {
          // the model's voice: the picture follows the time of the audio
          // (the audio is woken first, so that a stop while it wakes leaves nothing to sound later)
          const cold = !voice.running;
          void voice.ensureAudio().then((ok) => (cold && ok ? new Promise<boolean>((r) => setTimeout(() => r(ok), 250)) : ok)).then((ok) => {
            if (my !== this.token) return;
            if (!ok) finish('stopped');
            else void voice.speak(clip.score, { it: clip.label, en: clip.label }).then((r) => {
              if (my !== this.token || r !== 'done') finish(r); else rest();
            });
          });
          // (the time of what is heard, and a frame's lead on it, as for a recording. Until the voice is heard
          // the mouth waits in its first posture: the wall clock since the voice was asked for runs ahead of it
          // by the time the audio takes to start, and the picture would then have to jump back; only if the
          // engine says nothing for a while is the wall clock followed)
          const trace: number[] = [];
          if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { tutorSync: { kind: 'model', trace, traj: clip.traj, pace: this.pace } });
          this.clock = () => {
            const p = voice.lanes.performer.kind === 'sentence' ? voice.progress() : null;
            return p && (p.heard || p.t > 0.4) ? Math.min(speech, p.t + this.pace.lead()) : this.t;
          };
          const loop = () => {
            if (import.meta.env.DEV) { const p = voice.progress(); if (p?.heard) trace.push(p.t, this.t, performance.now()); }
            this.tick(); this.run(my, loop);
          };
          this.run(my, loop);
          return;
        }
        if (sound.kind === 'voice') {
          // the teacher's voice: the mouth waits in its first posture until the voice sounds, then
          // goes through the sound in the time the voice takes to say it
          // a recording of it, if there is one: the picture then reads the audio's own clock, and where
          // the sound starts and stops in the recording is measured, not guessed
          const live = rec ? playClip(rec) : null;
          if (rec && live) {
            // the movement is fitted to the recording, sound by sound: the picture is where the recording is,
            // drawn as far ahead of it as a frame takes to be seen
            const f = fit(clip.traj, clip.score.phones, rec);
            const trace: number[] = [];
            if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { tutorSync: { kind: 'recording', t0: rec.t0, t1: rec.t1, dur: rec.buffer.duration, latency: live.latency(), trace, fit: f, rec, traj: clip.traj, now: live.now, pace: this.pace } });
            this.clock = () => Math.min(speech, f.at(live.now() + this.pace.lead()));
            const loop = () => {
              const now = live.now();
              if (import.meta.env.DEV) trace.push(now, this.t, performance.now());
              this.tick();
              if (now >= f.end) rest(live.ended); else this.run(my, loop);
            };
            this.run(my, loop);
            return;
          }
          const said = sound.speak!();
          const known = sound.id ? spoken.get(sound.id) : undefined;
          let t0 = 0;
          void said.started.then(() => {
            if (my !== this.token) return;
            t0 = performance.now();
            const span = known ? Math.max(0.12, known - VOICE_LATENCY - VOICE_TRAIL) : speech;
            const heard = () => (performance.now() - t0) / 1000 - VOICE_LATENCY;
            this.clock = () => { const el = heard() + this.pace.lead(); return el <= 0 ? 0 : Math.min(speech, (speech * el) / span); };
            const loop = () => {
              this.tick();
              if (heard() >= span) rest(said.ended); else this.run(my, loop);
            };
            this.run(my, loop);
          });
          void said.ended.then(() => {
            // said to the end: how long it took is kept for the next time
            if (my === this.token && t0 && sound.id) remember(sound.id, (performance.now() - t0) / 1000);
          });
          return;
        }
        // in silence: at the clip's own speed
        const at = performance.now();
        this.clock = () => Math.min(speech, (performance.now() - at) / 1000);
        const loop = () => {
          this.tick();
          if (this.t >= speech) rest(); else this.run(my, loop);
        };
        this.run(my, loop);
      };
      // the recording is fetched during the breath in, so that it is ready when the sound is due
      const recorded = sound.kind === 'voice' && sound.id ? voiceClip(sound.id) : null;
      const began = performance.now();
      this.clock = () => Math.min(0, -LEAD_IN + (performance.now() - began) / 1000);
      const leadIn = () => {
        if (this.t >= 0) {
          // (the mouth holds its first posture until the sound's own clock takes over)
          this.clock = () => 0;
          this.inhaling = false; this.emit(); void begin(); return;
        }
        this.tick();
        this.run(my, leadIn);
      };
      this.run(my, leadIn);
    });
  }

  /** Freezes the picture where it is; the sound stops. */
  pause(): void { this.halt(); }

  /** Moves the time by hand (a playing clip pauses). */
  seek(t: number): void {
    this.halt();
    if (!this.clip) return;
    this.t = Math.max(0, Math.min(this.clip.traj.duration, t));
    this.emit();
  }

  /** To the middle of the step before or after the one shown. */
  step(dir: -1 | 1): void {
    const c = this.clip;
    if (!c || !c.stages.length) return;
    const i = Math.max(0, Math.min(c.stages.length - 1, this.stage + dir));
    this.seek(c.stages[i].key);
  }

  private halt(): void {
    if (!this.playing) return;
    this.token++;
    cancelAnimationFrame(this.raf);
    this.clock = null;
    this.inhaling = false;
    hush();
    stopClip();
    if (voice.lanes.performer.kind !== 'hands') voice.stop();
    this.playing = false;
    const s = this.settle;
    this.settle = null;
    this.emit();
    s?.('stopped');
  }
}

export const player = new Player();

/** Re-renders with the player: its clip, playing or not, the step that is lit, a time set by hand. Not with every moment of a clip that plays (see `usePlayerTime`). */
export function usePlayer(): Player {
  useSyncExternalStore(player.subscribe, () => player.version);
  return player;
}

/** Re-renders with the player's time, fifteen times a second while a clip plays: for the small things that show the time itself. */
export function usePlayerTime(): Player {
  useSyncExternalStore(player.subscribeTime, () => player.beat);
  return player;
}

// handy for debugging in the browser console during development
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { tutorPlayer: player });
