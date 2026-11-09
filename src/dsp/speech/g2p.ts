import { PHONEMES } from './phonemes';
import { englishWord, englishNumber } from './english';
import { devanagariText } from './indic';
import { arabicText } from './arabic';

/** A phone of an utterance after grapheme-to-phoneme conversion. */
export interface Phone {
  ipa: string;
  /** primary lexical stress (on vowels) */
  stress?: boolean;
  /** secondary stress (English compounds and long words) */
  stress2?: boolean;
  /** reduced vowel (English schwa, the short i of "roses") */
  reduced?: boolean;
  /** part of a function word (article, preposition...): no pitch accent */
  func?: boolean;
  /** geminate (Italian double consonant) */
  long?: boolean;
  /** first phone of a word */
  wordStart?: boolean;
  /** word boundary after this phone */
  wordEnd?: boolean;
  /** prosodic break (comma, full stop) after this phone */
  pause?: 'short' | 'long';
  /** question intonation at the end of the phrase */
  question?: boolean;
  /** a question that starts with a question word (falls like a statement) */
  whQuestion?: boolean;
  /** English final /t/ before a consonant: held by a glottal stop, released without a puff */
  glottalized?: boolean;
  /** nasalised vowel (Hindi ँ, Urdu ں): the velum stays open through it */
  nasal?: boolean;
}

/** The languages the text can be in: Italian, American English, Arabic, Urdu, Hindi. */
export type Lang = 'it' | 'en' | 'ar' | 'ur' | 'hi';
export const LANGS: Lang[] = ['en', 'it', 'ar', 'ur', 'hi'];
/** the languages written right to left */
export const RTL_LANGS: Lang[] = ['ar', 'ur'];

const IT_VOWELS = 'aeiouàèéìíòóùú';
const isV = (c: string | undefined) => !!c && IT_VOWELS.includes(c);
const isFrontV = (c: string | undefined) => !!c && 'eiéèìí'.includes(c);
const VOICED_C = 'bdgvlmnrz';

function baseVowel(c: string): { ipa: string; accent: boolean } {
  switch (c) {
    case 'à': return { ipa: 'a', accent: true };
    case 'è': return { ipa: 'ɛ', accent: true };
    case 'é': return { ipa: 'e', accent: true };
    case 'ì': case 'í': return { ipa: 'i', accent: true };
    case 'ò': return { ipa: 'ɔ', accent: true };
    case 'ó': return { ipa: 'o', accent: true };
    case 'ù': case 'ú': return { ipa: 'u', accent: true };
    default: return { ipa: c, accent: false };
  }
}

/**
 * Unstressed Italian function words (articles, clitic pronouns, simple and
 * articulated prepositions, conjunctions): in running speech they lean on the
 * next word and carry no accent.
 */
const IT_FUNCTION_WORDS = new Set((
  'il lo la i gli le un uno una l di a da in con su per tra fra e ed o od ma se che non mi ti si ci vi ne li ' +
  'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle ' +
  'nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi'
).split(' '));

/**
 * Italian orthography to phones. Rules: c/g before e/i, ch/gh, sc(i), gn, gl(i),
 * qu, z, geminates, silent h, intervocalic s voiced (northern norm),
 * default stress on the penultimate syllable unless an accent is written.
 */
