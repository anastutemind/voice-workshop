/**
 * What is typed into the tutor is always read: by its own script, whatever
 * course is open, and Latin letters in a course of a script as that
 * language's words spelt in Latin.
 */
import { describe, expect, it } from 'vitest';
import { typedPhones, latinSpelling } from '../src/ui/tutor/typed';
import { buildScore } from '../src/dsp/speech/sequencer';
import { stagesOf, trajectory } from '../src/ui/tutor/motion';

const ipa = (text: string, course: 'ur' | 'hi' | 'ar' | 'en' | null) => typedPhones(text, course).map((p) => p.ipa + (p.long ? 'ː' : '')).join(' ');

describe('what is typed into the tutor', () => {
  it('Latin spellings in the courses of a script are read as that language\'s words', () => {
    expect(latinSpelling('walid', 'ur')).toBe('ʋəliːd');
    expect(latinSpelling('walid', 'ar')).toBe('waliːd');
    expect(ipa('walid', 'ur')).toBe('ʋ ə l iː d');
    expect(ipa('salaam', 'ur')).toBe('s ə l aː m');
    expect(ipa('hindi', 'hi')).toBe('h ɪ n d iː');
    expect(ipa('zindagi', 'ur')).toBe('z ɪ n d ə g iː');
    expect(ipa('ghar', 'hi')).toBe('gʱ ə r');
    expect(ipa('ahmad', 'ar')).toBe('a h m a d');
    expect(ipa('thalatha', 'ar')).toBe('θ a l a θ aː');
  });

  it('in the course of sounds Latin letters are English', () => {
    expect(ipa('walid', null)).toBe('w æ l ɪ d');
  });

  it('in the course of English Latin letters are English, and every other script is still read by its own', () => {
    expect(ipa('walid', 'en')).toBe(ipa('walid', null));
    expect(ipa('the cat sat on the mat', 'en')).toBe(ipa('the cat sat on the mat', null));
    expect(ipa('नमस्ते', 'en')).toBe(ipa('नमस्ते', 'hi'));
    expect(ipa('ولید', 'en')).toBe(ipa('ولید', 'ur'));
    const phones = typedPhones('she sells sea shells', 'en');
    const stages = stagesOf(buildScore(phones, { lang: 'en', f0: 120, ps: 8, rate: 0.9, timeScale: 1 }).phones, trajectory(buildScore(phones, { lang: 'en', f0: 120, ps: 8, rate: 0.9, timeScale: 1 })));
    expect(stages.length).toBeGreaterThanOrEqual(phones.length - 1);
  });

  it('every word is read by its own script, in any course', () => {
    expect(ipa('ولید', 'hi')).toBe(ipa('ولید', 'ur'));
    expect(ipa('नमस्ते', 'ar')).toBe(ipa('नमस्ते', 'hi'));
    expect(ipa('नमस्ते walid', 'hi')).toBe('n ə m ə s t eː ʋ ə l iː d');
    expect(typedPhones('مرحبا يا walid', 'ar').length).toBeGreaterThan(8);
  });

  it('nothing with letters in it is passed over in silence, and every sound gets its step of the picture', () => {
    const lines: [string, 'ur' | 'hi' | 'ar' | null][] = [
      ['walid', 'ur'], ['walid', 'hi'], ['walid', 'ar'], ['walid', null],
      ['khuda hafiz, phir milenge!', 'ur'], ['mera naam walid hai', 'ur'], ['aap kaise hain?', 'hi'], ['assalamu alaykum', 'ar'],
      ['strengths and sixths', null], ['the quick brown fox jumps over the lazy dog', null],
      ['میں اردو سیکھ رہا ہوں', 'ur'], ['मैं हिंदी सीख रहा हूँ', 'hi'], ['أنا أتعلم اللغة العربية', 'ar'],
    ];
    for (const [text, course] of lines) {
      const phones = typedPhones(text, course);
      expect(phones.length, text).toBeGreaterThan(3);
      const score = buildScore(phones, { lang: course ?? 'en', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
      const stages = stagesOf(score.phones, trajectory(score));
      expect(stages.length, text).toBeGreaterThanOrEqual(phones.length - 1);
    }
  });
});
