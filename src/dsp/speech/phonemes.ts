import { Articulators } from '../tract/types';

export type Manner =
  | 'vowel' | 'fricative' | 'stop' | 'nasal' | 'approximant' | 'lateral' | 'trill' | 'tap' | 'affricate' | 'glottal' | 'glottalStop' | 'silence';

/** Velum opening of the nasal consonants: a port of about 0.4 cm² (portArea). */
export const NASAL_VELUM = 0.35;

/**
 * A phoneme as an articulatory target. Only the articulators that the sound
 * really controls are listed in `art`; the others are free to coarticulate
 * (they move toward the neighbouring vowels, as in Öhman's 1966 model of VCV
 * coarticulation).
 */
export interface Phoneme {
  ipa: string;
  manner: Manner;
  voiced: boolean;
  /** articulatory targets (cm / normalised units) */
  art: Partial<Articulators>;
  /** glottal abduction 0 (phonation) .. 1 (wide open, breathing) */
  abduction: number;
  /** nominal duration, s */
  dur: number;
  /** example words */
  examples?: string;
  /** for affricates: the stop and fricative parts */
  parts?: [string, string];
  /** dorsal closure (velar stops/nasals) */
  dorsal?: boolean;
  /** diphthongs: the vowel the tongue and lips glide to */
  offglide?: string;
  /**
   * released with a puff of air (Hindi, Urdu): a voiceless stop keeps the
   * folds apart for about 70 ms after the burst; a voiced one lets the voice
   * sigh out breathily (the murmur of bʱ, dʱ, gʱ)
   */
  aspirated?: boolean;
}

const V = (ipa: string, art: Partial<Articulators>, examples: string, dur = 0.14): Phoneme => ({
  ipa, manner: 'vowel', voiced: true, art: { tipX: 0, tipY: 0, groove: 0, tongueSides: 0, lipTuck: 0, velum: 0, ...art }, abduction: 0, dur, examples,
});

/**
 * Vowel targets were fitted (scripts/tune-vowels.ts) so that the reference
 * acoustic model lands on the Peterson & Barney (1952) / Hillenbrand et al.
 * (1995) adult-male means; Italian vowels follow the same chart positions.
 */
