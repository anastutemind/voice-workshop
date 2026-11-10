import { describe, it, expect } from 'vitest';
import { computeGeometry, SC_PHARYNX, SC_FRONT } from '../src/dsp/tract/geometry';
import { sectionsFromGeometry, N_SECTIONS } from '../src/dsp/tract/areaFunction';
import { formants } from '../src/dsp/tract/acoustics';
import { ARTICULATOR_RANGES, DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, Articulators } from '../src/dsp/tract/types';
import { PHONEMES, IPA_EXTRA, VOWELS, GLIDING, CONSONANTS, ASPIRATED, GESTURES } from '../src/dsp/speech/phonemes';
import type { Phone } from '../src/dsp/speech/g2p';
import { parseIpa } from '../src/dsp/speech/g2p';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { GUIDE, guideFor, PLACES } from '../src/ui/tutor/guide';
import { IPA_SECTIONS, IPA_SOUNDS, IPA_MARKS, IPA_PULMONIC, IPA_VOWELS, IPA_LANGUAGES, ipaSound, ipaSection } from '../src/ui/tutor/ipa';

/** The posture of a sound in a neutral mouth: what it does not control rests as for the vowel of "about". */
const posture = (ipa: string): Articulators => ({ ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...PHONEMES[ipa].art });

/** The narrowest passage of a posture above the larynx: its area (cm²), where it is (cm from the glottis), in which region, and how much of it lies beside the tongue. */
function constriction(ipa: string): { area: number; at: number; region: 'pharynx' | 'velar' | 'front' | 'slit'; lateral: number; length: number } {
  const g = computeGeometry(posture(ipa), DEFAULT_ANATOMY, DEFAULT_TEETH);
  let best = { area: Infinity, at: 0, region: 'front' as 'pharynx' | 'velar' | 'front' | 'slit', lateral: 0, length: g.length };
  for (let i = 0; i <= g.lastRay; i++) {
    if (g.s[i] < 2.6) continue;
    const h = g.hits[i], sc = g.rays[i].sc;
    if (h.area < best.area) best = { area: h.area, at: g.s[i], region: sc < SC_PHARYNX ? 'pharynx' : sc < SC_FRONT ? 'velar' : 'front', lateral: h.lateral, length: g.length };
  }
  if (g.slit.area < best.area) best = { area: g.slit.area, at: g.teethPos, region: 'slit', lateral: 0, length: g.length };
  return best;
}

/** The first two formants of a vowel (Hz) and its narrowest passage (cm²). */
function vowel(ipa: string): { f1: number; f2: number; narrowest: number } {
  const a = { ...DEFAULT_ARTICULATORS, ...PHONEMES[ipa].art };
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  const f = formants(sectionsFromGeometry(g), {});
  let narrowest = Infinity;
  for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6) narrowest = Math.min(narrowest, g.hits[i].area);
  return { f1: f[0].f, f2: f[1].f, narrowest };
}

/** The phones of a compact form, or null if a character of it is not a symbol of the model. */
function strict(src: string): Phone[] | null {
  const ps = compactPhones(src);
  const plain = src.normalize('NFD').replace(/[ːˈ~̃]/g, '');
  return ps.map((p) => p.ipa).join('') === plain ? ps : null;
}
const says = (ps: Phone[], sound: string) => ps.some((p) => PHONEMES[p.ipa] === PHONEMES[sound]);
const finite = (ps: Phone[]) => buildScore(ps, { lang: 'hi' }).frames.every((f) => Number.isFinite(f.f0) && Number.isFinite(f.abduction) && Object.values(f.art!).every(Number.isFinite));

const section = (id: string) => IPA_SECTIONS.find((s) => s.id === id)!.sounds.map((s) => s.symbol);
const sorted = (list: string[]) => [...list].sort();
/** writing that a reader of English can read without help: the Latin letters, with their marks and the phonetic ones */
const LATIN = /^[\u0000-˿̀-ͯḀ-ỿⱠ-Ɀ’]*$/;
/** sounds so rare that one sure word is better than a second doubtful one */
const ONE_WORD = new Set(['ⱱ', 'ʢ', 'ʡ', 'ɧ', 'ɜ', 'ʛ']);

