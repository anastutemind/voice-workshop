import type { Telemetry } from '../../dsp/engine/engine';
import type { EngineParams } from '../../dsp/engine/params';
import type { Program, EndReason } from '../../audio/programRunner';

export type { Program, EndReason };

export interface StreamBlock { out: Float32Array; flow: Float32Array; noise: Float32Array }

/**
 * Where the voice goes: the audio thread in the browser (AudioBridge), a fake
 * in the tests. Only the voice controller talks to it.
 */
export interface VoiceSink {
  readonly running: boolean;
  readonly sampleRate: number;
  /** starts or resumes the audio; `params` are the first ones the engine gets */
  start(params: EngineParams): Promise<void>;
  suspend(): Promise<void>;
  /** parameters to sound now and once the running program (id, 0 = none) is over */
  params(params: EngineParams, after: EngineParams, program: number): void;
  program(p: Program): void;
  stop(id: number): void;
  onTelemetry: (t: Telemetry, program: number) => void;
  onStream: (s: StreamBlock) => void;
  onEnded: (id: number, reason: EndReason, captured?: Float32Array) => void;
  onState: (running: boolean) => void;
  /** the engine's own time (`Telemetry.time`) of the sound heard at this instant, where the sink can tell (null: it cannot now) */
  heardTime?(): number | null;
  readonly micAnalyser: AnalyserNode | null;
  enableMic(): Promise<AnalyserNode>;
  disableMic(): void;
}