export const VOWELS: Record<string, Phoneme> = {
  'ə': V('ə', { jaw: 0.4, tongueX: 0.14, tongueY: 0.73, tongueRoot: 0.49, lipOpen: 0.26, lipRound: 0.1, lipProtrude: 0.06 }, 'sofa'),
  i: V('i', { jaw: 0.143, tongueX: 1.095, tongueY: 0.83, tongueRoot: 1.2, lipOpen: -0.05, lipRound: 0.19, lipProtrude: -0.35 }, 'heed, vino'),
  'ɪ': V('ɪ', { jaw: 0.25, tongueX: 0.894, tongueY: 0.924, tongueRoot: -0.377, lipOpen: 0.046, lipRound: 0.04, lipProtrude: -0.295 }, 'hid'),
  e: V('e', { jaw: 0.465, tongueX: 0.8, tongueY: 1.06, tongueRoot: -0.183, lipOpen: 0.779, lipRound: 0, lipProtrude: -0.346 }, 'vero, hayed'),
  'ɛ': V('ɛ', { jaw: 0.62, tongueX: 0.732, tongueY: 0.98, tongueRoot: -0.53, lipOpen: 0.984, lipRound: 0, lipProtrude: -0.346 }, 'bello, head'),
  'æ': V('æ', { jaw: 0.883, tongueX: 0.608, tongueY: 0.673, tongueRoot: -0.411, lipOpen: 0.255, lipRound: 0, lipProtrude: -0.346 }, 'had'),
  a: V('a', { jaw: 0.95, tongueX: 0.29, tongueY: -0.61, tongueRoot: -0.01, lipOpen: 0.47, lipRound: 0, lipProtrude: -0.1 }, 'casa'),
  'ɑ': V('ɑ', { jaw: 0.878, tongueX: -0.017, tongueY: -0.441, tongueRoot: -0.134, lipOpen: 0.578, lipRound: 0, lipProtrude: -0.096 }, 'father, hod'),
  'ɔ': V('ɔ', { jaw: 0.497, tongueX: -0.812, tongueY: -0.153, tongueRoot: 0.417, lipOpen: -0.05, lipRound: 0.53, lipProtrude: 0.4 }, 'cosa, hawed'),
  o: V('o', { jaw: 0.4, tongueX: -0.698, tongueY: 0.565, tongueRoot: 0.666, lipOpen: -0.012, lipRound: 0.99, lipProtrude: 0.4 }, 'voce'),
  'ʊ': V('ʊ', { jaw: 0.427, tongueX: -0.101, tongueY: 1.038, tongueRoot: 0.237, lipOpen: -0.024, lipRound: 0.93, lipProtrude: 0.93 }, 'hood'),
  u: V('u', { jaw: 0.072, tongueX: 0.347, tongueY: 1.136, tongueRoot: 0.243, lipOpen: 0.01, lipRound: 1, lipProtrude: 0.963 }, "who'd, luna"),
  'ʌ': V('ʌ', { jaw: 0.649, tongueX: -0.499, tongueY: 0.199, tongueRoot: 0.071, lipOpen: 0.787, lipRound: 0.21, lipProtrude: -0.087 }, 'hud'),
  // r-coloured vowel of "heard": a bunched or retroflex tongue with the tip up
  // and back plus rounded lips pull F3 down to about 1700 Hz (scripts/tune-rhotic.ts)
  'ɝ': V('ɝ', { jaw: 0.332, tongueX: -0.242, tongueY: -0.778, tongueRoot: 0.281, tipX: -0.679, tipY: 2.2, lipOpen: 0.124, lipRound: 0.216, lipProtrude: 1 }, 'heard, bird', 0.16),
};

/** Sounds used by the speech sequencer that cannot be held as a steady shape. */
export const GLIDING: Record<string, Phoneme> = {
  // unstressed r-coloured vowel ("butter")
  'ɚ': V('ɚ', VOWELS['ɝ'].art, 'butter', 0.1),
  // American English diphthongs: a nucleus that glides toward a higher vowel
  'eɪ': { ...V('eɪ', VOWELS.e.art, 'day', 0.19), offglide: 'ɪ' },
  'aɪ': { ...V('aɪ', VOWELS.a.art, 'my', 0.22), offglide: 'ɪ' },
  'oʊ': { ...V('oʊ', VOWELS.o.art, 'go', 0.2), offglide: 'ʊ' },
  'aʊ': { ...V('aʊ', VOWELS.a.art, 'now', 0.23), offglide: 'ʊ' },
  'ɔɪ': { ...V('ɔɪ', VOWELS['ɔ'].art, 'boy', 0.24), offglide: 'ɪ' },
};

/** the curled tongue tip of the retroflexes: up and back, behind the alveolar ridge */
const RETROFLEX: Partial<Articulators> = { jaw: 0.12, tipX: -0.6, tipY: 2.2, groove: 0, tongueX: 0.1, tongueY: 0.3, tongueRoot: 0.6 };
/** the tongue root pulled back toward the pharyngeal wall (the emphatics of Arabic) */
const PHARYNGEAL: Partial<Articulators> = { tongueRoot: -0.6, tongueX: -0.3, tongueY: -0.3 };
const EMPHATIC_S: Partial<Articulators> = { jaw: 0.15, tipX: 0.68, tipY: 0.516, groove: 1, lipOpen: 0.18, lipRound: 0, lipProtrude: -0.35, ...PHARYNGEAL };

