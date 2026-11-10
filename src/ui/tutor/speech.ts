/**
 * The teacher's voice: the letter, its name and its word said by a real
 * speech voice of the browser, in the language being learnt. Urdu has no
 * voice on most computers; its sounds are those of Hindi, so without an Urdu
 * voice the Hindi one says them, from a spelling in Devanagari made here.
 * Without any voice the tutor falls back on the simulator's own.
 */
import type { TutorLang } from '../store';
import { compactPhones } from '../../dsp/speech/indic';
import { PHONEMES } from '../../dsp/speech/phonemes';
import type { Letter } from './letters';

// ------------------------------------------------- compact form to Devanagari

const DEVA_C: Record<string, string> = {
  p: 'प', b: 'ब', m: 'म', f: 'फ़', v: 'व', 'ʋ': 'व', w: 'व', t: 'त', d: 'द', n: 'न', 'θ': 'थ', 'ð': 'द', s: 'स', z: 'ज़', l: 'ल', r: 'र', 'ɾ': 'र',
  'ʈ': 'ट', 'ɖ': 'ड', 'ɳ': 'ण', 'ɽ': 'ड़', 'ʂ': 'ष', 'ʃ': 'श', 'ʒ': 'ज़', 'tʃ': 'च', 'dʒ': 'ज', j: 'य', 'ɲ': 'ञ', k: 'क', g: 'ग', 'ŋ': 'ङ',
  x: 'ख़', 'ɣ': 'ग़', q: 'क़', h: 'ह', 'ħ': 'ह', 'sˤ': 'स', 'tˤ': 'त', 'dˤ': 'द', 'ðˤ': 'ज़',
  'pʰ': 'फ', 'bʱ': 'भ', 'tʰ': 'थ', 'dʱ': 'ध', 'ʈʰ': 'ठ', 'ɖʱ': 'ढ', 'tʃʰ': 'छ', 'dʒʱ': 'झ', 'kʰ': 'ख', 'gʱ': 'घ', 'ɽʱ': 'ढ़',
};
/** each vowel: on its own, and as the mark after a consonant */
const DEVA_V: Record<string, [string, string]> = {
  'ə': ['अ', ''], a: ['आ', 'ा'], 'ɪ': ['इ', 'ि'], i: ['ई', 'ी'], 'ʊ': ['उ', 'ु'], u: ['ऊ', 'ू'], e: ['ए', 'े'], 'ɛ': ['ऐ', 'ै'], o: ['ओ', 'ो'], 'ɔ': ['औ', 'ौ'],
};

/** A word in the compact form of the tutor ('bəkriː') written in Devanagari ('बक्री'), for a Hindi voice to read. */
export function devanagariOf(compact: string): string {
  const ps = compactPhones(compact);
  let out = '';
  let afterConsonant = false;
  ps.forEach((p, i) => {
    const v = DEVA_V[p.ipa];
    if (v) {
      const mark = afterConsonant ? v[1] : v[0];
      out += mark;
      if (p.nasal) out += /[िीेैोौ]/.test(mark) ? 'ं' : 'ँ';
      afterConsonant = false;
      return;
    }
    const c = DEVA_C[p.ipa];
    if (!c) { afterConsonant = false; return; } // a glottal stop: the vowel after it stands alone
    if (afterConsonant) out += '्';
    out += c;
    afterConsonant = true;
    // a doubled consonant is written twice
    if (p.long && i > 0) out += '्' + c;
  });
  return out;
}

const ROMAN: [string, string][] = [
  ['chh', 'tʃʰ'], ['ch', 'tʃ'], ['sh', 'ʃ'], ['zh', 'ʒ'], ['kh', 'x'], ['gh', 'ɣ'], ['bh', 'bʱ'], ['ph', 'pʰ'], ['th', 'tʰ'], ['ṭh', 'ʈʰ'], ['jh', 'dʒʱ'], ['dh', 'dʱ'], ['ḍh', 'ɖʱ'], ['ṛh', 'ɽʱ'],
  ['ai', 'ɛː'], ['au', 'ɔː'], ['ā', 'aː'], ['ī', 'iː'], ['ū', 'uː'], ['e', 'eː'], ['o', 'oː'], ['a', 'ə'], ['i', 'ɪ'], ['u', 'ʊ'],
  ['ṭ', 'ʈ'], ['ḍ', 'ɖ'], ['ṛ', 'ɽ'], ['j', 'dʒ'], ['y', 'j'], ['w', 'ʋ'], ['v', 'ʋ'],
];

/** The name of an Urdu letter in Latin letters ('baṛī he') in the compact form ('bəɽiː heː'). */
export function romanToCompact(roman: string, sound = ''): string {
  return roman.split(/[\s-]+/).filter(Boolean).map((w, wi, all) => {
    let out = '';
    let i = 0;
    // the name of a puffed letter starts with its own sound (khe of کھ is kʰ, not the x of خ)
    if (wi === 0 && all.length === 1 && /[ʰʱ]$/.test(sound)) {
      const m = ROMAN.find(([r, c]) => w.startsWith(r) && /[ʰʱxɣ]$/.test(c));
      if (m) { out = sound; i = m[0].length; }
    }
    while (i < w.length) {
      const m = ROMAN.find(([r]) => w.startsWith(r, i));
      if (m) { out += i + m[0].length === w.length && m[0] === 'a' ? 'aː' : m[1]; i += m[0].length; }
      else { if (PHONEMES[w[i]]) out += w[i]; i++; }
    }
    return out;
  }).join(' ');
}

