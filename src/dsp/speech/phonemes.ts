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

// ---------------------------------------------------------------------------
// The rest of the International Phonetic Alphabet (the tutor's IPA chart).
// Every posture was placed with the geometry (tests/ipa.test.ts): where it
// closes or narrows, how wide the passage is, and, for the vowels, where the
// first two formants fall. They are kept apart from the tables above, whose
// vowels were fitted to measured English and Italian formants.

/** the front of the tongue against the hard palate: the closure of ɲ, with the velum shut */
const PALATAL: Partial<Articulators> = { jaw: 0.1, tongueX: 0.9, tongueY: 1.5, tongueRoot: 1.2, tipY: 0.1, groove: 0 };
/** the blade behind the ridge and the body raised to the palate, the lips spread: the hiss of ɕ */
const ALVEOLO_PALATAL: Partial<Articulators> = {
  jaw: 0.05, tongueX: 0.9, tongueY: 1.1, tongueRoot: 1.2, tipX: 0.4, tipY: 0.3, groove: 0.6, lipOpen: 0.5, lipRound: 0, lipProtrude: -0.2, lipTuck: 0, velum: 0,
};
/** the back of the tongue drawn up and back to the uvula, the root kept forward so that the throat below stays open */
const UVULAR: Partial<Articulators> = { jaw: 0.4, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 };
/** the root of the tongue pulled down and back onto the epiglottis, lower in the throat than ħ and ʕ */
const EPIGLOTTAL: Partial<Articulators> = { jaw: 0.55, tongueX: 0, tongueY: 0, tipY: 0, groove: 0, lipOpen: 0.5, velum: 0 };
/** the two lips almost together, leaving a slit between them */
const LIP_SLIT: Partial<Articulators> = { jaw: 0.15, lipTuck: 0, lipRound: 0, lipProtrude: 0, velum: 0 };