export function italianWord(word: string): Phone[] {
  const w = word.toLowerCase();
  const out: Phone[] = [];
  let accentIdx = -1;
  let i = 0;
  const push = (ipa: string, extra: Partial<Phone> = {}) => out.push({ ipa, ...extra });
  while (i < w.length) {
    const c = w[i], n = w[i + 1];
    // geminates: double consonant letter
    if (!isV(c) && c === n && c !== 'h') {
      const ph = italianConsonant(w, i + 1);
      if (ph) { push(ph.ipa, { long: true }); i += 1 + ph.len; continue; }
    }
    if (isV(c)) {
      const v = baseVowel(c);
      // i/u as glides before another vowel (ie, uo, ia...) unless accented
      if ((v.ipa === 'i' || v.ipa === 'u') && !v.accent && isV(n) && out.length > 0) {
        push(v.ipa === 'i' ? 'j' : 'w'); i++; continue;
      }
      if (v.accent) accentIdx = out.length;
      push(v.ipa);
      i++;
      continue;
    }
    if (c === 'h' || c === "'") { i++; continue; }
    const ph = italianConsonant(w, i);
    if (ph) { push(ph.ipa); i += ph.len; continue; }
    i++;
  }
  // stress: written accent, else penultimate vowel
  const vowelIdx = out.map((p, k) => (PHONEMES[p.ipa]?.manner === 'vowel' ? k : -1)).filter((k) => k >= 0);
  let st = accentIdx;
  if (st < 0 && vowelIdx.length) st = vowelIdx.length >= 2 ? vowelIdx[vowelIdx.length - 2] : vowelIdx[0];
  const func = IT_FUNCTION_WORDS.has(w);
  if (st >= 0 && !func) out[st].stress = true;
  // intervocalic s -> z (northern Italian), s before voiced consonant -> z
  for (let k = 0; k < out.length; k++) {
    if (out[k].ipa !== 's' || out[k].long) continue;
    const prev = out[k - 1], next = out[k + 1];
    const pv = prev && PHONEMES[prev.ipa]?.manner === 'vowel';
    const nv = next && PHONEMES[next.ipa]?.manner === 'vowel';
    if ((pv && nv) || (next && VOICED_C.includes(next.ipa))) out[k].ipa = 'z';
  }
  // the palatals ɲ ʎ ʃ and the affricates ts dz are always long between vowels
  for (let k = 1; k < out.length - 1; k++) {
    const ipa = out[k].ipa;
    if (['ɲ', 'ʎ', 'ʃ', 'ts', 'dz'].includes(ipa) && PHONEMES[out[k - 1].ipa]?.manner === 'vowel' && PHONEMES[out[k + 1].ipa]?.manner === 'vowel') out[k].long = true;
  }
  if (func) for (const p of out) p.func = true;
  if (out.length) { out[0].wordStart = true; out[out.length - 1].wordEnd = true; }
  return out;
}

function italianConsonant(w: string, i: number): { ipa: string; len: number } | null {
  const c = w[i], n = w[i + 1], n2 = w[i + 2];
  switch (c) {
    case 'c':
      if (n === 'h') return { ipa: 'k', len: 2 };
      if (n === 'i' && isV(n2)) return { ipa: 'tʃ', len: 2 };
      if (isFrontV(n)) return { ipa: 'tʃ', len: 1 };
      if (n === 'q') return { ipa: 'k', len: 2 };
      return { ipa: 'k', len: 1 };
    case 'g':
      if (n === 'h') return { ipa: 'g', len: 2 };
      if (n === 'n') return { ipa: 'ɲ', len: 2 };
      if (n === 'l' && n2 === 'i') return isV(w[i + 3]) ? { ipa: 'ʎ', len: 3 } : { ipa: 'ʎ', len: 2 };
      if (n === 'i' && isV(n2)) return { ipa: 'dʒ', len: 2 };
      if (isFrontV(n)) return { ipa: 'dʒ', len: 1 };
      return { ipa: 'g', len: 1 };
    case 's':
      if (n === 'c' && n2 === 'i' && isV(w[i + 3])) return { ipa: 'ʃ', len: 3 };
      if (n === 'c' && isFrontV(n2)) return { ipa: 'ʃ', len: 2 };
      return { ipa: 's', len: 1 };
    case 'q': return { ipa: 'k', len: 1 };
    case 'z': return { ipa: 'ts', len: 1 };
    case 'x': return { ipa: 'ks', len: 1 };
    case 'j': return { ipa: 'j', len: 1 };
    case 'y': return { ipa: 'j', len: 1 };
    case 'w': return { ipa: 'w', len: 1 };
    case 'k': return { ipa: 'k', len: 1 };
    default:
      if ('bdfglmnprtv'.includes(c)) return { ipa: c, len: 1 };
      return null;
  }
}

