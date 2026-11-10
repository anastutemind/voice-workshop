import { Articulators, ARTICULATOR_KEYS, ARTICULATOR_RANGES, DEFAULT_ARTICULATORS } from '../tract/types';
import { PHONEMES, Phoneme, NASAL_VELUM } from './phonemes';
import { Phone, Lang } from './g2p';
import { Score, ScoreFrame, ScorePhone } from '../engine/params';
import { TamChannel, TAM_TAU } from './tam';

/**
 * Turns phones into a gestural score: piecewise targets for every articulator
 * and for the source (abduction, F0, lung pressure, voice quality). The engine
 * smooths the articulator targets with critically damped dynamics (TAM), so
 * movements overlap.
 *
 * What makes it sound like speech, each part switchable (NaturalnessOptions):
 *
 * - timing: segment durations from context rules. English follows Klatt
 *   (1979): every sound has an inherent and a minimum duration, and
 *   multiplicative rules shorten or lengthen the compressible part (phrase-final
 *   lengthening, unstressed and polysyllabic shortening, the voicing of the
 *   next consonant, clusters). Italian uses rules of the same kind from the
 *   phonetics of Italian: long stressed vowels in open syllables, short ones
 *   before geminates and clusters, geminates about twice as long as single
 *   consonants, phrase-final lengthening.
 * - intonation: the Fujisaki model (Fujisaki & Hirose 1984). log F0 is a floor
 *   plus the responses to phrase commands (impulses, a slow rise and decay:
 *   declination) and accent commands (steps on stressed syllables of content
 *   words, smoothed). Statements end with a final lowering, yes/no questions
 *   with a rise, phrases before a comma with a small continuation rise.
 * - micro: microprosody (high vowels have a slightly higher F0, voiceless
 *   consonants raise the onset of the next vowel, voiced ones lower it) and
 *   flutter, the slow F0 wander of a living voice.
 * - voiceQuality: stressed syllables get more lung pressure and a slightly
 *   tenser source, phrase ends relax into a breathier voice.
 * - coarticulation (Öhman 1966): a consonant only sets the articulators it
 *   needs; the others are interpolated from the surrounding vowels, so the
 *   tongue body glides from vowel to vowel through /p/ or /t/, and the lips
 *   round ahead of /u/. Without it every sound sets every articulator.
 *
 * Arabic, Urdu and Hindi use the inherent durations with long vowels and
 * geminates (plainDuration), the Italian-style accents, and their own
 * consonants: an aspirated stop (Hindi ख, Urdu کھ) is released into a puff
 * of air, a murmured one (घ, گھ) into a breathy sigh of voice, and a
 * nasalised vowel (ँ, ں) keeps the velum open.
 *
 * Slow motion (`timeScale`): every duration, lead and time constant of the
 * plan is multiplied, and the engine moves its articulators as many times
 * slower (Score.timeScale), so that a gesture can be followed by eye.
 */
export interface NaturalnessOptions {
  timing: boolean;
  intonation: boolean;
  micro: boolean;
  voiceQuality: boolean;
  coarticulation: boolean;
}

export const NATURAL_ALL: NaturalnessOptions = { timing: true, intonation: true, micro: true, voiceQuality: true, coarticulation: true };

export interface ProsodyOptions {
  /** base pitch, Hz (the speaker's usual speaking pitch) */
  f0: number;
  /** strength of the pitch accents, semitones */
  accent: number;
  /** speaking rate multiplier (>1 faster) */
  rate: number;
  /** lung pressure, cm H2O */
  ps: number;
  /** language: durations, aspiration, accent alignment */
  lang: Lang;
  /** optional user contour: points (t in 0..1 of the utterance, f0 in Hz) */
  contour?: { t: number; f0: number }[];
  /** articulatory lead of targets before the acoustic segment, s */
  lead: number;
  /** slow motion: the whole utterance, gestures included, this many times slower (1 = real time) */
  timeScale: number;
  natural: NaturalnessOptions;
}

/** Options of buildScore: any prosody option, and any subset of the naturalness ingredients. */
export type ScoreOptions = Partial<Omit<ProsodyOptions, 'natural'>> & { natural?: Partial<NaturalnessOptions> };

export const DEFAULT_PROSODY: ProsodyOptions = { f0: 120, accent: 5, rate: 1, ps: 8, lang: 'it', lead: 0.03, timeScale: 1, natural: NATURAL_ALL };

/** the parts of a stop: its closure, its release, the puff of air after it, or the breathy voice of a murmured one */
type Part = 'closure' | 'release' | 'aspiration' | 'murmur';

interface Seg {
  ipa: string;
  ph: Phoneme;
  t0: number;
  t1: number;
  /** index of the phone in the input */
  unit: number;
  part?: Part;
  label: string;
}

/** A phone with its prosodic context. */
interface Unit {
  p: Phone;
  ph: Phoneme;
  vowel: boolean;
  word: number;
  /** syllable index in the utterance, and the vowel that is its nucleus */
  syl: number;
  /** first and last phone index of the word */
  w0: number;
  w1: number;
  /** syllable has a primary stress */
  stressed: boolean;
  /** consonant after the nucleus of its syllable */
  coda: boolean;
  /** the syllable is the last one before a pause or the end */
  phraseFinal: boolean;
  /** kind of boundary that ends the phrase of this phone */
  boundary: 'comma' | 'stop' | 'question' | 'wh';
  wordFinalSyl: boolean;
  polysyllabic: boolean;
  dur: number;
}

