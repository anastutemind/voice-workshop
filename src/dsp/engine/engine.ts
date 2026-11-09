import { RHO, C_SOUND, CMH2O, NU, AREA_CLOSED } from '../constants';
import { LFSource, rdToTiming, timingFromQuotients, LFTiming } from '../glottis/lf';
import { TwoMassGlottis } from '../glottis/twoMass';
import { Waveguide } from '../tract/waveguide';
import { computeGeometry, TractGeometry } from '../tract/geometry';
import { AreaFunction, N_SECTIONS, sectionsFromGeometry, resampleTube } from '../tract/areaFunction';
import { buildNasal, NasalTract, noseOf, nostrilArea, portArea } from '../tract/nasal';
import { Aero, newJetInfo, JetInfo, RE_CRIT, kineticResistances } from '../aero/aero';
import { TurbulenceSource, ShapedNoise } from '../noise/noise';
import { ButterworthLowpass } from '../util/biquad';
import { Rng } from '../util/rng';
import { smoothstep } from '../util/math';
import { TamChannel, TAM_TAU } from '../speech/tam';
import { Articulators, ARTICULATOR_KEYS } from '../tract/types';
import { EngineParams, Score, ScoreFrame, defaultParams } from './params';

/** Output samples between control updates. */
const CTRL = 32;
/** Minimum time between geometry recomputations (s). */
const GEOM_INTERVAL = 0.0027;
/** Radiated pressure at 1 m per unit dU/dt: rho / (4 pi r), in Pa. */
const RAD_PA = RHO / (4 * Math.PI * 100) / 10;
/** Digital full scale corresponds to this sound pressure at 1 m (Pa). */
const FULL_SCALE_PA = 0.3;
/**
 * Source-strength calibration of the turbulence models (dimensionless). The
 * wall and obstacle gains put held /s/ about 9 dB and /f/ about 17 dB below
 * /a/, with jets of the true hydraulic diameter of each passage.
 */
export const NOISE_K = { aspiration: 0.15, wall: 0.07, obstacle: 1.35, user: 0.04, bypass: 0.004, burst: 0.08 };
/** Length of the vocal folds (cm) for the glottal Reynolds number. */
const FOLD_LENGTH = 1.4;

/**
 * A control-rate value carried into the sample loop as a straight line over
 * one control period. Held as steps instead, it would modulate the glottal
 * pulses at the control rate (1.5 kHz) and leave a comb of whistles at its
 * multiples, heard as a fizz over the whole voice.
 */
class Ramp {
  private from: number;
  private to: number;
  v: number;
  constructor(v = 0) { this.from = this.to = this.v = v; }
  /** a new control value: the ramp starts from where it is now */
  set(target: number): void { this.from = this.v; this.to = target; }
  snap(v: number): void { this.from = this.to = this.v = v; }
  at(phase: number): number { this.v = this.from + (this.to - this.from) * phase; return this.v; }
}

export interface Telemetry {
  time: number;
  articulators: Articulators;
  abduction: number;
  areas: Float64Array;
  length: number;
  fsTract: number;
  teethIndex: number;
  lipsIndex: number;
  nasalPort: number;
  /** rms pressure and volume velocity per section (normalised 0..1) */
  pRms: Float64Array;
  uRms: Float64Array;
  // source
  f0: number;
  f0Target: number;
  phase: number;
  openQuotient: number;
  speedQuotient: number;
  ra: number;
  glottalArea: number;
  glottalFlow: number;
  twoMass: { l1: number; l2: number; r1: number; r2: number; a1: number; a2: number; q: number } | null;
  voicingAmp: number;
  // aero
  ps: number;
  po: number;
  ug: number;
  uMouth: number;
  uNose: number;
  constrictionIndex: number;
  constrictionArea: number;
  jet: JetInfo;
  glottalRe: number;
  slit: { height: number; width: number; area: number; vertical: number };
  // noise levels (rms, linear, after gains) for the meters
  levels: { aspiration: number; wall: number; obstacle: number; user: number; voice: number; out: number };
  playing: boolean;
  scoreTime: number;
  phone: string;
}

export interface Streams {
  out: Float32Array;
  flow: Float32Array;
  noise: Float32Array;
}

export class VoiceEngine {
  readonly fsOut: number;
  params: EngineParams;

  private fsT = 88000;
  private wg: Waveguide;
  private lf = new LFSource();
  private tm = new TwoMassGlottis();
  private aero = new Aero();
  private jet = newJetInfo();
  private aspNoise = new TurbulenceSource(11);
  private wallNoise = new TurbulenceSource(23);
  private obsNoise = new TurbulenceSource(37);
  private userNoise = new ShapedNoise(1024);
  private userNoiseKey = '';
  private lpf = new ButterworthLowpass(8);
  private rng = new Rng(99);

  // articulators and source controls (TAM-smoothed)
  private tam: Record<string, TamChannel> = {};
  readonly art: Articulators;
  private abduction = 0;
  private f0 = 120;
  private psCur = 0; // dyn/cm^2
  /** Rd change and glottal gate from the score */
  private rdOffset = 0;
  private gate = 1;