describe('the chart of the International Phonetic Alphabet', () => {
  it('has every sound once: 59 consonants of the lungs, 28 vowels, the other symbols, clicks, implosives and ejectives', () => {
    const all = IPA_SOUNDS.map((s) => s.symbol);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(IPA_SOUNDS.map((s) => s.name)).size).toBe(all.length);
    const pulmonic = IPA_PULMONIC.flatMap(section);
    expect(sorted(pulmonic)).toEqual(sorted([
      'p', 'b', 't', 'd', 'ʈ', 'ɖ', 'c', 'ɟ', 'k', 'ɡ', 'q', 'ɢ', 'ʔ', 'm', 'ɱ', 'n', 'ɳ', 'ɲ', 'ŋ', 'ɴ', 'ʙ', 'r', 'ʀ', 'ⱱ', 'ɾ', 'ɽ',
      'ɸ', 'β', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'ʂ', 'ʐ', 'ç', 'ʝ', 'x', 'ɣ', 'χ', 'ʁ', 'ħ', 'ʕ', 'h', 'ɦ', 'ɬ', 'ɮ',
      'ʋ', 'ɹ', 'ɻ', 'j', 'ɰ', 'l', 'ɭ', 'ʎ', 'ʟ',
    ]));
    expect(pulmonic.length).toBe(59);
    const vowels = IPA_VOWELS.flatMap(section);
    expect(sorted(vowels)).toEqual(sorted([
      'i', 'y', 'ɨ', 'ʉ', 'ɯ', 'u', 'ɪ', 'ʏ', 'ʊ', 'e', 'ø', 'ɘ', 'ɵ', 'ɤ', 'o', 'ə', 'ɛ', 'œ', 'ɜ', 'ɞ', 'ʌ', 'ɔ', 'æ', 'ɐ', 'a', 'ɶ', 'ɑ', 'ɒ',
    ]));
    expect(vowels.length).toBe(28);
    expect(sorted(section('other'))).toEqual(sorted(['ʍ', 'w', 'ɥ', 'ʜ', 'ʢ', 'ʡ', 'ɕ', 'ʑ', 'ɺ', 'ɧ', 'ts', 'dz', 'tʃ', 'dʒ', 'tɕ', 'dʑ', 'ʈʂ', 'ɖʐ']));
    expect(sorted(section('non-pulmonic'))).toEqual(sorted(['ʘ', 'ǀ', 'ǃ', 'ǂ', 'ǁ', 'ɓ', 'ɗ', 'ʄ', 'ɠ', 'ʛ', 'pʼ', 'tʼ', 'kʼ', 'sʼ']));
    expect(all.length).toBe(59 + 28 + 18 + 14);
    for (const s of IPA_SECTIONS) { expect(s.title.length, s.id).toBeGreaterThan(3); expect(s.blurb.length, s.id).toBeGreaterThan(20); }
    expect(ipaSound('ʈ')!.name).toBe('voiceless retroflex plosive');
    expect(ipaSection('y')!.id).toBe('vowels-close');
    expect(ipaSound('?')).toBeUndefined();
  });

  it('every sound has a name, plain words, a guide a child can follow, and real words that have it', () => {
    for (const s of IPA_SOUNDS) {
      const at = `[${s.symbol}]`;
      expect(s.name.length, at).toBeGreaterThan(8);
      expect(s.short.length, at).toBeGreaterThan(8);
      expect(s.short.length, at).toBeLessThanOrEqual(90);
      // a guide of its own, not the "listen and copy" given to an unknown sound
      const g = guideFor(s.symbol);
      expect(GUIDE[s.symbol], at).toBeDefined();
      expect(g.hint, at).not.toBe('Listen and copy');
      expect(PLACES[g.place], at).toBeDefined();
      for (const line of [g.hint, g.lips, g.tongue, g.air, g.voice]) { expect(line.length, at).toBeGreaterThan(3); expect(line.length, at).toBeLessThanOrEqual(260); }
      expect(g.like, at).toBeTruthy();
      // the words: from different languages, each with its language, its meaning, and Latin letters if its writing is not
      expect(s.examples.length, at).toBeGreaterThanOrEqual(ONE_WORD.has(s.symbol) ? 1 : 2);
      expect(s.examples.length, at).toBeLessThanOrEqual(4);
      const languages = s.examples.map((e) => e.lang.split('-')[0]);
      expect(new Set(languages).size, at).toBe(languages.length);
      for (const e of s.examples) {
        const word = `${at} ${e.text}`;
        expect(IPA_LANGUAGES[e.lang], word).toBeDefined();
        expect(e.language, word).toBe(IPA_LANGUAGES[e.lang]);
        expect(e.text.trim().length, word).toBeGreaterThan(0);
        expect(e.meaning.trim().length, word).toBeGreaterThan(0);
        if (!LATIN.test(e.text)) expect(e.roman, word).toBeTruthy();
      }
      if (s.carrier) { expect(IPA_LANGUAGES[s.carrier.lang], at).toBeDefined(); expect(s.carrier.text.length, at).toBeGreaterThan(0); }
    }
    // the guide of the tutor's own letters is untouched, and the puffed sounds still derive from the plain ones
    expect(guideFor('p').hint).toBe('Lips together, then pop');
    expect(guideFor('cʰ').air).toContain('puff');
  });

  it('the model says every sound it can; the others are explained and shown on the nearest posture', () => {
    const explained = IPA_SOUNDS.filter((s) => s.sound === null).map((s) => s.symbol);
    // the velar lateral (the model has no way for the air beside the back of the tongue) and the sounds made without the lungs
    expect(sorted(explained)).toEqual(sorted(['ʟ', ...section('non-pulmonic')]));
    for (const s of IPA_SOUNDS) {
      const at = `[${s.symbol}]`;
      expect(PHONEMES[s.show], at).toBeDefined();
      const isVowel = IPA_VOWELS.includes(ipaSection(s.symbol)!.id);
      expect(PHONEMES[s.show].manner === 'vowel', at).toBe(isVowel);
      if (s.sound === null) { expect(s.say, at).toBeNull(); continue; }
      expect(PHONEMES[s.sound], at).toBeDefined();
      expect(s.show, at).toBe(s.sound);
      const ps = strict(s.say!);
      expect(ps, `${at} says ${s.say}`).not.toBeNull();
      expect(says(ps!, s.sound), `${at} says ${s.say}`).toBe(true);
      expect(finite(ps!), `${at} says ${s.say}`).toBe(true);
    }
    // the chart writes the voiced velar stop with its IPA letter; the model keeps the g of the keyboard
    expect(ipaSound('ɡ')!.sound).toBe('g');
    expect(guideFor('ɡ')).toBe(guideFor('g'));
  });

  it('every word the model can say is written in its own sounds, has the sound it shows, and makes a score', () => {
    let words = 0;
    for (const s of IPA_SOUNDS) {
      for (const e of s.examples) {
        if (!e.ipa) continue;
        words++;
        const word = `[${s.symbol}] ${e.text} /${e.ipa}/`;
        const ps = strict(e.ipa);
        expect(ps, word).not.toBeNull();
        if (s.sound) expect(says(ps!, s.sound), word).toBe(true);
        expect(finite(ps!), word).toBe(true);
      }
      // a sound the model cannot make has no word the model could say right
      if (s.sound === null) expect(s.examples.every((e) => !e.ipa), `[${s.symbol}]`).toBe(true);
    }
    expect(words).toBeGreaterThan(300);
  });

  it('explains the marks of length, stress, tone and the common diacritics', () => {
    const symbols = IPA_MARKS.map((m) => m.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const want of ['ː', 'ˈ', 'ˌ', 'ʰ', 'ʷ', 'ʲ', 'ˠ', 'ˤ', 'ʼ', '◌̃', '◌̥', '◌̬', '◌̩', '◌̯', '˥', '˩']) expect(symbols, want).toContain(want);
    for (const m of IPA_MARKS) { expect(m.name.length, m.symbol).toBeGreaterThan(2); expect(m.means.length, m.symbol).toBeGreaterThan(10); expect(m.example.length, m.symbol).toBeGreaterThan(3); }
  });
});

