/**
 * The teacher's voice as recordings. The browser's speech voice gives no
 * clock: it does not say when the sound really starts, nor how the word is
 * laid out in time, so a picture can only guess along. A recording can be
 * measured: where the sound starts and stops in it is found in its samples,
 * and it plays on the audio clock, which the picture then reads. The files
 * (public/audio/tutor, made with the system's voices by a script) are
 * optional: without one for what is to be said, the speech voice says it.
 */
import { heardNow } from './sync';

export interface VoiceClip {
  buffer: AudioBuffer;
  /** where the sound starts and stops in the recording, seconds */
  t0: number;
  t1: number;
  /** where each sound of what is said starts and stops, seconds from `from`: written when the recording was made */
  marks?: number[];
  /** what the marks are counted from: the instant the recording first gets loud (align.ts rise; a number: through that loudness), or, in recordings made before, the first moment something is heard */
  from?: 'rise' | 'onset' | number;
}

/**
 * The voices the recordings were made with, by the language of what they say (Urdu is read from Devanagari
 * by the Hindi voice): a recording is looked up by its voice, the speed it was asked at, and the text.
 */
export const RECORDED_VOICE: Record<string, string> = { ur: 'Lekha', hi: 'Lekha', ar: 'Majed', en: 'Samantha', 'en-GB': 'Daniel' };
/** The name a recording of `text` in a language goes by (null: no recordings are made in that language). */
export const recordingId = (lang: string, rate: number, text: string): string | null => (RECORDED_VOICE[lang] ? `${RECORDED_VOICE[lang]}|${rate}|${text}` : null);

const DIR = 'audio/tutor/';
let ctx: AudioContext | null = null;
/** what the list of recordings says of one: its file, the times of its sounds and what they are counted from (an older list: the file alone) */
type Entry = string | { f: string; k?: number[]; z?: 'rise' | number };
let manifest: Promise<Record<string, Entry>> | null = null;
const clips = new Map<string, Promise<VoiceClip | null>>();
let playing: AudioBufferSourceNode | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? window.AudioContext : undefined;
  if (!AC) return null;
  ctx = new AC({ latencyHint: 'interactive' });
  return ctx;
}

/** Where the sound is in a recording: from the first to the last moment it is above a tenth of its loudest. */
function span(buffer: AudioBuffer): [number, number] {
  const d = buffer.getChannelData(0), sr = buffer.sampleRate;
  const win = Math.max(1, Math.round(sr * 0.004));
  const n = Math.floor(d.length / win);
  const rms = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * win, e = j + win; j < e; j++) s += d[j] * d[j];
    rms[i] = Math.sqrt(s / win);
    if (rms[i] > peak) peak = rms[i];
  }
  if (!(peak > 0)) return [0, buffer.duration];
  const th = peak * 0.1;
  let a = 0, b = n - 1;
  while (a < n && rms[a] < th) a++;
  while (b > a && rms[b] < th) b--;
  return [(a * win) / sr, ((b + 1) * win) / sr];
}

/** The recording of something the teacher says (named as the player names it), or null if there is none. */
export function voiceClip(id: string): Promise<VoiceClip | null> {
  let p = clips.get(id);
  if (!p) {
    p = (async () => {
      const ac = audio();
      if (!ac) return null;
      manifest ??= fetch(DIR + 'manifest.json').then((r) => (r.ok ? (r.json() as Promise<Record<string, Entry>>) : {})).catch(() => ({}));
      const entry = (await manifest)[id];
      if (!entry) return null;
      const file = typeof entry === 'string' ? entry : entry.f;
      const r = await fetch(DIR + file);
      if (!r.ok) return null;
      const buffer = await ac.decodeAudioData(await r.arrayBuffer());
      const [t0, t1] = span(buffer);
      return { buffer, t0, t1, ...(typeof entry !== 'string' && entry.k ? { marks: entry.k, from: entry.z ?? ('onset' as const) } : {}) } as VoiceClip;
    })().catch(() => null);
    if (clips.size > 300) clips.clear();
    clips.set(id, p);
  }
  return p;
}

/**
 * Plays a recording. `now()` is the time since its first sample was heard
 * (negative until then): the audio's own clock, read where the sound leaves
 * the computer; `ended` resolves when it is over or stopped.
 */
export function playClip(clip: VoiceClip): { now: () => number; ended: Promise<void>; latency: () => number } | null {
  const ac = audio();
  if (!ac) return null;
  stopClip();
  void ac.resume();
  const src = ac.createBufferSource();
  src.buffer = clip.buffer;
  src.connect(ac.destination);
  const at = ac.currentTime + 0.04;
  src.start(at);
  playing = src;
  const ended = new Promise<void>((res) => { src.onended = () => { if (playing === src) playing = null; res(); }; });
  const late = () => (ac.outputLatency || 0) + (ac.baseLatency || 0);
  return { now: () => heardNow(ac, performance.now()) - at, ended, latency: late };
}

/** Cuts the recording that is playing. */
export function stopClip(): void {
  const s = playing;
  playing = null;
  try { s?.stop(); } catch { /* not started */ }
}