  // geometry
  geom: TractGeometry | null = null;
  af: AreaFunction;
  nasal: NasalTract;
  private geomKey = '';
  private sinceGeom = 1;
  private fineMinArea = 1;
  private fineMinS = 0;
  /** wetted perimeter and lateral width of the narrowest passage (0 = round) */
  private fineMinPerimeter = 0;
  private fineMinWidth = 0;
  private constrictionIndex = 0;
  private wallJunction = 0;
  private aspJunction = 1;

  // resampler
  private ratio = 88000 / 48000;
  private pos = 0;
  private produced = 0;
  private ring = new Float64Array(8);
  private ringIdx = 0;

  // glottal bookkeeping
  private uMean = 0;
  private uMeanCoef = 0;
  private uPrev = 0;
  private gFlowPrev = 0;
  private voicingAmp = 0;
  private periodAmp = 1;
  private glottalArea = 0;
  private glottalFlow = 0;
  private glottalRe = 0;
  private dflow = 0;
  private aspMean = 0;
  private mouthSlow = 0;
  private mouthNow = 0;
  private poNow = 0;
  private psNow = 0;
  private mouthCoef = 0.1;
  private pulseMean = 0;
  private pulseMeanCoef = 0.004;
  private slowCoef = 0.003;
  private lastOpenTime = 0;
  private measuredF0 = 0;
  private tractTime = 0;
  private tmQ = 1;

  // per-sample noise amplitudes (set at control rate)
  private wallAmp = 0;
  private obsAmp = 0;
  // control-rate values ramped across each control period in the sample loop
  private rVoicing = new Ramp(0);
  private rGate = new Ramp(1);
  private rAbd = new Ramp(0);
  private rPs = new Ramp(0);
  private rPo = new Ramp(0);
  private rMouth = new Ramp(0);
  private rUg = new Ramp(0);
  private rWall = new Ramp(0);
  private rObs = new Ramp(0);
  private ctrlPhase = 1;
  private userAmp = 0;
  private userJunction = -1;
  private teethJunction = 40;
  private ctrl = 0;
  private time = 0;

  // score
  private score: Score | null = null;
  private scoreTime = 0;
  private scoreIdx = 0;
  private scoreHold = 0.25;

  // telemetry
  private levelAcc = { aspiration: 0, wall: 0, obstacle: 0, user: 0, voice: 0, out: 0, n: 0 };
  private telemetryLevels = { aspiration: 0, wall: 0, obstacle: 0, user: 0, voice: 0, out: 0 };
  /** optional streams for analysis (filled when set) */
  streams: Streams | null = null;
  streamPos = 0;
  private lastNoise = 0;

  constructor(fsOut = 48000, params: EngineParams = defaultParams()) {
    this.fsOut = fsOut;
    this.params = params;
    this.art = { ...params.articulators };
    for (const k of ARTICULATOR_KEYS) this.tam[k] = new TamChannel(this.art[k], TAM_TAU[k]);
    this.tam.abduction = new TamChannel(params.abduction, TAM_TAU.abduction);
    this.tam.f0 = new TamChannel(params.source.f0, TAM_TAU.f0);
    this.tam.ps = new TamChannel(0, TAM_TAU.ps);
    this.f0 = params.source.f0;
    this.af = { areas: new Float64Array(N_SECTIONS).fill(3), length: 17.5, dx: 17.5 / N_SECTIONS, teethIndex: 40, lipsIndex: 42 };
    this.nasal = buildNasal(this.af.dx, 1, AREA_CLOSED, 18);
    this.wg = new Waveguide(N_SECTIONS, this.nasal.areas.length, this.nasal.coupling);
    this.tm.reset();
    this.updateGeometry(true);
    this.lf.periodF0 = this.f0;
  }

  setParams(p: EngineParams): void { this.params = p; }

  /** Starts a sequenced utterance. */
  playScore(score: Score): void {
    this.score = score;
    this.scoreTime = 0;
    this.scoreIdx = 0;
    this.tam.f0.tau = score.f0Tau ?? TAM_TAU.f0;
    this.setTimeScale(score.timeScale ?? 1);
  }

  stopScore(): void { this.score = null; this.tam.f0.tau = TAM_TAU.f0; this.setTimeScale(1); }

  /** Slow motion: the articulators, the glottis and the lungs take `s` times longer to reach their targets. */
  private setTimeScale(s: number): void {
    for (const k of ARTICULATOR_KEYS) this.tam[k].tau = TAM_TAU[k] * s;
    this.tam.abduction.tau = TAM_TAU.abduction * s;
    this.tam.ps.tau = TAM_TAU.ps * s;
  }

  get isPlaying(): boolean { return this.score !== null; }

  // ------------------------------------------------------------ control

