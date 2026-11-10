/**
 * What a learner types into the tutor, as sounds. A word is read by its own
 * writing whatever course is open: Arabic letters as Urdu (or Arabic, in the
 * Arabic course), Devanagari as Hindi, and Latin letters as English in the
 * courses of English and of sounds, or, in the three courses of a script, as the Latin
 * spelling of a word of that language ("walid", "salaam", "namaste",
 * "kitab"): nobody who learns the Urdu letters can type them yet. A line may
 * mix them; nothing that has letters is passed over in silence.
 */
import { Lang, Phone, textToPhones } from '../../dsp/speech/g2p';
import type { TutorLang } from '../store';
import { compactPhones } from '../../dsp/speech/indic';
import { PHONEMES } from '../../dsp/speech/phonemes';

type Script = 'arabic' | 'devanagari' | 'latin';
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/, DEVANAGARI = /[ऀ-ॿ]/, LATIN = /[A-Za-zÀ-ɏḀ-ỿ]/;
const scriptOf = (w: string): Script | null => (ARABIC.test(w) ? 'arabic' : DEVANAGARI.test(w) ? 'devanagari' : LATIN.test(w) ? 'latin' : null);

/**
 * Latin spellings of Hindi, Urdu and Arabic words, longest first. Two
 * letters for one sound come before their first letter; `ar` is what the
 * spelling means in an Arabic word where that differs (th is the th of
 * "three" there, a puffed t in Hindi and Urdu).
 */
const SPELL: [string, string, string?][] = [
  ['cch', 'tʃtʃʰ'], ['chh', 'tʃʰ'], ['tch', 'tʃ'], ['sch', 'ʃ'],
  ['aa', 'aː'], ['ee', 'iː'], ['ii', 'iː'], ['oo', 'uː'], ['uu', 'uː'], ['ai', 'ɛː', 'aj'], ['ay', 'ɛː', 'aj'], ['au', 'ɔː', 'aw'], ['aw', 'ɔː', 'aw'], ['ou', 'uː'],
  ['ch', 'tʃ'], ['sh', 'ʃ'], ['zh', 'ʒ'], ['kh', 'x'], ['gh', 'ɣ'], ['bh', 'bʱ', 'b'], ['ph', 'pʰ', 'f'], ['th', 'tʰ', 'θ'], ['jh', 'dʒʱ', 'dʒ'], ['dh', 'dʱ', 'ð'], ['ng', 'ŋg'], ['ck', 'k'],
  ['ā', 'aː'], ['ī', 'iː'], ['ū', 'uː'], ['é', 'eː'], ['ṭ', 'ʈ', 'tˤ'], ['ḍ', 'ɖ', 'dˤ'], ['ṛ', 'ɽ', 'r'], ['ṣ', 'ʂ', 'sˤ'], ['ś', 'ʃ'], ['ñ', 'ɲ'], ['ṅ', 'ŋ'], ['ṇ', 'ɳ', 'n'], ['ḥ', 'h', 'ħ'], ['ʿ', 'ʕ'], ['ʾ', 'ʔ'], ["'", 'ʔ'],
  ['e', 'eː'], ['o', 'oː'], ['a', 'ə', 'a'], ['i', 'ɪ', 'i'], ['u', 'ʊ', 'u'],
  ['j', 'dʒ'], ['y', 'j'], ['w', 'ʋ', 'w'], ['v', 'ʋ', 'w'], ['c', 'k'], ['q', 'q'], ['x', 'ks'], ['r', 'r'],
];
const SHORT_TO_LONG: Record<string, string> = { 'ə': 'aː', a: 'aː', 'ɪ': 'iː', i: 'iː', 'ʊ': 'uː', u: 'uː' };
const isVowel = (s: string) => PHONEMES[s.replace(/ː$/, '')]?.manner === 'vowel';