// a consonant made with the tongue keeps its margins braced against the
// teeth, except a lateral, which lowers them to let the air past its sides
const TONGUE_KEYS: (keyof Articulators)[] = ['tongueX', 'tongueY', 'tipX', 'tipY', 'groove'];
const C = (
  ipa: string, manner: Manner, voiced: boolean, art: Partial<Articulators>, abduction: number, dur: number, examples: string, extra: Partial<Phoneme> = {},
): Phoneme => ({
  ipa, manner, voiced,
  art: manner === 'lateral' ? { tongueSides: 1, ...art } : TONGUE_KEYS.some((k) => k in art) ? { tongueSides: 0, ...art } : art,
  abduction, dur, examples, ...extra,
});

export const CONSONANTS: Record<string, Phoneme> = {
  // fricatives
  // lips spread back against the teeth: the short cavity in front of the
  // groove puts the hiss where it is measured (male /s/: peak 4-5 kHz, mean
  // 5-6 kHz; Jongman et al. 2000), and rounding from the next vowel cannot
  // stretch it down to a lisp
  s: C('s', 'fricative', false, { jaw: 0.15, tongueX: 0.3, tongueY: 0.0, tongueRoot: 1.2, tipX: 0.68, tipY: 0.516, groove: 1, lipOpen: 0.18, lipRound: 0, lipProtrude: -0.35, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'sasso, hiss, see'),
  z: C('z', 'fricative', true, { jaw: 0.15, tongueX: 0.3, tongueY: 0.0, tongueRoot: 1.2, tipX: 0.68, tipY: 0.516, groove: 1, lipOpen: 0.18, lipRound: 0, lipProtrude: -0.35, lipTuck: 0, velum: 0 }, 0.12, 0.09, 'rosa (N. It.), zoo'),
  'ʃ': C('ʃ', 'fricative', false, { jaw: 0.014, tongueX: 0.316, tongueY: 0.643, tongueRoot: 1.2, tipX: 0.487, tipY: 0.425, groove: 0.705, lipOpen: 0.856, lipRound: 0.776, lipProtrude: 0.925, lipTuck: 0, velum: 0 }, 0.55, 0.13, 'scena, she'),
  'ʒ': C('ʒ', 'fricative', true, { jaw: 0.014, tongueX: 0.316, tongueY: 0.643, tongueRoot: 1.2, tipX: 0.487, tipY: 0.425, groove: 0.705, lipOpen: 0.856, lipRound: 0.776, lipProtrude: 0.925, lipTuck: 0, velum: 0 }, 0.12, 0.1, 'beige'),
  f: C('f', 'fricative', false, { jaw: 0.12, lipOpen: 0.522, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: 0 }, 0.55, 0.12, 'fame, father'),
  v: C('v', 'fricative', true, { jaw: 0.12, lipOpen: 0.522, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: 0 }, 0.12, 0.08, 'voce'),
  'θ': C('θ', 'fricative', false, { jaw: 0.2, tipX: 1.05, tipY: 0.1, groove: 0, lipOpen: 0.25, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'thin'),
  'ð': C('ð', 'fricative', true, { jaw: 0.2, tipX: 1.05, tipY: 0.1, groove: 0, lipOpen: 0.25, lipTuck: 0, velum: 0 }, 0.12, 0.07, 'this'),
  // glottis open about 0.27 cm^2: between vowels the folds keep flapping (breathy [ɦ])
  h: C('h', 'glottal', false, {}, 0.5, 0.08, 'heed, hiss'),
  // stops
  p: C('p', 'stop', false, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 0 }, 0.5, 0.09, 'papà'),
  b: C('b', 'stop', true, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: 0 }, 0.08, 0.07, 'buzz'),
  t: C('t', 'stop', false, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 0 }, 0.5, 0.08, 'tutto'),
  d: C('d', 'stop', true, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: 0 }, 0.08, 0.06, 'dado, heed'),
  k: C('k', 'stop', false, { tongueX: -0.25, tongueY: 1.7, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 }, 0.5, 0.09, 'casa', { dorsal: true }),
  g: C('g', 'stop', true, { tongueX: -0.25, tongueY: 1.7, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 }, 0.08, 0.07, 'gatto', { dorsal: true }),
  // nasals: in running speech the velum parts from the pharyngeal wall by 2-4
  // mm (X-ray films of French sentences, Laprie, Elie & Tsukanova 2015),
  // against about 10 mm in a breath; with the port's bean shape, 12-28 mm
  // across, that is a few tenths of a square centimetre, not the 1.6 cm² of
  // the velum fully lowered (NASAL_VELUM)
  m: C('m', 'nasal', true, { jaw: 0.3, lipOpen: -0.35, lipTuck: 0, velum: NASAL_VELUM }, 0, 0.08, 'mamma'),
  n: C('n', 'nasal', true, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, lipTuck: 0, velum: NASAL_VELUM }, 0, 0.07, 'nonno'),
  'ɲ': C('ɲ', 'nasal', true, { jaw: 0.1, tongueX: 0.9, tongueY: 1.5, tongueRoot: 1.2, tipY: 0.1, velum: NASAL_VELUM }, 0, 0.09, 'gnocchi'),
  // the dorsum closes against the oral face of the lowered velum, in front of
  // the velopharyngeal port: further back it would cut the nose off too
  'ŋ': C('ŋ', 'nasal', true, { tongueX: 0.15, tongueY: 1.7, tongueRoot: 1.2, tipY: 0, velum: NASAL_VELUM }, 0, 0.08, 'sing', { dorsal: true }),
  // approximants, laterals, trill
  // the tip closes on the alveolar ridge while the margins of the tongue are
  // drawn in and lowered: the air flows past both sides of the tongue
  // (Narayanan, Alwan & Haker 1997); the tongue body sets F2. Behind the
  // contact the lumen between the margins is a side branch, the supralingual
  // cavity (2.5 cm here, 3.1 cm in Zhang & Espy-Wilson 2004): its zero sits
  // between F3 and F4. Fitted with scripts/tune-lateral.ts --robust to
  // F 335/1507/2421 Hz (measured about 350/1500/2600); the lips come from the
  // context
  l: C('l', 'lateral', true, { jaw: 0.304, tongueX: 0.714, tongueY: 1.497, tongueRoot: 0.744, tipX: -0.42, tipY: 2.2, groove: 0, velum: 0 }, 0, 0.07, 'luna'),
  'ʎ': C('ʎ', 'lateral', true, { jaw: 0.1, tongueX: 0.9, tongueY: 0.962, tongueRoot: 1.2, tipY: 0.1, velum: 0 }, 0, 0.09, 'figlio'),
  // dark (velarised) l of English codas, "feel": the tongue body backs up, F2
  // near 1000 Hz; fitted the same way to F 448/936/2254 Hz, cavity 3.4 cm
  'ɫ': C('ɫ', 'lateral', true, { jaw: 0.591, tongueX: -0.757, tongueY: 0.203, tongueRoot: 0.791, tipX: 0.514, tipY: 2.2, groove: 0, velum: 0 }, 0, 0.08, 'feel, milk'),
  // the tip rests just below the alveolar ridge; the sequencer adds the fast
  // contacts (about 26 per second, Recasens 1991) on top of this posture
  r: C('r', 'trill', true, { jaw: 0.15, tipX: 0.25, tipY: 1.25, groove: 0, velum: 0 }, 0, 0.08, 'raro (trill)'),
  // American r: tip up and back, tongue body low and back, lips rounded: F3
  // about 1600 Hz with the passage kept at 0.3 cm^2, so it does not hiss
  'ɹ': C('ɹ', 'approximant', true, { jaw: 0.2, tongueX: -0.707, tongueY: -0.975, tongueRoot: 1.2, tipX: -0.97, tipY: 2.197, lipOpen: 0.197, lipRound: 0.81, lipProtrude: 0.332, velum: 0 }, 0, 0.08, 'red'),
  j: C('j', 'approximant', true, { jaw: 0.06, tongueX: 1.0, tongueY: 0.925, tongueRoot: 1.2, lipRound: 0, velum: 0 }, 0, 0.06, 'ieri, yes'),
  w: C('w', 'approximant', true, { jaw: 0.1, tongueX: -0.8, tongueY: 0.3, tongueRoot: 1.2, lipOpen: -0.08, lipRound: 1, lipProtrude: 0.8, lipTuck: 0, velum: 0 }, 0, 0.06, 'uomo, we'),
  // affricates
  'tʃ': C('tʃ', 'affricate', false, {}, 0.5, 0.14, 'voce, ciao', { parts: ['t', 'ʃ'] }),
  'dʒ': C('dʒ', 'affricate', true, {}, 0.1, 0.12, 'gelato', { parts: ['d', 'ʒ'] }),
  ts: C('ts', 'affricate', false, {}, 0.5, 0.13, 'pizza', { parts: ['t', 's'] }),
  dz: C('dz', 'affricate', true, {}, 0.1, 0.11, 'zero', { parts: ['d', 'z'] }),
  // ---- the sounds of Arabic, Urdu and Hindi that English and Italian lack
  // (tutor mode). Places found with the geometry (scripts/probe in the tests):
  // retroflex: the tip curled up and back closes about 0.7 cm behind the
  // alveolar contact of /t/
  'ʈ': C('ʈ', 'stop', false, { ...RETROFLEX, lipTuck: 0, velum: 0 }, 0.5, 0.09, 'ṭamāṭar (Hindi, Urdu)'),
  'ɖ': C('ɖ', 'stop', true, { ...RETROFLEX, lipTuck: 0, velum: 0 }, 0.08, 0.07, 'ḍamrū'),
  'ɳ': C('ɳ', 'nasal', true, { ...RETROFLEX, lipTuck: 0, velum: NASAL_VELUM }, 0, 0.08, 'bāṇ'),
  // retroflex sibilant: the curled tip leaves a slit at the same place, the lips a little rounded
  'ʂ': C('ʂ', 'fricative', false, { ...RETROFLEX, tipY: 1.7, groove: 0.6, lipOpen: 0.3, lipRound: 0.4, lipProtrude: 0.4, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'bhāṣā'),
  // uvular stop: the dorsum closes about 0.6 cm behind the /k/ contact, at the uvula
  q: C('q', 'stop', false, { tongueX: -1.0, tongueY: 1.6, tongueRoot: 0.2, tipY: 0, groove: 0, velum: 0 }, 0.5, 0.09, 'qamar, qalam', { dorsal: true }),
  // velar fricatives: the /k/ posture lowered to a slit of 0.14 cm² (x) and 0.22 cm² (ɣ)
  x: C('x', 'fricative', false, { tongueX: -0.25, tongueY: 1.05, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 }, 0.55, 0.12, 'khubz, khargosh'),
  'ɣ': C('ɣ', 'fricative', true, { tongueX: -0.25, tongueY: 0.95, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 }, 0.12, 0.09, 'ghazāl, ghubāra'),
  // pharyngeals: the tongue root pulled toward the back wall of the pharynx
  // leaves a slit of 0.14 cm² (ħ) or a passage of 0.36 cm² (ʕ) about 4.6 cm above the glottis
  'ħ': C('ħ', 'fricative', false, { jaw: 0.55, tongueX: -0.5, tongueY: -0.3, tongueRoot: 0, tipY: 0, groove: 0, lipOpen: 0.5, velum: 0 }, 0.55, 0.12, 'ḥiṣān'),
  'ʕ': C('ʕ', 'approximant', true, { jaw: 0.55, tongueX: -0.5, tongueY: -0.3, tongueRoot: 0.3, tipY: 0, groove: 0, lipOpen: 0.5, velum: 0 }, 0, 0.09, 'ʿayn'),
  // emphatics: the dental sounds with the tongue root pulled back (pharyngealised)
  'sˤ': C('sˤ', 'fricative', false, { ...EMPHATIC_S, lipTuck: 0, velum: 0 }, 0.55, 0.12, 'ṣaqr'),
  'tˤ': C('tˤ', 'stop', false, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, ...PHARYNGEAL, lipTuck: 0, velum: 0 }, 0.5, 0.09, 'ṭāʾir'),
  'dˤ': C('dˤ', 'stop', true, { jaw: 0.12, tipX: 0.25, tipY: 1.75, groove: 0, ...PHARYNGEAL, lipTuck: 0, velum: 0 }, 0.08, 0.07, 'ḍifdaʿ'),
  'ðˤ': C('ðˤ', 'fricative', true, { jaw: 0.2, tipX: 1.05, tipY: 0.1, groove: 0, lipOpen: 0.25, ...PHARYNGEAL, lipTuck: 0, velum: 0 }, 0.12, 0.08, 'ẓarf'),
  // labiodental approximant (Hindi व, Urdu و): the lower lip near the upper teeth, a passage of 0.3 cm²
  'ʋ': C('ʋ', 'approximant', true, { jaw: 0.15, lipOpen: 0.6, lipTuck: 0.7, lipRound: 0, lipProtrude: 0, velum: 0 }, 0, 0.06, 'van, wālid'),
  // pause
  _: C('_', 'silence', false, {}, 0.9, 0.2, 'pause'),
};