  private targetFrame(): { art: Articulators | null; abduction: number; f0: number; ps: number; tip: number; rd: number; gate: number } | null {
    const sc = this.score;
    if (!sc) return null;
    if (this.scoreTime > sc.duration + this.scoreHold) { this.stopScore(); return null; }
    const fr = sc.frames;
    while (this.scoreIdx < fr.length - 2 && fr[this.scoreIdx + 1].t <= this.scoreTime) this.scoreIdx++;
    const a = fr[this.scoreIdx], b = fr[Math.min(this.scoreIdx + 1, fr.length - 1)];
    const t = b.t > a.t ? Math.min(1, Math.max(0, (this.scoreTime - a.t) / (b.t - a.t))) : 0;
    const mix = (x: number, y: number) => x + (y - x) * t;
    let art: Articulators | null = null;
    if (a.art && b.art) {
      art = {} as Articulators;
      for (const k of ARTICULATOR_KEYS) art[k] = mix(a.art[k], b.art[k]);
    }
    return {
      art, abduction: mix(a.abduction, b.abduction), f0: mix(a.f0, b.f0), ps: mix(a.ps, b.ps),
      tip: mix(a.tip ?? 0, b.tip ?? 0), rd: mix(a.rd ?? 0, b.rd ?? 0), gate: mix(a.gate ?? 1, b.gate ?? 1),
    };
  }

  private control(): void {
    const dt = CTRL / this.fsOut;
    const p = this.params;
    const fr = this.targetFrame();
    if (this.score) this.scoreTime += dt;
    const artT = fr?.art ?? p.articulators;
    for (const k of ARTICULATOR_KEYS) this.art[k] = this.tam[k].step(artT[k], dt);
    // taps and trills: the contacts of the tongue tip are ballistic, added on
    // top of the smoothed posture (alveolar trill about 26 Hz, Recasens 1991)
    if (fr && fr.tip) this.art.tipY += fr.tip;
    this.rdOffset = fr ? fr.rd : 0;
    // a glottal stop closes within a few milliseconds
    this.gate += ((fr ? fr.gate : 1) - this.gate) * (1 - Math.exp(-dt / 0.006));
    this.abduction = this.tam.abduction.step(fr ? fr.abduction : p.abduction, dt);
    const vib = p.source.vibratoDepth > 0 ? Math.pow(2, (p.source.vibratoDepth / 1200) * Math.sin(2 * Math.PI * p.source.vibratoRate * this.time)) : 1;
    // flutter: slow quasi-random F0 wander of a living voice (Klatt & Klatt 1990)
    const fl = this.score?.flutter ?? 0;
    const tt = this.time;
    const flutter = fl > 0 ? 1 + (fl / 50 / 100) * (Math.sin(2 * Math.PI * 12.7 * tt) + Math.sin(2 * Math.PI * 7.1 * tt) + Math.sin(2 * Math.PI * 4.7 * tt)) : 1;
    this.f0 = this.tam.f0.step(fr ? fr.f0 : p.source.f0, dt) * vib * flutter;
    const psTarget = fr ? fr.ps : p.phonate ? p.source.ps : 0;
    this.psCur = this.tam.ps.step(psTarget, dt) * CMH2O;

    // geometry
    this.sinceGeom += dt;
    if (this.sinceGeom >= GEOM_INTERVAL) this.updateGeometry(false);

    // aerodynamics
    this.updateAero(dt);
    this.time += dt;
    this.rVoicing.set(this.voicingAmp);
    this.rGate.set(this.gate);
    this.rAbd.set(Math.max(0, this.abduction));
    this.rPs.set(this.psCur);
    this.rPo.set(this.aero.po);
    this.rMouth.set(this.aero.uMouth);
    this.rUg.set(this.aero.ug);
    this.rWall.set(this.wallAmp);
    this.rObs.set(this.obsAmp);
    this.ctrlPhase = 0;
  }

  private artKey(): string {
    const a = this.art, an = this.params.anatomy, t = this.params.teeth;
    let s = '';
    for (const k of ARTICULATOR_KEYS) s += (Math.round(a[k] * 400) / 400) + ',';
    s += `${an.scale},${an.pharynx},${an.pharynxWidth},${an.nasalLeak},${an.nasalCycle},${an.nostrilLeft},${an.nostrilRight},${an.piriform}|${t.slitWidth},${t.diastema},${t.overjet},${t.advance},${t.upperLength},${t.lowerLength},${t.slitOpen}`;
    if (this.params.tubeMode) s += '|tube' + this.params.tubeAreas.join(',') + this.params.tubeLength;
    return s;
  }