/** A word of Hindi, Urdu or Arabic in Latin letters, in the compact form of the tables ('walid' → 'ʋəliːd'). */
export function latinSpelling(word: string, lang: 'ur' | 'hi' | 'ar'): string {
  const w = word.toLowerCase().normalize('NFC');
  const parts: string[] = [];
  for (let i = 0; i < w.length;) {
    const m = SPELL.find(([r]) => w.startsWith(r, i));
    if (m) {
      let s = (lang === 'ar' ? m[2] : undefined) ?? m[1];
      // Hindi has no x and ɣ of its own: kh and gh are the puffed k and the murmured g there
      if (lang === 'hi' && m[0] === 'kh') s = 'kʰ';
      if (lang === 'hi' && m[0] === 'gh') s = 'gʱ';
      parts.push(s);
      i += m[0].length;
    } else {
      if (PHONEMES[w[i]]) parts.push(w[i]);
      i++;
    }
  }
  // Latin spellings do not mark length. Two habits of these languages put it back where it is nearly always
  // meant: a word does not end on a short vowel ("hindi", "shukriya"), and an i or a u in the last, closed
  // syllable of a word of several is the long one ("walid", "karim", "mahmud"). An a there is as often short
  // ("ahmad") as long ("salaam"): it is left as it is spelt.
  const vowels = parts.map((s, k) => (isVowel(s) ? k : -1)).filter((k) => k >= 0);
  const last = vowels[vowels.length - 1];
  if (last !== undefined && SHORT_TO_LONG[parts[last]]) {
    const closing = parts.length - 1 - last;
    if (closing === 0 || (closing === 1 && vowels.length > 1 && SHORT_TO_LONG[parts[last]] !== 'aː')) parts[last] = SHORT_TO_LONG[parts[last]];
  }
  return parts.join('');
}

/**
 * The sounds of what was typed, in the course `course` (null: the course of
 * sounds; there and in the course of English, Latin letters are English). Every word is read by its own
 * script; words of one script that follow one another are read together, so
 * that a sentence keeps its phrasing.
 */
export function typedPhones(text: string, course: TutorLang | null): Phone[] {
  const t = text.trim();
  if (!t) return [];
  if ((t.startsWith('/') && t.endsWith('/')) || (t.startsWith('[') && t.endsWith(']'))) return textToPhones(t, 'en');
  const runs: { script: Script; words: string[] }[] = [];
  for (const w of t.split(/\s+/)) {
    const s = scriptOf(w) ?? runs[runs.length - 1]?.script;
    if (!s) continue; // (marks before any word)
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.script === s) lastRun.words.push(w); else runs.push({ script: s, words: [w] });
  }
  const out: Phone[] = [];
  for (const run of runs) {
    const line = run.words.join(' ');
    let ps: Phone[];
    if (run.script === 'devanagari') ps = textToPhones(line, 'hi');
    else if (run.script === 'arabic') ps = textToPhones(line, course === 'ar' ? 'ar' : 'ur');
    else if (course === null || course === 'en') ps = textToPhones(line, 'en');
    else {
      ps = [];
      for (const word of run.words) {
        const bare = word.replace(/[^A-Za-zÀ-ɏḀ-ỿ'ʿʾ]/g, '');
        const w = bare ? compactPhones(latinSpelling(bare, course)) : [];
        if (!w.length) continue;
        const vi = w.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
        if (vi >= 0 && !w.some((p) => p.stress)) w[vi].stress = true;
        w[0].wordStart = true; w[w.length - 1].wordEnd = true;
        if (/[.!?]$/.test(word)) w[w.length - 1].pause = 'long';
        else if (/[,;:]$/.test(word)) w[w.length - 1].pause = 'short';
        ps.push(...w);
      }
    }
    out.push(...ps);
  }
  return out;
}

/** The language whose melody and timing suit what was typed: the course's, or English. */
export const typedLang = (course: TutorLang | null): Lang => course ?? 'en';
