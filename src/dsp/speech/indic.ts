import { PHONEMES } from './phonemes';
import type { Phone } from './g2p';

/**
 * Devanagari (Hindi) to phones. The script is an abugida: every consonant
 * carries the vowel ə unless a vowel sign (matra) replaces it or a virama
 * removes it. Rules: the inherent schwa is dropped at the end of a word and,
 * right to left, between a vowel and a consonant that keeps its own vowel
 * (कमल kəməl, समझना səmdʒʱnaː); the anusvara is the nasal of the following
 * stop (ठंडा ʈʰəɳɖaː) and nasalises the vowel elsewhere (हंस hə̃s); the
 * chandrabindu nasalises; a nukta turns क ख ग ज ड ढ फ into q x ɣ z ɽ ɽʱ f;
 * a consonant doubled through a virama is one long consonant (उल्लू ʊlːuː).
 */

const INDEPENDENT: Record<string, string> = {
  'अ': 'ə', 'आ': 'aː', 'इ': 'ɪ', 'ई': 'iː', 'उ': 'ʊ', 'ऊ': 'uː', 'ऋ': 'rɪ', 'ए': 'eː', 'ऐ': 'ɛː', 'ओ': 'oː', 'औ': 'ɔː', 'ऑ': 'ɔ', 'ऍ': 'ɛ',
};
const MATRA: Record<string, string> = {
  'ा': 'aː', 'ि': 'ɪ', 'ी': 'iː', 'ु': 'ʊ', 'ू': 'uː', 'ृ': 'rɪ', 'े': 'eː', 'ै': 'ɛː', 'ो': 'oː', 'ौ': 'ɔː', 'ॉ': 'ɔ', 'ॅ': 'ɛ',
};
export const DEVANAGARI_CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kʰ', 'ग': 'g', 'घ': 'gʱ', 'ङ': 'ŋ',
  'च': 'tʃ', 'छ': 'tʃʰ', 'ज': 'dʒ', 'झ': 'dʒʱ', 'ञ': 'ɲ',
  'ट': 'ʈ', 'ठ': 'ʈʰ', 'ड': 'ɖ', 'ढ': 'ɖʱ', 'ण': 'ɳ',
  'त': 't', 'थ': 'tʰ', 'द': 'd', 'ध': 'dʱ', 'न': 'n',
  'प': 'p', 'फ': 'pʰ', 'ब': 'b', 'भ': 'bʱ', 'म': 'm',
  'य': 'j', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'ʋ', 'श': 'ʃ', 'ष': 'ʂ', 'स': 's', 'ह': 'h',
};
/** the sounds the nukta (a dot below) gives the letters of Persian and Arabic loans */
const NUKTA: Record<string, string> = { 'क': 'q', 'ख': 'x', 'ग': 'ɣ', 'ज': 'z', 'ड': 'ɽ', 'ढ': 'ɽʱ', 'फ': 'f', 'य': 'j', 'न': 'n', 'र': 'r', 'ळ': 'l' };
const VIRAMA = '्', NUKTA_SIGN = '़', ANUSVARA = 'ं', CHANDRABINDU = 'ँ', VISARGA = 'ः';

/** the nasal that an anusvara becomes before a stop of the same place */
function homorganic(c: string | null): string | null {
  if (!c) return null;
  const first = c[0];
  if ('kg'.includes(first)) return 'ŋ';
  if (c.startsWith('tʃ') || c.startsWith('dʒ')) return 'ɲ';
  if ('ʈɖ'.includes(first)) return 'ɳ';
  if ('td'.includes(first)) return 'n';
  if ('pb'.includes(first)) return 'm';
  return null;
}

/** Function words of Hindi: no pitch accent of their own. */
const HI_FUNCTION_WORDS = new Set('है हैं का की के को में पर से और ने भी तो ही या कि यह वह था थी थे हूँ हो'.split(' '));

interface Unit { c: string | null; v: string | null; inherent: boolean; anusvara: boolean; nasal: boolean; long: boolean }

const SYMBOLS = Object.keys(PHONEMES).sort((a, b) => b.length - a.length);

/**
 * The phones of a word written in the compact form of the tables: the
 * symbols of the model, ː for length, a tilde (U+0303) for a nasal vowel,
 * ˈ before the stressed vowel ('aː', 'rɪ', 'mɛ̃ː', 'tʃʰətriː').
 */
export function compactPhones(src: string, extra: Partial<Phone> = {}): Phone[] {
  const s = src.normalize('NFD'); // a precomposed ã becomes a + the tilde
  const out: Phone[] = [];
  let stress = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === 'ː') { if (out.length) out[out.length - 1].long = true; i++; continue; }
    if (ch === '\u0303' || ch === '~') { if (out.length) out[out.length - 1].nasal = true; i++; continue; }
    if (ch === 'ˈ') { stress = true; i++; continue; }
    const sym = SYMBOLS.find((k) => s.startsWith(k, i));
    if (!sym) { i++; continue; }
    const p: Phone = { ipa: sym };
    if (PHONEMES[sym].manner === 'vowel') { Object.assign(p, extra); if (stress) { p.stress = true; stress = false; } }
    out.push(p);
    i += sym.length;
  }
  return out;
}

