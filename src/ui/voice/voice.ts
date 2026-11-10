/**
 * The one door to the voice. Every change of what is heard goes through this
 * controller: the hands (sliders, the head, the presets), the performers (a
 * sentence, a melody, a pitch glide, a clip) and the filter (head, tube or
 * none). It keeps the hands' parameters, decides who owns each control, and
 * is the only code that talks to the audio (through a VoiceSink).
 *
 * The rules:
 *  - a performer owns some controls while it plays (see drivers.ts); edits to
 *    them are refused, unless the edit asks to take over, which first stops
 *    the performer and keeps the posture and pitch that were sounding
 *  - when a performer ends or is stopped the hands are back: the head glides
 *    to the posture it had before, and the lungs are off, so nothing starts
 *    sounding again by itself
 *  - a tube or no filter leaves the posture (and more) without effect; those
 *    controls are locked until the head is the filter again
 *  - the hands' voice sounds for a breath: it rests BREATH_MS after the last
 *    change (a phoneme picked, a handle or a slider moved), so that nothing
 *    drones on; while a hand drags the head it keeps sounding. `sustain`
 *    (the Lab's Hold) keeps it sounding
 */
import type { Telemetry } from '../../dsp/engine/engine';
import { defaultParams, EngineParams, Score, DEFAULT_SOURCE, DEFAULT_NOISE } from '../../dsp/engine/params';
import { CMH2O } from '../../dsp/constants';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../../dsp/tract/types';
import { PHONEMES } from '../../dsp/speech/phonemes';
import { colourCurve } from '../../dsp/noise/noise';
import { applyPhoneme } from '../presets';
import { ControlId, touched, cloneParams, DeepReadonly } from './controls';
import { Bi, Filter, Lanes, Lock, lockOf, Performer } from './drivers';
import type { VoiceSink, StreamBlock, EndReason } from './sink';

export type Result = 'done' | 'stopped';

/** Time and timers, replaceable in the tests. */
export interface Clock {
  now(): number;
  every(ms: number, fn: () => void): () => void;
  after(ms: number, fn: () => void): () => void;
}

const realClock: Clock = {
  now: () => performance.now(),
  every: (ms, fn) => { const id = setInterval(fn, ms); return () => clearInterval(id); },
  after: (ms, fn) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
};

export const DRAWN_TUBE: Bi = { it: 'tubo disegnato a mano', en: 'hand-drawn tube' };
/** Name of a tube measured by MRI. */
export const mriTube = (ipa: string): Bi => ({ it: `tubo misurato della /${ipa}/`, en: `measured tube of /${ipa}/` });
/** telemetry older than this no longer describes what sounds, ms */
const LIVE_MS = 300;
/** how long the hands' voice sounds after the last change, ms: a breath */
export const BREATH_MS = 2500;
/** the output volume the voice starts with, dB: a held vowel near -30 dBFS */
export const START_VOLUME = -8;

export class VoiceController {
  private _manual: EngineParams;
  private _lanes: Lanes = { filter: { kind: 'head' }, performer: { kind: 'hands' } };
  /** the state a clip plays (A/B), when it is not the hands' */
  private clipParams: EngineParams | null = null;
  private timing = { t0: 0, seconds: 0 };
  private sink: VoiceSink | null = null;
  /** latest telemetry of the engine and the program it came from (0 = the hands) */
  telemetry: Telemetry | null = null;
  telemetryProgram = 0;
  private telemetryTime = -1e9;
  private nextId = 1;
  private waiters = new Map<number, { resolve: (r: Result) => void; captured?: (s: Float32Array) => void }>();
  private stopGlide: (() => void) | null = null;
  private stopSuspend: (() => void) | null = null;
  private locks = new Map<ControlId, Lock | null>();
  private listeners = new Set<() => void>();
  private streamListeners = new Set<(s: StreamBlock) => void>();
  /** what the hands hold, in words: a phoneme and a speaker preset (cleared when the hands change them otherwise) */
  held: { phoneme: string | null; speaker: string | null } = { phoneme: null, speaker: null };
  /** messages for the person (an audio start that failed) */
  onInfo: (msg: string) => void = () => {};
  micOn = false;
  /** the hands' voice keeps sounding instead of resting after a breath */
  sustain = false;
  private stopRest: (() => void) | null = null;
  /** a hand is dragging the head: its moves give the voice air */
  private dragging = false;

