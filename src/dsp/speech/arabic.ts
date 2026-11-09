import { PHONEMES } from './phonemes';
import type { Phone } from './g2p';
import { vowelPhones, compactPhones } from './indic';

/**
 * Arabic and Urdu script to phones. The script writes the consonants and
 * the long vowels; the short vowels are marks (fatḥa, kasra, ḍamma; zabar,
 * zer, pesh) that everyday text leaves out. With the marks the reading is
 * exact; without them a short vowel is supplied between two consonants (a
 * in Arabic, ə in Urdu), ا و ي are read as long vowels after a consonant
 * and as glottal stop, w and y at the start of a word, and the Urdu letters
 * ے ں ھ give eː, a nasal vowel and the aspiration of the letter before.
 * The Arabic article ال assimilates to the sun letters (الشمس aʃːams).
 */

type Lang = 'ar' | 'ur';

const ARABIC: Record<string, string> = {
  'ب': 'b', 'ت': 't', 'ث': 'θ', 'ج': 'dʒ', 'ح': 'ħ', 'خ': 'x', 'د': 'd', 'ذ': 'ð', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'ʃ',
  'ص': 'sˤ', 'ض': 'dˤ', 'ط': 'tˤ', 'ظ': 'ðˤ', 'ع': 'ʕ', 'غ': 'ɣ', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h',
  // Persian, Urdu
  'پ': 'p', 'ٹ': 'ʈ', 'چ': 'tʃ', 'ڈ': 'ɖ', 'ڑ': 'ɽ', 'ژ': 'ʒ', 'ک': 'k', 'گ': 'g', 'ہ': 'h', 'ھ': 'h', 'ڤ': 'v', 'ڇ': 'tʃ',
  // hamza carriers
  'ء': 'ʔ', 'أ': 'ʔ', 'إ': 'ʔ', 'ؤ': 'ʔ', 'ئ': 'ʔ', 'ۀ': 'h', 'ۂ': 'h',
};
/** Urdu reads the Arabic letters it borrowed with its own sounds. */
const URDU: Record<string, string> = { 'ث': 's', 'ح': 'h', 'ذ': 'z', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'ʔ', 'ك': 'k' };
const SUN = new Set(['t', 'θ', 'd', 'ð', 'r', 'z', 's', 'ʃ', 'sˤ', 'dˤ', 'tˤ', 'ðˤ', 'l', 'n']);
const ASPIRATE: Record<string, string> = { b: 'bʱ', p: 'pʰ', t: 'tʰ', 'ʈ': 'ʈʰ', 'dʒ': 'dʒʱ', 'tʃ': 'tʃʰ', d: 'dʱ', 'ɖ': 'ɖʱ', k: 'kʰ', g: 'gʱ', 'ɽ': 'ɽʱ' };

const ALIF = 'ا', ALIF_MADDA = 'آ', ALIF_MAQSURA = 'ى', WAW = 'و', TA_MARBUTA = 'ة', NUN_GHUNNA = 'ں', BARI_YE = 'ے', DO_CHASHMI = 'ھ', URDU_HE = 'ہ';
const YA = new Set(['ي', 'ی', 'ئ', 'ۓ']);
const SHORT: Record<Lang, Record<string, string>> = { ar: { a: 'a', i: 'i', u: 'u' }, ur: { a: 'ə', i: 'ɪ', u: 'ʊ' } };
// marks: fatḥa, kasra, ḍamma, sukūn, shadda, tanwīn, superscript alif
const MARK: Record<string, string> = { 'َ': 'a', 'ِ': 'i', 'ُ': 'u', 'ْ': '0', 'ّ': 'ː', 'ً': 'an', 'ٍ': 'in', 'ٌ': 'un', 'ٰ': 'A', 'ٖ': 'i', 'ٗ': 'u', '٘': 'n' };

interface Tok { ch: string; vowel: string | null; sukun: boolean; shadda: boolean; tanwin: string | null }

function tokenize(word: string): Tok[] {
  const toks: Tok[] = [];
  for (const ch of word.normalize('NFC')) {
    const m = MARK[ch];
    if (m !== undefined) {
      const t = toks[toks.length - 1];
      if (!t) continue;
      if (m === '0') t.sukun = true;
      else if (m === 'ː') t.shadda = true;
      else if (m === 'A') t.vowel = 'aː';
      else if (m.length === 2) { t.vowel = m[0]; t.tanwin = 'n'; }
      else if (m === 'n') t.tanwin = 'n';
      else t.vowel = m;
      continue;
    }
    if (ch === 'ـ' || /[ؐ-ؚۖ-ۭ]/.test(ch)) continue; // tatweel, Quranic marks
    toks.push({ ch, vowel: null, sukun: false, shadda: false, tanwin: null });
  }
  return toks;
}