const FRAME = 0.005;
/** how much earlier than its sound a consonant gesture starts (s) */
const CONS_ONSET = 0.02;
/** how many of its time constants ahead of a closure an articulator sets out, when it has its whole way to go */
const CLOSE_AHEAD = 3;
/** the whole way of an articulator: from an open vowel to a closure */
const REACH: Record<string, number> = { jaw: 0.8, tipY: 1.75, tipX: 0.9, tongueY: 2.3, tongueX: 1.2, tongueRoot: 1.2, lipOpen: 0.8, velum: 0.35 };
/** how long before its planned release a consonant lets its target go (s) */
const RELEASE_LEAD = 0.012;
/** articulators that keep the middle of a vowel for the vowel, and how many of
 *  their time constants before that middle a consonant may claim them */
const PROTECTED = new Set<string>(['tipX', 'tipY', 'tongueX', 'tongueY', 'velum']);
const CORE = 0.75;
/** articulators whose vowel targets are aimed so that the middle of the vowel
 *  reaches them, and how far past the target they may aim, as a share of the
 *  way still to go */
const COMPENSATED: (keyof Articulators)[] = ['tongueX', 'tongueY', 'tongueRoot', 'jaw', 'lipRound', 'lipProtrude'];
const OVERSHOOT = 0.6;
const isObstruent = (ph: Phoneme | undefined) => !!ph && (ph.manner === 'stop' || ph.manner === 'fricative' || ph.manner === 'affricate');
const isCons = (u: Unit | undefined) => !!u && !u.vowel && u.ph.manner !== 'silence';

// ------------------------------------------------------------------ context

/** Legal two-consonant onsets (both languages): stop/f + liquid or glide, s + consonant. */
function legalOnset(a: string, b: string): boolean {
  const liquids = ['l', 'ɫ', 'r', 'ɹ', 'w', 'j', 'ɾ'];
  if (a === 's' || a === 'z' || a === 'ʃ') return b !== 's' && b !== 'z';
  if (['p', 'b', 't', 'd', 'k', 'g', 'f', 'v', 'θ'].includes(a)) return liquids.includes(b);
  return false;
}

function analyse(phones: Phone[]): Unit[] {
  const units: Unit[] = [];
  let word = 0;
  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    const ph = PHONEMES[p.ipa];
    if (!ph) continue;
    const prevU = units[units.length - 1];
    if (p.wordStart && prevU && !prevU.p.wordEnd && !prevU.p.pause) word++;
    units.push({
      p, ph, vowel: ph.manner === 'vowel', word, syl: -1, w0: 0, w1: 0, stressed: false, coda: false,
      phraseFinal: false, boundary: 'stop', wordFinalSyl: false, polysyllabic: false, dur: 0,
    });
    if (p.wordEnd || p.pause) word++;
  }
  if (!units.length) return units;
  // word extents
  for (let i = 0; i < units.length; i++) {
    let a = i, b = i;
    while (a > 0 && units[a - 1].word === units[i].word) a--;
    while (b < units.length - 1 && units[b + 1].word === units[i].word) b++;
    units[i].w0 = a; units[i].w1 = b;
  }
  // syllables: one per vowel; consonants go to the next vowel if they form a legal onset
  let syl = -1;
  const nucleus: number[] = [];
  for (let i = 0; i < units.length; i++) if (units[i].vowel) nucleus.push(i);
  for (let s = 0; s < nucleus.length; s++) {
    const v = nucleus[s];
    const u = units[v];
    syl = s;
    u.syl = syl;
    u.stressed = !!u.p.stress;
    // consonants before the vowel within the word
    let k = v - 1;
    const onset: number[] = [];
    while (k >= u.w0 && !units[k].vowel) { onset.unshift(k); k--; }
    // word-initial clusters are all onset; word-internal ones keep at most a legal onset
    let first = 0;
    if (k >= u.w0) {
      const n = onset.length;
      if (n >= 2 && legalOnset(units[onset[n - 2]].p.ipa, units[onset[n - 1]].p.ipa)) first = n - 2;
      else first = Math.max(0, n - 1);
      // the first half of a geminate closes the previous syllable
      if (n >= 1 && units[onset[n - 1]].p.long) first = n - 1;
    }
    for (let j = 0; j < onset.length; j++) {
      const c = units[onset[j]];
      if (j >= first) { c.syl = syl; c.coda = false; } else { c.syl = s - 1; c.coda = true; }
    }
    // word-final consonants belong to the last syllable
    if (s === nucleus.length - 1 || units[nucleus[s + 1]].word !== u.word) {
      for (let j = v + 1; j <= u.w1; j++) if (!units[j].vowel) { units[j].syl = syl; units[j].coda = true; }
    }
  }
  // geminates close their syllable too
  for (const u of units) if (u.p.long && !u.vowel) u.coda = false;
  // words without a vowel (rare): attach to the previous syllable
  for (const u of units) if (u.syl < 0) u.syl = Math.max(0, syl);
  // stress of a syllable from its nucleus
  const sylStress = new Map<number, boolean>();
  for (const v of nucleus) sylStress.set(units[v].syl, !!units[v].p.stress);
  for (const u of units) u.stressed = sylStress.get(u.syl) ?? false;
  // phrases: up to a pause or the end; the last syllable of each is phrase-final
  let start = 0;
  for (let i = 0; i < units.length; i++) {
    const last = i === units.length - 1;
    const pz = units[i].p.pause;
    if (!pz && !last) continue;
    const end = i;
    const boundary: Unit['boundary'] = units[i].p.whQuestion ? 'wh' : units[i].p.question ? 'question' : pz === 'short' ? 'comma' : 'stop';
    let lastSyl = -1;
    for (let j = end; j >= start; j--) if (units[j].vowel) { lastSyl = units[j].syl; break; }
    for (let j = start; j <= end; j++) {
      units[j].boundary = boundary;
      if (units[j].syl === lastSyl) units[j].phraseFinal = true;
    }
    start = i + 1;
  }
  // word-level flags
  for (const u of units) {
    let nv = 0, lastSyl = -1;
    for (let j = u.w0; j <= u.w1; j++) if (units[j].vowel) { nv++; lastSyl = units[j].syl; }
    u.polysyllabic = nv > 1;
    u.wordFinalSyl = u.syl === lastSyl;
  }
  return units;
}