const IT_UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici',
  'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

/** An integer in Italian words, written as one word as Italian does (ventitré, centottanta). */
export function italianNumber(n: number): string {
  if (n < 0) return 'meno ' + italianNumber(-n);
  if (n < 20) return IT_UNITS[n];
  if (n < 100) {
    const t = IT_TENS[Math.floor(n / 10)], u = n % 10;
    if (!u) return t;
    // the tens drop their vowel before uno and otto; tre takes an accent
    const tt = u === 1 || u === 8 ? t.slice(0, -1) : t;
    return tt + (u === 3 ? 'tré' : IT_UNITS[u]);
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    const hs = (h === 1 ? '' : IT_UNITS[h]) + 'cento';
    if (!r) return hs;
    return (Math.floor(r / 10) === 8 ? hs.slice(0, -1) : hs) + italianNumber(r);
  }
  if (n < 1e6) {
    const k = Math.floor(n / 1000), r = n % 1000;
    return (k === 1 ? 'mille' : italianNumber(k) + 'mila') + (r ? ' ' + italianNumber(r) : '');
  }
  const m = Math.floor(n / 1e6), r = n % 1e6;
  return (m === 1 ? 'un milione' : italianNumber(m) + ' milioni') + (r ? ' ' + italianNumber(r) : '');
}

const IPA_SYMBOLS = Object.keys(PHONEMES).sort((a, b) => b.length - a.length);
const IPA_ALIASES: Record<string, string> = {
  'ɐ': 'ə', 'ɡ': 'g', 'ʁ': 'r', 'ç': 'ʃ', 'χ': 'x', 'ʁ̞': 'ɣ', 'ɒ': 'ɔ', 'y': 'i', 'ø': 'e', 'œ': 'ɛ', 'ɨ': 'ɪ', 'ᵻ': 'ɪ', 'ᵊ': 'ə', 'ʤ': 'dʒ', 'ʧ': 'tʃ', 'ɭ': 'l', 'ɦ': 'h',
};

/** Parses an IPA string into phones (stress marks ˈ ˌ, length marks ː). */
export function parseIpa(s: string): Phone[] {
  const out: Phone[] = [];
  let stressNext: 0 | 1 | 2 = 0;
  let wordStart = true;
  let i = 0;
  const add = (p: Phone) => {
    if (wordStart) { p.wordStart = true; wordStart = false; }
    out.push(p);
  };
  while (i < s.length) {
    const c = s[i];
    if (c === 'ˈ') { stressNext = 1; i++; continue; }
    if (c === 'ˌ') { stressNext = 2; i++; continue; }
    if (c === '.' || c === '/' || c === '[' || c === ']') { i++; continue; }
    if (c === 'ː' || c === ':') { if (out.length) out[out.length - 1].long = true; i++; continue; }
    // a tilde over a vowel (combining U+0303, or ~ after it) nasalises it
    if (c === '\u0303' || c === '~') { if (out.length) out[out.length - 1].nasal = true; i++; continue; }
    if (c === ' ') { if (out.length) out[out.length - 1].wordEnd = true; wordStart = true; i++; continue; }
    if (c === ',' || c === '|') { if (out.length) out[out.length - 1].pause = 'short'; i++; continue; }
    if (c === '‖' || c === '!' || c === ';') { if (out.length) out[out.length - 1].pause = 'long'; i++; continue; }
    if (c === '?') { if (out.length) { out[out.length - 1].pause = 'long'; out[out.length - 1].question = true; } i++; continue; }
    let matched = '';
    for (const sym of IPA_SYMBOLS) if (s.startsWith(sym, i)) { matched = sym; break; }
    const ipa = matched || IPA_ALIASES[c];
    if (!ipa) { i++; continue; }
    const p: Phone = { ipa };
    // stress applies to the next vowel
    if (stressNext && PHONEMES[ipa]?.manner === 'vowel') {
      if (stressNext === 1) p.stress = true; else p.stress2 = true;
      stressNext = 0;
    }
    add(p);
    i += matched ? matched.length : 1;
  }
  if (out.length) out[out.length - 1].wordEnd = true;
  return out;
}

