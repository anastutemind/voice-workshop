import workletUrl from './worklet.ts?worker&url';
import type { Telemetry } from '../dsp/engine/engine';
import type { EngineParams } from '../dsp/engine/params';
import type { Program, RunnerIn, RunnerOut, EndReason } from './programRunner';
import type { VoiceSink, StreamBlock } from '../ui/voice/sink';

/**
 * Main-thread side of the audio: owns the AudioContext, the worklet node
 * and the optional microphone. Messages keep their order; parameters sent in
 * the same task are coalesced into the last one.
 */
export class AudioBridge implements VoiceSink {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private master: GainNode | null = null;
  private queue: RunnerIn[] = [];
  private flushing = false;
  micAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;

  onTelemetry: (t: Telemetry, program: number) => void = () => {};
  onStream: (s: StreamBlock) => void = () => {};
  onEnded: (id: number, reason: EndReason, captured?: Float32Array) => void = () => {};
  onState: (running: boolean) => void = () => {};

  get running(): boolean { return !!this.ctx && this.ctx.state === 'running'; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 48000; }

  private starting: Promise<void> | null = null;

  /** Starts (or resumes) the audio; concurrent calls share one start, so only one engine ever runs. */
  start(params: EngineParams): Promise<void> {
    if (!this.starting) this.starting = this.doStart(params).finally(() => { this.starting = null; });
    return this.starting;
  }

  private context(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const master = ctx.createGain();
      master.gain.value = 1;
      // a limiter on the way out: the bursts of a sentence, or a volume pushed
      // up, never reach the speakers as a jolt
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      ctx.onstatechange = () => this.onState(this.running);
      this.ctx = ctx; this.master = master;
    }
    return this.ctx;
  }

  private async doStart(params: EngineParams): Promise<void> {
    const ctx = this.context();
    if (!this.node) {
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'voice-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e: MessageEvent<RunnerOut>) => {
        const d = e.data;
        if (d.type === 'telemetry') {
          // what the engine reports is what it has just computed; it is heard later, by the time the sound
          // takes to leave the computer. The pictures are drawn from it: it is handed on when it is heard,
          // so that lips and sound are together
          const late = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
          if (late > 8) setTimeout(() => this.onTelemetry(d.telemetry, d.program), late);
          else this.onTelemetry(d.telemetry, d.program);
        }
        else if (d.type === 'stream') this.onStream(d);
        else if (d.type === 'ended') this.onEnded(d.id, d.reason, d.captured);
      };
      node.connect(this.master!);
      // the first parameters snap the articulators; anything sent before the node existed follows
      node.port.postMessage({ type: 'params', params, after: params, program: 0 } satisfies RunnerIn);
      this.node = node;
      this.flush();
    }
    if (ctx.state !== 'running') await ctx.resume();
    this.onState(this.running);
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    this.onState(this.running);
  }

  private send(m: RunnerIn): void {
    const last = this.queue[this.queue.length - 1];
    if (m.type === 'params' && last?.type === 'params') this.queue[this.queue.length - 1] = m;
    else this.queue.push(m);
    if (this.flushing || !this.node) return;
    // a microtask, so it also works while the page is in the background, where animation frames are paused
    this.flushing = true;
    queueMicrotask(() => this.flush());
  }

  private flush(): void {
    this.flushing = false;
    if (!this.node) return;
    for (const m of this.queue) this.node.port.postMessage(m);
    this.queue = [];
  }

  params(params: EngineParams, after: EngineParams, program: number): void { this.send({ type: 'params', params, after, program }); }
  program(p: Program): void { this.send({ type: 'program', program: p }); }
  stop(id: number): void { this.send({ type: 'stop', id }); }

  /** Opt-in microphone analysis (never routed to the speakers). */
  async enableMic(): Promise<AnalyserNode> {
    const ctx = this.context();
    if (ctx.state !== 'running') await ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    this.micStream = stream;
    this.micAnalyser = an;
    return an;
  }

  disableMic(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micAnalyser = null;
  }
}