// ---------------------------------------------------------------- durations

/** Klatt (1979) inherent and minimum durations, ms (American English). */
const KLATT: Record<string, [number, number]> = {
  i: [155, 55], 'ɪ': [135, 40], 'eɪ': [190, 100], 'ɛ': [150, 70], 'æ': [230, 80], 'ɑ': [240, 100], 'ɔ': [240, 100], 'oʊ': [220, 80],
  'ʊ': [160, 60], u: [210, 70], 'ʌ': [140, 60], 'ə': [120, 60], 'ɝ': [180, 80], 'ɚ': [180, 80], 'aɪ': [250, 150], 'aʊ': [260, 100],
  'ɔɪ': [280, 150], a: [230, 80], e: [190, 100], o: [220, 80],
  p: [90, 50], t: [75, 50], k: [80, 60], b: [85, 60], d: [75, 50], g: [80, 60], 'tʃ': [140, 90], 'dʒ': [120, 80], ts: [130, 90], dz: [120, 80],
  f: [100, 80], 'θ': [90, 60], s: [105, 60], 'ʃ': [105, 80], v: [60, 40], 'ð': [50, 30], z: [75, 40], 'ʒ': [70, 40], h: [80, 20],
  m: [70, 60], n: [60, 50], 'ŋ': [95, 60], l: [80, 40], 'ɫ': [80, 40], 'ɹ': [80, 30], w: [80, 60], j: [80, 40], 'ɾ': [20, 20], 'ʔ': [50, 30],
  r: [80, 40], 'ɲ': [90, 60], 'ʎ': [90, 60],
};

/** Inherent and minimum durations for Italian, ms (stops: closure plus release). */
const ITALIAN: Record<string, [number, number]> = {
  a: [120, 55], e: [115, 50], 'ɛ': [118, 52], o: [115, 50], 'ɔ': [118, 52], i: [100, 45], u: [100, 45], 'ə': [80, 40],
  p: [95, 60], t: [88, 55], k: [95, 60], b: [78, 50], d: [72, 45], g: [78, 50], 'tʃ': [115, 75], 'dʒ': [100, 65], ts: [120, 80], dz: [105, 70],
  f: [100, 65], v: [70, 45], s: [105, 65], z: [75, 45], 'ʃ': [105, 75], m: [75, 50], n: [70, 45], 'ɲ': [95, 65], 'ŋ': [70, 45],
  l: [65, 40], 'ʎ': [95, 65], r: [70, 50], 'ɾ': [25, 20], j: [60, 40], w: [60, 40], h: [70, 30],
};

function englishDuration(u: Unit, next: Unit | undefined, prev: Unit | undefined): number {
  const [inh, min0] = KLATT[u.p.ipa] ?? [u.ph.dur * 1000, u.ph.dur * 500];
  let min = min0;
  let pr = 1;
  const clauseFinal = u.phraseFinal && u.boundary !== 'comma';
  if (u.vowel) {
    if (u.phraseFinal) pr *= clauseFinal ? 1.4 : 1.2; // phrase-final lengthening
    else pr *= 0.6; // non-phrase-final shortening
    if (!u.wordFinalSyl) pr *= 0.85;
    if (u.polysyllabic) pr *= 0.8;
    if (!u.p.stress && !u.p.stress2) { pr *= u.p.reduced || u.p.func ? 0.5 : 0.7; min *= 0.5; }
    // the next consonant in the word (or none at the end of the word)
    const nx = next && next.word === u.word ? next : undefined;
    let f = 1;
    if (!nx) f = u.phraseFinal ? 1.2 : 1;
    else if (nx.vowel) f = 1.2;
    else if (nx.ph.manner === 'fricative' && nx.ph.voiced) f = 1.6;
    else if (nx.ph.manner === 'stop' && nx.ph.voiced) f = 1.2;
    else if (nx.ph.manner === 'nasal') f = 0.85;
    else if ((nx.ph.manner === 'stop' || nx.ph.manner === 'affricate') && !nx.ph.voiced) f = 0.7;
    pr *= u.phraseFinal ? f : 1 + 0.5 * (f - 1);
  } else {
    if (!(u.p.wordStart || prev?.word !== u.word)) pr *= 0.85; // non-initial consonants
    if (!u.stressed) pr *= 0.7;
    const pc = isCons(prev) && prev!.word === u.word, nc = isCons(next) && next!.word === u.word;
    if (pc && nc) pr *= 0.5; else if (pc || nc) pr *= 0.7;
    if (u.phraseFinal && u.coda) pr *= 1.4;
  }
  return (min + (inh - min) * pr) / 1000;
}

