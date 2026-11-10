/**
 * In whole words and sentences of the four languages, at the instant that
 * shows each sound, the mouth makes that sound: a stop is closed where that
 * stop is made, lips are shut for p, b, m, the lower lip is on the top teeth
 * for f and v, air goes through the nose for a nasal, a rounded vowel is
 * rounded, an open one open, and the voice is on where the sound has one.
 * (What a sound is alone is tested with the sounds; this is about what is
 * left of it between its neighbours, at the speed of speech.)
 */
import { describe, expect, it } from 'vitest';
import { computeGeometry } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { buildScore } from '../src/dsp/speech/sequencer';
import { poseAt, stagesOf, trajectory } from '../src/ui/tutor/motion';
import { flowOf, lipsOf, narrowest } from '../src/ui/tutor/readout';
import { typedPhones } from '../src/ui/tutor/typed';

type Course = 'ur' | 'hi' | 'ar' | null;
const LINES: [string, Course][] = [
  // Urdu
  ['آم', 'ur'], ['بکری', 'ur'], ['خرگوش', 'ur'], ['دروازہ', 'ur'], ['ٹماٹر', 'ur'], ['چھٹی', 'ur'], ['ژالہ', 'ur'], ['غریب', 'ur'], ['قلم', 'ur'], ['پھول', 'ur'], ['بھائی', 'ur'], ['ڑ', 'ur'],
  ['میرا نام ولید ہے', 'ur'], ['آپ کیسے ہیں؟', 'ur'], ['مجھے اردو بہت پسند ہے', 'ur'], ['walid', 'ur'], ['khuda hafiz', 'ur'],
  // Hindi
  ['नमस्ते', 'hi'], ['क्षत्रिय', 'hi'], ['ज्ञान', 'hi'], ['स्त्री', 'hi'], ['धर्म', 'hi'], ['भ्रष्ट', 'hi'], ['ऋषि', 'hi'], ['पंखा', 'hi'], ['ठंडा', 'hi'], ['झंडा', 'hi'],
  ['मेरा नाम वलीद है', 'hi'], ['आप कैसे हैं?', 'hi'], ['मुझे हिंदी सीखना अच्छा लगता है', 'hi'],
  // Arabic
  ['بَاب', 'ar'], ['خُبْز', 'ar'], ['مُسْتَشْفى', 'ar'], ['قِطّة', 'ar'], ['عَيْن', 'ar'], ['صَحِيح', 'ar'], ['ضَرَبَ', 'ar'], ['ظَلام', 'ar'], ['غُرْفة', 'ar'], ['ثَلاثة', 'ar'],
  ['مرحبا يا وليد', 'ar'], ['كيف حالك؟', 'ar'], ['أنا أتعلم اللغة العربية', 'ar'],
  // English
  ['strengths', null], ['sixths', null], ['squirrel', null], ['rhythm', null], ['thorough', null], ['bubble', null], ['mammoth', null], ['fifth', null], ['vivid', null],
  ['the quick brown fox jumps over the lazy dog', null], ['she sells sea shells by the sea shore', null], ['peter piper picked a peck of pickled peppers', null], ['my name is Walid', null],
];

const BILABIAL = /^(p|b|m|pʰ|bʱ)$/, LABIODENTAL = /^(f|v|ʋ)$/, ROUNDED = /^(u|o|ʊ|ɔ)$/, OPEN = /^(a|ɑ|æ)$/;

interface Fault { line: string; ipa: string; what: string }

function faults(text: string, course: Course): Fault[] {
  const out: Fault[] = [];
  const phones = typedPhones(text, course);
  const score = buildScore(phones, { lang: course ?? 'en', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  const traj = trajectory(score);
  for (const st of stagesOf(score.phones, traj)) {
    const ph = PHONEMES[st.ipa];
    if (!ph || st.part === 'pop' || st.part === 'puff') continue;
    const pose = poseAt(traj, st.key)!;
    const geom = computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH);
    const flow = flowOf(pose, geom), lips = lipsOf(pose.art, geom);
    const bad = (what: string) => out.push({ line: text, ipa: st.ipa, what });
    // the sound alone, to set the place of its closure or narrowing against
    const alone = { ...DEFAULT_ARTICULATORS, ...(ph.manner === 'affricate' && ph.parts ? PHONEMES[ph.parts[0]].art : ph.art) };
    const own = narrowest(computeGeometry(alone, DEFAULT_ANATOMY, DEFAULT_TEETH));
    const here = narrowest(geom);
    const stop = ph.manner === 'stop' || ph.manner === 'nasal' || ph.manner === 'affricate';
    if (stop && st.part === 'hold') {
      if (!flow.blocked) bad(`the mouth is not closed (narrowest ${here.area.toFixed(2)} cm² at ${here.sc.toFixed(1)})`);
      else if (Math.abs(here.sc - own.sc) > 1.6) bad(`closed at ${here.sc.toFixed(1)} cm, the sound closes at ${own.sc.toFixed(1)}`);
    }
    if (BILABIAL.test(st.ipa) && (st.part === 'hold' || ph.manner === 'nasal') && lips.state !== 'closed') bad(`lips ${lips.state}, not closed`);
    if (LABIODENTAL.test(st.ipa) && lips.state !== 'teeth') bad(`lips ${lips.state}, not on the teeth`);
    if (ph.manner === 'nasal' && flow.nose < 0.3) bad(`no air through the nose (${flow.nose.toFixed(2)})`);
    if (ph.manner === 'vowel') {
      if (flow.blocked) bad('a vowel with the mouth closed');
      if (ROUNDED.test(st.ipa) && (ph.art.lipRound ?? 0) > 0.6 && lips.state !== 'round') bad(`a rounded vowel with lips ${lips.state}`);
      if (OPEN.test(st.ipa) && lips.gap < 0.7) bad(`an open vowel with lips ${lips.gap.toFixed(2)} cm apart`);
      if (flow.voice < 0.3) bad(`a vowel without voice (${flow.voice.toFixed(2)})`);
    }
    if (ph.manner === 'fricative' && flow.blocked) bad('a fricative with the mouth closed');
  }
  return out;
}

describe('the mouth in whole words and sentences', () => {
  it('at the instant that shows each sound, the mouth makes that sound (Urdu, Hindi, Arabic, English)', () => {
    const all: Fault[] = [];
    for (const [text, course] of LINES) all.push(...faults(text, course));
    const told = all.map((f) => `${f.line}: /${f.ipa}/ ${f.what}`);
    expect(told, told.slice(0, 40).join('\n')).toEqual([]);
  });
});