/**
 * The aspirated stops and affricates of Hindi and Urdu (and the breathy
 * voiced ones, the murmured bʱ dʱ ɖʱ gʱ dʒʱ): the same closures, released
 * with a puff of air or a breathy sigh of voice.
 */
const ASP = (base: string, ipa: string, examples: string): Phoneme => ({ ...CONSONANTS[base], ipa, aspirated: true, dur: CONSONANTS[base].dur + 0.03, examples });
export const ASPIRATED: Record<string, Phoneme> = {
  'pʰ': ASP('p', 'pʰ', 'phal, phūl'),
  'tʰ': ASP('t', 'tʰ', 'thālī'),
  'ʈʰ': ASP('ʈ', 'ʈʰ', 'ṭhaṇḍā'),
  'kʰ': ASP('k', 'kʰ', 'khargosh'),
  'tʃʰ': ASP('tʃ', 'tʃʰ', 'chhatrī'),
  'bʱ': ASP('b', 'bʱ', 'bhālū'),
  'dʱ': ASP('d', 'dʱ', 'dhanush'),
  'ɖʱ': ASP('ɖ', 'ɖʱ', 'ḍhakkan'),
  'gʱ': ASP('g', 'gʱ', 'ghar'),
  'dʒʱ': ASP('dʒ', 'dʒʱ', 'jhaṇḍā'),
};

/** Consonants that only exist as fast gestures inside speech. */
export const GESTURES: Record<string, Phoneme> = {
  // one ballistic flick of the tongue tip against the ridge: Italian intervocalic r, American "butter"
  'ɾ': C('ɾ', 'tap', true, { tipX: 0.25, groove: 0, velum: 0 }, 0, 0.025, 'caro, butter'),
  // the vocal folds pressed together for a moment: "button", "uh-oh"
  'ʔ': C('ʔ', 'glottalStop', false, {}, 0, 0.05, 'button'),
  // the retroflex flap of Hindi and Urdu (ड़, ڑ): the curled tip flicks forward against the palate
  'ɽ': C('ɽ', 'tap', true, { tipX: -0.6, groove: 0, velum: 0 }, 0, 0.03, 'pahāṛ'),
  'ɽʱ': { ...C('ɽʱ', 'tap', true, { tipX: -0.6, groove: 0, velum: 0 }, 0, 0.03, 'paṛhnā'), aspirated: true },
};

export const PHONEMES: Record<string, Phoneme> = { ...VOWELS, ...GLIDING, ...CONSONANTS, ...ASPIRATED, ...GESTURES };

export const isVowel = (ipa: string): boolean => PHONEMES[ipa]?.manner === 'vowel';