  constructor(private readonly clock: Clock = realClock) {
    const p = defaultParams();
    p.articulators = { ...p.articulators, jaw: 0.94, tongueX: 0.06, tongueY: -0.83, lipOpen: 0.5, lipProtrude: 0.04 };
    p.volume = START_VOLUME;
    this._manual = p;
  }

  /** Connects the audio. */
  attach(sink: VoiceSink): void {
    this.sink = sink;
    sink.onTelemetry = (t, program) => { this.telemetry = t; this.telemetryProgram = program; this.telemetryTime = this.clock.now(); };
    sink.onStream = (s) => { for (const l of this.streamListeners) l(s); };
    sink.onEnded = (id, reason, captured) => this.ended(id, reason, captured);
    sink.onState = () => this.emit();
  }

  // ------------------------------------------------------------ reading

  /** The hands' parameters, read-only: change them with edit(). */
  get manual(): DeepReadonly<EngineParams> { return this._manual; }
  get lanes(): Lanes { return this._lanes; }
  get running(): boolean { return !!this.sink?.running; }
  get sampleRate(): number { return this.sink?.sampleRate ?? 48000; }
  get micAnalyser(): AnalyserNode | null { return this.sink?.micAnalyser ?? null; }
  /** something is meant to sound: the lungs blow, or a performance plays */
  get soundOn(): boolean {
    const k = this._lanes.performer.kind;
    return this.running && (this._manual.phonate || (k !== 'hands' && k !== 'glide'));
  }

  /** What the engine gets now. */
  effective(): EngineParams {
    const p = this._lanes.performer;
    if (p.kind === 'melody' && p.buzz) return { ...this._manual, bypassTract: true, tubeMode: false };
    if (p.kind === 'clip') return this.clipParams ? { ...this.clipParams, volume: this._manual.volume } : { ...this._manual, phonate: false };
    return this._manual;
  }

  /** Fresh telemetry, or null when the engine is not running. */
  live(): Telemetry | null {
    return this.running && this.telemetry && this.clock.now() - this.telemetryTime < LIVE_MS ? this.telemetry : null;
  }

  /** What is sounding: the engine's parameters, with the posture, glottis, pitch and lung pressure it has reached. */
  sounding(): EngineParams {
    const base = this.effective();
    const t = this.live();
    if (!t) return base;
    return { ...base, articulators: t.articulators, abduction: t.abduction, source: { ...base.source, f0: t.f0Target, ps: t.ps / CMH2O } };
  }

  /** Who owns a control, if not the hands. */
  lock(c: ControlId): Lock | null {
    if (!this.locks.has(c)) this.locks.set(c, lockOf(this._lanes, c));
    return this.locks.get(c)!;
  }