/** the commonest words of Urdu, whose vowels the script leaves unwritten (and reads wrong by rule) */
const URDU_WORDS: Record<string, string> = {
  'میں': 'mɛ̃ː', 'ہیں': 'hɛ̃ː', 'ہے': 'hɛː', 'نہیں': 'nəhĩː', 'اور': 'ɔːr', 'کیا': 'kjaː', 'ایک': 'eːk', 'یہ': 'jeː', 'وہ': 'ʋoː', 'کے': 'keː', 'سے': 'seː',
  'نے': 'neː', 'کو': 'koː', 'کا': 'kaː', 'کی': 'kiː', 'تھا': 'tʰaː', 'تھے': 'tʰeː', 'تھی': 'tʰiː', 'آپ': 'aːp', 'ہم': 'həm', 'تم': 'tʊm', 'کیسے': 'kɛːseː', 'کیسا': 'kɛːsaː',
  'ہوں': 'hũː', 'ہو': 'hoː', 'پر': 'pər', 'بھی': 'bʱiː', 'تو': 'toː', 'کہ': 'keː', 'کون': 'kɔːn', 'کہاں': 'kəhãː', 'کب': 'kəb', 'کیوں': 'kjõː', 'اچھا': 'ətʃʰːaː', 'بہت': 'bəhʊt',
  'شکریہ': 'ʃʊkrijaː', 'سلام': 'səlaːm', 'پانی': 'paːniː', 'اردو': 'ʊrduː', 'دوست': 'doːst', 'گھر': 'gʱər', 'نام': 'naːm', 'میرا': 'meːraː', 'تمہارا': 'tʊmhaːraː', 'ٹھیک': 'ʈʰiːk',
};

/** the sounds a word of Urdu may end in without a vowel before the last one (چاند, دوست, رنگ) */
const CLUSTER_FIRST = new Set(['m', 'n', 'ŋ', 'ɳ', 'l', 'r', 'ɽ', 's', 'ʃ', 'z', 'ʋ', 'j', 'w']);
const isObstruent = (c: string) => { const m = PHONEMES[c]?.manner; return m === 'stop' || m === 'fricative' || m === 'affricate'; };

const FUNCTION_WORDS: Record<Lang, Set<string>> = {
  ar: new Set('في من على إلى عن أن إن و أو ثم لا ما هل قد لم لن كان هو هي'.split(' ')),
  ur: new Set('کا کی کے کو نے سے میں پر اور ہے ہیں تھا تھی تھے بھی تو یہ وہ نہ نہیں ایک کہ'.split(' ')),
};

