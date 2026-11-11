/**
 * The teacher's recordings fit the tutor that plays them: every letter and
 * word of the four alphabets has one, and the times written beside it (where
 * each of its sounds starts and stops) are as many as the sounds the tutor's
 * own clip of it has. Otherwise the picture would have to look for the
 * sounds again while playing, and could find them elsewhere.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { trajectory } from '../src/ui/tutor/motion';
import { fitTo, Frames, planOf } from '../src/ui/tutor/align';
import { ALPHABETS } from '../src/ui/tutor/letters';
import { speechText } from '../src/ui/tutor/speech';
import { COURSES, sayOf } from '../src/ui/tutor/courses';
import { recordingId, RECORDED_VOICE } from '../src/ui/tutor/clips';

const DIR = new URL('../public/audio/tutor/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(DIR + 'manifest.json', 'utf8')) as Record<string, { f: string; k?: number[] } | string>;
const isVowel = (s: string) => PHONEMES[s]?.manner === 'vowel';
/** a recording that is all sound, to fit against: the marks, when they are taken, are all that counts */
const loud: Frames = { n: 400, loud: new Float32Array(400).fill(1), mid: new Float32Array(400).fill(0.6), high: new Float32Array(400) };

describe('the teacher\'s recordings', () => {
  it('every letter and word of the courses has a recording, with the times of the very sounds the tutor shows', () => {
    const wrong: string[] = [];
    let seen = 0;
    const seenIn: Record<string, number> = {};
    for (const lang of ['ur', 'hi', 'ar', 'en'] as const) {
      const A = ALPHABETS[lang];
      const via = lang === 'ur' ? 'hi' : lang, voice = RECORDED_VOICE[lang];
      for (const l of A.letters) {
        const say = l.say ?? (l.sound === 'ã' || isVowel(l.sound) ? l.sound : l.sound + A.vowel);
        for (const [what, rate, ipa] of [['sound', 0.75, say], ['word', 0.82, l.word.ipa]] as const) {
          const ps = compactPhones(ipa);
          if (!ps.length) continue;
          const key = `${voice}|${rate}|${speechText(l, lang, via, what, say)}`;
          const entry = manifest[key];
          if (!entry || typeof entry === 'string' || !entry.k) { wrong.push(`${key}: no recording with its times`); continue; }
          if (!existsSync(DIR + entry.f)) { wrong.push(`${key}: its file ${entry.f} is missing`); continue; }
          // (its times are counted from the instant it first gets loud, which decoding does not move)
          const z = (entry as { z?: string | number }).z;
          if (z !== 'rise' && !(typeof z === 'number' && z > 0.3 && z < 1)) { wrong.push(`${key}: its times are counted from the first moment heard, not from its rise`); continue; }
          const vi = ps.findIndex((p) => isVowel(p.ipa));
          if (vi >= 0 && !ps.some((p) => p.stress)) ps[vi].stress = true;
          ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
          // the clip as the tutor builds it (its own pitch and breath do not change its sounds)
          const score = buildScore(ps, { lang, f0: 110, ps: 7, rate: 0.9, timeScale: 1 });
          const fit = fitTo(loud, score.phones, trajectory(score), entry.k);
          seen++;
          seenIn[lang] = (seenIn[lang] ?? 0) + 1;
          const a = fit.knots.audio;
          const k = a.length === entry.k.length + 1 ? [entry.k[0], ...entry.k] : a.length === entry.k.length - 1 ? entry.k.slice(1) : entry.k;
          const taken = a.length === k.length && k.every((t, i) => Math.abs(a[i] - a[0] - (t - k[0])) < 1e-6);
          if (!taken) wrong.push(`${key} /${ipa}/: ${entry.k.length - 1} sounds timed in the recording, ${a.length - 1} in the tutor's clip`);
          // and the times run forward
          else if (entry.k.some((t, i) => i > 0 && t < entry.k![i - 1] - 1e-9)) wrong.push(`${key}: its times run backward`);
        }
      }
    }
    expect(seen).toBeGreaterThan(280);
    // every letter of English, its sound and its word
    expect(seenIn.en).toBe(2 * ALPHABETS.en.letters.length);
    expect(wrong, wrong.slice(0, 20).join('\n')).toEqual([]);
  });

  it('an English sound taken out of a word is the sound alone: the recording\'s times are those of the sound, not of the word', () => {
    for (const l of ALPHABETS.en.letters) {
      if (!l.read?.from) continue;
      const say = l.say ?? l.sound + ALPHABETS.en.vowel;
      const key = recordingId('en', 0.75, speechText(l, 'en', 'en', 'sound', say))!;
      const entry = manifest[key];
      expect(entry && typeof entry !== 'string' && entry.k, key).toBeTruthy();
      const ps = compactPhones(say);
      const vi = ps.findIndex((p) => isVowel(p.ipa));
      if (vi >= 0) ps[vi].stress = true;
      ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
      const score = buildScore(ps, { lang: 'en', f0: 110, ps: 7, rate: 0.9, timeScale: 1 });
      expect(fitTo(loud, score.phones, trajectory(score), (entry as { k: number[] }).k).marked, `${key} for /${say}/`).toBe(true);
    }
  });

  it('the course of sounds: its letters said alone and its words, in English, Hindi and Arabic, have the times of the tutor\'s own sounds', () => {
    const wrong: string[] = [];
    let seen = 0;
    const check = (key: string | null, ipa: string, lang: string) => {
      if (!key) return;
      const entry = manifest[key];
      if (!entry || typeof entry === 'string' || !entry.k) { wrong.push(`${key}: no recording with its times`); return; }
      const ps = compactPhones(ipa);
      if (!ps.length) return;
      const vi = ps.findIndex((p) => isVowel(p.ipa));
      if (vi >= 0 && !ps.some((p) => p.stress)) ps[vi].stress = true;
      ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
      const score = buildScore(ps, { lang: (lang.startsWith('en') ? 'en' : lang) as 'en', f0: 110, ps: 7, rate: 0.9, timeScale: 1 });
      const a = fitTo(loud, score.phones, trajectory(score), entry.k).knots.audio;
      seen++;
      const k = a.length === entry.k.length + 1 ? [entry.k[0], ...entry.k] : a.length === entry.k.length - 1 ? entry.k.slice(1) : entry.k;
      if (!(a.length === k.length && k.every((t, i) => Math.abs(a[i] - a[0] - (t - k[0])) < 1e-6))) {
        // (a text said alike for two items the tutor says differently: the recording is the other item's, and the
        // player does not use it for this one; the test of the fit says so)
        const f = fitTo(loud, score.phones, trajectory(score), entry.k);
        if (f.marked) wrong.push(`${key} /${ipa}/: the player would take times that are not this clip's`);
        else shared.push(key);
      }
    };
    const shared: string[] = [];
    for (const e of COURSES.ipa.entries) {
      if (e.silent) continue;
      if (e.carrier) check(recordingId(e.carrier.lang, 0.75, e.carrier.text), sayOf(e, COURSES.ipa), e.carrier.lang);
      for (const x of e.examples) if (x.ipa) check(recordingId(x.lang, 0.82, x.text), x.ipa, x.lang);
    }
    expect(seen).toBeGreaterThan(100);
    expect(wrong, wrong.slice(0, 20).join('\n')).toEqual([]);
    // only a handful are said alike with another item
    expect(shared.length, shared.join(', ')).toBeLessThan(6);
  });

  it('the cuts checked by eye (scripts/tutor-voice-cuts.json) are of recordings the courses make, as many as their sounds, in order, and say why', () => {
    const checked = JSON.parse(readFileSync(new URL('../scripts/tutor-voice-cuts.json', import.meta.url), 'utf8')) as Record<string, { cuts?: number[]; ok?: string; why: string }>;
    // what each recording says, by its name: the compact form of the whole of what the voice reads
    const said = new Map<string, [string, string]>();
    for (const lang of ['ur', 'hi', 'ar', 'en'] as const) {
      const A = ALPHABETS[lang], via = lang === 'ur' ? 'hi' : lang;
      for (const l of A.letters) {
        const say = l.say ?? (l.sound === 'ã' || isVowel(l.sound) ? l.sound : l.sound + A.vowel);
        said.set(recordingId(lang, 0.75, speechText(l, lang, via, 'sound', say))!, [lang, l.read?.from ?? say]);
        said.set(recordingId(lang, 0.82, speechText(l, lang, via, 'word', say))!, [lang, l.word.ipa]);
      }
    }
    for (const e of COURSES.ipa.entries) for (const x of e.examples) { const k = x.ipa && recordingId(x.lang, 0.82, x.text); if (k && !said.has(k)) said.set(k, [x.lang, x.ipa!]); }
    const wrong: string[] = [];
    for (const [key, c] of Object.entries(checked)) {
      const item = said.get(key);
      if (!item) { wrong.push(`${key}: no course says it`); continue; }
      if (!manifest[key]) wrong.push(`${key}: not recorded`);
      if (!(c.why && c.why.length > 20)) wrong.push(`${key}: no reason given`);
      if (c.ok !== undefined && !/^[0-9a-f]{16}$/.test(c.ok)) wrong.push(`${key}: its fingerprint is not one`);
      if (c.cuts) {
        const ps = compactPhones(item[1]);
        const vi = ps.findIndex((p) => isVowel(p.ipa));
        if (vi >= 0 && !ps.some((p) => p.stress)) ps[vi].stress = true;
        ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
        const score = buildScore(ps, { lang: (item[0].startsWith('en') ? 'en' : item[0]) as 'en', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
        const S = planOf(score.phones, trajectory(score)).kinds.length;
        if (c.cuts.length !== S + 1) wrong.push(`${key}: ${c.cuts.length - 1} stretches cut by hand, the word has ${S}`);
        if (c.cuts.some((t, i) => i > 0 && t < c.cuts![i - 1])) wrong.push(`${key}: its cuts run backward`);
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
  });
});