  private updateGeometry(force: boolean): void {
    const key = this.artKey();
    if (!force && key === this.geomKey) return;
    this.geomKey = key;
    this.sinceGeom = 0;
    const p = this.params;
    if (p.tubeMode) {
      this.geom = null;
      const n = N_SECTIONS;
      const areas = resampleTube(p.tubeAreas, n, this.af.areas, AREA_CLOSED);
      this.af.length = p.tubeLength;
      this.af.dx = p.tubeLength / n;
      this.af.teethIndex = n - 3;
      this.af.lipsIndex = n - 2;
      // the turbulent constriction is looked for above the epilaryngeal tube,
      // as in the head (2.6 cm in a 17.5 cm tract)
      this.fineMinArea = Infinity;
      this.fineMinPerimeter = 0;
      this.fineMinWidth = 0;
      const i0 = Math.max(2, Math.ceil((2.6 * p.tubeLength) / 17.5 / this.af.dx));
      for (let i = i0; i < n; i++) if (areas[i] < this.fineMinArea) { this.fineMinArea = areas[i]; this.fineMinS = (i + 0.5) * this.af.dx; }
    } else {
      this.geom = computeGeometry(this.art, p.anatomy, p.teeth, { reuse: this.geom ?? undefined });
      sectionsFromGeometry(this.geom, N_SECTIONS, this.af);
      // fine-grid minimum above the larynx (aerodynamic constriction)
      const g = this.geom;
      let m = Infinity, ms = 0, mp = 0, mw = 0;
      const sStart = 2.6 * p.anatomy.scale;
      for (let i = 0; i <= g.lastRay; i++) {
        if (g.s[i] < sStart) continue;
        const a = g.hits[i].area;
        if (a < m) { m = a; ms = g.s[i]; mp = g.hits[i].perimeter; mw = g.hits[i].width; }
      }
      // the incisal slit is a constriction too
      if (g.slit.area < m && g.teethPos > 0) { m = g.slit.area; ms = g.teethPos; mp = g.slit.perimeter; mw = g.slit.width; }
      this.fineMinArea = Math.max(m, 0);
      this.fineMinS = ms;
      this.fineMinPerimeter = mp;
      this.fineMinWidth = mw;
    }
    const af = this.af;
    const n = N_SECTIONS;
    // tract rate follows the length so that one sample = one section
    const fsNew = (n * C_SOUND) / af.length;
    if (Math.abs(fsNew - this.fsT) > 0.002 * this.fsT || force) {
      this.fsT = fsNew;
      this.ratio = this.fsT / this.fsOut;
      this.lpf.design(Math.min(0.42 * this.fsOut, 0.24 * this.fsT), this.fsT);
      this.uMeanCoef = Math.exp(-2 * Math.PI * 12 / this.fsT);
      this.mouthCoef = 1 - Math.exp(-2 * Math.PI * 1500 / this.fsT);
      this.pulseMeanCoef = 1 - Math.exp(-1 / (0.003 * this.fsT));
      this.slowCoef = 1 - Math.exp(-2 * Math.PI * 40 / this.fsT);
    }
    const scale = p.anatomy.scale;
    const port = portArea(this.art.velum, p.anatomy.nasalLeak, scale);
    const coupling = Math.round(0.43 * n) - 1;
    this.nasal = buildNasal(af.dx, scale, port, coupling, this.nasal.dx === af.dx ? this.nasal : undefined, noseOf(p.anatomy));
    const steps = Math.round(this.fsT * GEOM_INTERVAL * 1.05);
    this.wg.lossParams.base = 70 * p.losses;
    this.wg.lossParams.narrow = 45 * p.losses;
    this.wg.setGeometry(af, this.nasal, this.fsT, force ? 1 : steps);
    // constriction and noise injection points
    const dx = af.dx;
    this.aspJunction = Math.max(1, Math.min(n - 2, Math.round(1.0 / dx)));
    let ci = Math.min(n - 1, Math.max(0, Math.floor(this.fineMinS / dx)));
    this.constrictionIndex = ci;
    // exit of the constriction: first section downstream that opens up
    let exit = ci;
    const ac = Math.max(af.areas[ci], 1e-3);
    while (exit < n - 1 && af.areas[exit + 1] < 2.2 * ac) exit++;
    this.wallJunction = Math.min(n - 2, exit + Math.max(1, Math.round(0.5 / dx)));
    this.teethJunction = Math.min(n - 2, Math.max(1, af.teethIndex));
    const u = p.noise.user;
    let uj = -1;
    if (u.on) {
      switch (u.location) {
        case 'glottis': uj = this.aspJunction; break;
        case 'constriction': uj = this.wallJunction; break;
        case 'teeth': uj = this.teethJunction; break;
        case 'lips': uj = n - 2; break;
        case 'custom': uj = Math.max(0, Math.min(n - 2, Math.round(u.position * (n - 1)))); break;
      }
    }
    this.userJunction = uj;
    const nk = `${u.curve.join(',')}|${u.lowCut}|${u.highCut}`;
    if (nk !== this.userNoiseKey) { this.userNoiseKey = nk; this.userNoise.setSpectrum(u.curve, u.lowCut, u.highCut); }
  }

  private meanGlottalArea(): number {
    const p = this.params;
    const s2 = p.anatomy.scale * p.anatomy.scale;
    const abd = 0.55 * s2 * Math.max(0, this.abduction);
    let vib = 0;
    if (p.voicing) {
      if (p.source.model === 'lf') vib = 0.45 * p.source.peakArea * s2 * this.voicingAmp;
      else vib = Math.max(0, this.tm.amin) * 0.5 + 0.5 * Math.max(0, p.source.restArea);
    }
    return (vib + p.source.chink * s2) * this.gate + abd;
  }

