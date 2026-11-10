import { describe, it, expect } from 'vitest';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { renderOffline } from '../src/dsp/engine/engine';
import { defaultParams } from '../src/dsp/engine/params';
import { analyse, judge, BY_EYE, Finding, Heard, Report } from '../src/ui/tutor/listen';

const FS = 48000;

/** A deterministic random number, so that the noise of a test is the same every time. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * What the model says for a letter's sound, as the tutor plays it, with
 * 0.3 s of silence before it and 0.4 s after: the learner's recording, with
 * the model as the learner. `noise` adds white noise that many dB below the
 * peak of the sound; `gain` scales everything.
 *
 * One thing is cut. The model starts every utterance with a few hundredths
 * of a second of voice of its own, before the first sound has taken its
 * shape: before a stop it is a faint blip well ahead of the burst, before a
 * voiceless hiss a voiced on-glide ("ᵊsa") that no speaker makes. Before
 * those sounds it is silenced (a nasal, a lateral, a vowel start with their
 * own voice anyway).
 */
const renders = new Map<string, Float32Array>();
function rendered(compact: string): Float32Array {
  let out = renders.get(compact);
  if (out) return out;
  const ps = compactPhones(compact);
  const vi = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  if (vi >= 0) ps[vi].stress = true;
  ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  const sc = buildScore(ps, { lang: 'ur', f0: 120, ps: 8, rate: 0.9 });
  const r = renderOffline(defaultParams(), sc.duration + 0.4, FS, sc).out;
  const first = PHONEMES[sc.phones[0].ipa];
  if (first && ((!first.voiced && (first.manner === 'fricative' || first.manner === 'glottal')) || first.manner === 'stop' || first.manner === 'affricate')) {
    const cut = Math.round((sc.phones[0].t0 + 0.025) * FS), fade = Math.round(0.02 * FS);
    for (let i = 0; i < cut; i++) r[i] = 0;
    for (let i = 0; i < fade; i++) r[cut + i] *= i / fade;
  }
  out = new Float32Array(Math.round(0.3 * FS) + r.length);
  out.set(r, Math.round(0.3 * FS));
  renders.set(compact, out);
  return out;
}
function say(compact: string, opts: { gain?: number; noise?: number; seed?: number; fs?: number } = {}): Float32Array {
  let out = rendered(compact).slice();
  if (opts.noise !== undefined) {
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    const sd = (peak / Math.SQRT2) * 10 ** (opts.noise / 20);
    const rnd = random(opts.seed ?? 7);
    for (let i = 0; i < out.length; i++) out[i] += sd * Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());
  }
  if (opts.gain !== undefined) for (let i = 0; i < out.length; i++) out[i] *= opts.gain;
  if (opts.fs && opts.fs !== FS) {
    // another microphone rate, by straight-line interpolation
    const n = Math.floor((out.length * opts.fs) / FS);
    const res = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * FS) / opts.fs, k = Math.floor(x), f = x - k; res[i] = out[k] * (1 - f) + (out[Math.min(out.length - 1, k + 1)] ?? 0) * f; }
    out = res;
  }
  return out;
}

const cache = new Map<string, Heard>();
/** What the listener decodes when the model says `compact` (kept: a render takes a moment). */
function hear(compact: string): Heard {
  let h = cache.get(compact);
  if (!h) { h = analyse(say(compact), FS); cache.set(compact, h); }
  return h;
}
/** The model says `said`; the letter asked for `sound`, said as `want`. */
const verdict = (said: string, sound: string, want: string): Report => judge(hear(said), { sound, say: want });
const finding = (r: Report, id: string): Finding => {
  const f = r.findings.find((x) => x.id === id);
  if (!f) throw new Error(`no finding "${id}" in: ${r.findings.map((x) => x.id).join(', ')}`);
  return f;
};
/** every finding that could be told is right */
const allRight = (r: Report) => r.findings.every((f) => f.ok !== false) && r.findings.some((f) => f.ok === true);

