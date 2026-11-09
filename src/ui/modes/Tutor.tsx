import { useEffect, useRef, useState } from 'react';
import { store, useUi, useTick, TutorLang, TutorSpeed } from '../store';
import { useL } from '../i18n';
import { HeadView } from '../components/HeadView';
import { MouthFront } from '../components/MouthFront';
import { VoiceTiles } from './quick';
import { voice } from '../voice/voice';
import { useLanes, useManual } from '../voice/hooks';
import { ALPHABETS, Letter, TUTOR_LANGS } from '../tutor/letters';
import { guideFor, PLACES, PLACE_ORDER } from '../tutor/guide';
import { compactPhones } from '../../dsp/speech/indic';
import { buildScore } from '../../dsp/speech/sequencer';
import { PHONEMES, NASAL_VELUM } from '../../dsp/speech/phonemes';
import type { Phone } from '../../dsp/speech/g2p';
import type { Score } from '../../dsp/engine/params';

/** the sounds that can be held as long as the breath lasts */
const SUSTAINED = new Set(['vowel', 'fricative', 'nasal', 'approximant', 'lateral', 'trill']);
const SPEEDS: [TutorSpeed, string, { it: string; en: string }][] = [
  [1, '1×', { it: 'normale', en: 'normal' }], [0.5, '½×', { it: 'lento', en: 'slow' }], [0.25, '¼×', { it: 'lentissimo', en: 'very slow' }],
];

/** The phones of a word in the compact form, as one stressed word. */
function wordPhones(ipa: string): Phone[] {
  const ps = compactPhones(ipa);
  const vi = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  if (vi >= 0 && !ps.some((p) => p.stress)) ps[vi].stress = true;
  if (ps.length) { ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true; }
  return ps;
}

/** What the letter says on its own: a vowel as it is, a consonant with the alphabet's vowel. */
function sayOf(l: Letter, lang: TutorLang): string {
  if (l.say) return l.say;
  const ph = PHONEMES[l.sound];
  return ph?.manner === 'vowel' ? l.sound : l.sound + ALPHABETS[lang].vowel;
}

/** Shapes the head as the letter's sound, in silence. */
function pose(l: Letter): void {
  if (l.sound === 'ã') {
    voice.holdPhoneme('a', { blow: false });
    voice.edit((p) => { p.articulators.velum = NASAL_VELUM; }, { takeOver: true });
  } else if (PHONEMES[l.sound]) voice.holdPhoneme(l.sound, { blow: false });
}

/** The frame of a score nearest to a time. */
function frameAt(score: Score, t: number) {
  const fr = score.frames;
  let lo = 0, hi = fr.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m].t <= t) lo = m; else hi = m; }
  return fr[lo];
}

/**
 * Tutor: the letters of Urdu, Arabic and Hindi for a child who starts from
 * the sounds. One letter at a time: the head and the mouth in the mirror
 * show how it is made, in slow motion if wanted, step by step with a
 * scrubber; under them, in plain words, what the lips, the tongue, the air
 * and the voice do, a word that starts with it, and the letter itself to
 * hear alone, with a vowel, or in the word.
 */
