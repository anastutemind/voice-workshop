/**
 * Big, simple controls for the Learn and Play modes: they go through the same
 * voice controller as the lab's sliders, so what they do is what you hear.
 */
import { useEffect } from 'react';
import { store, useUi, useTick } from '../store';
import { useL } from '../i18n';
import { Slider, Toggle } from '../components/controls';
import { VOICE_PRESETS } from '../presets';
import { PHONEMES } from '../../dsp/speech/phonemes';
import { textToPhones } from '../../dsp/speech/g2p';
import { buildScore } from '../../dsp/speech/sequencer';
import { MRI_VOWELS } from '../../dsp/data/mri';
import { noteName } from '../canvas';
import { voice, mriTube } from '../voice/voice';
import { useLanes, useLock, useManual, useVoice } from '../voice/hooks';
import type { QuickId } from '../tour';

type Bi = { it: string; en: string };

/** A row of big phoneme buttons; the one the hands hold is lit. */
export function PhonemeButtons(props: { list: string[]; size?: 'big' | 'small'; label?: Bi }) {
  const L = useL();
  const held = useVoice((v) => v.held.phoneme);
  return (
    <div className="quick-row">
      {props.label && <span className="quick-label">{L(props.label)}</span>}
      <div className={props.size === 'small' ? 'ipa-buttons small' : 'ipa-buttons'}>
        {props.list.map((p) => (
          <button key={p} className={held === p ? 'ipa-btn on' : 'ipa-btn'} title={PHONEMES[p]?.examples} onClick={() => voice.holdPhoneme(p)}>{p}</button>
        ))}
      </div>
    </div>
  );
}

const TILES: { id: string; img: string }[] = [
  { id: 'man', img: 'img/voice-man.jpg' }, { id: 'woman', img: 'img/voice-woman.jpg' },
  { id: 'child', img: 'img/voice-child.jpg' }, { id: 'whisper', img: 'img/voice-whisper.jpg' },
];

/** Who is speaking: four illustrated speakers (source and anatomy together). */
export function VoiceTiles() {
  const L = useL();
  const speaker = useVoice((v) => v.held.speaker);
  return (
    <div className="voice-tiles">
      {TILES.map((t) => {
        const pr = VOICE_PRESETS.find((p) => p.id === t.id)!;
        return (
          <button key={t.id} className={speaker === t.id ? 'voice-tile on' : 'voice-tile'} title={L(pr.hint)} onClick={() => voice.applyPreset(pr.id, pr.apply)}>
            <img src={t.img} alt="" loading="lazy" />
            <span>{L(pr.name)}</span>
          </button>
        );
      })}
    </div>
  );
}

const EXAMPLES: Record<'it' | 'en', string[]> = {
  en: ['a buzz, a hiss and a filter', 'hello there', 'is it raining?', 'pa ta ka'],
  it: ['la voce è fatta di aria', 'ciao, come stai?', 'piove in città oggi?', 'pa ta ca'],
};

/** Say something: a text, the Speak and Stop buttons and a few examples, in the language of the interface. */
export function SayBox(props: { examples?: boolean }) {
  const L = useL();
  const ui = useUi();
  const perf = useLanes().performer;
  const sp = ui.speech;
  useEffect(() => { if (sp.lang === 'en') void store.ensureLexicon(); }, [sp.lang]);
  const speak = async (text = sp.text, lang = sp.lang) => {
    if (lang === 'en') await store.ensureLexicon();
    const ph = textToPhones(text, lang);
    if (!ph.length) return;
    const p = voice.manual;
    void voice.speak(buildScore(ph, { lang, f0: p.source.f0, ps: Math.max(6, p.source.ps), rate: sp.rate, accent: sp.accent, natural: sp.natural }), { it: text, en: text });
  };
  const speaking = perf.kind === 'sentence';
  return (
    <div className="say-box">
      <div className="say-row">
        <input className="text-input" dir="auto" value={sp.text} aria-label={L({ it: 'Testo da dire', en: 'Text to say' })}
          onChange={(e) => store.setSpeech({ text: e.target.value, lang: ui.lang })} onKeyDown={(e) => { if (e.key === 'Enter') void speak(); }} />
        {speaking
          ? <button className="btn big" onClick={() => voice.stop()}>■ {L({ it: 'Ferma', en: 'Stop' })}</button>
          : <button className="btn primary big" onClick={() => void speak()}>🔊 {L({ it: 'Parla', en: 'Speak' })}</button>}
      </div>
      {props.examples !== false && (
        <div className="chips">
          {EXAMPLES[ui.lang].map((t) => <button key={t} className="chip" onClick={() => { store.setSpeech({ text: t, lang: ui.lang }); void speak(t, ui.lang); }}>{t}</button>)}
        </div>
      )}
    </div>
  );
}