/** The phones of a vowel written in the compact form ('aː', 'rɪ', 'ə'). */
export const vowelPhones = compactPhones;

/** One Hindi word in Devanagari to phones. */
export function devanagariWord(word: string): Phone[] {
  const w = word.normalize('NFD');
  const units: Unit[] = [];
  let lastBase = '';
  const last = () => units[units.length - 1];
  for (const ch of w) {
    if (DEVANAGARI_CONSONANTS[ch]) { units.push({ c: DEVANAGARI_CONSONANTS[ch], v: 'ə', inherent: true, anusvara: false, nasal: false, long: false }); lastBase = ch; continue; }
    if (INDEPENDENT[ch]) { units.push({ c: null, v: INDEPENDENT[ch], inherent: false, anusvara: false, nasal: false, long: false }); continue; }
    const u = last();
    if (!u) continue;
    if (ch === NUKTA_SIGN) { if (u.c && NUKTA[lastBase]) u.c = NUKTA[lastBase]; continue; }
    if (MATRA[ch]) { u.v = MATRA[ch]; u.inherent = false; continue; }
    if (ch === VIRAMA) { u.v = null; u.inherent = false; continue; }
    if (ch === ANUSVARA) { u.anusvara = true; continue; }
    if (ch === CHANDRABINDU) { u.nasal = true; continue; }
    if (ch === VISARGA) { units.push({ c: 'h', v: null, inherent: false, anusvara: false, nasal: false, long: false }); continue; }
  }
  if (!units.length) return [];
  // schwa deletion: at the end of a word of more than one syllable, and between a vowel and a consonant that keeps its vowel
  const vowels = units.filter((u) => u.v !== null).length;
  const final = units[units.length - 1];
  if (final.inherent && vowels > 1) final.v = null;
  for (let i = units.length - 2; i >= 1; i--) {
    const u = units[i];
    if (!u.inherent || u.v === null) continue;
    const prev = units[i - 1], next = units[i + 1];
    if (prev.v !== null && next.c && next.v !== null) u.v = null;
  }
  // a consonant doubled through a virama is one long consonant
  for (let i = units.length - 2; i >= 0; i--) {
    if (units[i].v === null && units[i].c && units[i].c === units[i + 1].c) { units[i + 1].long = true; units[i + 1].anusvara ||= units[i].anusvara; units.splice(i, 1); }
  }
  const out: Phone[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.c) out.push({ ipa: u.c, ...(u.long ? { long: true } : {}) });
    if (u.v !== null) {
      const next = units[i + 1];
      const nas = u.anusvara ? homorganic(next?.c ?? null) : null;
      out.push(...vowelPhones(u.v, u.nasal || (u.anusvara && !nas) ? { nasal: true } : {}));
      if (nas) out.push({ ipa: nas });
    }
  }
  // stress: the first long vowel, else the first vowel (Hindi stress is light)
  const vi = out.map((p, k) => (PHONEMES[p.ipa]?.manner === 'vowel' ? k : -1)).filter((k) => k >= 0);
  const func = HI_FUNCTION_WORDS.has(word);
  if (vi.length && !func) out[vi.find((k) => out[k].long) ?? vi[0]].stress = true;
  if (func) for (const p of out) p.func = true;
  if (out.length) { out[0].wordStart = true; out[out.length - 1].wordEnd = true; }
  return out;
}

const HI_WH = new Set(['कौन', 'कहाँ', 'कब', 'क्यों', 'कैसे', 'कैसा', 'कैसी', 'किसका', 'कितना', 'कितने', 'किधर']);
/** a question word anywhere in the phrase (Hindi asks "āp kaise haĩ?"); the yes/no marker क्या at the start is not one */
const isWh = (words: string[]) => words.some((w, i) => HI_WH.has(w) || (i > 0 && w === 'क्या'));

/** Hindi text to phones: words, pauses (, । . ! ?) and questions. */
export function devanagariText(text: string): Phone[] {
  const out: Phone[] = [];
  const tokens = text.split(/(\s+|[,.;:!?।॥—–-])/).filter((x) => x && !/^\s+$/.test(x));
  let words: string[] = [];
  for (const tok of tokens) {
    if (/^[,;:—–]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'short'; continue; }
    if (/^[.!।॥]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'long'; words = []; continue; }
    if (tok === '?') {
      if (out.length) { const l = out[out.length - 1]; l.pause = 'long'; l.question = true; if (isWh(words)) l.whQuestion = true; }
      words = [];
      continue;
    }
    if (tok === '-') continue;
    const word = tok.replace(/[^ऀ-ॿ]/g, '');
    if (!word) continue;
    words.push(word);
    out.push(...devanagariWord(word));
  }
  return out;
}