  /**
   * How far the performance has got, s (null for the hands). `heard`: the time is that of what is heard now,
   * read from the audio (false: the engine has not reported on this performance yet, or cannot be heard, and
   * the time is the wall clock's since it was asked for, which runs ahead of the sound by the time it takes to
   * start).
   */
  progress(): { t: number; seconds: number; heard: boolean } | null {
    const p = this._lanes.performer;
    if (p.kind === 'hands') return null;
    const t = this.running ? this.telemetry : null;
    if ((p.kind === 'sentence' || p.kind === 'melody') && t && this.telemetryProgram === p.id) {
      // The score runs with the engine's clock, so the score's time of the last report is carried on to the
      // engine's time of the sound heard now. A report is a sixtieth of a second old at best, and much older on a
      // busy page, which hands them on late: however old, it still tells where the score was at its engine time.
      // (It cannot be ahead of the report by more than the report's age, nor behind it by more than the time
      // the sound takes to leave the computer: a reading outside that is not believed.)
      const age = (this.clock.now() - this.telemetryTime) / 1000;
      const heard = this.sink?.heardTime?.() ?? null;
      if (heard !== null) {
        const on = Math.max(-0.5, Math.min(age + 0.3, heard - t.time));
        return { t: Math.max(0, Math.min(p.score.duration, t.scoreTime + on)), seconds: p.score.duration, heard: true };
      }
      if (age * 1000 < LIVE_MS) return { t: Math.max(0, Math.min(p.score.duration, t.scoreTime)), seconds: p.score.duration, heard: true };
    }
    return { t: Math.min(this.timing.seconds, (this.clock.now() - this.timing.t0) / 1000), seconds: this.timing.seconds, heard: false };
  }

  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  /** Analysis streams of what is heard. */
  onStream(fn: (s: StreamBlock) => void): () => void { this.streamListeners.add(fn); return () => this.streamListeners.delete(fn); }

  // ------------------------------------------------------------ the hands

  /**
   * Changes the hands' parameters. Refused (false) when it touches a control
   * that a performer or the filter owns, unless `takeOver`: then the owner
   * lets go first (the performer stops, the head becomes the filter again).
   * Setting tubeMode or bypassTract chooses the filter.
   */
  edit(mut: (p: EngineParams) => void, opts: { takeOver?: boolean } = {}): boolean {
    let draft = cloneParams(this._manual);
    mut(draft);
    const changed = touched(this._manual, draft);
    if (!changed.size) return true;
    const locked = [...changed].filter((c) => this.lock(c));
    if (locked.length) {
      if (!opts.takeOver) return false;
      for (const c of locked) this.release(c);
      draft = cloneParams(this._manual);
      mut(draft);
    }
    if (changed.has('posture') || changed.has('velum')) this.held = { ...this.held, phoneme: null };
    if (changed.has('body') || changed.has('quality')) this.held = { ...this.held, speaker: null };
    if (this.dragging && this.running && this._lanes.performer.kind === 'hands') draft.phonate = true;
    this.commit(draft);
    return true;
  }

  /** Holds a phoneme with the hands (an explicit choice: it takes over by default); `blow: false` only shapes the head. */
  holdPhoneme(ipa: string, opts: { f0?: number; takeOver?: boolean; blow?: boolean } = {}): boolean {
    const blow = opts.blow ?? true;
    const ok = this.edit((p) => { applyPhoneme(ipa, p); if (opts.f0) p.source.f0 = opts.f0; p.phonate = blow; }, { takeOver: opts.takeOver ?? true });
    if (ok) { this.held = { ...this.held, phoneme: ipa }; this.emit(); if (blow) void this.ensureAudio(); }
    return ok;
  }

  /** Becomes a speaker (a preset of source and anatomy, by id) and blows (unless `blow: false`). */
  applyPreset(id: string, apply: (p: EngineParams) => void, opts: { blow?: boolean } = {}): boolean {
    const blow = opts.blow ?? true;
    const ok = this.edit((p) => { apply(p); p.phonate = blow; }, { takeOver: true });
    if (ok) { this.held = { ...this.held, speaker: id }; this.emit(); if (blow) void this.ensureAudio(); }
    return ok;
  }