const WH_WORDS: Partial<Record<Lang, Set<string>>> = {
  en: new Set(['what', 'where', 'when', 'who', 'whom', 'whose', 'why', 'which', 'how']),
  it: new Set(['che', 'chi', 'cosa', 'come', 'dove', 'quando', 'perché', 'perche', 'quale', 'quali', 'quanto', 'quanta', 'quanti', 'quante']),
};

/** Text (words in one of the languages, or /IPA/) to phones. */
export function textToPhones(text: string, lang: Lang): Phone[] {
  const t = text.trim();
  if ((t.startsWith('/') && t.endsWith('/')) || (t.startsWith('[') && t.endsWith(']'))) return parseIpa(t.slice(1, -1));
  if (lang === 'hi') return devanagariText(t);
  if (lang === 'ar' || lang === 'ur') return arabicText(t, lang);
  const out: Phone[] = [];
  // numbers become words first
  const spelled = t.replace(/\d+/g, (d) => ' ' + (lang === 'en' ? englishNumber(Number(d)) : italianNumber(Number(d))) + ' ');
  const tokens = spelled.split(/(\s+|[,.;:!?—–-])/).filter((x) => x && !/^\s+$/.test(x));
  let phraseStartIdx = 0;
  let firstWord = '';
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];
    if (/^[,;:—–]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'short'; continue; }
    if (/^[.!]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'long'; phraseStartIdx = out.length; firstWord = ''; continue; }
    if (tok === '?') {
      if (out.length) {
        const last = out[out.length - 1];
        last.pause = 'long';
        last.question = true;
        if (WH_WORDS[lang]?.has(firstWord)) last.whQuestion = true;
      }
      phraseStartIdx = out.length; firstWord = '';
      continue;
    }
    if (tok === '-') continue;
    const word = tok.toLowerCase().replace(/’/g, "'").replace(/[^a-zàèéìíòóùú']/g, '');
    if (!word) continue;
    if (!firstWord && out.length === phraseStartIdx) firstWord = word;
    let phones: Phone[];
    if (lang === 'en') {
      phones = englishWord(word);
      // "the" before a vowel is ði
      const prev = out.length ? out.slice(-2) : [];
      if (prev.length === 2 && prev[0].ipa === 'ð' && prev[1].ipa === 'ə' && prev[0].wordStart && prev[1].wordEnd && PHONEMES[phones[0]?.ipa]?.manner === 'vowel') {
        prev[1].ipa = 'i';
      }
    } else phones = italianWord(word);
    out.push(...phones);
  }
  if (lang === 'en') americanLinking(out);
  return out;
}

/**
 * What American speakers do to a word-final /t d/ inside a phrase (the
 * lexicon gives the words one by one): between vowels it becomes a flap
 * ("it is", "get up", "would it"); a /t/ after a vowel and before a
 * consonant is held by a glottal stop and not released ("it rains", "that
 * man"); after another consonant and before one it is usually dropped ("just
 * two", "next day").
 */
function americanLinking(out: Phone[]): void {
  const vowelLike = (p: Phone | undefined) => !!p && (PHONEMES[p.ipa]?.manner === 'vowel' || p.ipa === 'ɹ');
  for (let i = out.length - 2; i >= 1; i--) {
    const p = out[i], prev = out[i - 1], next = out[i + 1];
    if (!p.wordEnd || p.pause || (p.ipa !== 't' && p.ipa !== 'd') || prev.wordEnd) continue;
    const nextVowel = PHONEMES[next.ipa]?.manner === 'vowel';
    if (vowelLike(prev) && nextVowel) p.ipa = 'ɾ';
    else if (p.ipa === 't' && vowelLike(prev) && !nextVowel) p.glottalized = true;
    else if (!vowelLike(prev) && !nextVowel && PHONEMES[prev.ipa]?.manner !== 'nasal') {
      prev.wordEnd = true;
      out.splice(i, 1);
    }
  }
}