export function Tutor() {
  const L = useL();
  const ui = useUi();
  const { lang, speed } = ui.tutor;
  const alphabet = ALPHABETS[lang];
  const idx = Math.min(ui.tutor.letter, alphabet.letters.length - 1);
  const letter = alphabet.letters[idx];
  const guide = guideFor(letter.sound);
  const place = PLACES[guide.place];
  const manual = useManual();
  const perf = useLanes().performer;
  const speaking = perf.kind === 'sentence';
  const [scrub, setScrub] = useState<{ score: Score; what: 'say' | 'word'; t: number } | null>(null);
  useTick(speaking ? 20 : 0);

  const go = (i: number) => store.setTutor({ letter: (i + alphabet.letters.length) % alphabet.letters.length });
  const setLang = (l: TutorLang) => store.setTutor({ lang: l, letter: 0 });

  // a new letter: the head takes its shape, in silence
  useEffect(() => { pose(letter); setScrub(null); }, [lang, idx]);
  // the arrow keys turn the letters (not while typing)
  const nav = useRef(go);
  nav.current = go;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === 'ArrowRight') nav.current(store.ui.tutor.letter + 1);
      else if (e.key === 'ArrowLeft') nav.current(store.ui.tutor.letter - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const build = (what: 'say' | 'word', sp: TutorSpeed = speed): Score => {
    const phones = what === 'say' ? wordPhones(sayOf(letter, lang)) : wordPhones(letter.word.ipa);
    return buildScore(phones, { lang, f0: manual.source.f0, ps: Math.max(7, manual.source.ps), rate: 0.9, timeScale: 1 / sp });
  };
  const play = (what: 'say' | 'word') => {
    setScrub(null);
    const text = what === 'say' ? letter.glyph : letter.word.text;
    void voice.speak(build(what), { it: text, en: text });
  };
  // the sound alone: held for a breath when it can be, else said with a short vowel
  const hold = () => {
    setScrub(null);
    if (letter.sound === 'ã') { voice.holdPhoneme('a'); voice.edit((p) => { p.articulators.velum = NASAL_VELUM; }, { takeOver: true }); return; }
    const ph = PHONEMES[letter.sound];
    if (ph && SUSTAINED.has(ph.manner)) voice.holdPhoneme(letter.sound);
    else play('say');
  };
  // step by step: the head posed at one instant of the sound, in silence
  const scrubTo = (s: { score: Score; what: 'say' | 'word' }, t: number) => {
    if (voice.lanes.performer.kind !== 'hands') voice.stop();
    const fr = frameAt(s.score, t);
    if (fr.art) voice.edit((p) => { p.articulators = { ...fr.art! }; p.abduction = fr.abduction; p.phonate = false; }, { takeOver: true });
    setScrub({ ...s, t });
  };
  const startScrub = (what: 'say' | 'word') => scrubTo({ score: build(what, 1), what }, 0);

  const now = voice.progress()?.t ?? 0;
  const timeline = speaking ? perf.score : scrub?.score ?? null;
  const at = speaking ? now : scrub?.t ?? -1;
  const scriptClass = `script-${lang}`;
  const voicedSound = PHONEMES[letter.sound]?.voiced ?? true;
  const sustainable = letter.sound === 'ã' || SUSTAINED.has(PHONEMES[letter.sound]?.manner ?? '');
  return (
    <main className="tutor">
      <nav className="tutor-langs" role="tablist" aria-label={L({ it: 'Lingua', en: 'Language' })}>
        {TUTOR_LANGS.map((l) => (
          <button key={l} role="tab" aria-selected={l === lang} className={l === lang ? 'tutor-lang on' : 'tutor-lang'} onClick={() => setLang(l)}>
            <span className={`tutor-lang-native script-${l}`} lang={l} dir={ALPHABETS[l].dir}>{ALPHABETS[l].native}</span>
            <span className="tutor-lang-text"><b>{ALPHABETS[l].name}</b><small>{ALPHABETS[l].letters.length} {L({ it: 'lettere', en: 'letters' })}</small></span>
          </button>
        ))}
      </nav>
      <section className="tutor-stage">
        <div className="tutor-head ds-card">
          <HeadView guide={{ id: `${lang}-${idx}`, handle: guide.handle, text: guide.hint }} />
        </div>
        <div className="tutor-mouth ds-card">
          <MouthFront caption={L({ it: 'allo specchio', en: 'in the mirror' })} />
          <div className="tutor-motion">
            <div className="quick-row speed">
              <span className="quick-label">🐢 {L({ it: 'Velocità', en: 'Speed' })}</span>
              <div className="seg">
                {SPEEDS.map(([s, name, hint]) => <button key={s} className={speed === s ? 'on' : ''} title={L(hint)} onClick={() => store.setTutor({ speed: s })}>{name} <small>{L(hint)}</small></button>)}
              </div>
            </div>
            <div className="quick-row">
              <span className="quick-label">👣 {L({ it: 'Passo passo', en: 'Step by step' })}</span>
              {scrub
                ? <input className="scrub" type="range" min={0} max={scrub.score.duration} step={0.005} value={scrub.t} aria-label={L({ it: 'Istante', en: 'Moment' })} onChange={(e) => scrubTo(scrub, Number(e.target.value))} />
                : <div className="chips">
                  <button className="chip" onClick={() => startScrub('say')}>{L({ it: 'la lettera', en: 'the letter' })}</button>
                  <button className="chip" onClick={() => startScrub('word')}>{L({ it: 'la parola', en: 'the word' })}</button>
                </div>}
            </div>
            {timeline && (
              <div className="timeline">
                {timeline.phones.map((ph, i) => <span key={i} className={at >= ph.t0 && at < ph.t1 ? 'ph on' : 'ph'} style={{ flexGrow: Math.max(0.3, (ph.t1 - ph.t0) * 20) }}>{ph.ipa}</span>)}
              </div>
            )}
          </div>
        </div>
        <aside className="tutor-letters ds-card" aria-label={L({ it: 'Le lettere', en: 'The letters' })}>
          <div className="place-legend">
            {PLACE_ORDER.filter((pl) => alphabet.letters.some((l) => guideFor(l.sound).place === pl)).map((pl) => (
              <span key={pl}><i style={{ background: PLACES[pl].colour }} />{PLACES[pl].name}</span>
            ))}
          </div>
          <div className={`letter-grid ${scriptClass}`} dir={alphabet.dir} lang={lang}>
            {alphabet.letters.map((l, i) => {
              const g = guideFor(l.sound);
              return (
                <button key={l.glyph + i} className={i === idx ? 'letter-btn on' : 'letter-btn'} style={{ '--place': PLACES[g.place].colour } as React.CSSProperties}
                  title={`${l.roman} · /${l.sound}/ · ${l.word.roman}`} aria-pressed={i === idx} onClick={() => go(i)}>
                  {l.glyph}<small dir="ltr">{l.roman}</small>
                </button>
              );
            })}
          </div>
        </aside>
      </section>
      <section className="tutor-card ds-card" aria-live="polite">
        <div className={`letter-big ${scriptClass}`} dir={alphabet.dir} lang={lang} style={{ color: place.colour }}>{letter.glyph}</div>
        <div className="letter-info">
          <header className="letter-head">
            <h2><span className={scriptClass} dir={alphabet.dir} lang={lang}>{letter.name}</span> <span className="muted">·</span> {letter.roman} <span className="muted">·</span> <span className="ipa">/{letter.sound}/</span></h2>
            <span className="place-badge" style={{ borderColor: place.colour, color: place.colour }}>{place.icon} {place.name}</span>
            {guide.like && <span className="muted like">{L({ it: 'come', en: 'like' })} {guide.like}</span>}
          </header>
          {letter.note && <p className="letter-note">{letter.note}</p>}
          <div className="steps">
            <div className="step"><span className="ico" aria-hidden>👄</span><div><b>{L({ it: 'Labbra', en: 'Lips' })}</b>{guide.lips}</div></div>
            <div className="step"><span className="ico" aria-hidden>👅</span><div><b>{L({ it: 'Lingua', en: 'Tongue' })}</b>{guide.tongue}</div></div>
            <div className="step"><span className="ico" aria-hidden>🌬️</span><div><b>{L({ it: 'Aria', en: 'Air' })}</b>{guide.air}</div></div>
            <div className={voicedSound || letter.sound === 'ã' ? 'step voiced' : 'step'}><span className="ico" aria-hidden>{voicedSound || letter.sound === 'ã' ? '🎵' : '🤫'}</span><div><b>{L({ it: 'Voce', en: 'Voice' })}</b>{guide.voice}</div></div>
          </div>
          {guide.trick && <p className="trick">💡 {guide.trick}</p>}
          <div className="tutor-word">
            <span className={`w ${scriptClass}`} dir={alphabet.dir} lang={lang}>{letter.word.text}</span>
            <span className="roman">{letter.word.roman}</span>
            <span className="muted">{letter.word.meaning}</span>
            <span className="ipa muted">/{letter.word.ipa}/</span>
          </div>
        </div>
        <div className="tutor-try">
          {speaking
            ? <button className="btn try big" onClick={() => voice.stop()}>■ {L({ it: 'Ferma', en: 'Stop' })}</button>
            : <>
              <button className="btn primary try" onClick={hold}>▶ {sustainable ? L({ it: 'Tieni il suono', en: 'Hold the sound' }) : L({ it: 'Il suono', en: 'The sound' })} <span className="ipa">{letter.sound === 'ã' ? 'ãː' : letter.sound}</span></button>
              {PHONEMES[letter.sound]?.manner !== 'vowel' && letter.sound !== 'ã' && (
                <button className="btn try" onClick={() => play('say')}>▶ {L({ it: 'Con una vocale', en: 'With a vowel' })} <span className="ipa">{sayOf(letter, lang)}</span></button>
              )}
              <button className="btn try" onClick={() => play('word')}>▶ {L({ it: 'La parola', en: 'The word' })} <span className={scriptClass} dir={alphabet.dir} lang={lang}>{letter.word.text}</span></button>
            </>}
          <p className="small muted speed-note">{speed === 1 ? L({ it: 'a velocità normale', en: 'at normal speed' }) : L({ it: `al rallentatore, ${SPEEDS.find((s) => s[0] === speed)![1]}`, en: `in slow motion, ${SPEEDS.find((s) => s[0] === speed)![1]}` })}</p>
          <div className="tutor-nav">
            <button className="btn" onClick={() => go(idx - 1)}>← {L({ it: 'Prima', en: 'Previous' })}</button>
            <span className="muted">{idx + 1} / {alphabet.letters.length}</span>
            <button className="btn" onClick={() => go(idx + 1)}>{L({ it: 'Dopo', en: 'Next' })} →</button>
          </div>
        </div>
        <div className="tutor-voices">
          <span className="quick-label">{L({ it: 'Chi parla', en: 'Who speaks' })}</span>
          <VoiceTiles />
        </div>
      </section>
    </main>
  );
}