describe('the sounds added to the model for the chart', () => {
  it('stay inside the range of every articulator and leave the older tables as they were', () => {
    const older = { ...VOWELS, ...GLIDING, ...CONSONANTS, ...ASPIRATED, ...GESTURES };
    for (const [k, ph] of Object.entries(IPA_EXTRA)) {
      expect(older[k], k).toBeUndefined();
      expect(PHONEMES[k], k).toBe(ph);
      for (const [key, v] of Object.entries(ph.art)) {
        const [lo, hi] = ARTICULATOR_RANGES[key as keyof Articulators];
        expect(v, `${k} ${key}`).toBeGreaterThanOrEqual(lo);
        expect(v, `${k} ${key}`).toBeLessThanOrEqual(hi);
      }
      if (ph.parts) for (const part of ph.parts) expect(PHONEMES[part], k).toBeDefined();
    }
    for (const [k, ph] of Object.entries(older)) expect(PHONEMES[k], k).toBe(ph);
    expect(Object.keys(VOWELS)).not.toContain('y');
  });

  it('ç typed as one character or as c with a cedilla is the same sound', () => {
    expect(PHONEMES['ç']).toBeDefined();
    expect(PHONEMES['ç']).toBe(PHONEMES['ç']);
    expect(PHONEMES['ç']).not.toBe(PHONEMES.c);
    // the compact form splits the letter from its cedilla before it reads the symbols
    const ps = compactPhones('ça');
    expect(ps.length).toBe(2);
    expect(PHONEMES[ps[0].ipa]).toBe(PHONEMES['ç']);
    expect(guideFor(ps[0].ipa)).toBe(guideFor('ç'));
    // typed between slashes the new sounds are themselves, no longer stand-ins
    expect(parseIpa('çyø').map((p) => PHONEMES[p.ipa].ipa)).toEqual(['ç', 'y', 'ø']);
  });

  it('the palatal stops close on the hard palate, between the contacts of /t/ and /k/; the uvular ones behind /k/', () => {
    const t = constriction('t'), k = constriction('k'), c = constriction('c'), q = constriction('q');
    expect(c.area).toBeLessThan(1e-3);
    expect(constriction('ɟ').area).toBeLessThan(1e-3);
    expect(t.at - c.at).toBeGreaterThan(1.5);
    expect(c.at - k.at).toBeGreaterThan(1.5);
    const G = constriction('ɢ'), N = constriction('ɴ');
    expect(G.area).toBeLessThan(1e-3);
    expect(Math.abs(G.at - q.at)).toBeLessThan(0.05);
    expect(k.at - G.at).toBeGreaterThan(0.3);
    expect(N.area).toBeLessThan(1e-3);
    expect(k.at - N.at).toBeGreaterThan(0.3);
    // the closure of the uvular nasal is still in front of the door to the nose (the junction of the acoustic model)
    const door = Math.round(0.43 * N_SECTIONS) - 1;
    expect(Math.floor((N.at / N.length) * N_SECTIONS)).toBeGreaterThan(door);
    expect(PHONEMES['ɴ'].art.velum).toBeGreaterThan(0.2);
    // the labiodental nasal: the lip as close to the teeth as for /f/, the nose open
    const M = constriction('ɱ');
    expect(M.area).toBeLessThan(0.15);
    expect(M.at).toBeGreaterThan(constriction('s').at);
    expect(PHONEMES['ɱ'].art.velum).toBeGreaterThan(0.2);
    // the epiglottal stop shuts the throat below the place of ħ
    const E = constriction('ʡ');
    expect(E.area).toBeLessThan(1e-3);
    expect(E.region).toBe('pharynx');
    expect(constriction('ħ').at - E.at).toBeGreaterThan(0.8);
  });

  it('the fricatives leave a slit where they are made, the voiced one of a pair a little wider', () => {
    const slit = (ipa: string, lo = 0.08, hi = 0.3) => { const c = constriction(ipa); expect(c.area, ipa).toBeGreaterThan(lo); expect(c.area, ipa).toBeLessThan(hi); return c; };
    // the two lips
    const phi = slit('ɸ'), beta = slit('β');
    expect(phi.region).toBe('front');
    expect(phi.at).toBeGreaterThan(constriction('θ').at);
    expect(beta.area).toBeGreaterThan(phi.area);
    // the palate: ɕ behind ʃ, ç behind ɕ, all in front of the closure of c
    const sh = constriction('ʃ'), ci = slit('ɕ', 0.05, 0.2), ch = slit('ç', 0.08, 0.2), jj = slit('ʝ');
    expect(sh.at).toBeGreaterThan(ci.at);
    expect(ci.at).toBeGreaterThan(ch.at);
    expect(ch.at).toBeGreaterThan(constriction('c').at);
    expect(jj.area).toBeGreaterThan(ch.area);
    expect(constriction('ʑ').area).toBeCloseTo(ci.area, 6);
    expect(constriction('ʐ').at).toBeCloseTo(constriction('ʂ').at, 6);
    // the uvula: behind the place of x, above that of ħ
    const x = constriction('x'), hh = constriction('ħ'), chi = slit('χ'), rr = slit('ʁ');
    expect(chi.at).toBeLessThan(x.at - 1);
    expect(chi.at).toBeGreaterThan(hh.at + 1);
    expect(rr.area).toBeGreaterThan(chi.area);
    expect(Math.abs(constriction('ʀ').at - chi.at)).toBeLessThan(0.2);
    // the epiglottis: lower in the throat than ħ
    const H = slit('ʜ', 0.08, 0.25);
    expect(H.region).toBe('pharynx');
    expect(hh.at - H.at).toBeGreaterThan(0.8);
    expect(constriction('ʢ').area).toBeGreaterThan(H.area);
    // the sides of the tongue: the tip closed as for /l/, the hiss past the margins
    const l = constriction('l'), ll = slit('ɬ', 0.08, 0.25), lz = slit('ɮ');
    expect(ll.lateral).toBeCloseTo(ll.area, 6);
    expect(lz.area).toBeGreaterThan(ll.area);
    expect(l.area).toBeGreaterThan(lz.area);
    expect(Math.abs(ll.at - constriction('t').at)).toBeLessThan(1);
    // voiceless w and the Swedish sj keep their lips round
    expect(PHONEMES['ʍ'].voiced).toBe(false);
    expect(slit('ɧ').region).toBe('velar');
    expect(PHONEMES['ɧ'].art.lipRound).toBeGreaterThan(0.5);
    // the breathy h is a glottal sound with the voice on
    expect(PHONEMES['ɦ'].manner).toBe('glottal');
    expect(PHONEMES['ɦ'].voiced).toBe(true);
    expect(PHONEMES['ɦ'].abduction).toBeLessThan(PHONEMES.h.abduction);
  });

  it('the approximants and laterals are open enough not to hiss, where they are made', () => {
    const rt = constriction('ʈ');
    const r = constriction('ɻ');
    expect(r.area).toBeGreaterThan(0.2); expect(r.area).toBeLessThan(0.45);
    expect(Math.abs(r.at - rt.at)).toBeLessThan(0.3);
    const w = constriction('ɰ');
    expect(w.area).toBeGreaterThan(constriction('ɣ').area);
    expect(w.area).toBeLessThan(0.6);
    expect(w.region).toBe('velar');
    const u = constriction('ɥ');
    expect(u.area).toBeGreaterThan(0.15);
    expect(PHONEMES['ɥ'].art.lipRound).toBeGreaterThan(0.5);
    expect(PHONEMES['ɥ'].art.tongueX).toBeCloseTo(PHONEMES.j.art.tongueX!, 6);
    // the retroflex lateral: the curled tip closes the middle where ʈ does, the air passes its sides
    const g = computeGeometry(posture('ɭ'), DEFAULT_ANATOMY, DEFAULT_TEETH);
    const contact = g.hits.map((h, i) => ({ h, s: g.s[i] })).filter(({ h, s }, i) => i <= g.lastRay && s > 11 && h.d <= 0);
    expect(contact.length).toBeGreaterThan(0);
    for (const { h, s } of contact) { expect(h.lateral).toBeGreaterThan(0.3); expect(Math.abs(s - rt.at)).toBeLessThan(0.5); }
    expect(constriction('ɭ').area).toBeGreaterThan(0.25);
    // the trills the model cannot flutter hold their place with the voice on
    for (const k of ['ʙ', 'ʀ']) { expect(PHONEMES[k].voiced).toBe(true); expect(constriction(k).area).toBeGreaterThan(0.1); expect(constriction(k).area).toBeLessThan(0.3); }
    expect(constriction('ʙ').at).toBeGreaterThan(constriction('θ').at);
    // the affricates are a stop let go into the hiss of the same place
    for (const [k, stop, hiss] of [['tɕ', 't', 'ɕ'], ['dʑ', 'd', 'ʑ'], ['ʈʂ', 'ʈ', 'ʂ'], ['ɖʐ', 'ɖ', 'ʐ']]) {
      expect(PHONEMES[k].manner).toBe('affricate');
      expect(PHONEMES[k].parts).toEqual([stop, hiss]);
      expect(PHONEMES[k].voiced).toBe(PHONEMES[hiss].voiced);
    }
  });

  it('the new vowels sit where the chart puts them', () => {
    const F = Object.fromEntries(['i', 'ɪ', 'e', 'ɛ', 'æ', 'a', 'ɑ', 'ɔ', 'o', 'u', 'ə', 'ʌ', ...Object.keys(IPA_EXTRA).filter((k) => IPA_EXTRA[k].manner === 'vowel')].map((k) => [k, vowel(k)]));
    // no new vowel is so narrow that it would hiss
    for (const k of Object.keys(IPA_EXTRA)) if (IPA_EXTRA[k].manner === 'vowel') expect(F[k].narrowest, k).toBeGreaterThan(0.2);
    // front rounded: the tongue of the front vowel behind rounded lips, which lower the second formant
    for (const [round, plain] of [['y', 'i'], ['ʏ', 'ɪ'], ['ø', 'e'], ['œ', 'ɛ'], ['ɶ', 'æ']]) {
      const r = PHONEMES[round].art, p = PHONEMES[plain].art;
      expect(Math.abs(r.tongueX! - p.tongueX!), round).toBeLessThan(0.25);
      expect(Math.abs(r.tongueY! - p.tongueY!), round).toBeLessThan(0.15);
      expect(r.tongueX!, round).toBeGreaterThan(0.5);
      expect(r.lipRound!, round).toBeGreaterThanOrEqual(0.5);
      expect(r.lipRound!, round).toBeGreaterThan(p.lipRound! + 0.4);
      expect(F[round].f2, round).toBeLessThan(F[plain].f2 * 0.93);
      expect(Math.abs(F[round].f1 / F[plain].f1 - 1), round).toBeLessThan(0.15);
    }
    // back unrounded: the tongue of the back vowel behind flat lips, which raise it
    for (const [flat, round] of [['ɯ', 'u'], ['ɤ', 'o']]) {
      expect(PHONEMES[flat].art.lipRound, flat).toBe(0);
      expect(Math.abs(PHONEMES[flat].art.tongueX! - PHONEMES[round].art.tongueX!), flat).toBeLessThan(0.25);
      expect(F[flat].f2, flat).toBeGreaterThan(F[round].f2 * 1.25);
      expect(Math.abs(F[flat].f1 / F[round].f1 - 1), flat).toBeLessThan(0.2);
    }
    // central: between front and back, the rounded one of each pair lower in its second formant
    for (const [flat, round] of [['ɨ', 'ʉ'], ['ɘ', 'ɵ'], ['ɜ', 'ɞ']]) {
      expect(F[flat].f2, flat).toBeLessThan(F.i.f2);
      expect(F[round].f2, round).toBeGreaterThan(F.u.f2);
      expect(F[round].f2, round).toBeLessThan(F[flat].f2);
      expect(PHONEMES[round].art.lipRound!, round).toBeGreaterThan(PHONEMES[flat].art.lipRound! + 0.4);
    }
    expect(F['ɨ'].f2).toBeGreaterThan(F['ɯ'].f2);
    // heights: close, close-mid, open-mid, near-open, by the first formant
    expect(F['ɨ'].f1).toBeLessThan(F['ɘ'].f1);
    expect(F['ɘ'].f1).toBeLessThan(F['ɜ'].f1);
    expect(F['ɜ'].f1).toBeLessThan(F['ɐ'].f1);
    expect(F['ʉ'].f1).toBeLessThan(F['ɵ'].f1);
    expect(F['ɵ'].f1).toBeLessThan(F['ɞ'].f1);
    expect(F.y.f1).toBeLessThan(F['ø'].f1);
    expect(F['ø'].f1).toBeLessThan(F['œ'].f1);
    expect(F['œ'].f1).toBeLessThan(F['ɶ'].f1);
    for (const close of ['y', 'ɨ', 'ʉ', 'ɯ']) expect(F[close].f1, close).toBeLessThan(360);
    expect(Math.abs(F['ɐ'].f2 / F['ə'].f2 - 1)).toBeLessThan(0.12);
    expect(F['ɐ'].f1).toBeGreaterThan(F['ə'].f1 * 1.2);
    // the open back rounded vowel: between ɑ and ɔ
    expect(F['ɒ'].f1).toBeGreaterThan(F['ɔ'].f1);
    expect(F['ɒ'].f1).toBeLessThan(F['ɑ'].f1);
    expect(F['ɒ'].f2).toBeLessThan(F['ɑ'].f2);
    expect(PHONEMES['ɒ'].art.lipRound!).toBeGreaterThan(0.4);
  });

  it('they sound: a front rounded vowel, the uvular and lateral hisses, the uvular nasal through the nose', () => {
    const fs = 48000;
    const rms = (x: Float32Array, a: number, b: number) => { let s = 0, n = 0; for (let i = Math.max(0, Math.floor(a * fs)); i < Math.min(x.length, Math.floor(b * fs)); i++) { s += x[i] * x[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
    for (const [say, sound, least] of [['yː', 'y', 0.01], ['aχa', 'χ', 0.004], ['aɬa', 'ɬ', 0.004], ['aɴa', 'ɴ', 0.01], ['ɕa', 'ɕ', 0.004], ['aʁa', 'ʁ', 0.01]] as const) {
      const sc = buildScore(compactPhones(say), { lang: 'hi' });
      const r = renderOffline(defaultParams(), sc.duration + 0.3, fs, sc);
      for (const v of r.out) expect(Number.isFinite(v)).toBe(true);
      const seg = sc.phones.find((p) => p.ipa === sound)!;
      expect(rms(r.out, seg.t0, seg.t1), say).toBeGreaterThan(least);
      expect(rms(r.out, 0, sc.duration), say).toBeGreaterThan(0.005);
    }
  });
});