  private updateAero(dt: number): void {
    const p = this.params;
    const scale = p.anatomy.scale;
    const ag = this.meanGlottalArea();
    // the air leaves the nose through the nostrils: pinched, they stop it
    const nasalArea = Math.min(portArea(this.art.velum, p.anatomy.nasalLeak, scale), 1.0 * scale * scale, nostrilArea(scale, noseOf(p.anatomy)));
    const oral = Math.max(0, this.fineMinArea);
    // sub-steps for the stiff closure/release dynamics
    const sub = 4;
    for (let i = 0; i < sub; i++) {
      this.aero.step(dt / sub, {
        ps: this.psCur, glottalArea: ag, oralArea: oral, nasalArea: nasalArea > 2e-3 ? nasalArea : 0,
        compliance: 1.0e-3 * scale * scale * scale,
      });
    }
    // voicing needs transglottal pressure and adducted folds. Below the
    // speaking pressure (8 cmH2O) the vibration amplitude falls almost in
    // proportion, so that with the jet speed (sqrt of the pressure) the voice
    // loses 8-9 dB per halving of the pressure, as measured (Titze & Sundberg
    // 1992): a voiced fricative, with pressure behind its constriction, is
    // much weaker than its vowels. Above it the amplitude grows more slowly.
    const dp = Math.max(0, this.psCur - this.aero.po) / CMH2O;
    const adduction = 1 - smoothstep(0.25, 0.6, this.abduction);
    const pressureGate = smoothstep(1.2, 3.5, dp);
    const drive = dp < 8 ? Math.pow(dp / 8, 0.9) : Math.sqrt(Math.min(dp, 30) / 8);
    this.voicingAmp = p.voicing ? adduction * pressureGate * drive : 0;

    // jet and turbulence sources
    const g = this.geom;
    const teethPos = g ? g.teethPos : this.af.length - 1;
    const slitH = g ? g.slit.height : 0.3;
    // distance from the constriction exit to the incisors
    let exitS = this.fineMinS;
    if (g) {
      for (let i = 0; i <= g.lastRay; i++) {
        if (g.s[i] <= this.fineMinS) continue;
        if (g.hits[i].area > 2.2 * Math.max(this.fineMinArea, 1e-3)) { exitS = g.s[i]; break; }
      }
    }
    this.aero.jet(oral, g ? teethPos - exitS : -1, slitH, this.jet, this.fineMinPerimeter, this.fineMinWidth);
    // the jets lose their kinetic pressure where they expand: flow resistances
    kineticResistances(this.af.areas, this.aero.uMouth, this.wg.resTarget, this.constrictionIndex, this.fineMinArea);
    const n = this.params.noise;
    const db = (x: number) => Math.pow(10, x / 20);
    this.wallAmp = n.fricationOn ? NOISE_K.wall * this.jet.wallSource * db(n.frication) : 0;
    this.obsAmp = n.obstacleOn ? NOISE_K.obstacle * this.jet.obstacleSource * db(n.obstacle) : 0;
    this.wallNoise.configure(this.fsT, this.jet.fc);
    // glottal jet: width of the glottis ~0.2-0.3 cm, St ~0.15
    const vgl = Math.sqrt((2 * Math.max(this.psCur - this.aero.po, 0)) / RHO);
    this.aspNoise.configure(this.fsT, (0.15 * vgl) / (0.25 * scale));
    this.obsNoise.configure(this.fsT, this.jet.fcObstacle);
    this.userAmp = n.user.on ? NOISE_K.user * 1000 * db(n.user.level) : 0;
  }

  // -------------------------------------------------------- sample loop

  private nextPeriod = (src: LFSource): void => {
    const s = this.params.source;
    const j = (s.jitter / 100) * this.rng.gauss();
    src.periodF0 = Math.max(20, Math.min(1500, this.f0 * (1 + Math.max(-0.3, Math.min(0.3, j)))));
    let amp = 1 + (s.shimmer / 100) * this.rng.gauss();
    if (s.diplophonia > 0 && (src.periodIndex & 1)) amp *= 1 - 0.8 * s.diplophonia;
    this.periodAmp = Math.max(0, amp);
    const rd = Math.max(0.3, Math.min(2.7, s.rd + this.rdOffset));
    const timing: LFTiming = s.advanced ? timingFromQuotients(s.oq, s.alphaM, s.ra) : rdToTiming(rd);
    src.setShape(timing);
    // measured F0 (for display)
    this.measuredF0 = src.periodF0;
  };

