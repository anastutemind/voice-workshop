import { Anatomy, Articulators, Teeth, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../tract/types';
import { colourCurve, NOISE_CURVE_POINTS } from '../noise/noise';

export type SourceModel = 'lf' | 'twomass';

export interface SourceParams {
  model: SourceModel;
  /** target fundamental frequency, Hz */
  f0: number;
  /** LF shape parameter Rd (0.3 pressed ... 2.7 breathy) */
  rd: number;
  /** use Oq / alpha_m / Ra instead of Rd */
  advanced: boolean;
  oq: number;
  alphaM: number;
  ra: number;
  /** peak glottal opening in LF mode, cm^2 (sets the flow amplitude) */
  peakArea: number;
  /** posterior glottal chink (incomplete closure), cm^2 */
  chink: number;
  /** subglottal (lung) pressure, cm H2O */
  ps: number;
  /** cycle-to-cycle period perturbation, % */
  jitter: number;
  /** cycle-to-cycle amplitude perturbation, % */
  shimmer: number;
  /** alternate-cycle amplitude difference (diplophonia, creak), 0..1 */
  diplophonia: number;
  /** strength of source-tract interaction (glottal losses during the open phase), 0..1 */
  interaction: number;
  /** vibrato rate (Hz) and depth (cents) */
  vibratoRate: number;
  vibratoDepth: number;
  // two-mass model
  /** automatic tension control to follow f0 (otherwise use q) */
  tensionAuto: boolean;
  q: number;
  /** left/right asymmetry (raspy, subharmonics) */
  asym: number;
  /** rest (pre-phonatory) area of each mass, cm^2 */
  restArea: number;
}

export type NoiseLocation = 'glottis' | 'constriction' | 'teeth' | 'lips' | 'custom';

export interface UserNoiseParams {
  on: boolean;
  /** level in dB (0 dB is a moderate hiss) */
  level: number;
  location: NoiseLocation;
  /** custom position along the tract, 0 (glottis) .. 1 (lips) */
  position: number;
  /** 0 = steady, 1 = fully pulsed by the glottal flow */
  pulse: number;
  /** spectral shape in dB on log-spaced frequencies (NOISE_CURVE_POINTS) */
  curve: number[];
  lowCut: number;
  highCut: number;
  /** if true the noise bypasses the tract (heard as generated) */
  bypassTract: boolean;
}

export interface NoiseParams {
  aspirationOn: boolean;
  /** dB trim of the aspiration source */
  aspiration: number;
  /** 0 = steady aspiration, 1 = pulsed with the glottal flow (physical) */
  aspirationPulse: number;
  fricationOn: boolean;
  /** dB trim of the wall (jet) source at the constriction */
  frication: number;
  obstacleOn: boolean;
  /** dB trim of the obstacle (teeth) source */
  obstacle: number;
  /** release transient of stops on/off */
  burstOn: boolean;
  user: UserNoiseParams;
}

export interface EngineParams {
  articulators: Articulators;
  anatomy: Anatomy;
  teeth: Teeth;
  /** glottal abduction (0 = phonation position, 1 = wide open, breathing) */
  abduction: number;
  /** air from the lungs on/off */
  phonate: boolean;
  /** vocal folds allowed to vibrate (off = whisper / noise only) */
  voicing: boolean;
  source: SourceParams;
  noise: NoiseParams;
  /** output volume, dB */
  volume: number;
  /** bypass the vocal tract and hear the raw sources */
  bypassTract: boolean;
  /** multiplier of the waveguide losses */
  losses: number;
  /** vocal tract drawn as a tube (direct area-function mode) */
  tubeMode: boolean;
  /** user area function for tube mode (cm^2), any length >= 2, resampled to N */
  tubeAreas: number[];
  /** tube length in tube mode, cm */
  tubeLength: number;
}

export const DEFAULT_SOURCE: SourceParams = {
  model: 'lf',
  f0: 120,
  rd: 1.0,
  advanced: false,
  oq: 0.6,
  alphaM: 0.75,
  ra: 0.03,
  peakArea: 0.12,
  chink: 0.01,
  ps: 8,
  jitter: 0.4,
  shimmer: 2,
  diplophonia: 0,
  interaction: 0.6,
  vibratoRate: 5.5,
  vibratoDepth: 0,
  tensionAuto: true,
  q: 1,
  asym: 0,
  restArea: 0.03,
};

export const DEFAULT_USER_NOISE: UserNoiseParams = {
  on: false,
  level: 0,
  location: 'teeth',
  position: 0.9,
  pulse: 0,
  curve: Array.from(colourCurve('white')),
  lowCut: 100,
  highCut: 14000,
  bypassTract: false,
};

export const DEFAULT_NOISE: NoiseParams = {
  aspirationOn: true,
  aspiration: 0,
  aspirationPulse: 1,
  fricationOn: true,
  frication: 0,
  obstacleOn: true,
  obstacle: 0,
  burstOn: true,
  user: DEFAULT_USER_NOISE,
};

export function defaultParams(): EngineParams {
  return {
    articulators: { ...DEFAULT_ARTICULATORS },
    anatomy: { ...DEFAULT_ANATOMY },
    teeth: { ...DEFAULT_TEETH },
    abduction: 0,
    phonate: false,
    voicing: true,
    source: { ...DEFAULT_SOURCE },
    noise: { ...DEFAULT_NOISE, user: { ...DEFAULT_USER_NOISE, curve: DEFAULT_USER_NOISE.curve.slice() } },
    volume: 0,
    bypassTract: false,
    losses: 1,
    tubeMode: false,
    tubeAreas: new Array(16).fill(3),
    tubeLength: 17.5,
  };
}

export { NOISE_CURVE_POINTS };

/** A frame of a sequenced utterance: targets for the articulators and source. */
export interface ScoreFrame {
  /** time, s */
  t: number;
  /** articulator targets; a score without them (a melody) leaves the tract to the hands */
  art?: Articulators;
  abduction: number;
  f0: number;
  /** lung pressure, cm H2O */
  ps: number;
  /**
   * fast tongue-tip raise added after the articulator smoothing (cm): the
   * ballistic contacts of taps and trills, too quick for the target dynamics
   */
  tip?: number;
  /** change of the LF shape parameter Rd (breathier phrase ends, tenser accents) */
  rd?: number;
  /** vocal-fold vibration and leak allowed (1) or folds pressed shut (0, glottal stop) */
  gate?: number;
}

export interface ScorePhone { ipa: string; t0: number; t1: number; label?: string }

export interface Score {
  frames: ScoreFrame[];
  phones: ScorePhone[];
  duration: number;
  /** slow random wander of F0 while the score plays (Klatt's flutter, 0..100; 25 is natural) */
  flutter?: number;
  /** time constant (s) of the F0 smoothing while the score plays, when its contour is already smooth */
  f0Tau?: number;
  /**
   * slow motion: the score was stretched this many times, and the
   * articulators and the glottis move as many times slower while it plays,
   * so that a gesture can be watched (1 or absent = real time)
   */
  timeScale?: number;
}
