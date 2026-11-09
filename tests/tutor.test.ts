import { describe, it, expect } from 'vitest';
import { computeGeometry, SC_PHARYNX, SC_FRONT } from '../src/dsp/tract/geometry';
import { DEFAULT_ANATOMY, DEFAULT_ARTICULATORS, DEFAULT_TEETH, Articulators } from '../src/dsp/tract/types';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { textToPhones, Phone } from '../src/dsp/speech/g2p';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { TAM_TAU } from '../src/dsp/speech/tam';
import { VoiceEngine, renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { ALPHABETS, TUTOR_LANGS } from '../src/ui/tutor/letters';
import { GUIDE, guideFor, PLACES } from '../src/ui/tutor/guide';

/** The narrowest passage of a phoneme's posture: its area (cm²), where it is (cm from the glottis) and in which region. */
function constriction(ipa: string): { area: number; at: number; region: 'pharynx' | 'velar' | 'front' | 'slit' } {
  const a: Articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...PHONEMES[ipa].art };
  const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
  let best = { area: Infinity, at: 0, region: 'front' as 'pharynx' | 'velar' | 'front' | 'slit' };
  for (let i = 0; i <= g.lastRay; i++) {
    if (g.s[i] < 2.6) continue;
    const h = g.hits[i], sc = g.rays[i].sc;
    if (h.area < best.area) best = { area: h.area, at: g.s[i], region: sc < SC_PHARYNX ? 'pharynx' : sc < SC_FRONT ? 'velar' : 'front' };
  }
  if (g.slit.area < best.area) best = { area: g.slit.area, at: g.teethPos, region: 'slit' };
  return best;
}

const show = (ps: Phone[]) => ps.map((p) => p.ipa + (p.long ? 'ː' : '') + (p.nasal ? '~' : '')).join(' ');

describe('the sounds of Arabic, Urdu and Hindi', () => {
  it('the retroflexes close behind the alveolar contact of /t/, the uvular behind the velar contact of /k/', () => {
    const t = constriction('t'), rt = constriction('ʈ'), k = constriction('k'), q = constriction('q');
    expect(rt.area).toBeLessThan(1e-3);
    expect(t.at - rt.at).toBeGreaterThan(0.4);
    expect(constriction('ɖ').area).toBeLessThan(1e-3);
    expect(constriction('ɳ').area).toBeLessThan(1e-3);
    expect(q.area).toBeLessThan(1e-3);
    expect(k.at - q.at).toBeGreaterThan(0.3);
  });
  it('the fricatives leave a slit where they are made: ʂ at the palate, x at the velum, ħ in the pharynx', () => {
    const rs = constriction('ʂ');
    expect(rs.area).toBeGreaterThan(0.08); expect(rs.area).toBeLessThan(0.3); expect(rs.region).toBe('front');
    const x = constriction('x');
    expect(x.area).toBeGreaterThan(0.08); expect(x.area).toBeLessThan(0.25); expect(x.region).toBe('velar');
    expect(constriction('ɣ').area).toBeGreaterThan(x.area);
    const h = constriction('ħ');
    expect(h.area).toBeGreaterThan(0.08); expect(h.area).toBeLessThan(0.25); expect(h.region).toBe('pharynx');
    const ayn = constriction('ʕ');
    expect(ayn.area).toBeGreaterThan(h.area); expect(ayn.region).toBe('pharynx');
  });
  it('the emphatics keep their front slit or contact and narrow the pharynx behind it', () => {
    const s = constriction('s'), sE = constriction('sˤ');
    expect(sE.area).toBeGreaterThan(0.05); expect(sE.area).toBeLessThan(0.2);
    expect(sE.at).toBeGreaterThan(s.at - 1);
    const a: Articulators = { ...DEFAULT_ARTICULATORS, ...PHONEMES['ə'].art, ...PHONEMES['sˤ'].art };
    const g = computeGeometry(a, DEFAULT_ANATOMY, DEFAULT_TEETH);
    let phar = Infinity;
    for (let i = 0; i <= g.lastRay; i++) if (g.s[i] >= 2.6 && g.rays[i].sc < SC_PHARYNX) phar = Math.min(phar, g.hits[i].area);
    expect(phar).toBeLessThan(0.5);
    expect(constriction('tˤ').area).toBeLessThan(1e-3);
  });
  it('ʋ is a labiodental passage, wider than v', () => {
    const v = constriction('ʋ');
    expect(v.area).toBeGreaterThan(constriction('v').area);
    expect(v.area).toBeLessThan(0.5);
  });
});