  private tractStep(): number {
    const p = this.params;
    const wg = this.wg;
    const fs = this.fsT;
    const dt = 1 / fs;
    this.tractTime += dt;
    const s2 = p.anatomy.scale * p.anatomy.scale;
    // control-rate values, ramped across the control period
    const ph = this.ctrlPhase = Math.min(1, this.ctrlPhase + 1 / (CTRL * this.ratio));
    const voicingAmp = this.rVoicing.at(ph);
    const gate = this.rGate.at(ph);
    const abduction = this.rAbd.at(ph);
    // intraoral pressure and lung pressure come from the control-rate
    // aerodynamics: interpolate them per sample (no staircase in the flow)
    this.poNow += (this.rPo.at(ph) - this.poNow) * this.mouthCoef;
    this.psNow += (this.rPs.at(ph) - this.psNow) * this.mouthCoef;
    const po = this.poNow;
    const ps = this.psNow;
    const dp = Math.max(ps - po, 0);
    const vg = Math.sqrt((2 * dp) / RHO);
    const z0 = wg.z0;
    const steadyArea = p.source.chink * s2 * gate + 0.55 * s2 * abduction;
    let u = 0; // total glottal flow (cm^3/s)
    let ag = steadyArea;
    if (p.source.model === 'lf') {
      this.lf.step(fs, this.nextPeriod);
      const amp = p.voicing ? p.source.peakArea * s2 * voicingAmp * this.periodAmp * gate : 0;
      const avib = amp * this.lf.flow;
      ag = avib + steadyArea;
      u = ag * vg;
      // acoustic part of the flow: the pulses minus their period mean. The
      // quasi-steady flow (mean of the pulses plus any leak) belongs to the
      // aerodynamic model and is not injected into the waveguide. The mean
      // glides (3 ms): a new period with another amplitude (shimmer) or shape
      // (Rd) would otherwise shift it in one step, a click at every period.
      this.pulseMean += (amp * this.lf.meanFlow - this.pulseMean) * this.pulseMeanCoef;
      const uAc = (avib - this.pulseMean) * vg;
      // glottal impedance (dynamic Bernoulli resistance) for source-tract interaction
      const zg = u > 1e-3 ? (2 * dp) / u : 1e12;
      const rgPhys = (zg - z0) / (zg + z0);
      const rg = 1 - p.source.interaction * (1 - Math.max(-0.4, rgPhys));
      this.uMean = this.uMeanCoef * this.uMean + (1 - this.uMeanCoef) * u;
      wg.rg = rg;
      wg.glottalInjection = z0 * (1 + rg) * 0.5 * uAc;
    } else {
      const tp = this.tm.params;
      const sp = p.source;
      tp.asym = sp.asym;
      tp.a0 = Math.max(0.0, sp.restArea) * s2 + (p.voicing ? 0 : 0.2);
      tp.d1 = 0.25 * p.anatomy.scale;
      tp.q = sp.tensionAuto ? this.tmQ : sp.q;
      const uf = this.tm.step(dt, p.voicing ? ps : 0, po, wg.pMinus, z0, this.uMean) * gate;
      ag = Math.max(0, this.tm.amin) + steadyArea;
      u = uf + steadyArea * vg;
      this.uMean = this.uMeanCoef * this.uMean + (1 - this.uMeanCoef) * uf;
      wg.rg = 1;
      wg.glottalInjection = z0 * (uf - this.uMean);
      if (this.tm.openingEvent && this.tm.lastPeriod > 0) {
        const f = 1 / this.tm.lastPeriod;
        this.measuredF0 = f;
        if (sp.tensionAuto && this.f0 > 0) {
          const err = Math.log(this.f0 / f);
          this.tmQ = Math.max(0.3, Math.min(6, this.tmQ * Math.exp(0.35 * Math.max(-0.5, Math.min(0.5, err)))));
        }
        this.lastOpenTime = this.tractTime;
      }
      if (this.tractTime - this.lastOpenTime > 0.1) {
        // not oscillating: move tension toward the open-loop estimate
        this.tmQ += (this.f0 / 125 - this.tmQ) * 0.0005;
        this.measuredF0 = 0;
      }
    }
    this.dflow = (u - this.gFlowPrev) * fs;
    this.gFlowPrev = u;
    this.glottalFlow = u;
    this.glottalArea = ag;

    // aspiration: turbulence of the glottal jet, pulsed by the flow
    const n = p.noise;
    let asp = 0;
    if (n.aspirationOn && ag > 1e-5) {
      const re = u / (FOLD_LENGTH * p.anatomy.scale * NU);
      this.glottalRe = re;
      // turbulence grows once the glottal jet is clearly above the critical
      // Reynolds number: modal pulses (peak Re ~2000) stay mostly laminar,
      // a leaky (breathy) or abducted glottis (Re 4000+) is fully turbulent
      const onset = 0.1 + 0.9 * smoothstep(RE_CRIT * 0.9, RE_CRIT * 2.2, re);
      const inst = ((RHO * vg * vg * vg) / C_SOUND) * Math.sqrt(ag / 0.1) * onset;
      this.aspMean += (inst - this.aspMean) * 0.0005;
      const m = n.aspirationPulse;
      const amp = NOISE_K.aspiration * Math.pow(10, n.aspiration / 20) * ((1 - m) * this.aspMean + m * inst);
      asp = amp * this.aspNoise.next();
    }
    // flow modulation of the supraglottal sources: the glottal pulses pass through the constriction
    const ug = this.rUg.at(ph);
    const mod = ug > 1 ? Math.min(3, Math.pow(Math.max(0, u) / Math.max(ug, 1), 1.5)) : 1;
    const wallAmp = this.rWall.at(ph), obsAmp = this.rObs.at(ph);
    const wall = wallAmp > 0 ? wallAmp * mod * this.wallNoise.next() : 0;
    const obs = obsAmp > 0 ? obsAmp * mod * this.obsNoise.next() : 0;
    let user = 0;
    if (this.userAmp > 0) {
      const fl = p.source.peakArea > 0 ? Math.min(2, u / Math.max(p.source.peakArea * s2 * vg, 1)) : 0;
      const m = n.user.pulse;
      user = this.userAmp * ((1 - m) + m * 2 * fl) * this.userNoise.next(fs);
    }
    this.lastNoise = asp + wall + obs + user;

    wg.srcCount = 0;
    if (asp !== 0) { wg.srcJunction[wg.srcCount] = this.aspJunction; wg.srcValue[wg.srcCount++] = asp; }
    if (wall !== 0) { wg.srcJunction[wg.srcCount] = this.wallJunction; wg.srcValue[wg.srcCount++] = wall; }
    if (obs !== 0) { wg.srcJunction[wg.srcCount] = this.teethJunction; wg.srcValue[wg.srcCount++] = obs; }
    if (user !== 0 && !n.user.bypassTract && this.userJunction >= 0) {
      wg.srcJunction[wg.srcCount] = this.userJunction; wg.srcValue[wg.srcCount++] = user;
    }
    // release transient: the fast part of the mouth flow injected at the constriction
    // (the aerodynamic flow is updated at the control rate: smooth it to
    // remove the staircase, keeping the millisecond-scale release transient)
    this.mouthNow += (this.rMouth.at(ph) - this.mouthNow) * this.mouthCoef;
    if (n.burstOn) {
      this.mouthSlow += (this.mouthNow - this.mouthSlow) * this.slowCoef;
      wg.monoJunction = Math.min(N_SECTIONS - 2, this.constrictionIndex);
      wg.monoValue = NOISE_K.burst * (this.mouthNow - this.mouthSlow);
    } else wg.monoJunction = -1;

    wg.step();
    const uOut = wg.lipFlow + wg.nosFlow;
    let rad = (uOut - this.uPrev) * fs;
    this.uPrev = uOut;
    if (p.bypassTract) rad = this.dflow + (asp + wall + obs + user) * NOISE_K.bypass * fs;
    else if (n.user.bypassTract && user !== 0) rad += user * NOISE_K.bypass * fs;

    // meters
    const la = this.levelAcc;
    la.aspiration += asp * asp; la.wall += wall * wall; la.obstacle += obs * obs; la.user += user * user;
    la.voice += this.voicingAmp; la.n++;

    return this.lpf.process(rad * RAD_PA / FULL_SCALE_PA);
  }