/** The pitch, as a big slider with the note name. */
function PitchSlider() {
  const L = useL();
  const p = useManual();
  const lock = useLock('pitch');
  useTick(lock ? 15 : 0);
  return (
    <div className="quick-row">
      <span className="quick-label">{L({ it: 'La nota', en: 'The pitch' })}</span>
      <div className="quick-slider">
        <Slider label="" value={p.source.f0} live={voice.sounding().source.f0} control="pitch" min={60} max={500} log
          onChange={(v) => voice.edit((x) => { x.source.f0 = v; })} format={(v) => `${noteName(v)} · ${Math.round(v)} Hz`} />
      </div>
    </div>
  );
}

function MriButtons() {
  const L = useL();
  const filter = useLanes().filter;
  return (
    <div className="quick-row">
      <span className="quick-label">{L({ it: 'Tubi misurati', en: 'Measured tubes' })}</span>
      <div className="ipa-buttons">
        {MRI_VOWELS.filter((v) => ['i', 'ɑ', 'u'].includes(v.ipa)).map((v) => (
          <button key={v.ipa} className={filter.kind === 'tube' && filter.label.en === mriTube(v.ipa).en ? 'ipa-btn on' : 'ipa-btn'}
            onClick={() => { voice.loadTube(v.areas, v.areas.length * v.dx, mriTube(v.ipa), { takeOver: true }); store.setUi({ viewTab: 'tube' }); }}>{v.ipa}</button>
        ))}
        {filter.kind !== 'head' && <button className="chip" onClick={() => voice.setFilter('head', { takeOver: true })}>{L({ it: 'Torna alla testa', en: 'Back to the head' })}</button>}
      </div>
    </div>
  );
}

function NoseToggle() {
  const L = useL();
  const p = useManual();
  const shut = p.anatomy.nostrilLeft + p.anatomy.nostrilRight === 0;
  return (
    <div className="quick-row">
      <span className="quick-label">{L({ it: 'Il naso', en: 'The nose' })}</span>
      <Toggle label={L({ it: 'Tappa il naso', en: 'Pinch the nose' })} value={shut} control="nose"
        onChange={(v) => voice.edit((x) => { x.anatomy.nostrilLeft = v ? 0 : 1; x.anatomy.nostrilRight = v ? 0 : 1; })} />
      <button className="chip" onClick={() => { voice.holdPhoneme('a'); voice.edit((x) => { x.articulators.velum = 0.7; }); }}>{L({ it: 'Una «a» nasale', en: 'A nasal “ah”' })}</button>
    </div>
  );
}

/** The quick controls a Learn chapter asks for. */
export function QuickControls(props: { ids: QuickId[] }) {
  const L = useL();
  return (
    <div className="quick">
      {props.ids.map((id) => {
        switch (id) {
          case 'vowels': return <PhonemeButtons key={id} list={['a', 'e', 'i', 'o', 'u', 'ə']} label={{ it: 'Una vocale', en: 'Say a vowel' }} />;
          case 'consonants': return <PhonemeButtons key={id} list={['m', 'n', 's', 'ʃ', 'f', 'l', 'r']} label={{ it: 'Una consonante', en: 'Hold a consonant' }} />;
          case 'fricatives': return <PhonemeButtons key={id} list={['s', 'ʃ', 'f', 'θ', 'z', 'h']} label={{ it: 'Un fruscio', en: 'Hold a hiss' }} />;
          case 'nasals': return <PhonemeButtons key={id} list={['m', 'n', 'ŋ']} label={{ it: 'Una nasale', en: 'Hum a nasal' }} />;
          case 'pitch': return <PitchSlider key={id} />;
          case 'voices': return <div key={id} className="quick-row"><span className="quick-label">{L({ it: 'Chi parla', en: 'Who speaks' })}</span><VoiceTiles /></div>;
          case 'say': return <div key={id} className="quick-row wide"><SayBox /></div>;
          case 'mri': return <MriButtons key={id} />;
          case 'nose': return <NoseToggle key={id} />;
        }
      })}
    </div>
  );
}