describe('the listener decodes how a sound was said', () => {
  it('finds the sound in the recording, its tracks frame by frame', () => {
    const h = hear('pa');
    expect(h.silent).toBe(false);
    expect(h.hop).toBe(0.01);
    // the model's p pops 0.445 s into the recording, and its vowel ends near 0.8 s
    expect(h.t0).toBeGreaterThan(0.4); expect(h.t0).toBeLessThan(0.47);
    expect(h.t1).toBeGreaterThan(0.7); expect(h.t1).toBeLessThan(0.95);
    expect(h.level.length).toBe(h.voiced.length);
    expect(h.hiss.length).toBe(h.voiced.length);
    expect(Math.max(...h.level)).toBeCloseTo(1, 5);
    for (const v of [...h.level, ...h.hiss]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    // the voice is on in the vowel, off in the silence before
    expect(h.voiced[55]).toBe(true);
    expect(h.voiced[20]).toBe(false);
    expect(h.pitch!).toBeGreaterThan(95); expect(h.pitch!).toBeLessThan(170);
    expect(h.marks.burst!).toBeGreaterThan(0.43); expect(h.marks.burst!).toBeLessThan(0.46);
    expect(h.marks.vowel![0]).toBeGreaterThan(h.marks.burst!);
  });

  it('a pop, and the voice against it: at once for b d g, late for p t k', () => {
    for (const s of ['pa', 'ta', 'ka', 'ʈa', 'qa', 'tˤa']) {
      const c = hear(s).cues;
      expect(c.burst, s).toBe(true);
      expect(c.vot!, s).toBeGreaterThanOrEqual(0.03);
      expect(c.voicedOnset, s).toBe(false);
    }
    for (const s of ['ba', 'da', 'ga', 'ɖa']) {
      const c = hear(s).cues;
      expect(c.burst, s).toBe(true);
      expect(c.vot!, s).toBeLessThanOrEqual(0.015);
      expect(c.vot!, s).toBeGreaterThanOrEqual(0);
      expect(c.voicedOnset, s).toBe(true);
    }
  });

  it('the puff of the aspirated stops, the breathy sigh of the murmured ones', () => {
    for (const s of ['pa', 'ta', 'ka', 'ba', 'da', 'ga']) {
      const c = hear(s).cues;
      expect(c.aspirated, s).toBe(false);
      expect(c.puff!, s).toBeLessThanOrEqual(0.045);
    }
    for (const s of ['pʰa', 'tʰa', 'kʰa']) {
      const c = hear(s).cues;
      expect(c.aspirated, s).toBe(true);
      expect(c.puff!, s).toBeGreaterThan(0.065);
      expect(c.breathy, s).toBe(false);
      expect(c.voicedOnset, s).toBe(false);
    }
    const sigh = hear('bʱa').cues;
    expect(sigh.aspirated).toBe(true);
    expect(sigh.breathy).toBe(true);
  });

  it('a hiss before the vowel, its voice and its centre: s sharp, sh lower, z with the voice on', () => {
    const s = hear('sa').cues, sh = hear('ʃa').cues, z = hear('za').cues, zh = hear('ʒa').cues;
    for (const c of [s, sh]) { expect(c.frication).toBeGreaterThan(0.08); expect(c.hissVoiced!).toBeLessThanOrEqual(0.3); expect(c.voicedOnset).toBe(false); }
    for (const c of [z, zh]) { expect(c.frication).toBeGreaterThanOrEqual(0.04); expect(c.hissVoiced!).toBeGreaterThanOrEqual(0.7); expect(c.voicedOnset).toBe(true); }
    expect(s.hissCentre!).toBeGreaterThan(5200);
    expect(z.hissCentre!).toBeGreaterThan(5200);
    expect(sh.hissCentre!).toBeLessThan(4300);
    expect(zh.hissCentre!).toBeLessThan(4300);
    expect(s.hissCentre! - sh.hissCentre!).toBeGreaterThan(1200);
    // no hiss before a stop's vowel, nor before a hum's
    expect(hear('ba').cues.frication).toBeLessThan(0.04);
    expect(hear('ma').cues.frication).toBe(0);
  });

  it('a hum: voice on, no burst, no hiss, then the vowel', () => {
    for (const s of ['ma', 'na']) {
      const c = hear(s).cues;
      expect(c.burst, s).toBe(false);
      expect(c.frication, s).toBe(0);
      expect(c.murmur, s).toBeGreaterThanOrEqual(0.05);
      expect(c.nasal, s).toBe(true);
      expect(c.voicedOnset, s).toBe(true);
      expect(c.voiceFirst, s).toBe(true);
    }
    expect(hear('pa').cues.nasal).toBe(false);
    expect(hear('aː').cues.nasal).toBe(false);
  });

  it('the flutter of a rolled r', () => {
    const r = hear('ra').cues;
    expect(r.trill).toBe(true);
    expect(r.taps).toBeGreaterThanOrEqual(2);
    expect(r.burst).toBe(false);
    for (const s of ['la', 'ma', 'aː', 'ba', 'sa']) { expect(hear(s).cues.trill, s).toBe(false); expect(hear(s).cues.taps, s).toBe(0); }
  });

  it('the vowel: open or closed, front or back, long or short', () => {
    const a = hear('aː').cues, i = hear('iː').cues, u = hear('uː').cues, e = hear('ə').cues;
    expect(a.vowel!.f1).toBeGreaterThan(600); expect(a.vowel!.f2).toBeGreaterThan(1000); expect(a.vowel!.f2).toBeLessThan(1700);
    expect(i.vowel!.f1).toBeLessThan(400); expect(i.vowel!.f2).toBeGreaterThan(1900);
    expect(u.vowel!.f1).toBeLessThan(400); expect(u.vowel!.f2).toBeLessThan(1100);
    expect(e.vowel!.f1).toBeGreaterThan(400); expect(e.vowel!.f1).toBeLessThan(620);
    for (const c of [a, i, u]) expect(c.vowelDuration).toBeGreaterThan(0.3);
    expect(e.vowelDuration).toBeLessThan(0.26);
    // the same vowel after a consonant
    expect(hear('ma').cues.vowel!.f1).toBeGreaterThan(600);
  });

  it('silence, and a room with nobody speaking, are silence', () => {
    expect(analyse(new Float32Array(FS * 2), FS).silent).toBe(true);
    expect(analyse(new Float32Array(100), FS).silent).toBe(true);
    const rnd = random(3);
    const room = new Float32Array(FS * 2);
    for (let i = 0; i < room.length; i++) room[i] = 0.01 * (rnd() - 0.5);
    const h = analyse(room, FS);
    expect(h.silent).toBe(true);
    const r = judge(h, { sound: 'b', say: 'ba' });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(0);
    expect(r.findings).toEqual([]);
    expect(r.headline).toMatch(/couldn't hear/);
  });
});

describe('the listener judges it against what the letter asks', () => {
  it('what the model says for a letter is right for that letter', () => {
    const letters: [string, string][] = [
      ['p', 'pa'], ['b', 'ba'], ['t', 'ta'], ['d', 'da'], ['k', 'ka'], ['g', 'ga'], ['ʈ', 'ʈa'], ['ɖ', 'ɖa'], ['q', 'qa'],
      ['pʰ', 'pʰa'], ['tʰ', 'tʰa'], ['kʰ', 'kʰa'], ['bʱ', 'bʱa'],
      ['s', 'sa'], ['z', 'za'], ['ʃ', 'ʃa'], ['ʒ', 'ʒa'], ['tʃ', 'tʃa'], ['dʒ', 'dʒa'],
      ['m', 'ma'], ['n', 'na'], ['l', 'la'], ['r', 'ra'], ['j', 'ja'],
      ['a', 'aː'], ['i', 'iː'], ['u', 'uː'], ['ə', 'ə'],
    ];
    // (the model's b, d, g are silent while the mouth is shut; a speaker of these languages hums
    // there, and without that hum the listener does not vouch for the voice: two stars, not three)
    const noHum = new Set(['b', 'd', 'g', 'ɖ']);
    for (const [sound, s] of letters) {
      const r = verdict(s, sound, s);
      expect(allRight(r), `${s}: ${r.findings.filter((f) => f.ok === false).map((f) => `${f.id}: ${f.got}`).join('; ')}`).toBe(true);
      expect(r.score, s).toBe(100);
      if (noHum.has(sound)) {
        expect(finding(r, 'voice').ok, s).toBeNull();
        expect(r.stars, s).toBe(2);
      } else {
        expect(r.stars, s).toBe(3);
        expect(r.headline, s).toBe('Spot on!');
      }
    }
  });

  it('the voice: p for b is heard, and b is not taken for p', () => {
    // (the model's own b has no hum before its pop: the listener does not vouch for its voice,
    // nor call it wrong; the hum is tried in the next test)
    const right = verdict('ba', 'b', 'ba'), wrong = verdict('pa', 'b', 'ba');
    expect(finding(right, 'voice').ok).toBeNull();
    expect(finding(wrong, 'voice').ok).toBe(false);
    expect(finding(wrong, 'voice').tip).toBeTruthy();
    expect(finding(wrong, 'manner').ok).toBe(true); // it was a pop all the same
    expect(wrong.score).toBeLessThan(right.score);
    expect(wrong.stars).toBeLessThan(3);
    expect(wrong.headline).toMatch(/voice/);
    expect(finding(verdict('ta', 'd', 'da'), 'voice').ok).toBe(false);
    expect(finding(verdict('ka', 'g', 'ga'), 'voice').ok).toBe(false);
    // the other way: without a hum before the pop, the model's b is a p to these languages' ears
    expect(finding(verdict('ba', 'p', 'pa'), 'voice').ok).toBe(true);
    expect(finding(verdict('pa', 'p', 'pa'), 'voice').ok).toBe(true);
  });

  it('a hum before the pop, as Urdu, Hindi and Arabic make their b: the voice leads', () => {
    // the model's b is silent while the lips are shut; a speaker's hums. The hum is added by
    // hand: 90 ms of the first two harmonics, 20 dB below the vowel, up to the burst
    const clean = say('ba');
    const burst = hear('ba').marks.burst!;
    let peak = 0;
    for (const v of clean) peak = Math.max(peak, Math.abs(v));
    const hummed = (level: number) => {
      const out = clean.slice();
      const a = Math.round((burst - 0.09) * FS), b = Math.round(burst * FS), amp = peak * 10 ** (level / 20);
      for (let i = a; i < b; i++) {
        const t = (i - a) / FS, fade = Math.min(1, t / 0.01, (b - i) / (0.003 * FS));
        out[i] += amp * fade * (Math.sin(2 * Math.PI * 120 * t) + 0.5 * Math.sin(2 * Math.PI * 240 * t + 1));
      }
      return out;
    };
    const h = analyse(hummed(-20), FS);
    expect(h.cues.burst).toBe(true);
    expect(h.cues.vot!).toBeLessThan(-0.05);
    expect(h.cues.vot!).toBeGreaterThan(-0.12);
    expect(h.cues.voicedOnset).toBe(true);
    expect(h.cues.nasal).not.toBe(true); // too soft for the hum of an m
    const asB = judge(h, { sound: 'b', say: 'ba' }), asP = judge(h, { sound: 'p', say: 'pa' });
    expect(finding(asB, 'voice').ok).toBe(true);
    expect(finding(asB, 'voice').got).toMatch(/before the pop/);
    expect(finding(asB, 'manner').ok).toBe(true);
    expect(asB.stars).toBe(3);
    // and said for p it is wrong: the voice was on too early
    expect(finding(asP, 'voice').ok).toBe(false);
    expect(asP.stars).toBeLessThan(3);
    expect(asP.score).toBeLessThan(asB.score);
    // a fainter hum (30 dB down) is still heard, and a loud one (10 dB down) is still the hum of a b
    expect(finding(judge(analyse(hummed(-30), FS), { sound: 'p', say: 'pa' }), 'voice').ok).toBe(false);
    const loud = analyse(hummed(-10), FS);
    expect(loud.cues.vot!).toBeLessThan(-0.05);
    expect(finding(judge(loud, { sound: 'b', say: 'ba' }), 'manner').ok).toBe(true);
  });

  it('the puff: plain for aspirated and aspirated for plain are heard', () => {
    expect(finding(verdict('pʰa', 'pʰ', 'pʰa'), 'puff').ok).toBe(true);
    expect(finding(verdict('pa', 'p', 'pa'), 'puff').ok).toBe(true);
    const flat = verdict('pa', 'pʰ', 'pʰa');
    expect(finding(flat, 'puff').ok).toBe(false);
    expect(flat.score).toBeLessThan(100);
    expect(flat.headline).toMatch(/puff/);
    expect(finding(verdict('pʰa', 'p', 'pa'), 'puff').ok).toBe(false);
    expect(finding(verdict('kʰa', 'k', 'ka'), 'puff').ok).toBe(false);
    // the murmured b: a sigh with the voice on; a plain b has no sigh, an aspirated p no voice
    const sigh = verdict('bʱa', 'bʱ', 'bʱa');
    expect(finding(sigh, 'puff').ok).toBe(true);
    expect(finding(sigh, 'voice').ok).toBe(true);
    // (the sigh is voice all through and easily taken for the vowel: a plain b is not called wrong for it, only not right)
    expect(finding(verdict('ba', 'bʱ', 'bʱa'), 'puff').ok).toBeNull();
    expect(verdict('ba', 'bʱ', 'bʱa').stars).toBeLessThan(3);
    expect(finding(verdict('pʰa', 'bʱ', 'bʱa'), 'voice').ok).toBe(false);
    expect(finding(verdict('bʱa', 'b', 'ba'), 'puff').ok).toBe(false);
  });

  it('the hiss: s for sh, sh for s, and the voice of z', () => {
    expect(finding(verdict('sa', 's', 'sa'), 'hiss').ok).toBe(true);
    expect(finding(verdict('ʃa', 'ʃ', 'ʃa'), 'hiss').ok).toBe(true);
    expect(finding(verdict('sa', 'ʃ', 'ʃa'), 'hiss').ok).toBe(false);
    expect(finding(verdict('ʃa', 's', 'sa'), 'hiss').ok).toBe(false);
    expect(finding(verdict('za', 'z', 'za'), 'voice').ok).toBe(true);
    expect(finding(verdict('za', 's', 'sa'), 'voice').ok).toBe(false);
    expect(finding(verdict('sa', 'z', 'za'), 'voice').ok).toBe(false);
    expect(verdict('sa', 'z', 'za').score).toBeLessThan(verdict('za', 'z', 'za').score);
  });

  it('the kind of sound: a pop is not a hiss, a hiss not a pop, a hum neither, a smooth l no rolled r', () => {
    const cases: [string, string, string][] = [
      ['pa', 's', 'sa'], ['ma', 'b', 'ba'], ['ma', 'p', 'pa'], ['ba', 'm', 'ma'], ['sa', 'm', 'ma'], ['ra', 'l', 'la'],
      ['sa', 'a', 'aː'], ['ma', 'a', 'aː'], ['pa', 'a', 'aː'], ['aː', 's', 'sa'], ['ta', 'tʃ', 'tʃa'],
    ];
    for (const [said, sound, want] of cases) {
      const r = verdict(said, sound, want);
      expect(finding(r, 'manner').ok, `${said} for ${want}: ${finding(r, 'manner').got}`).toBe(false);
      expect(finding(r, 'manner').tip, `${said} for ${want}`).toBeTruthy();
      expect(r.stars, `${said} for ${want}`).toBeLessThan(3);
      expect(r.score, `${said} for ${want}`).toBeLessThan(verdict(want, sound, want).score);
    }
    // a smooth l for a rolled r: a single tap at the start of a word leaves no dip to hear, so a
    // missing flutter is not held against the learner; it is only not vouched for
    expect(finding(verdict('la', 'r', 'ra'), 'manner').ok).toBeNull();
    expect(verdict('la', 'r', 'ra').stars).toBeLessThan(3);
    // a bare vowel for a stop: a vowel that starts at once cannot be told from a soft pop, and is not called wrong
    expect(finding(verdict('aː', 'p', 'pa'), 'manner').ok).not.toBe(true);
    expect(verdict('aː', 'p', 'pa').stars).toBeLessThan(3);
    // a hiss said for a stop: no pop, or (where the hiss starts suddenly) a pop with a long hiss after it
    for (const [said, sound, want] of [['ʃa', 't', 'ta'], ['sa', 'p', 'pa']] as const) {
      const hissy = verdict(said, sound, want);
      expect(finding(hissy, 'manner').ok === false || finding(hissy, 'puff').ok === false, said).toBe(true);
      expect(hissy.stars, said).toBeLessThan(3);
    }
  });

  it('the vowel: its quality and its length', () => {
    expect(finding(verdict('aː', 'i', 'iː'), 'vowel').ok).toBe(false);
    expect(finding(verdict('iː', 'a', 'aː'), 'vowel').ok).toBe(false);
    expect(finding(verdict('uː', 'i', 'iː'), 'vowel').ok).toBe(false);
    expect(finding(verdict('iː', 'u', 'uː'), 'vowel').ok).toBe(false);
    expect(finding(verdict('aː', 'u', 'uː'), 'vowel').ok).toBe(false);
    for (const v of ['a', 'i', 'u']) expect(finding(verdict(v + 'ː', v, v + 'ː'), 'length').ok, v).toBe(true);
    // a short vowel held long, a long one cut short
    expect(finding(verdict('aː', 'a', 'a'), 'length').ok).toBe(false);
    expect(finding(verdict('ə', 'ə', 'ə'), 'length').ok).toBe(true);
    // after a consonant the vowel is not the lesson: it is not judged
    expect(verdict('pa', 'p', 'pa').findings.some((f) => f.id === 'vowel')).toBe(false);
  });

  it('says what an ear cannot tell, instead of guessing', () => {
    // a t on the teeth and one curled back, k and q, the heavy letters: the place is for the eye
    for (const [sound, s] of [['ʈ', 'ʈa'], ['ɖ', 'ɖa'], ['q', 'qa'], ['tˤ', 'tˤa'], ['p', 'pa'], ['m', 'ma']] as const) {
      const place = finding(verdict(s, sound, s), 'place');
      expect(place.ok, s).toBeNull();
      expect(place.got, s).toBe(BY_EYE);
      expect(place.tip, s).toBeUndefined();
    }
    // the model's t and its curled ʈ sound alike to this ear: neither is called wrong for the other
    expect(allRight(verdict('ta', 'ʈ', 'ʈa'))).toBe(true);
    expect(allRight(verdict('ka', 'q', 'qa'))).toBe(true);
    // a nasal vowel: the nose cannot be heard
    const nose = finding(judge(hear('aː'), { sound: 'ã', say: 'ãː' }), 'nose');
    expect(nose.ok).toBeNull();
    // a sound after the vowel (the shadda's m, the visarga's breath) is not judged
    const coda = judge(hear('uː'), { sound: 'm', say: 'ʔumː' });
    expect(coda.findings.filter((f) => f.id === 'place').every((f) => f.ok === null)).toBe(true);
    expect(coda.findings.some((f) => f.id === 'place')).toBe(true);
  });

  it('writes in plain words, for a parent to read to a child', () => {
    const reports = [verdict('pa', 'b', 'ba'), verdict('sa', 'ʃ', 'ʃa'), verdict('ba', 'm', 'ma'), verdict('aː', 'i', 'iː'), verdict('pʰa', 'pʰ', 'pʰa'), verdict('ra', 'r', 'ra')];
    for (const r of reports) {
      expect(r.headline.length).toBeGreaterThan(3);
      expect(r.headline.length).toBeLessThan(70);
      for (const f of r.findings) {
        for (const text of [f.title, f.want, f.got, f.tip ?? '']) {
          expect(text, text).not.toMatch(/[^\x20-\x7e]/); // plain letters: no symbols of the model, no pictures
          expect(text.length, text).toBeLessThan(120);
        }
        expect(f.title.split(' ').length).toBeLessThanOrEqual(3);
        if (f.ok !== false) expect(f.tip).toBeUndefined();
      }
    }
  });
});

describe('the listener does not depend on the microphone', () => {
  const letters: [string, string][] = [['p', 'pa'], ['b', 'ba'], ['pʰ', 'pʰa'], ['s', 'sa'], ['ʃ', 'ʃa'], ['z', 'za'], ['m', 'ma'], ['r', 'ra'], ['a', 'aː'], ['i', 'iː'], ['u', 'uː']];
  const oks = (r: Report) => r.findings.map((f) => `${f.id}:${f.ok}`).join(' ');

  it('a quiet recording (a twentieth of the level) is judged the same', () => {
    for (const [sound, s] of letters) {
      const quiet = judge(analyse(say(s, { gain: 0.05 }), FS), { sound, say: s });
      expect(oks(quiet), s).toBe(oks(verdict(s, sound, s)));
      expect(quiet.score, s).toBe(100);
    }
    // and a wrong one is still wrong
    expect(finding(judge(analyse(say('pa', { gain: 0.05 }), FS), { sound: 'b', say: 'ba' }), 'voice').ok).toBe(false);
  });

  it('with the noise of a room (40 dB below the voice) nothing right turns wrong: at most it turns unsure', () => {
    for (const seed of [7, 11, 23]) {
      for (const [sound, s] of letters) {
        const clean = verdict(s, sound, s);
        const noisy = judge(analyse(say(s, { noise: -40, seed }), FS), { sound, say: s });
        expect(noisy.heard.silent, s).toBe(false);
        expect(noisy.heard.snr, s).toBeLessThan(60);
        for (const f of noisy.findings) {
          const was = finding(clean, f.id).ok;
          expect(f.ok === was || f.ok === null, `${s} seed ${seed}: ${f.id} was ${was}, is ${f.ok} (${f.got})`).toBe(true);
        }
        expect(noisy.findings.some((f) => f.ok === false), `${s} seed ${seed}`).toBe(false);
      }
    }
  });

  it('in a noisy room (30 dB below the voice) it says less, and still nothing wrong', () => {
    for (const [sound, s] of letters) {
      const noisy = judge(analyse(say(s, { noise: -30, seed: 5 }), FS), { sound, say: s });
      expect(noisy.heard.silent, s).toBe(false);
      expect(noisy.findings.filter((f) => f.ok === false).map((f) => `${f.id}: ${f.got}`), s).toEqual([]);
    }
  });

  it('with that noise the main findings are still told', () => {
    const noisy = (said: string, sound: string, want: string) => judge(analyse(say(said, { noise: -40 }), FS), { sound, say: want });
    expect(finding(noisy('pa', 'p', 'pa'), 'manner').ok).toBe(true);
    expect(finding(noisy('pa', 'p', 'pa'), 'voice').ok).toBe(true);
    expect(finding(noisy('ba', 'b', 'ba'), 'voice').ok).not.toBe(false);
    expect(finding(noisy('pʰa', 'pʰ', 'pʰa'), 'puff').ok).toBe(true);
    expect(finding(noisy('pa', 'pʰ', 'pʰa'), 'puff').ok).toBe(false);
    expect(finding(noisy('sa', 's', 'sa'), 'hiss').ok).toBe(true);
    expect(finding(noisy('ʃa', 'ʃ', 'ʃa'), 'hiss').ok).toBe(true);
    expect(finding(noisy('sa', 'ʃ', 'ʃa'), 'hiss').ok).toBe(false);
    expect(finding(noisy('za', 's', 'sa'), 'voice').ok).toBe(false);
    expect(finding(noisy('ma', 'm', 'ma'), 'manner').ok).toBe(true);
    expect(finding(noisy('ra', 'r', 'ra'), 'manner').ok).toBe(true);
    expect(finding(noisy('aː', 'a', 'aː'), 'vowel').ok).toBe(true);
    expect(finding(noisy('iː', 'a', 'aː'), 'vowel').ok).toBe(false);
    // p for b: with the noise the late voice is no longer sure, and it says so rather than guess
    expect(finding(noisy('pa', 'b', 'ba'), 'voice').ok).not.toBe(true);
  });

  it('another sampling rate gives the same verdicts', () => {
    for (const [sound, s] of [['p', 'pa'], ['b', 'ba'], ['s', 'sa'], ['ʃ', 'ʃa'], ['m', 'ma'], ['i', 'iː']] as const) {
      const r = judge(analyse(say(s, { fs: 44100 }), 44100), { sound, say: s });
      expect(oks(r), s).toBe(oks(verdict(s, sound, s)));
    }
    expect(finding(judge(analyse(say('pa', { fs: 44100 }), 44100), { sound: 'b', say: 'ba' }), 'voice').ok).toBe(false);
  });

  it('is quick: three seconds of sound in well under a blink', () => {
    const three = new Float32Array(3 * FS);
    three.set(say('ʃa').subarray(0, 3 * FS));
    analyse(three, FS); // (the first call warms the code up)
    let best = Infinity;
    for (let k = 0; k < 3; k++) { const t = performance.now(); analyse(three, FS); best = Math.min(best, performance.now() - t); }
    expect(best).toBeLessThan(400);
  });
});