describe('Devanagari, Arabic and Urdu script to phones', () => {
  it('Hindi: inherent schwa, its deletion, matras, anusvara, chandrabindu, nukta, geminates', () => {
    expect(show(textToPhones('कमल', 'hi'))).toBe('k ə m ə l');
    expect(show(textToPhones('आम', 'hi'))).toBe('aː m');
    expect(show(textToPhones('हाथी', 'hi'))).toBe('h aː tʰ iː');
    expect(show(textToPhones('ठंडा', 'hi'))).toBe('ʈʰ ə ɳ ɖ aː');
    expect(show(textToPhones('माँ', 'hi'))).toBe('m aː~');
    expect(show(textToPhones('हंस', 'hi'))).toBe('h ə~ s');
    expect(show(textToPhones('उल्लू', 'hi'))).toBe('ʊ lː uː');
    expect(show(textToPhones('समझना', 'hi'))).toBe('s ə m ə dʒʱ n aː');
    expect(show(textToPhones('पहाड़', 'hi'))).toBe('p ə h aː ɽ');
    expect(show(textToPhones('क़लम', 'hi'))).toBe('q ə l ə m');
    // "kyā" at the start asks yes or no (the melody rises); a question word anywhere else makes it fall
    const yn = textToPhones('क्या आप ठीक हैं?', 'hi');
    expect(yn.at(-1)!.question).toBe(true);
    expect(yn.at(-1)!.whQuestion).toBeFalsy();
    expect(textToPhones('आप कैसे हैं?', 'hi').at(-1)!.whQuestion).toBe(true);
  });
  it('Arabic: the vowel marks, long vowels, shadda, the article and its sun letters, hamza', () => {
    expect(show(textToPhones('بَيْت', 'ar'))).toBe('b a j t');
    expect(show(textToPhones('شَمْس', 'ar'))).toBe('ʃ a m s');
    expect(show(textToPhones('قَمَر', 'ar'))).toBe('q a m a r');
    expect(show(textToPhones('تُفَّاح', 'ar'))).toBe('t u fː aː ħ');
    expect(show(textToPhones('الشَّمْس', 'ar'))).toBe('a ʃː a m s');
    expect(show(textToPhones('القمر', 'ar'))).toBe('a l q a m a r');
    expect(show(textToPhones('ماء', 'ar'))).toBe('m aː ʔ');
    expect(show(textToPhones('ضِفْدَع', 'ar'))).toBe('dˤ i f d a ʕ');
    expect(show(textToPhones('مَدْرَسَة', 'ar'))).toBe('m a d r a s a');
  });
  it('Urdu: its own letters, aspiration with do-chashmī he, nūn ghunna, final he, clusters, common words', () => {
    expect(show(textToPhones('پانی', 'ur'))).toBe('p aː n iː');
    expect(show(textToPhones('ٹماٹر', 'ur'))).toBe('ʈ ə m aː ʈ ə r');
    expect(show(textToPhones('گھر', 'ur'))).toBe('gʱ ə r');
    expect(show(textToPhones('ماں', 'ur'))).toBe('m aː~');
    expect(show(textToPhones('چاند', 'ur'))).toBe('tʃ aː n d');
    expect(show(textToPhones('دروازہ', 'ur'))).toBe('d ə r ʋ aː z aː');
    expect(show(textToPhones('پھول', 'ur'))).toBe('pʰ oː l');
    expect(show(textToPhones('کوئی', 'ur'))).toBe('k oː iː');
    expect(show(textToPhones('گائے', 'ur'))).toBe('g aː eː');
    expect(show(textToPhones('میں', 'ur'))).toBe('m ɛː~');
    const q = textToPhones('آپ کیسے ہیں؟', 'ur');
    expect(q.at(-1)!.question).toBe(true);
    expect(q.at(-1)!.whQuestion).toBe(true);
    expect(textToPhones('کیا آپ ٹھیک ہیں؟', 'ur').at(-1)!.whQuestion).toBeFalsy();
  });
  it('the compact form of the tutor: long and nasal vowels, aspirates, stress', () => {
    const ps = compactPhones('tʃʰətrˈiː');
    expect(ps.map((p) => p.ipa)).toEqual(['tʃʰ', 'ə', 't', 'r', 'i']);
    expect(ps[4].long).toBe(true);
    expect(ps[4].stress).toBe(true);
    const n = compactPhones('mãː');
    expect(n[1].nasal).toBe(true); expect(n[1].long).toBe(true);
  });
});