/** One word in Arabic or Urdu script to phones. */
export function arabicWord(word: string, lang: Lang): Phone[] {
  const toks = tokenize(word);
  const out: Phone[] = [];
  if (lang === 'ur') {
    const bare = word.normalize('NFC').replace(/[\u064b-\u0652\u0670]/g, '');
    const known = URDU_WORDS[bare];
    if (known) {
      const ps = compactPhones(known);
      const func = FUNCTION_WORDS.ur.has(bare);
      const vi = ps.map((p, k) => (PHONEMES[p.ipa]?.manner === 'vowel' ? k : -1)).filter((k) => k >= 0);
      if (vi.length && !func) ps[vi.find((k) => ps[k].long) ?? vi[0]].stress = true;
      if (func) for (const p of ps) p.func = true;
      if (ps.length) { ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true; }
      return ps;
    }
  }
  const S = SHORT[lang];
  const isVowelLetter = (t: Tok | undefined) => !!t && !t.vowel && (t.ch === ALIF || t.ch === ALIF_MADDA || t.ch === ALIF_MAQSURA || t.ch === WAW || (YA.has(t.ch) && t.ch !== 'ئ') || t.ch === BARI_YE);
  const cons = (ch: string): string | null => (lang === 'ur' && URDU[ch]) || ARABIC[ch] || null;
  const lastVowel = () => { for (let k = out.length - 1; k >= 0; k--) if (PHONEMES[out[k].ipa]?.manner === 'vowel') return out[k]; return null; };
  const endsInVowel = () => out.length > 0 && PHONEMES[out[out.length - 1].ipa]?.manner === 'vowel';
  const pushV = (v: string) => out.push(...vowelPhones(v));
  let assimilate = false; // the article's l merged into a sun letter: the next consonant is long
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], next = toks[i + 1], prev = toks[i - 1];
    const first = i === 0, lastTok = i === toks.length - 1;
    // ---- the definite article of Arabic
    if (lang === 'ar' && first && t.ch === ALIF && next?.ch === 'ل' && toks.length > 2 && !next.vowel) {
      pushV('a');
      const after = cons(toks[2].ch);
      if (after && SUN.has(after)) assimilate = true; else out.push({ ipa: 'l' });
      i++;
      continue;
    }
    // ---- vowel letters
    if (t.ch === ALIF_MADDA) { if (first && lang === 'ar') out.push({ ipa: 'ʔ' }); pushV('aː'); continue; }
    // the seat of an initial vowel: alif, and in Urdu also ʿayn
    if (t.ch === ALIF || t.ch === ALIF_MAQSURA || (lang === 'ur' && t.ch === 'ع' && first)) {
      if (first) {
        if (t.vowel) pushV(S[t.vowel] ?? t.vowel);
        else if (next && YA.has(next.ch) && !next.vowel && !isVowelLetter(toks[i + 2])) { pushV(lang === 'ar' ? 'iː' : 'eː'); i++; }
        else if (next?.ch === BARI_YE) { pushV('eː'); i++; }
        else if (next?.ch === WAW && !next.vowel && !isVowelLetter(toks[i + 2])) { pushV(lang === 'ar' ? 'uː' : 'oː'); i++; }
        else if (next?.ch === ALIF && t.ch === 'ع') { pushV('aː'); i++; }
        else pushV(S.a);
      } else {
        // a consonant's short a before alif is the long aː
        const lv = lastVowel();
        if (lv && endsInVowel() && lv.ipa === S.a && !lv.long) lv.long = true;
        else pushV('aː');
      }
      if (t.tanwin) out.push({ ipa: 'n' });
      continue;
    }
    if (t.ch === BARI_YE) { pushV('eː'); continue; }
    // hamza on a ya in Urdu: the seam between two vowels (کوئی koːiː, گائے gaːeː)
    if (t.ch === 'ئ' && lang === 'ur' && !first && !t.vowel) { if (!isVowelLetter(next) && !lastTok) out.push({ ipa: 'ʔ' }); else if (lastTok) pushV('iː'); continue; }
    if (YA.has(t.ch) && !(t.ch === 'ئ' && (first || t.vowel))) {
      // a consonant y: at the start of a word, with a vowel mark of its own, or before a vowel letter
      if (first || t.vowel || (isVowelLetter(next) && !endsInVowel()) || (isVowelLetter(next) && prev?.vowel)) {
        out.push({ ipa: 'j' });
        if (t.vowel) pushV(S[t.vowel] ?? t.vowel);
        else if (!lastTok && !isVowelLetter(next) && cons(next?.ch ?? '')) pushV(S.a);
        continue;
      }
      const lv = lastVowel();
      if (endsInVowel() && lv && prev?.vowel === 'a') { if (lang === 'ar') out.push({ ipa: 'j' }); else { lv.ipa = 'ɛ'; lv.long = true; } }
      else if (endsInVowel() && prev?.vowel) out.push({ ipa: 'j' });
      else if (endsInVowel() && lang === 'ar') out.push({ ipa: 'j' });
      else pushV('iː');
      continue;
    }
    if (t.ch === WAW && !t.vowel && !(isVowelLetter(next) && !first)) {
      if (first) { out.push({ ipa: lang === 'ar' ? 'w' : 'ʋ' }); if (!isVowelLetter(next) && cons(next?.ch ?? '')) pushV(S.a); continue; }
      const lv = lastVowel();
      if (endsInVowel() && lv && prev?.vowel === 'a') { if (lang === 'ar') out.push({ ipa: 'w' }); else { lv.ipa = 'ɔ'; lv.long = true; } }
      else if (endsInVowel() && prev?.vowel) out.push({ ipa: 'w' });
      else pushV(lang === 'ar' ? 'uː' : 'oː');
      continue;
    }
    // ---- the Urdu signs
    if (t.ch === NUN_GHUNNA) { const lv = lastVowel(); if (lv) lv.nasal = true; continue; }
    if (t.ch === DO_CHASHMI && out.length && !first) {
      const p = out[out.length - 1];
      const asp = ASPIRATE[p.ipa];
      if (asp) { p.ipa = asp; if (t.vowel) pushV(S[t.vowel] ?? t.vowel); else if (!lastTok && !isVowelLetter(next)) pushV(S.a); continue; }
    }
    if (t.ch === URDU_HE && lastTok && !first && !endsInVowel() && !prev?.vowel) { pushV('aː'); continue; }
    if (t.ch === TA_MARBUTA) { if (lastTok) { if (!endsInVowel()) pushV(S.a); if (t.tanwin) out.push({ ipa: 't' }, { ipa: 'a' }, { ipa: 'n' }); } else { out.push({ ipa: 't' }); if (t.vowel) pushV(S[t.vowel] ?? t.vowel); } continue; }
    // ---- consonants
    let c = t.ch === WAW ? (lang === 'ar' ? 'w' : 'ʋ') : cons(t.ch);
    if (!c) continue;
    if (lang === 'ur' && c === 'ʔ' && t.ch === 'ع') {
      // ʿayn in Urdu is a vowel's seat: at the start it is its vowel, elsewhere it lengthens
      if (first) { pushV(t.vowel ? S[t.vowel] ?? t.vowel : S.a); continue; }
      const lv = lastVowel();
      if (endsInVowel() && lv && !lv.long) { lv.long = true; continue; }
      if (t.vowel) { pushV(S[t.vowel] ?? t.vowel); continue; }
      pushV(S.a);
      continue;
    }
    const long = t.shadda || assimilate;
    assimilate = false;
    const vowelSoFar = out.some((p) => PHONEMES[p.ipa]?.manner === 'vowel');
    out.push({ ipa: c, ...(long ? { long: true } : {}) });
    if (t.vowel) pushV(S[t.vowel] ?? t.vowel);
    else if (!t.sukun && !lastTok && !isVowelLetter(next) && !(next.ch === NUN_GHUNNA || next.ch === DO_CHASHMI) && !(next.ch === URDU_HE && i + 1 === toks.length - 1)) {
      // an unwritten short vowel between two consonants: always after the first
      // consonant of a word; before the last one unless the two make a final
      // cluster (nasal, liquid or sibilant plus an obstruent: چاند, دوست); in
      // the middle of a word in Arabic (مدرسة), not in Urdu, where the two
      // consonants meet at a syllable seam (بکری, مچھلی)
      const c2 = next.ch === WAW ? 'w' : cons(next.ch);
      const finalPair = i + 1 === toks.length - 1;
      if (!vowelSoFar) pushV(S.a);
      else if (finalPair) { if (!(CLUSTER_FIRST.has(c) && c2 && isObstruent(c2))) pushV(S.a); }
      else if (lang === 'ar') pushV(S.a);
    }
    if (t.tanwin) { if (!t.vowel) pushV(S.a); out.push({ ipa: 'n' }); }
  }
  // stress: the first long vowel, else the first vowel
  const vi = out.map((p, k) => (PHONEMES[p.ipa]?.manner === 'vowel' ? k : -1)).filter((k) => k >= 0);
  const func = FUNCTION_WORDS[lang].has(word);
  if (vi.length && !func) out[vi.find((k) => out[k].long) ?? vi[0]].stress = true;
  if (func) for (const p of out) p.func = true;
  if (out.length) { out[0].wordStart = true; out[out.length - 1].wordEnd = true; }
  return out;
}

