/**
 * What the tutor teaches, in one shape: the alphabets of Urdu, Arabic and
 * Hindi (letters.ts) and the whole International Phonetic Alphabet (ipa.ts),
 * each as a course of sections of entries. An entry is a letter or a sound
 * with everything the lesson needs: the model symbol that shows it, how to
 * say it alone, a word that has it, and for the IPA real words from several
 * languages for the browser's voices to say.
 */
import { ALPHABETS, Letter } from './letters';
import type { IpaExample, IpaMark, IpaSection, IpaSound } from './ipa';
import { PHONEMES } from '../../dsp/speech/phonemes';
import type { TutorLang } from '../store';

export type CourseId = TutorLang | 'ipa';
export type Example = IpaExample;

export interface Entry extends Letter {
  /** the model symbol whose posture shows the sound: the sound itself, or the nearest one when the model cannot say it */
  show: string;
  /** the model cannot make this sound (a click, an implosive, an ejective): it is shown and explained, not synthesised */
  silent: boolean;
  /** a letter or syllable that a real voice of a language reads as the bare sound */
  carrier?: { lang: string; text: string };
  /** words with the sound, from several languages (the IPA); the first is the entry's own word */
  examples: Example[];
  /** the language of the entry's word: the voice that says it and the recogniser that listens for it */
  wordLang: string;
  /** the word can be shown by the head (it is written in the model's symbols) */
  wordShown: boolean;
}

export interface Section { id: string; title: string; blurb?: string; entries: Entry[] }

export interface Course {
  id: CourseId;
  name: string;
  /** the name in its own script */
  native: string;
  dir: 'rtl' | 'ltr';
  /** the vowel a consonant is said with when it is taught alone */
  vowel: string;
  sections: Section[];
  /** every entry, in order */
  entries: Entry[];
  /** explanation-only marks (length, stress, the diacritics): the IPA only */
  marks: IpaMark[];
}

const fromLetter = (l: Letter, lang: TutorLang): Entry => ({
  ...l, show: l.sound === 'ã' ? 'a' : l.sound, silent: false, examples: [], wordLang: lang, wordShown: true,
});

/** The sections of an alphabet: where its list changes kind (the letters, the puffed ones, the marks…). */
function alphabetSections(lang: TutorLang): Section[] {
  const all = ALPHABETS[lang].letters.map((l) => fromLetter(l, lang));
  const cut = (title: string, id: string, pick: (e: Entry, i: number) => boolean, blurb?: string): Section => ({ id, title, blurb, entries: all.filter(pick) });
  const mark = (e: Entry) => e.glyph.startsWith('◌');
  if (lang === 'ur') {
    const puffed = (e: Entry) => e.glyph.length === 2 && e.glyph.endsWith('ھ');
    return [
      cut('Letters', 'letters', (e) => !mark(e) && !puffed(e)),
      cut('With a puff of air', 'puffed', puffed, 'A letter followed by ھ is said with a puff of air.'),
      cut('Vowel marks', 'marks', mark, 'Small marks above or below a letter: the short vowels.'),
    ];
  }
  if (lang === 'ar') return [cut('Letters', 'letters', (e) => !mark(e)), cut('Vowel marks', 'marks', mark, 'Small marks above or below a letter: the short vowels.')];
  const nukta = (e: Entry) => e.glyph.normalize('NFD').includes('\u093C');
  const firstConsonant = all.findIndex((e) => e.glyph === 'क');
  return [
    cut('Vowels', 'vowels', (_e, i) => i < firstConsonant),
    cut('Consonants', 'consonants', (e, i) => i >= firstConsonant && !nukta(e)),
    cut('Dotted letters', 'dotted', nukta, 'A dot below a letter: the sounds of Persian and Arabic words.'),
  ];
}

const isVowel = (ipa: string) => PHONEMES[ipa]?.manner === 'vowel';

function fromIpa(s: IpaSound): Entry {
  const show = s.show;
  const say = s.say ?? (isVowel(show) ? show : show + 'a');
  const first = s.examples[0];
  return {
    glyph: s.symbol, name: s.name, roman: s.short, sound: s.sound ?? show, say, note: s.note,
    word: first ? { text: first.text, roman: first.roman ?? first.text, meaning: first.meaning, ipa: first.ipa ?? say } : { text: s.symbol, roman: s.short, meaning: s.name, ipa: say },
    show, silent: s.sound === null, carrier: s.carrier, examples: s.examples, wordLang: first?.lang ?? 'en', wordShown: !!first?.ipa,
  };
}

function course(id: TutorLang): Course {
  const a = ALPHABETS[id];
  const sections = alphabetSections(id);
  return { id, name: a.name, native: a.native, dir: a.dir, vowel: a.vowel, sections, entries: sections.flatMap((s) => s.entries), marks: [] };
}

// the chart is a module of its own (ipa.ts)
const chart = Object.values(import.meta.glob('./ipa.ts', { eager: true }))[0] as { IPA_SECTIONS?: IpaSection[]; IPA_MARKS?: IpaMark[] } | undefined;
const ipaSections: Section[] = (chart?.IPA_SECTIONS ?? []).map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, entries: s.sounds.map(fromIpa) }));

export const COURSES: Record<CourseId, Course> = {
  ur: course('ur'),
  ar: course('ar'),
  hi: course('hi'),
  ipa: { id: 'ipa', name: 'IPA', native: 'aɪ pʰiː eɪ', dir: 'ltr', vowel: 'a', sections: ipaSections, entries: ipaSections.flatMap((s) => s.entries), marks: chart?.IPA_MARKS ?? [] },
};
export const COURSE_IDS: CourseId[] = ipaSections.length ? ['ur', 'ar', 'hi', 'ipa'] : ['ur', 'ar', 'hi'];

/** What an entry says on its own: a vowel as it is, a consonant with the course's vowel. */
export function sayOf(e: Entry, c: Course): string {
  if (e.say) return e.say;
  return isVowel(e.sound) ? e.sound : e.sound + c.vowel;
}