  /** Back to the reference voice and the vowel /a/ (lungs and volume as they are). */
  reset(): void {
    this.stop();
    this.edit((p) => {
      p.articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES.a.art };
      p.anatomy = { ...DEFAULT_ANATOMY };
      p.teeth = { ...DEFAULT_TEETH };
      p.source = { ...DEFAULT_SOURCE };
      p.noise = { ...DEFAULT_NOISE, user: { ...DEFAULT_NOISE.user, curve: Array.from(colourCurve('white')) } };
      p.abduction = 0; p.voicing = true; p.bypassTract = false; p.tubeMode = false; p.losses = 1;
    }, { takeOver: true });
  }

  /** Chooses the filter: the head, the tube in the parameters, or none. */
  setFilter(kind: Filter['kind'], opts: { takeOver?: boolean } = {}): boolean {
    return this.edit((p) => { p.tubeMode = kind === 'tube'; p.bypassTract = kind === 'bypass'; }, opts);
  }

  /** Loads a tube (an area function, glottis to lips) as the filter and blows through it. */
  loadTube(areas: number[], length: number, label: Bi, opts: { takeOver?: boolean } = {}): boolean {
    const ok = this.edit((q) => {
      q.tubeAreas = areas.slice(); q.tubeLength = length; q.tubeMode = true; q.bypassTract = false;
      q.articulators.velum = 0; q.phonate = true; q.voicing = true; q.abduction = 0;
    }, opts);
    if (ok) { this.setLanes({ ...this._lanes, filter: { kind: 'tube', label } }); this.emit(); void this.ensureAudio(); }
    return ok;
  }

  /** Starts a drag of the head from the posture you see; with `blow`, gives it air while the drag lasts if the audio runs. */
  grab(opts: { blow?: boolean } = {}): void {
    if (this._lanes.performer.kind !== 'hands') return;
    if (opts.blow) { this.dragging = true; if (!this.running) void this.ensureAudio(); }
    const t = this.live();
    const m = cloneParams(this._manual);
    let changed = false;
    if (t && this._lanes.filter.kind === 'head') { m.articulators = { ...t.articulators }; changed = true; }
    if (opts.blow && this.running && !m.phonate) { m.phonate = true; changed = true; }
    if (changed) this.commit(m);
  }

  /** The drag is over: the voice rests a breath later. */
  letGo(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.breathe();
  }

  // ------------------------------------------------------------ performers

  /** Speaks a score on the head; resolves when it ends ('done') or is stopped. */
  async speak(score: Score, label: Bi): Promise<Result> {
    if (!(await this.ensureAudio())) return 'stopped';
    const id = this.begin({ kind: 'sentence', id: this.nextId++, label, score }, score.duration, { filter: { kind: 'head' } });
    const done = this.wait(id);
    this.sink!.program({ id, params: this.effective(), after: this._manual, score });
    this.emit();
    return done;
  }

  /** Sings a pitch contour (a score without articulators): the hands keep the tract; `buzz` plays it with no filter. */
  async sing(score: Score, opts: { buzz: boolean; label: Bi }): Promise<Result> {
    if (!(await this.ensureAudio())) return 'stopped';
    const id = this.begin({ kind: 'melody', id: this.nextId++, label: opts.label, score, buzz: opts.buzz }, score.duration);
    const done = this.wait(id);
    this.sink!.program({ id, params: this.effective(), after: this._manual, score });
    this.emit();
    return done;
  }

  /** Plays a state of the voice for a while (A/B listening) and returns the samples heard. */
  async playClip(params: EngineParams, seconds: number, label: Bi): Promise<{ result: Result; samples: Float32Array | null }> {
    if (!(await this.ensureAudio())) return { result: 'stopped', samples: null };
    const id = this.begin({ kind: 'clip', id: this.nextId++, label, samples: false }, seconds, { clip: params });
    let samples: Float32Array | null = null;
    const done = this.wait(id, (s) => { samples = s; });
    this.sink!.program({ id, params: this.effective(), after: this._manual, seconds, snap: true, capture: true });
    this.emit();
    const result = await done;
    return { result, samples };
  }

  /** Plays samples made elsewhere (at sampleRate), in place of the voice. */
  async playSamples(samples: Float32Array, label: Bi, flow?: Float32Array): Promise<Result> {
    if (!(await this.ensureAudio())) return 'stopped';
    const id = this.begin({ kind: 'clip', id: this.nextId++, label, samples: true }, samples.length / this.sampleRate);
    const done = this.wait(id);
    this.sink!.program({ id, params: this.effective(), after: this._manual, samples, flow });
    this.emit();
    return done;
  }

  /** Glides the pitch from one value to another (a demonstration); the pitch stays at the end value. */
  glide(from: number, to: number, seconds: number, label: Bi): Promise<Result> {
    const id = this.begin({ kind: 'glide', id: this.nextId++, label }, seconds, { lungsOff: false });
    const done = this.wait(id);
    const t0 = this.clock.now();
    const step = () => {
      const u = Math.min(1, (this.clock.now() - t0) / (seconds * 1000));
      const m = cloneParams(this._manual);
      m.source.f0 = from * Math.pow(to / from, u);
      this._manual = m;
      if (u >= 1) this.finish(id, 'done');
      this.push();
      this.emit();
    };
    this.stopGlide = this.clock.every(16, step);
    step();
    return done;
  }

  /** Stops the performer: the hands are back, with the lungs off. */
  stop(): void {
    if (this._lanes.performer.kind === 'hands') return;
    this.endPerformer('stopped');
    this.push();
    this.emit();
  }

  /** Stops the performer but keeps what was sounding (posture and pitch, or the whole state of a clip), with air. */
  takeOver(): void {
    const p = this._lanes.performer;
    if (p.kind === 'hands') return;
    if (p.kind === 'glide') { this.stop(); return; }
    const s = this.sounding();
    let m = cloneParams(this._manual);
    if (p.kind === 'clip') {
      if (this.clipParams) m = cloneParams({ ...s, volume: m.volume });
    } else {
      m.articulators = { ...s.articulators };
      m.source.f0 = s.source.f0;
    }
    m.phonate = this.running;
    this.endPerformer('stopped');
    this.commit(m);
  }

  // ------------------------------------------------------------ the sound

  /** Starts the audio if needed; false if it could not start. */
  async ensureAudio(): Promise<boolean> {
    const s = this.sink;
    if (!s) return false;
    this.stopSuspend?.();
    this.stopSuspend = null;
    if (s.running) return true;
    try { await s.start(this._manual); } catch (e) { this.onInfo(String(e)); }
    this.emit();
    return s.running;
  }

  /** The Sound button: on = audio and lungs; off = everything stops (the audio sleeps shortly after). */
  async setSound(on: boolean): Promise<void> {
    if (on) {
      if (!(await this.ensureAudio())) return;
      if (this._lanes.performer.kind === 'hands' && !this._manual.phonate) this.edit((p) => { p.phonate = true; });
      return;
    }
    this.endPerformer('stopped');
    if (this._manual.phonate) { const m = cloneParams(this._manual); m.phonate = false; this._manual = m; }
    this.push();
    this.emit();
    this.stopSuspend?.();
    this.stopSuspend = this.clock.after(300, () => {
      this.stopSuspend = null;
      if (!this.soundOn && !this.micOn) void this.sink?.suspend();
    });
  }

  /** Hold (true): the hands' voice keeps sounding; off, it rests after a breath. */
  setSustain(on: boolean): void {
    this.sustain = on;
    this.breathe();
    this.emit();
  }

  /** Microphone analysis on or off. */
  async mic(on: boolean): Promise<void> {
    const s = this.sink;
    if (!s) return;
    if (on) { await s.enableMic(); this.micOn = true; } else { s.disableMic(); this.micOn = false; }
    this.emit();
  }

  // ------------------------------------------------------------ inside

  private emit(): void { for (const l of this.listeners) l(); }

  private setLanes(l: Lanes): void { this._lanes = l; this.locks.clear(); }

  private push(): void {
    const p = this._lanes.performer;
    const program = p.kind === 'hands' || p.kind === 'glide' ? 0 : p.id;
    this.sink?.params(this.effective(), this._manual, program);
  }

  /** Commits new hands' parameters; their filter flags choose the filter lane. */
  private commit(draft: EngineParams): void {
    const want: Filter['kind'] = draft.bypassTract ? 'bypass' : draft.tubeMode ? 'tube' : 'head';
    if (want !== this._lanes.filter.kind) this.setLanes({ ...this._lanes, filter: want === 'tube' ? { kind: 'tube', label: DRAWN_TUBE } : { kind: want } });
    draft.bypassTract = want === 'bypass';
    draft.tubeMode = want === 'tube';
    this._manual = draft;
    this.push();
    this.emit();
    this.breathe();
  }

  /** (Re)starts the breath: the hands' voice rests BREATH_MS from now, unless held, dragged or gliding. */
  private breathe(): void {
    this.stopRest?.();
    this.stopRest = null;
    if (!this._manual.phonate || this.sustain) return;
    this.stopRest = this.clock.after(BREATH_MS, () => {
      this.stopRest = null;
      const k = this._lanes.performer.kind;
      if (k === 'glide' || this.dragging) { this.breathe(); return; }
      if (k !== 'hands' || !this._manual.phonate || this.sustain) return;
      const m = cloneParams(this._manual);
      m.phonate = false;
      this._manual = m;
      this.push();
      this.emit();
    });
  }

  /** Frees a control from its owner. */
  private release(c: ControlId): void {
    const l = this.lock(c);
    if (!l) return;
    if (l.by === 'tube' || l.by === 'bypass') {
      const m = cloneParams(this._manual);
      m.tubeMode = false; m.bypassTract = false;
      this.commit(m);
    } else this.takeOver();
  }

  /**
   * Makes a performer the current one (the previous one is stopped). The
   * hands' lungs go off, so that the end of the performance is silence.
   */
  private begin(perf: Exclude<Performer, { kind: 'hands' }>, seconds: number, o: { filter?: Filter; lungsOff?: boolean; clip?: EngineParams } = {}): number {
    this.endPerformer('stopped');
    this.clipParams = o.clip ? cloneParams(o.clip) : null;
    const m = cloneParams(this._manual);
    if (o.lungsOff ?? true) m.phonate = false;
    const f = o.filter;
    if (f) { m.tubeMode = f.kind === 'tube'; m.bypassTract = f.kind === 'bypass'; }
    this._manual = m;
    this.setLanes({ filter: f ?? this._lanes.filter, performer: perf });
    this.timing = { t0: this.clock.now(), seconds };
    return perf.id;
  }

  private wait(id: number, captured?: (s: Float32Array) => void): Promise<Result> {
    return new Promise((resolve) => this.waiters.set(id, { resolve, captured }));
  }

  /** Ends the current performer (telling the audio to stop it). */
  private endPerformer(result: Result): void {
    const p = this._lanes.performer;
    if (p.kind === 'hands') return;
    if (p.kind !== 'glide') this.sink?.stop(p.id);
    this.finish(p.id, result);
  }

  /** The performer with this id is over: back to the hands. */
  private finish(id: number, result: Result, captured?: Float32Array): void {
    const p = this._lanes.performer;
    if (p.kind === 'hands' || p.id !== id) return;
    if (p.kind === 'glide') { this.stopGlide?.(); this.stopGlide = null; }
    this.clipParams = null;
    this.setLanes({ ...this._lanes, performer: { kind: 'hands' } });
    // after a glide the voice still has a whole breath
    if (p.kind === 'glide') this.breathe();
    const w = this.waiters.get(id);
    this.waiters.delete(id);
    if (captured) w?.captured?.(captured);
    w?.resolve(result);
  }

  /** A program ended on the audio thread; ends of programs already replaced or stopped are ignored. */
  private ended(id: number, reason: EndReason, captured?: Float32Array): void {
    const p = this._lanes.performer;
    if (p.kind === 'hands' || p.kind === 'glide' || p.id !== id) return;
    this.finish(id, reason === 'done' ? 'done' : 'stopped', captured);
    this.push();
    this.emit();
  }
}

export const voice = new VoiceController();