export const IPA_EXTRA: Record<string, Phoneme> = {
  // ---- vowels. Each starts from the vowels above it shares its tongue or its
  // lips with (y is the tongue of i with the lips of u) and was then moved a
  // little to its place on the vowel chart (adult male, F1/F2 in Hz)
  // front rounded: the front tongue of i ɪ e ɛ æ behind rounded lips, which lower F2
  y: V('y', { jaw: 0.18, tongueX: 1.086, tongueY: 0.796, tongueRoot: 1.173, lipOpen: 0.031, lipRound: 1, lipProtrude: 0.963 }, 'lune (French), über (German)'), // 268/1839
  'ʏ': V('ʏ', { jaw: 0.279, tongueX: 0.787, tongueY: 0.934, tongueRoot: -0.388, lipOpen: -0.043, lipRound: 0.93, lipProtrude: 0.93 }, 'hübsch (German)'), // 370/1517
  'ø': V('ø', { jaw: 0.52, tongueX: 0.86, tongueY: 1.079, tongueRoot: -0.171, lipOpen: -0.013, lipRound: 0.99, lipProtrude: 0.4 }, 'feu (French), schön (German)'), // 399/1570
  'œ': V('œ', { jaw: 0.564, tongueX: 0.53, tongueY: 1.019, tongueRoot: -0.808, lipOpen: 0.064, lipRound: 0.53, lipProtrude: 0.4 }, 'sœur (French)'), // 529/1463
  'ɶ': V('ɶ', { jaw: 0.916, tongueX: 0.536, tongueY: 0.586, tongueRoot: -0.536, lipOpen: 0.255, lipRound: 0.53, lipProtrude: 0.4 }, 'grøn (Danish)'), // 645/1455
  // central: the tongue between front and back, high (ɨ ʉ), half way (ɘ ɵ ɜ ɞ) or low (ɐ)
  'ɨ': V('ɨ', { jaw: 0.22, tongueX: 0.5, tongueY: 1.146, tongueRoot: 0.699, lipOpen: 0.05, lipRound: 0.04, lipProtrude: -0.295 }, 'ты (Russian)'), // 336/1609
  'ʉ': V('ʉ', { jaw: 0.234, tongueX: 0.78, tongueY: 0.996, tongueRoot: 0.807, lipOpen: 0, lipRound: 1, lipProtrude: 0.963 }, 'hus (Norwegian)'), // 300/1498
  'ɘ': V('ɘ', { jaw: 0.329, tongueX: 0.407, tongueY: 1.034, tongueRoot: 0.261, lipOpen: 0.28, lipRound: 0, lipProtrude: -0.2 }, 'bit (New Zealand)'), // 425/1678
  'ɵ': V('ɵ', { jaw: 0.441, tongueX: 0.512, tongueY: 0.936, tongueRoot: 0.198, lipOpen: 0.065, lipRound: 0.85, lipProtrude: 0.5 }, 'full (Swedish)'), // 430/1335
  'ɜ': V('ɜ', { jaw: 0.506, tongueX: -0.136, tongueY: 0.802, tongueRoot: 0.026, lipOpen: 0.557, lipRound: 0, lipProtrude: -0.2 }, 'bird (British)'), // 573/1519
  'ɞ': V('ɞ', { jaw: 0.564, tongueX: 0.006, tongueY: 0.729, tongueRoot: -0.048, lipOpen: 0.039, lipRound: 0.55, lipProtrude: 0.4 }, 'tomhail (Irish)'), // 561/1301
  'ɐ': V('ɐ', { jaw: 0.771, tongueX: 0.077, tongueY: -0.1, tongueRoot: 0.273, lipOpen: 0.383, lipRound: 0, lipProtrude: -0.05 }, 'Vater (German), casa (Portuguese)'), // 690/1391
  // back unrounded: the tongue of u and of o behind spread lips, which raise F2
  'ɯ': V('ɯ', { jaw: 0.1, tongueX: 0.412, tongueY: 1.122, tongueRoot: 0.289, lipOpen: 0.1, lipRound: 0, lipProtrude: -0.2 }, 'kūki (Japanese)'), // 338/1421
  'ɤ': V('ɤ', { jaw: 0.271, tongueX: -0.532, tongueY: 0.643, tongueRoot: 0.956, lipOpen: 0.281, lipRound: 0, lipProtrude: -0.2 }, 'è (Mandarin)'), // 480/1251
  // open back rounded: the tongue of ɑ behind the lips of ɔ
  'ɒ': V('ɒ', { jaw: 0.887, tongueX: -0.252, tongueY: -0.503, tongueRoot: 0.407, lipOpen: 0.151, lipRound: 0.53, lipProtrude: 0.4 }, 'hot (British)'), // 643/1011

  // ---- stops and nasals
  // palatal: the closure of ɲ, about 2.6 cm behind the contact of /t/ and 2.2 cm in front of that of /k/
  c: C('c', 'stop', false, { ...PALATAL, velum: 0 }, 0.5, 0.09, 'tyúk (Hungarian)', { dorsal: true }),
  'ɟ': C('ɟ', 'stop', true, { ...PALATAL, velum: 0 }, 0.08, 0.07, 'gyerek (Hungarian)', { dorsal: true }),
  // uvular: the closure of q with the voice (ɢ); for the nasal the back of the
  // tongue meets the lowered velum just behind the contact of /k/, still in
  // front of the door to the nose
  'ɢ': C('ɢ', 'stop', true, { ...CONSONANTS.q.art }, 0.08, 0.07, 'qand (Persian)', { dorsal: true }),
  'ɴ': C('ɴ', 'nasal', true, { tongueX: -0.6, tongueY: 1.5, tongueRoot: 0.2, tipY: 0, velum: NASAL_VELUM }, 0, 0.08, 'hon (Japanese)', { dorsal: true }),
  // labiodental nasal: the lower lip on the upper teeth, as close as the lip of /f/ gets (0.1 cm²), the nose open
  'ɱ': C('ɱ', 'nasal', true, { jaw: 0.12, lipOpen: 0.5, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: NASAL_VELUM }, 0, 0.07, 'symphony, inverno (Italian)'),
  // epiglottal stop: the root of the tongue shuts the throat about 3.2 cm above the glottis
  'ʡ': C('ʡ', 'stop', false, { ...EPIGLOTTAL, tongueX: -0.5, tongueY: -0.3, tongueRoot: -0.9 }, 0.5, 0.09, 'Agul, Dahalo'),

  // ---- fricatives
  // bilabial: a slit of 0.13 cm² (ɸ) or 0.21 cm² (β) between the two lips
  'ɸ': C('ɸ', 'fricative', false, { ...LIP_SLIT, lipOpen: -0.17 }, 0.55, 0.12, 'fune (Japanese)'),
  'β': C('β', 'fricative', true, { ...LIP_SLIT, lipOpen: -0.16 }, 0.12, 0.08, 'lobo (Spanish)'),
  // retroflex: the slit of ʂ with the voice
  'ʐ': C('ʐ', 'fricative', true, { ...CONSONANTS['ʂ'].art }, 0.12, 0.1, 'żaba (Polish)'),
  // alveolo-palatal: a grooved slit of 0.09 cm² between the places of ʃ and ç
  'ɕ': C('ɕ', 'fricative', false, { ...ALVEOLO_PALATAL }, 0.55, 0.13, 'xī (Mandarin), shio (Japanese)'),
  'ʑ': C('ʑ', 'fricative', true, { ...ALVEOLO_PALATAL }, 0.12, 0.1, 'zima (Polish)'),
  // palatal: the closure of c lowered to a slit of 0.12 cm² (ç) or 0.19 cm² (ʝ)
  'ç': C('ç', 'fricative', false, { ...PALATAL, tongueY: 1.15, velum: 0 }, 0.55, 0.12, 'ich (German)'),
  'ʝ': C('ʝ', 'fricative', true, { ...PALATAL, tongueY: 1.08, velum: 0 }, 0.12, 0.09, 'ayer (Spanish)'),
  // uvular: a slit of 0.14 cm² (χ) or 0.2 cm² (ʁ) between the back of the
  // tongue and the top of the throat, behind the place of x and above that of ħ
  'χ': C('χ', 'fricative', false, { ...UVULAR, tongueX: -1.06, tongueY: 0.45 }, 0.55, 0.12, 'acht (Dutch)'),
  'ʁ': C('ʁ', 'fricative', true, { ...UVULAR, tongueX: -1.0, tongueY: 0.5 }, 0.12, 0.09, 'rouge (French)'),
  // epiglottal: a slit of 0.14 cm² (ʜ) or a passage of 0.27 cm² (ʢ) about 3.4 cm above the glottis
  'ʜ': C('ʜ', 'fricative', false, { ...EPIGLOTTAL, tongueRoot: -0.94 }, 0.55, 0.12, 'Agul, Chechen'),
  'ʢ': C('ʢ', 'approximant', true, { ...EPIGLOTTAL, tongueRoot: -0.8 }, 0, 0.09, 'taʿāl (Iraqi Arabic)'),
  // the breathy h: the folds vibrate while air leaks between them
  'ɦ': C('ɦ', 'glottal', true, {}, 0.3, 0.08, 'hoed (Dutch), behind'),
  // lateral fricatives: the contact of /l/ with the sides of the tongue only
  // a little lowered, so that the air hisses through 0.15 cm² (ɬ) or 0.21 cm² (ɮ) past them
  'ɬ': C('ɬ', 'fricative', false, { ...CONSONANTS.l.art, tongueSides: 0.4 }, 0.55, 0.12, 'llan (Welsh)'),
  'ɮ': C('ɮ', 'fricative', true, { ...CONSONANTS.l.art, tongueSides: 0.5 }, 0.12, 0.09, 'dlala (Zulu)'),
  // voiceless w: the rounded lips and raised back of /w/ with the folds apart
  'ʍ': C('ʍ', 'fricative', false, { ...CONSONANTS.w.art }, 0.55, 0.1, 'which (Scottish)'),
  // the Swedish sj: the slit of x behind rounded lips
  'ɧ': C('ɧ', 'fricative', false, { jaw: 0.15, tongueX: -0.25, tongueY: 1.05, tongueRoot: 1.2, tipY: 0, groove: 0, lipOpen: 0.2, lipRound: 0.7, lipProtrude: 0.6, lipTuck: 0, velum: 0 }, 0.55, 0.13, 'sju (Swedish)'),

  // ---- approximants and laterals
  // retroflex: the curled tip of ʈ lowered to a passage of 0.3 cm²
  'ɻ': C('ɻ', 'approximant', true, { jaw: 0.2, tipX: -0.6, tipY: 1.9, groove: 0, tongueX: 0.1, tongueY: 0.3, tongueRoot: 0.6, velum: 0 }, 0, 0.08, 'ròu (Mandarin), Tamiḻ'),
  // velar: the place of ɣ opened to 0.36 cm², too wide to hiss
  'ɰ': C('ɰ', 'approximant', true, { tongueX: -0.25, tongueY: 0.8, tongueRoot: 1.2, tipY: 0, groove: 0, velum: 0 }, 0, 0.06, 'uisa (Korean)'),
  // labial-palatal: the tongue of /j/ behind rounded lips
  'ɥ': C('ɥ', 'approximant', true, { jaw: 0.06, tongueX: 1.0, tongueY: 0.925, tongueRoot: 1.2, lipOpen: 0.1, lipRound: 0.9, lipProtrude: 0.7, lipTuck: 0, velum: 0 }, 0, 0.06, 'huit (French)'),
  // retroflex lateral: the curled tip closes where ʈ does, the air flows past the sides
  'ɭ': C('ɭ', 'lateral', true, { jaw: 0.12, tipX: -0.6, tipY: 2.2, groove: 0, tongueX: 0.1, tongueY: 0.3, tongueRoot: 0.6, velum: 0 }, 0, 0.08, 'nāḷ (Tamil)'),
  // The lips of ʙ and the uvula of ʀ flutter in the air stream; the model has
  // no part that does, so it holds the place of each with the voice on (the
  // trill itself is told in words by the tutor)
  'ʙ': C('ʙ', 'approximant', true, { ...LIP_SLIT, lipOpen: -0.165 }, 0, 0.09, 'brrr'),
  'ʀ': C('ʀ', 'approximant', true, { ...UVULAR, tongueX: -1.02, tongueY: 0.48 }, 0, 0.09, 'rot (German)'),
  // labiodental flap: the lower lip brushes the upper teeth for an instant
  'ⱱ': C('ⱱ', 'approximant', true, { jaw: 0.12, lipOpen: 0.522, lipTuck: 1, lipRound: 0, lipProtrude: 0, velum: 0 }, 0, 0.03, 'vwa (Mono)'),
  // lateral flap: the flick of ɾ with the sides of the tongue lowered
  'ɺ': C('ɺ', 'tap', true, { tipX: 0.25, groove: 0, tongueSides: 1, velum: 0 }, 0, 0.03, 'roku (Japanese)'),

  // ---- affricates: a stop let go into the hiss made at the same place
  'tɕ': C('tɕ', 'affricate', false, {}, 0.5, 0.14, 'jī (Mandarin), chichi (Japanese)', { parts: ['t', 'ɕ'] }),
  'dʑ': C('dʑ', 'affricate', true, {}, 0.1, 0.12, 'jikan (Japanese)', { parts: ['d', 'ʑ'] }),
  'ʈʂ': C('ʈʂ', 'affricate', false, {}, 0.5, 0.14, 'zhōng (Mandarin), czas (Polish)', { parts: ['ʈ', 'ʂ'] }),
  'ɖʐ': C('ɖʐ', 'affricate', true, {}, 0.1, 0.12, 'dżem (Polish)', { parts: ['ɖ', 'ʐ'] }),
};
// ç is one character or two (c and a combining cedilla) depending on how a
// text was typed: both spellings name the same sound
IPA_EXTRA['ç'] = IPA_EXTRA['ç'];

export const PHONEMES: Record<string, Phoneme> = { ...VOWELS, ...GLIDING, ...CONSONANTS, ...ASPIRATED, ...GESTURES, ...IPA_EXTRA };

export const isVowel = (ipa: string): boolean => PHONEMES[ipa]?.manner === 'vowel';