  /** Renders n output samples into out (mono). */
  process(out: Float32Array, n: number = out.length): void {
    const gain = Math.pow(10, this.params.volume / 20);
    const st = this.streams;
    for (let i = 0; i < n; i++) {
      if (this.ctrl-- <= 0) { this.ctrl = CTRL - 1; this.control(); }
      this.pos += this.ratio;
      const need = Math.floor(this.pos) + 2;
      while (this.produced <= need) {
        const y = this.tractStep();
        this.ring[this.ringIdx & 7] = y;
        this.ringIdx++;
        this.produced++;
      }
      // keep pos and produced bounded
      if (this.produced > 1 << 30) { this.produced -= 1 << 29; this.pos -= 1 << 29; }
      const base = Math.floor(this.pos);
      const frac = this.pos - base;
      // ring holds the last 8 tract samples; we need base-1 .. base+2
      const off = this.produced - 1 - (base + 2);
      const i3 = this.ringIdx - 1 - off;
      const y0 = this.ring[(i3 - 3) & 7], y1 = this.ring[(i3 - 2) & 7], y2 = this.ring[(i3 - 1) & 7], y3 = this.ring[i3 & 7];
      // Catmull-Rom cubic interpolation
      const c1 = 0.5 * (y2 - y0);
      const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
      const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
      let y = ((c3 * frac + c2) * frac + c1) * frac + y1;
      y *= gain;
      this.levelAcc.out += y * y;
      // soft limiter
      const ay = Math.abs(y);
      if (ay > 0.8) y = Math.sign(y) * (0.8 + 0.2 * Math.tanh((ay - 0.8) / 0.2));
      out[i] = y;
      if (st) {
        const k = this.streamPos;
        if (k < st.out.length) {
          st.out[k] = y;
          st.flow[k] = this.glottalFlow;
          st.noise[k] = this.lastNoise;
          this.streamPos = k + 1;
        }
      }
    }
  }