// ------------------------------------------------------------- what to say

export type Say = 'sound' | 'name' | 'word';

const isMark = (l: Letter) => l.glyph.startsWith('◌');
const isVowelSound = (l: Letter) => l.sound === 'ã' || PHONEMES[l.sound]?.manner === 'vowel';

/** The text a voice of `via` reads to say a letter's sound, name or word. */
export function speechText(l: Letter, lang: TutorLang, via: TutorLang, what: Say, say: string): string {
  if (what === 'word') return lang === 'ur' && via === 'hi' ? devanagariOf(l.word.ipa) : l.word.text;
  if (lang === 'hi') return l.glyph;
  if (lang === 'ur' && via === 'hi') {
    if (what === 'name') return romanToCompact(l.roman, l.sound).split(' ').map(devanagariOf).join(' ');
    // a consonant alone is read with its short a, as a Hindi letter is
    if (!isVowelSound(l) && DEVA_C[l.sound] && !l.say) return DEVA_C[l.sound];
    return devanagariOf(say);
  }
  if (what === 'name') return l.name;
  // Arabic script, read by a voice of its own: the letter with a short a
  const ARABIC_VOWEL: Record<string, string> = { a: 'أَ', 'ə': 'اَ', i: 'إِ', 'ɪ': 'اِ', u: 'أُ', 'ʊ': 'اُ', e: 'اے', 'ã': 'آں' };
  // (the voices read some letters written alone by their names, or as a phrase: آ comes out as "alif madda",
  // شَ as a sentence. Written with the alif of a long a they are read as the sound.)
  if (isVowelSound(l)) return l.glyph === 'ا' ? 'أَا' : ARABIC_VOWEL[l.sound] ?? l.word.text;
  if (isMark(l)) return l.word.text;
  if (l.sound === 'ʔ') return 'أَ';
  if (l.glyph === 'ش') return 'شَا';
  return l.glyph + 'َ';
}

// --------------------------------------------------------------- the voices

const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

const rank = (v: SpeechSynthesisVoice) => (/premium|enhanced|natural|neural|siri/i.test(v.name) ? 0 : v.localService ? 1 : 2);

/** The best voice of the browser for a language, by the start of its tag ('hi', 'fr', 'en-GB'); null if it has none. */
export function voiceOf(prefix: string): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const want = prefix.toLowerCase();
  const vs = s.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(want)).sort((a, b) => rank(a) - rank(b));
  return vs[0] ?? null;
}

/** The best voice for a language of the tutor, and the language it really speaks (Hindi for Urdu, when Urdu has none). */
export function voiceFor(lang: TutorLang): { voice: SpeechSynthesisVoice; via: TutorLang } | null {
  for (const via of (lang === 'ur' ? ['ur', 'hi'] : [lang]) as TutorLang[]) {
    const voice = voiceOf(via);
    if (voice) return { voice, via };
  }
  return null;
}

/** The voice that reads the explanations aloud: the browser's own English voice, or any English one. */
export function narratorVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const en = s.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  return en.find((v) => v.default) ?? en.filter((v) => /^en[-_](us|gb)/i.test(v.lang)).sort((a, b) => rank(a) - rank(b))[0] ?? en[0] ?? null;
}

/**
 * Calls back when the browser's list of voices arrives or changes. The list
 * is filled a moment after the page asks for it the first time, and some
 * browsers do not tell: so it also calls back a few times by the clock.
 */
export function onVoices(fn: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  s.getVoices();
  s.addEventListener('voiceschanged', fn);
  const timers = [60, 400, 1200, 3000].map((ms) => setTimeout(fn, ms));
  return () => { s.removeEventListener('voiceschanged', fn); timers.forEach(clearTimeout); };
}

export interface Utterance {
  /** resolves when the voice starts to sound (or cannot) */
  started: Promise<void>;
  /** resolves when it has finished or was cancelled */
  ended: Promise<void>;
  cancel(): void;
}

let current: Utterance | null = null;

/** Says a text with a voice; any earlier one is cut. */
export function sayText(text: string, voice: SpeechSynthesisVoice, rate = 0.85): Utterance {
  const s = synth()!;
  current?.cancel();
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = rate;
  u.pitch = 1.05;
  let start!: () => void, end!: () => void;
  const started = new Promise<void>((r) => { start = r; });
  const ended = new Promise<void>((r) => { end = r; });
  let over = false;
  const finish = () => { if (over) return; over = true; clearTimeout(t1); clearTimeout(t2); start(); end(); if (current === me) current = null; };
  u.onstart = () => { clearTimeout(t1); start(); };
  u.onend = finish;
  u.onerror = finish;
  // a browser that never tells: go on anyway
  const t1 = setTimeout(start, 1200);
  const t2 = setTimeout(finish, 9000);
  const me: Utterance = { started, ended, cancel: () => { if (!over) { finish(); s.cancel(); } } };
  current = me;
  // Chrome drops an utterance spoken in the same task as a cancel
  setTimeout(() => { if (!over) s.speak(u); }, 30);
  return me;
}

/** Cuts whatever the teacher's voice is saying. */
export function hush(): void { current?.cancel(); }