const WH: Record<Lang, Set<string>> = {
  ar: new Set(['ما', 'ماذا', 'من', 'أين', 'متى', 'لماذا', 'كيف', 'كم', 'أي']),
  ur: new Set(['کون', 'کہاں', 'کب', 'کیوں', 'کیسے', 'کیسا', 'کیسی', 'کتنا', 'کتنے', 'کس', 'کدھر']),
};
/** a question word anywhere in the phrase (Urdu asks "āp kaise haĩ?"); the yes/no marker کیا at the start is not one */
const isWh = (lang: Lang, words: string[]) => words.some((w, i) => WH[lang].has(w) || (i > 0 && w === 'کیا'));

/** Arabic or Urdu text to phones: words, pauses (، ؛ , ۔ . ! ؟ ?) and questions. */
export function arabicText(text: string, lang: Lang): Phone[] {
  const out: Phone[] = [];
  const tokens = text.split(/(\s+|[,.;:!?،؛۔؟—–-])/).filter((x) => x && !/^\s+$/.test(x));
  let words: string[] = [];
  for (const tok of tokens) {
    if (/^[,;:،؛—–]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'short'; continue; }
    if (/^[.!۔]$/.test(tok)) { if (out.length) out[out.length - 1].pause = 'long'; words = []; continue; }
    if (tok === '?' || tok === '؟') {
      if (out.length) { const l = out[out.length - 1]; l.pause = 'long'; l.question = true; if (isWh(lang, words)) l.whQuestion = true; }
      words = [];
      continue;
    }
    if (tok === '-') continue;
    const word = tok.replace(/[^؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g, '');
    if (!word) continue;
    words.push(word.normalize('NFC').replace(/[ً-ْٰ]/g, ''));
    out.push(...arabicWord(word, lang));
  }
  return out;
}
