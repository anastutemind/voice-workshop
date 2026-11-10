/**
 * The tutor's ear: listens to the learner at the microphone for one
 * attempt. It starts on a call, waits for a voice, stops by itself when the
 * voice has been quiet for a moment (or after a few seconds), and gives back
 * the attempt both as a sound to play again and as samples to analyse. The
 * microphone is asked for raw sound (no noise suppression, no automatic
 * gain): the hiss of an s and the puff of a p are exactly what a noise
 * suppressor removes.
 */
import { useSyncExternalStore } from 'react';

export interface Take {
  /** the attempt, to play back */
  url: string;
  samples: Float32Array;
  sampleRate: number;
  seconds: number;
}

export type EarState = 'idle' | 'asking' | 'listening' | 'working' | 'denied';

export class Recorder {
  state: EarState = 'idle';
  /** a voice was heard in this attempt */
  spoke = false;
  version = 0;
  /** the loudness now, 0..1, for a meter (called every frame while listening) */
  onLevel: ((level: number) => void) | null = null;
  private stopNow: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private lastUrl: string | null = null;

  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  private set(state: EarState): void { this.state = state; this.version++; for (const l of this.listeners) l(); }

  get supported(): boolean { return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'; }

  /** Listens to one attempt; null if the microphone is refused, nothing was recorded, or it is already listening. */
  async listen(maxMs = 4500): Promise<Take | null> {
    if (this.state === 'asking' || this.state === 'listening' || this.state === 'working') return null;
    if (!this.supported) { this.set('denied'); return null; }
    this.spoke = false;
    this.set('asking');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    } catch { this.set('denied'); return null; }
    const ac = new AudioContext();
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    return new Promise<Take | null>((resolve) => {
      let raf = 0;
      const t0 = performance.now();
      let floor = Infinity, spokeAt = 0, quietAt = 0;
      const stop = () => { if (rec.state === 'recording') rec.stop(); };
      this.stopNow = stop;
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        // the room's own noise, from the quietest moments so far
        if (now - t0 > 80) floor = Math.min(floor, Math.max(rms, 1e-4));
        const loud = rms > Math.max(0.006, floor * 4);
        this.onLevel?.(Math.min(1, rms * 9));
        if (loud) { if (!spokeAt) { spokeAt = now; this.spoke = true; this.set('listening'); } quietAt = 0; }
        else if (spokeAt && !quietAt) quietAt = now;
        if ((spokeAt && quietAt && now - quietAt > 650 && now - spokeAt > 250) || now - t0 > maxMs) { stop(); return; }
        raf = requestAnimationFrame(tick);
      };
      rec.onstop = async () => {
        cancelAnimationFrame(raf);
        this.stopNow = null;
        this.onLevel?.(0);
        stream.getTracks().forEach((t) => t.stop());
        this.set('working');
        let take: Take | null = null;
        try {
          if (chunks.length) {
            const blob = new Blob(chunks, { type: rec.mimeType });
            const audio = await ac.decodeAudioData(await blob.arrayBuffer());
            if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
            this.lastUrl = URL.createObjectURL(blob);
            take = { url: this.lastUrl, samples: audio.getChannelData(0).slice(), sampleRate: audio.sampleRate, seconds: audio.duration };
          }
        } catch { take = null; }
        void ac.close();
        this.set('idle');
        resolve(take);
      };
      rec.start();
      this.set('listening');
      raf = requestAnimationFrame(tick);
    });
  }

  /** Ends the attempt now. */
  stop(): void { this.stopNow?.(); }
}

export const recorder = new Recorder();

export function useRecorder(): Recorder {
  useSyncExternalStore(recorder.subscribe, () => recorder.version);
  return recorder;
}