describe('aspiration, murmur and slow motion in the score', () => {
  it('an aspirated stop is released into a long puff, a murmured one into breathy voice', () => {
    const asp = buildScore(compactPhones('pʰa'), { lang: 'hi' });
    const [stop, vowel] = asp.phones;
    expect(stop.ipa).toBe('pʰ');
    // the folds stay apart until the vowel: the voice onset time is long
    const puff = asp.frames.filter((f) => f.t > stop.t1 - 0.06 && f.t < stop.t1 - 0.01);
    expect(puff.length).toBeGreaterThan(3);
    for (const f of puff) expect(f.abduction).toBeGreaterThanOrEqual(0.45);
    expect(vowel.t0 - asp.phones[0].t0).toBeGreaterThan(0.12);
    const plain = buildScore(compactPhones('pa'), { lang: 'hi' });
    expect(asp.phones[0].t1 - asp.phones[0].t0).toBeGreaterThan(plain.phones[0].t1 - plain.phones[0].t0 + 0.04);
    const mur = buildScore(compactPhones('gʱar'), { lang: 'hi' });
    const g = mur.phones[0];
    const sigh = mur.frames.filter((f) => f.t > g.t1 - 0.05 && f.t < g.t1 - 0.01);
    expect(sigh.length).toBeGreaterThan(2);
    for (const f of sigh) { expect(f.abduction).toBeGreaterThan(0.2); expect(f.abduction).toBeLessThan(0.4); expect(f.rd ?? 0).toBeGreaterThan(0.5); }
  });
  it('a nasal vowel opens the velum', () => {
    const sc = buildScore(compactPhones('mãː'), { lang: 'ur' });
    const v = sc.phones.find((p) => p.ipa === 'a')!;
    const mid = sc.frames.find((f) => f.t >= 0.5 * (v.t0 + v.t1))!;
    expect(mid.art!.velum).toBeGreaterThan(0.2);
    const oral = buildScore(compactPhones('baː'), { lang: 'ur' });
    const v2 = oral.phones.find((p) => p.ipa === 'a')!;
    expect(oral.frames.find((f) => f.t >= 0.5 * (v2.t0 + v2.t1))!.art!.velum).toBeLessThan(0.05);
  });
  it('slow motion stretches the whole plan and tells the engine to move as slowly', () => {
    const ph = compactPhones('ʈʰaː');
    const real = buildScore(ph, { lang: 'hi' }), slow = buildScore(ph, { lang: 'hi', timeScale: 4 });
    expect(slow.duration / real.duration).toBeGreaterThan(3.6);
    expect(slow.duration / real.duration).toBeLessThan(4.4);
    expect(slow.timeScale).toBe(4);
    expect(real.timeScale).toBeUndefined();
    const e = new VoiceEngine(48000);
    const tam = (e as unknown as { tam: Record<string, { tau: number }> }).tam;
    e.playScore(slow);
    expect(tam.jaw.tau).toBeCloseTo(TAM_TAU.jaw * 4, 6);
    expect(tam.tipY.tau).toBeCloseTo(TAM_TAU.tipY * 4, 6);
    e.stopScore();
    expect(tam.jaw.tau).toBeCloseTo(TAM_TAU.jaw, 6);
  });
  it('the new sounds render without a glitch', () => {
    for (const [w, l] of [['घर', 'hi'], ['ٹھنڈا', 'ur'], ['ضِفْدَع', 'ar'], ['माँ', 'hi'], ['خُبْز', 'ar']] as const) {
      const sc = buildScore(textToPhones(w, l), { lang: l });
      const r = renderOffline(defaultParams(), sc.duration + 0.3, 48000, sc);
      let rms = 0;
      for (const x of r.out) { expect(Number.isFinite(x)).toBe(true); rms += x * x; }
      expect(Math.sqrt(rms / r.out.length), w).toBeGreaterThan(0.005);
    }
  });
});

describe('the letter tutor', () => {
  it('every letter has a sound of the model, a guide, and a word that says it', () => {
    for (const lang of TUTOR_LANGS) {
      const al = ALPHABETS[lang];
      const seen = new Set<string>();
      for (const l of al.letters) {
        const at = `${lang} ${l.glyph} (${l.roman})`;
        expect(l.sound === 'ã' || !!PHONEMES[l.sound], at).toBe(true);
        expect(seen.has(l.glyph), at).toBe(false);
        seen.add(l.glyph);
        const g = guideFor(l.sound);
        expect(PLACES[g.place], at).toBeDefined();
        expect(g.lips.length && g.tongue.length && g.air.length && g.voice.length, at).toBeTruthy();
        const word = compactPhones(l.word.ipa);
        expect(word.length, at).toBeGreaterThan(0);
        // the word shows the letter's sound (a letter with a note of its own may show its other reading)
        if (!l.note) expect(word.some((p) => p.ipa === l.sound || (l.sound === 'ã' && p.nasal)), at).toBe(true);
        if (l.say) expect(compactPhones(l.say).length, at).toBeGreaterThan(0);
      }
    }
    expect(ALPHABETS.ar.letters.length).toBeGreaterThanOrEqual(28);
    expect(ALPHABETS.ur.letters.length).toBeGreaterThanOrEqual(38);
    expect(ALPHABETS.hi.letters.length).toBeGreaterThanOrEqual(44);
  });
  it('the guide covers every consonant and vowel the tutor uses, in plain words', () => {
    const sounds = new Set(TUTOR_LANGS.flatMap((l) => ALPHABETS[l].letters.map((x) => x.sound)));
    for (const s of sounds) {
      const base = s.replace(/[ʰʱ]$/, '');
      expect(GUIDE[base], s).toBeDefined();
    }
    for (const g of Object.values(GUIDE)) {
      for (const line of [g.lips, g.tongue, g.air, g.voice]) expect(line.length).toBeLessThanOrEqual(260);
    }
    expect(guideFor('kʰ').air).toContain('puff');
    expect(guideFor('gʱ').air).toContain('breathy');
  });
});