  /** Builds a telemetry snapshot and resets the accumulators. */
  telemetry(): Telemetry {
    const wg = this.wg;
    const n = N_SECTIONS;
    const pR = new Float64Array(n), uR = new Float64Array(n);
    const c = Math.max(1, wg.accCount);
    let pm = 1e-9, um = 1e-9;
    for (let i = 0; i < n; i++) {
      pR[i] = Math.sqrt(wg.pAcc[i] / c); uR[i] = Math.sqrt(wg.uAcc[i] / c);
      pm = Math.max(pm, pR[i]); um = Math.max(um, uR[i]);
    }
    for (let i = 0; i < n; i++) { pR[i] /= pm; uR[i] /= um; }
    wg.pAcc.fill(0); wg.uAcc.fill(0); wg.accCount = 0;
    const la = this.levelAcc;
    const ln = Math.max(1, la.n);
    const lv = this.telemetryLevels;
    lv.aspiration = Math.sqrt(la.aspiration / ln); lv.wall = Math.sqrt(la.wall / ln);
    lv.obstacle = Math.sqrt(la.obstacle / ln); lv.user = Math.sqrt(la.user / ln);
    lv.voice = la.voice / ln; lv.out = Math.sqrt(la.out / Math.max(1, ln / this.ratio));
    la.aspiration = la.wall = la.obstacle = la.user = la.voice = la.out = 0; la.n = 0;
    const s = this.params.source;
    const timing = s.advanced ? timingFromQuotients(s.oq, s.alphaM, s.ra) : rdToTiming(s.rd);
    const g = this.geom;
    let phone = '';
    if (this.score) {
      for (const ph of this.score.phones) if (this.scoreTime >= ph.t0 && this.scoreTime < ph.t1) { phone = ph.ipa; break; }
    }
    return {
      time: this.time,
      articulators: { ...this.art },
      abduction: this.abduction,
      areas: Float64Array.from(this.af.areas),
      length: this.af.length,
      fsTract: this.fsT,
      teethIndex: this.af.teethIndex,
      lipsIndex: this.af.lipsIndex,
      nasalPort: portArea(this.art.velum, this.params.anatomy.nasalLeak, this.params.anatomy.scale),
      pRms: pR,
      uRms: uR,
      f0: s.model === 'lf' ? (this.voicingAmp > 0.05 ? this.lf.periodF0 : 0) : this.measuredF0,
      f0Target: this.f0,
      phase: this.lf.phase,
      openQuotient: timing.te,
      speedQuotient: timing.tp / timing.te,
      ra: timing.ta,
      glottalArea: this.glottalArea,
      glottalFlow: this.glottalFlow,
      twoMass: s.model === 'twomass'
        ? { l1: this.tm.x[0], l2: this.tm.x[1], r1: this.tm.x[2], r2: this.tm.x[3], a1: this.tm.a1, a2: this.tm.a2, q: s.tensionAuto ? this.tmQ : s.q }
        : null,
      voicingAmp: this.voicingAmp,
      ps: this.psCur,
      po: this.aero.po,
      ug: this.aero.ug,
      uMouth: this.aero.uMouth,
      uNose: this.aero.uNose,
      constrictionIndex: this.constrictionIndex,
      constrictionArea: this.fineMinArea,
      jet: { ...this.jet },
      glottalRe: this.glottalRe,
      slit: g ? { height: g.slit.height, width: g.slit.width, area: g.slit.area, vertical: g.slit.vertical } : { height: 0, width: 0, area: 0, vertical: 0 },
      levels: { ...lv },
      playing: this.score !== null,
      scoreTime: this.scoreTime,
      phone,
    };
  }

  /** Immediately jumps the smoothed articulators to their targets. */
  snapArticulators(): void {
    for (const k of ARTICULATOR_KEYS) { this.tam[k].set(this.params.articulators[k]); this.art[k] = this.params.articulators[k]; }
    this.updateGeometry(true);
  }

  /** Jumps lung pressure (for offline rendering). */
  snapPressure(): void {
    const ps = this.params.phonate ? this.params.source.ps : 0;
    this.tam.ps.set(ps);
    this.psCur = ps * CMH2O;
    this.psNow = this.psCur;
    this.rPs.snap(this.psCur);
  }

  get tractRate(): number { return this.fsT; }
}

/** Offline rendering helper (tests, export). */
export function renderOffline(params: EngineParams, seconds: number, fs = 48000, score?: Score): { out: Float32Array; engine: VoiceEngine } {
  const e = new VoiceEngine(fs, params);
  e.snapArticulators();
  e.snapPressure();
  if (score) e.playScore(score);
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  const block = 128;
  for (let i = 0; i < n; i += block) {
    const m = Math.min(block, n - i);
    const view = out.subarray(i, i + m);
    e.process(view, m);
  }
  return { out, engine: e };
}

export type { ScoreFrame };