function italianDuration(u: Unit, next: Unit | undefined, prev: Unit | undefined): number {
  const [inh, min0] = ITALIAN[u.p.ipa] ?? KLATT[u.p.ipa] ?? [u.ph.dur * 1000, u.ph.dur * 500];
  let min = min0;
  let pr = 1;
  if (u.vowel) {
    const nx = next && next.word === u.word ? next : undefined;
    // a syllable is closed by a coda consonant or by the first half of a geminate
    const closed = !!nx && !nx.vowel && (nx.coda || !!nx.p.long);
    if (u.p.stress) pr *= closed ? 0.75 : 1.55;
    else if (u.p.func) { pr *= 0.35; min *= 0.7; }
    else { pr *= 0.45; min *= 0.75; }
    if (u.phraseFinal) pr *= u.boundary === 'comma' ? 1.2 : 1.4;
    if (!u.p.stress && u.wordFinalSyl && !u.p.func) pr *= 1.1;
  } else {
    if (u.p.wordStart) pr *= 1.05;
    const pc = isCons(prev) && prev!.word === u.word, nc = isCons(next) && next!.word === u.word;
    if (pc || nc) pr *= 0.8;
    if (!u.stressed) pr *= 0.9;
    if (u.phraseFinal && u.coda) pr *= 1.3;
  }
  let d = min + (inh - min) * pr;
  if (u.p.long && !u.vowel) d *= 1.85;
  return d / 1000;
}

/**
 * Durations for Arabic, Urdu and Hindi: the inherent duration of each sound,
 * long vowels and geminates long, the short vowels short, and the end of a
 * phrase slow.
 */
function plainDuration(u: Unit, next: Unit | undefined, prev: Unit | undefined): number {
  let d = u.ph.dur;
  if (u.vowel) {
    if (u.p.long) d *= 1.7;
    else if (u.p.ipa === 'ə' || u.p.ipa === 'ɪ' || u.p.ipa === 'ʊ') d *= 0.75;
    if (u.p.stress) d *= 1.1; else if (u.p.func) d *= 0.8;
    if (u.phraseFinal) d *= u.boundary === 'comma' ? 1.2 : 1.35;
  } else {
    if (u.p.long) d *= 1.85;
    const pc = isCons(prev) && prev!.word === u.word, nc = isCons(next) && next!.word === u.word;
    if (pc || nc) d *= 0.85;
    if (u.phraseFinal && u.coda) d *= 1.25;
  }
  return d;
}

// ------------------------------------------------------------------ Fujisaki

const ALPHA = 2.0; // phrase control, 1/s
const GAMMA = 0.9; // ceiling of the accent response
const gp = (t: number) => (t > 0 ? ALPHA * ALPHA * t * Math.exp(-ALPHA * t) : 0);
const ga = (t: number, beta: number) => (t > 0 ? Math.min(1 - (1 + beta * t) * Math.exp(-beta * t), GAMMA) : 0);
const ST = Math.LN2 / 12; // one semitone in log units

interface Command { t1: number; t2: number; a: number; beta: number }

// ---------------------------------------------------------------- the score

export function buildScore(phones: Phone[], opts: ScoreOptions = {}): Score {
  const o: ProsodyOptions = { ...DEFAULT_PROSODY, ...opts, natural: { ...NATURAL_ALL, ...(opts.natural ?? {}) } };
  const nat = o.natural;
  const scale = Math.max(1, o.timeScale || 1);
  const rate0 = Math.max(0.3, o.rate);
  const rate = rate0 / scale;
  const en = o.lang === 'en';
  /** time constant of an articulator, in slow motion as many times longer */
  const tau = (k: string) => TAM_TAU[k] * scale;
  const units = analyse(phones);

  // durations
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (nat.timing) u.dur = (en ? englishDuration : o.lang === 'it' ? italianDuration : plainDuration)(u, units[i + 1], units[i - 1]);
    else u.dur = u.ph.dur * (u.p.long && !u.vowel ? 1.9 : 1);
    if (u.ph.manner === 'trill') {
      // the number of contacts sets the duration of a trill (each about 38 ms)
      const contacts = u.p.long ? 4 : u.p.wordStart ? 3 : isCons(units[i - 1]) ? 1 : 2;
      u.dur = Math.max(u.dur, contacts * 0.036);
    }
    u.dur /= rate;
  }

  // segments
  const segs: Seg[] = [];
  let t = 0.06 * scale; // breath onset
  const label = (u: Unit) => u.p.ipa;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const ph = u.ph;
    const parts: [string, number][] = ph.manner === 'affricate' && ph.parts ? [[ph.parts[0], 0.45], [ph.parts[1], 0.55]] : [[u.p.ipa, 1]];
    for (const [ipa, frac] of parts) {
      const q = PHONEMES[ipa];
      const dur = u.dur * frac;
      if (q.manner === 'stop') {
        const rel = Math.min(0.015, dur * 0.35);
        segs.push({ ipa, ph: q, t0: t, t1: t + dur - rel, unit: i, part: 'closure', label: label(u) });
        t += dur - rel;
        segs.push({ ipa, ph: q, t0: t, t1: t + rel, unit: i, part: 'release', label: label(u) });
        t += rel;
        // English voiceless stops are aspirated at the start of a stressed syllable (not after s)
        const nx = units[i + 1];
        const afterS = units[i - 1]?.p.ipa === 's' && units[i - 1].word === u.word;
        if (en && !q.voiced && ph.manner === 'stop' && nx?.vowel && !u.coda && !afterS) {
          const vot = ({ p: 0.055, t: 0.065, k: 0.075 }[ipa] ?? 0.06) * (u.stressed ? 1 : 0.55) * scale / Math.sqrt(rate0);
          const asp = Math.max(0.005, vot - rel);
          segs.push({ ipa, ph: q, t0: t, t1: t + asp, unit: i, part: 'aspiration', label: label(u) });
          t += asp;
          // the aspiration takes over the start of the vowel (Klatt)
          nx.dur = Math.max(0.04, nx.dur - 0.5 * asp);
        }
      } else {
        segs.push({ ipa, ph: q, t0: t, t1: t + dur, unit: i, label: label(u) });
        t += dur;
      }
    }
    // the aspirated consonants of Hindi and Urdu: a voiceless one is released
    // into a puff of air (a long voice onset time, 70-90 ms), a voiced one into
    // a breathy sigh of voice, the murmur of bʱ dʱ gʱ (about 60 ms)
    if (ph.aspirated) {
      const nx = units[i + 1];
      const d = (ph.voiced ? 0.06 : 0.075) * scale / Math.sqrt(rate0);
      segs.push({ ipa: u.p.ipa, ph, t0: t, t1: t + d, unit: i, part: ph.voiced ? 'murmur' : 'aspiration', label: label(u) });
      t += d;
      if (nx?.vowel) nx.dur = Math.max(0.04, nx.dur - (ph.voiced ? 0.3 : 0.5) * d);
    }
    // a pause inside the utterance; after the last sound the voice simply stops
    if (u.p.pause && i < units.length - 1) {
      const d = (u.p.pause === 'long' ? 0.3 : 0.16) / rate;
      segs.push({ ipa: '_', ph: PHONEMES._, t0: t, t1: t + d, unit: i, label: '_' });
      t += d;
    }
  }
  const duration = t + 0.05 * scale;
  const lead = o.lead * scale;

  // ---------------------------------------------------------- articulation
  // per-key anchor points: (interval, value) at the segments that specify the key
  const anchors: Record<string, { t0: number; t1: number; v: number; cons?: boolean; mid?: number }[]> = {};
  for (const k of ARTICULATOR_KEYS) anchors[k] = [];
  const neutral: Articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art };
  for (const s of segs) {
    const m = s.ph.manner;
    if (m === 'silence' || ((m === 'glottal' || m === 'glottalStop') && nat.coarticulation)) continue;
    // at the release the closing articulator opens toward the next vowel: leave it free
    if (s.part === 'release' || s.part === 'aspiration' || s.part === 'murmur') continue;
    const art = s.ph.art;
    const keys = m === 'vowel' || !nat.coarticulation ? ARTICULATOR_KEYS : (Object.keys(art) as (keyof Articulators)[]);
    const off = s.ph.offglide ? PHONEMES[s.ph.offglide].art : null;
    for (const k of keys) {
      let v = art[k] ?? (nat.coarticulation ? DEFAULT_ARTICULATORS[k] : neutral[k]);
      // a nasalised vowel (Hindi ँ, Urdu ں) keeps the velum open through the vowel
      if (k === 'velum' && m === 'vowel' && units[s.unit].p.nasal) v = NASAL_VELUM;
      if (off) {
        // diphthong: hold the nucleus, then glide to the offglide target
        // (the nucleus is aimed to be reached a quarter of the way in)
        const d = s.t1 - s.t0;
        anchors[k].push({ t0: s.t0 - lead, t1: s.t0 + 0.35 * d - lead, v, mid: s.t0 + 0.25 * d });
        anchors[k].push({ t0: s.t1 - 0.2 * d - lead, t1: s.t1 - lead, v: off[k] ?? v });
      } else if (m !== 'vowel') {
        // a consonant gesture starts earlier than its sound (it overlaps the
        // vowel before), so that a short fricative or nasal still reaches its
        // target; a stop aims beyond the contact and closes in time anyway.
        // The target is let go just before the planned release: the opening
        // of a closure clears it within a few milliseconds, a fricative's
        // narrow slit needs a little longer to open, and a slow articulator
        // (tongue body, jaw, velum) lets go earlier than the tip, so that all
        // open together (a velar released late behind a velum already raised
        // would cut off both mouth and nose)
        // The middle of the vowel before is its own: the tongue may head for
        // the consonant only from about one time constant before it, so a
        // short vowel between alveolars is not said with the tip already up
        // (an r-coloured, retroflex vowel) nor one before a velar with the
        // dorsum on its way to it. The velum too, in Italian; English lowers
        // it from the start of a vowel before a nasal (Cohn 1990), and the
        // nasalized vowel is part of the word
        const prev = anchors[k][anchors[k].length - 1];
        const own = PROTECTED.has(k) && !(en && k === 'velum');
        const core = own && prev && !prev.cons && prev.mid !== undefined ? prev.mid - CORE * tau(k) : -Infinity;
        // A closure is closed when its sound starts: an articulator that has far to go for it (the jaw and
        // the tongue after an open vowel) sets out that much earlier, as a speaker's does in the last part of
        // the vowel. Setting out only when the sound was due, a d after "a" never touched, a k closed a
        // twentieth of a second late, and the mouth of the picture closed after the sound
        const closes = m === 'stop' || m === 'nasal';
        const far = closes && prev && !prev.cons ? Math.min(1, Math.abs(v - prev.v) / (REACH[k] ?? 1)) : 0;
        const early = Math.max(m === 'stop' ? 0 : CONS_ONSET * scale, far * CLOSE_AHEAD * tau(k));
        // (but the vowel before keeps its middle and a little more: a short one between two stops is still said open)
        const kept = far > 0 && prev && prev.mid !== undefined ? prev.mid - lead + 0.2 * (prev.t1 + lead - prev.mid) : -Infinity;
        const t0 = Math.max(core, Math.min(s.t0 - lead, Math.max(kept, s.t0 - lead - early)));
        if (prev && prev.t1 > t0) prev.t1 = Math.max(prev.t0, t0);
        const release = (m === 'fricative' ? 2 : 1) * RELEASE_LEAD * scale * (TAM_TAU[k] / TAM_TAU.tipY);
        anchors[k].push({ t0: Math.max(t0, prev ? prev.t1 : -Infinity), t1: Math.max(t0 + 0.01, s.t1 - release), v, cons: true });
      } else anchors[k].push({ t0: s.t0 - lead, t1: s.t1 - lead, v, mid: 0.5 * (s.t0 + s.t1) });
    }
  }
  // after the last sound the mouth relaxes to rest (and a final stop is released)
  for (const k of ARTICULATOR_KEYS) anchors[k].push({ t0: t + 0.03, t1: t + 1, v: neutral[k] });
  const valueAt = (k: keyof Articulators, time: number): number => {
    const a = anchors[k];
    if (!a.length) return DEFAULT_ARTICULATORS[k];
    if (time <= a[0].t0) return a[0].v;
    for (let i = 0; i < a.length; i++) {
      if (time >= a[i].t0 && time <= a[i].t1) return a[i].v;
      if (i + 1 < a.length && time > a[i].t1 && time < a[i + 1].t0) {
        // after a consonant the articulator it used is released at once
        // toward its next target (the tip leaves the ridge, the lip the teeth);
        // between vowels it glides, through the consonants that leave it free
        if (a[i].cons) return a[i + 1].v;
        const w = (time - a[i].t1) / (a[i + 1].t0 - a[i].t1);
        return a[i].v + (a[i + 1].v - a[i].v) * w;
      }
    }
    return a[a.length - 1].v;
  };

  // a short vowel would end before the slow articulators reach it (the tongue
  // body takes about 85 ms for 90 % of its way): its target is aimed past the
  // vowel, as a speaker does who means to reach it, so that the middle of the
  // vowel gets there. The engine's own dynamics are run here to find out by how
  // much; the aim goes past the vowel by at most OVERSHOOT of the way, and
  // never outside the articulator's range
  for (const k of COMPENSATED) {
    const vowels = anchors[k].filter((a) => a.mid !== undefined).map((a) => ({ a, v0: a.v, from: a.v }));
    if (!vowels.length) continue;
    const [lo, hi] = ARTICULATOR_RANGES[k];
    for (let iter = 0; iter < 3; iter++) {
      const tr = new TamChannel(valueAt(k, 0), tau(k));
      const y: number[] = [];
      for (let i = 0; i * FRAME <= duration; i++) y.push(tr.step(valueAt(k, i * FRAME), FRAME));
      const at = (time: number) => y[Math.max(0, Math.min(y.length - 1, Math.round(time / FRAME)))];
      for (const w of vowels) {
        if (iter === 0) w.from = at(w.a.t0);
        const miss = w.v0 - at(w.a.mid!);
        const room = OVERSHOOT * Math.abs(w.v0 - w.from);
        w.a.v = Math.max(lo, Math.min(hi, Math.max(w.v0 - room, Math.min(w.v0 + room, w.a.v + miss))));
      }
    }
  }

  // tongue-tip contacts of taps and trills (raised-cosine flicks up to the
  // ridge). Their height is measured from where the smoothed tip really is,
  // so the same target dynamics as the engine are run here
  const tipTrack = new TamChannel(valueAt('tipY', 0), tau('tipY'));
  const tipSmooth: number[] = [];
  for (let k = 0; k * FRAME <= duration + 0.05; k++) tipSmooth.push(tipTrack.step(valueAt('tipY', k * FRAME), FRAME));
  const tipNow = (time: number) => tipSmooth[Math.max(0, Math.min(tipSmooth.length - 1, Math.round(time / FRAME)))];
  const flicks: { c: number; w: number; a: number }[] = [];
  for (const s of segs) {
    if (s.ph.manner === 'tap') {
      // the flick is added after the smoothing, so it is not led like the
      // postures; it overshoots the ridge so that the contact lasts about
      // 10-15 ms (American flaps 10-40 ms, Zue & Laferriere 1979)
      const c = 0.5 * (s.t0 + s.t1);
      flicks.push({ c, w: Math.max(0.04, (s.t1 - s.t0) * 1.6), a: Math.max(0, 2.2 - tipNow(c)) });
    } else if (s.ph.manner === 'trill') {
      const period = scale / 26;
      const n = Math.max(1, Math.round((s.t1 - s.t0) / period));
      const step = (s.t1 - s.t0) / n;
      for (let k = 0; k < n; k++) {
        const c = s.t0 + (k + 0.5) * step - lead * 0.3;
        flicks.push({ c, w: 0.62 * step, a: Math.max(0.5, (k === 0 ? 2.3 : 2.0) - tipNow(c)) });
      }
    }
  }
  const tipAt = (time: number): number => {
    let y = 0;
    for (const f of flicks) {
      const d = Math.abs(time - f.c);
      if (d < f.w / 2) y = Math.max(y, f.a * 0.5 * (1 + Math.cos((2 * Math.PI * d) / f.w)));
    }
    return y;
  };

  // ---------------------------------------------------------------- melody
  const vowelSeg = (ui: number) => segs.find((s) => s.unit === ui && s.ph.manner === 'vowel');
  const sylStart = (ui: number) => segs.find((s) => units[s.unit].syl === units[ui].syl)?.t0 ?? 0;
  const phraseCmds: { t: number; a: number }[] = [];
  const accentCmds: Command[] = [];
  // accent commands must last long enough for the step response to get near
  // its top (1 - (1 + βt) e^(-βt) is 0.8 at βt = 3), or short syllables lose their accent
  const betaAcc = en ? 26 : 28;
  {
    // phrases
    let phraseStart = 0;
    let first = true;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const isEnd = i === units.length - 1 || !!u.p.pause;
      if (!isEnd) continue;
      const startT = segs.find((s) => s.unit === phraseStart)?.t0 ?? 0;
      phraseCmds.push({ t: startT - 0.25, a: first ? 0.32 : u.boundary === 'comma' || units[phraseStart - 1]?.boundary === 'comma' ? 0.16 : 0.26 });
      first = false;
      // accents on the stressed vowels of content words
      const acc: number[] = [];
      for (let j = phraseStart; j <= i; j++) if (units[j].vowel && units[j].p.stress && !units[j].p.func) acc.push(j);
      const boundary = u.boundary;
      const yesNo = boundary === 'question';
      const lastV = (() => { for (let j = i; j >= phraseStart; j--) if (units[j].vowel) return j; return -1; })();
      let height = o.accent * ST;
      acc.forEach((j, n) => {
        const vs = vowelSeg(j);
        if (!vs) return;
        const nuclear = n === acc.length - 1;
        let a = height;
        // a yes/no question has a low nuclear accent before its final rise
        if (nuclear && yesNo) a = 0;
        if (en) {
          // English H*: rise through the stressed syllable, peak inside its vowel
          const t2 = vs.t1 - 0.03;
          if (a > 0) accentCmds.push({ t1: Math.min(sylStart(j) - 0.03, t2 - 0.17), t2, a, beta: betaAcc });
        } else if (nuclear && !yesNo && boundary !== 'comma') {
          // Italian statement nucleus H+L*: high on the syllable before, falling onto the stressed one
          accentCmds.push({ t1: vs.t0 - 0.24, t2: vs.t0 + 0.02, a: a * 1.1, beta: betaAcc });
        } else if (a > 0) {
          // Italian L+H*: the rise starts with the stressed vowel and peaks late,
          // still inside it (a peak on the next voiceless consonant is not heard)
          const t2 = vs.t1 - 0.015;
          accentCmds.push({ t1: Math.min(vs.t0 - 0.03, t2 - 0.13), t2, a, beta: betaAcc });
        }
        // downstep: each accent a little lower than the one before, never below 60 %
        height = Math.max(0.6 * o.accent * ST, height * 0.9);
      });
      // boundary tones
      const lv = lastV >= 0 ? vowelSeg(lastV) : undefined;
      const endT = segs.filter((s) => s.unit <= i).reduce((m, s) => Math.max(m, s.t1), 0);
      if (lv) {
        if (yesNo) accentCmds.push({ t1: lv.t0 - 0.1, t2: endT + 0.2, a: 0.5, beta: 16 });
        else if (boundary === 'comma') accentCmds.push({ t1: lv.t0, t2: endT + 0.1, a: 0.13, beta: 16 });
        else accentCmds.push({ t1: lv.t0 - 0.02, t2: endT + 0.2, a: -0.13, beta: 12 }); // final lowering
      }
      phraseStart = i + 1;
    }
  }
  const floor = o.f0 * Math.pow(2, -4 / 12);
  // microprosody: intrinsic F0 of vowels and the push of the preceding consonant
  const micro: { t0: number; t1: number; st: number; decay?: number }[] = [];
  if (nat.micro) {
    for (const s of segs) {
      if (s.ph.manner !== 'vowel') continue;
      const ip = s.ipa;
      const intrinsic = ['i', 'u', 'ɪ', 'ʊ'].includes(ip) ? 0.7 : ['a', 'æ', 'ɑ', 'aɪ', 'aʊ'].includes(ip) ? -0.5 : 0;
      if (intrinsic) micro.push({ t0: s.t0, t1: s.t1, st: intrinsic });
      const prevSeg = segs[segs.indexOf(s) - 1];
      if (prevSeg && isObstruent(prevSeg.ph)) micro.push({ t0: s.t0, t1: s.t0 + 0.12, st: prevSeg.ph.voiced ? -0.8 : 1.3, decay: 0.035 });
    }
  }
  const microAt = (time: number): number => {
    let st = 0;
    for (const m of micro) {
      if (time < m.t0 - 0.03 || time > m.t1 + 0.03) continue;
      if (m.decay) st += m.st * Math.exp(-Math.max(0, time - m.t0) / m.decay);
      else {
        const e = Math.min(1, Math.max(0, (time - m.t0 + 0.03) / 0.06), Math.max(0, (m.t1 + 0.03 - time) / 0.06));
        st += m.st * e;
      }
    }
    return st;
  };
  const f0At = (time: number): number => {
    let f: number;
    if (o.contour && o.contour.length >= 2) {
      const u = Math.min(1, Math.max(0, time / duration));
      const c = o.contour;
      f = c[c.length - 1].f0;
      if (u <= c[0].t) f = c[0].f0;
      else {
        for (let i = 1; i < c.length; i++) {
          if (u <= c[i].t) {
            const w = (u - c[i - 1].t) / Math.max(1e-6, c[i].t - c[i - 1].t);
            f = c[i - 1].f0 * Math.pow(c[i].f0 / c[i - 1].f0, w);
            break;
          }
        }
      }
    } else if (!nat.intonation) f = o.f0;
    else {
      let lf = Math.log(floor);
      for (const pc of phraseCmds) lf += pc.a * gp(time - pc.t);
      for (const ac of accentCmds) lf += ac.a * (ga(time - ac.t1, ac.beta) - ga(time - ac.t2, ac.beta));
      f = Math.exp(lf);
    }
    return f * Math.pow(2, microAt(time) / 12);
  };

  // ------------------------------------------------------ source per frame
  const segAt = (time: number): Seg | null => {
    for (const s of segs) if (time >= s.t0 && time < s.t1) return s;
    return null;
  };
  const stressedVowels = segs.filter((s) => s.ph.manner === 'vowel' && units[s.unit].p.stress && !units[s.unit].p.func);
  const phraseEnds = segs.filter((s) => s.ph.manner === 'silence').map((s) => s.t0).concat([t]);
  // unaspirated voiceless stops (Italian, English after s) keep the folds
  // apart through the closure and bring them together just after the burst:
  // the voice starts with a short lag, longest behind the slow release of the
  // tongue body (Italian: short lag, under about 30 ms, /k/ the longest)
  const shortLag = segs.filter((s) => s.part === 'release' && !s.ph.voiced && units[s.unit].ph.manner === 'stop' && !units[s.unit].p.glottalized
    && !segs.some((a) => a.unit === s.unit && a.part === 'aspiration'))
    .map((s) => ({ t0: s.t0, t1: s.t0 + (({ p: 0.008, t: 0.012, k: 0.02 } as Record<string, number>)[s.ipa] ?? 0.012) }));
  const frames: ScoreFrame[] = [];
  const n = Math.ceil((duration + 0.25) / FRAME);
  for (let i = 0; i <= n; i++) {
    const time = i * FRAME;
    const art = {} as Articulators;
    for (const k of ARTICULATOR_KEYS) art[k] = valueAt(k, time);
    // glottal gestures lead the acoustic segment slightly
    const sg = segAt(time + 0.01);
    let abd = 0;
    let gate = 1;
    // before the first sound the folds are already together, ready to vibrate
    // (no breathy [h] onset); after the last one they part a little while the
    // lungs stop pushing, so the voice ends without a hiss of escaping air
    if (!sg) abd = time < 0.06 ? 0.08 : 0.4;
    else {
      const m = sg.ph.manner;
      const unit = units[sg.unit];
      if (m === 'silence') abd = 0.6;
      else if (m === 'glottalStop') { abd = 0; gate = 0; }
      else if (m === 'stop' && unit.p.glottalized) {
        // [ʔt̚]: the folds close with the tongue, so no pressure builds up
        // behind the closure and nothing bursts out at its release
        abd = 0;
        if (sg.part === 'closure') gate = 0;
      } else if (m === 'stop' && !sg.ph.voiced) {
        // the stop part of an affricate keeps the glottis open into its hiss
        const aspirated = unit.ph.manner === 'affricate' || segs.some((s) => s.unit === sg.unit && s.part === 'aspiration');
        if (sg.part === 'release') abd = aspirated ? 0.55 : 0.04;
        else abd = 0.5;
      } else if (m === 'stop') abd = en && unit.p.wordStart ? 0.12 : 0.02;
      else abd = sg.ph.abduction;
    }
    for (const w of shortLag) if (time + 0.01 >= w.t0 && time + 0.01 < w.t1) abd = Math.max(abd, 0.5);
    // the murmur of a voiced aspirate: the folds vibrate while air leaks between them
    if (sg?.part === 'murmur') abd = 0.3;
    // lungs: on during the utterance, lower during pauses, off at the end
    let ps = time < duration ? o.ps : 0;
    let rd = 0;
    if (time < duration) {
      if (nat.voiceQuality) {
        ps *= 1 - 0.12 * (time / duration);
        for (const v of stressedVowels) {
          const c = 0.5 * (v.t0 + v.t1), w = (v.t1 - v.t0) + 0.08;
          const d = Math.abs(time - c);
          if (d < w) { const e = 0.5 * (1 + Math.cos((Math.PI * d) / w)); ps *= 1 + 0.14 * e; rd -= 0.12 * e; }
        }
        // the end of each phrase relaxes: less pressure, breathier voice
        for (const pe of phraseEnds) {
          const d = pe - time;
          if (d >= 0 && d < 0.28) { const e = 1 - d / 0.28; ps *= 1 - 0.18 * e; rd += 0.55 * e; }
        }
      }
      // a pause is quiet: the lungs hold back instead of blowing through the open glottis
      if (sg?.ph.manner === 'silence' && sg.t1 - sg.t0 > 0.1 && time > sg.t0 + 0.04 && time < sg.t1 - 0.06) ps *= 0.08;
    }
    if (sg?.part === 'murmur') rd += 0.9;
    frames.push({ t: time, art, abduction: abd, f0: f0At(time), ps, tip: tipAt(time), rd, gate });
  }
  const sp: ScorePhone[] = [];
  for (const s of segs) {
    const prev = sp[sp.length - 1];
    if (prev && prev.ipa === s.label && (s.part === 'release' || s.part === 'aspiration' || s.part === 'murmur' || units[s.unit].ph.manner === 'affricate') && sp.length && segs[segs.indexOf(s) - 1]?.unit === s.unit) { prev.t1 = s.t1; continue; }
    sp.push({ ipa: s.label, t0: s.t0, t1: s.t1 });
  }
  // the melody is already a smooth curve (Fujisaki's filters, the drawn
  // contour): the engine only rounds off the 5 ms frame steps, without the
  // slower glide it gives to a slider, which would shave the accent peaks
  return { frames, phones: sp, duration, flutter: nat.micro ? 25 : 0, f0Tau: 0.006, ...(scale > 1 ? { timeScale: scale } : {}) };
}

/** A sustained vowel or a glide between targets, for the singing / A-B demos. */
export function sustainScore(
  targets: { art: Articulators; dur: number; f0: number; f0End?: number }[],
  ps = 8,
): Score {
  const frames: ScoreFrame[] = [];
  const phones: ScorePhone[] = [];
  let t = 0;
  for (const tg of targets) {
    const n = Math.max(1, Math.round(tg.dur / FRAME));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const f0 = tg.f0End ? tg.f0 * Math.pow(tg.f0End / tg.f0, u) : tg.f0;
      frames.push({ t: t + i * FRAME, art: { ...tg.art }, abduction: 0, f0, ps });
    }
    phones.push({ ipa: '', t0: t, t1: t + tg.dur });
    t += tg.dur;
  }
  const last = frames[frames.length - 1];
  for (let i = 1; i < 30; i++) frames.push({ ...last, t: t + i * FRAME, ps: 0 });
  return { frames, phones, duration: t };
}
