import { useEffect } from 'react';
import { store, useUi, useTick } from '../store';
import { voice } from '../voice/voice';
import { useLanes } from '../voice/hooks';
import { useL } from '../i18n';
import { Slider, Section, Seg, Toggle } from './controls';
import { C } from '../canvas';
import { textToPhones, Phone, Lang } from '../../dsp/speech/g2p';
import { buildScore, NaturalnessOptions, NATURAL_ALL } from '../../dsp/speech/sequencer';

type Bi = { it: string; en: string };

const EXAMPLES: { text: string; lang: Lang }[] = [
  { text: 'heed', lang: 'en' }, { text: 'father', lang: 'en' }, { text: 'hiss', lang: 'en' }, { text: 'this', lang: 'en' },
  { text: 'a buzz, a hiss and a filter', lang: 'en' },
  { text: 'Every voice you have ever heard is made of just two ingredients.', lang: 'en' },
  { text: 'Is it raining in the city today?', lang: 'en' },
  { text: 'The little button on the water bottle', lang: 'en' },
  { text: 'sasso', lang: 'it' }, { text: 'mamma', lang: 'it' }, { text: 'voce', lang: 'it' }, { text: 'la voce è fatta di aria', lang: 'it' },
  { text: 'ciao, come stai?', lang: 'it' }, { text: 'il carro corre sulla strada', lang: 'it' }, { text: 'gnocchi e pizza', lang: 'it' },
  { text: 'قَمَر', lang: 'ar' }, { text: 'السَّلامُ عَلَيْكُم', lang: 'ar' }, { text: 'الشَّمْسُ تُشْرِقُ في الصَّباح', lang: 'ar' },
  { text: 'پانی', lang: 'ur' }, { text: 'آپ کیسے ہیں؟', lang: 'ur' }, { text: 'چاند رات میں چمکتا ہے', lang: 'ur' },
  { text: 'कमल', lang: 'hi' }, { text: 'आप कैसे हैं?', lang: 'hi' }, { text: 'हाथी बहुत बड़ा है', lang: 'hi' },
];

/** The ingredients of natural speech, each with a plain explanation. */
const INGREDIENTS: { key: keyof NaturalnessOptions; name: Bi; what: Bi }[] = [
  {
    key: 'timing', name: { it: 'Durate', en: 'Timing' },
    what: {
      it: 'Ogni suono ha una durata che cambia col contesto: le vocali toniche si allungano, quelle atone si accorciano, si rallenta a fine frase. Spento: ogni suono dura sempre uguale.',
      en: 'Every sound has a length that depends on its context: stressed vowels stretch, unstressed ones shrink, and speech slows down at the end of a phrase. Off: every sound always lasts the same.',
    },
  },
  {
    key: 'intonation', name: { it: 'Intonazione', en: 'Intonation' },
    what: {
      it: 'La melodia della frase: sale sulle sillabe accentate, scende piano lungo la frase, cala alla fine di un’affermazione e sale in una domanda. Spento: una nota sola, da robot.',
      en: 'The melody of the sentence: it rises on stressed syllables, drifts down through the phrase, falls at the end of a statement and rises in a question. Off: a single note, like a robot.',
    },
  },
  {
    key: 'micro', name: { it: 'Micro-variazioni', en: 'Micro-variation' },
    what: {
      it: 'Piccole spinte della nota che nessuno decide: le vocali chiuse (i, u) stanno un po’ più in alto, dopo una consonante sorda la nota parte più alta, e la voce trema appena. Spento: tutto perfettamente liscio.',
      en: 'Small pitch nudges nobody plans: closed vowels (ee, oo) sit slightly higher, the pitch starts higher after a voiceless consonant, and the voice wavers a little. Off: everything perfectly smooth.',
    },
  },
  {
    key: 'voiceQuality', name: { it: 'Qualità della voce', en: 'Voice quality' },
    what: {
      it: 'Sulle sillabe accentate i polmoni spingono di più e le corde chiudono più decise; a fine frase la spinta cala e la voce diventa più soffiata. Spento: stessa forza e stesso timbro dall’inizio alla fine.',
      en: 'On stressed syllables the lungs push harder and the folds close more firmly; at the end of a phrase the push fades and the voice turns breathier. Off: the same force and color from start to end.',
    },
  },
  {
    key: 'coarticulation', name: { it: 'Coarticolazione', en: 'Coarticulation' },
    what: {
      it: 'I movimenti si sovrappongono: una consonante muove solo ciò che le serve e il resto prepara già la vocale dopo (le labbra si arrotondano prima della «u»). Spento: ogni suono riparte da zero con tutta la bocca.',
      en: 'Movements overlap: a consonant only moves what it needs while the rest already prepares the next vowel (the lips round before an “oo”). Off: every sound resets the whole mouth.',
    },
  },
];

const showIpa = (phones: Phone[]) => phones.map((p) =>
  (p.stress ? 'ˈ' : p.stress2 ? 'ˌ' : '') + p.ipa + (p.long ? 'ː' : '') + (p.wordEnd ? ' ' : '') + (p.pause ? (p.question ? '? ' : '| ') : '')).join('');

/**
 * Text to speech with the articulatory model: spelling -> phonemes ->
 * gestural score (targets that overlap in time) -> the same physical engine.
 */
export function SpeakPanel() {
  const L = useL();
  const ui = useUi();
  const sp = ui.speech;
  const { text, lang, rate, accent, natural } = sp;
  const perf = useLanes().performer;
  const sc = perf.kind === 'sentence' ? perf.score : null;
  useTick(sc ? 20 : 0);
  useEffect(() => { if (lang === 'en') void store.ensureLexicon(); }, [lang]);
  let phones: Phone[] = [];
  try { phones = textToPhones(text, lang); } catch { phones = []; }
  const speak = async (t = text, lg = lang) => {
    if (lg === 'en') await store.ensureLexicon();
    const ph = textToPhones(t, lg);
    if (!ph.length) return;
    const p = voice.manual;
    const score = buildScore(ph, { lang: lg, f0: p.source.f0, ps: Math.max(6, p.source.ps), rate, accent, natural });
    void voice.speak(score, { it: t, en: t });
  };
  const setNatural = (n: Partial<NaturalnessOptions>) => store.setSpeech({ natural: { ...natural, ...n } });
  const robot = INGREDIENTS.every((g) => !natural[g.key]);
  const all = INGREDIENTS.every((g) => natural[g.key]);
  const now = voice.progress()?.t ?? 0;
  const lexNote: Bi | null = lang !== 'en' ? null
    : ui.lexicon === 'ready' ? { it: 'dizionario americano: 89 mila parole', en: 'American dictionary: 89 thousand words' }
      : ui.lexicon === 'error' ? { it: 'dizionario non disponibile: uso le regole di lettura', en: 'dictionary unavailable: using spelling rules' }
        : { it: 'carico il dizionario…', en: 'loading the dictionary…' };
  return (
    <div className="panel-body">
      <Section title={L({ it: 'Fai parlare la testa', en: 'Make the head speak' })} accent={C.amber}
        info={L({
          it: 'Il testo diventa fonemi. In italiano con le regole dell’ortografia (la «s» tra vocali è sonora, come al Nord); in inglese con un dizionario americano di 89 mila parole, regole per plurali, passati e parole composte, e regole di lettura per le parole che non conosce. I numeri vengono letti. Arabo, urdu e hindi si leggono dalla loro scrittura (con i segni delle vocali, se ci sono). Ogni fonema è un bersaglio per lingua, labbra, mascella, velo e glottide; il resto lo fa la fisica: la stessa testa che muovi a mano. Scrivi /IPA/ tra barre per dare i fonemi direttamente.',
          en: 'The text becomes phonemes. Italian uses its spelling rules (an “s” between vowels is voiced, as in the North); English uses an American dictionary of 89 thousand words, rules for plurals, past tenses and compounds, and letter-to-sound rules for words it does not know. Numbers are read out. Arabic, Urdu and Hindi are read from their script (with the vowel marks, when written). Each phoneme is a target for tongue, lips, jaw, velum and glottis; everything else is physics: the same head you move by hand. Write /IPA/ between slashes to give phonemes directly.',
        })}>
        <div className="row">
          <input className="text-input" dir="auto" value={text} onChange={(e) => store.setSpeech({ text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void speak(); }} />
          <Seg value={lang} options={[['en', 'EN'], ['it', 'IT'], ['ar', 'AR'], ['ur', 'UR'], ['hi', 'HI']]} onChange={(v) => store.setSpeech({ lang: v })} />
        </div>
        <div className="ipa-line">{showIpa(phones) || '—'}</div>
        {lexNote && <p className="small muted">{L(lexNote)}</p>}
        <div className="row">
          <button className="btn primary" onClick={() => void speak()}>{L({ it: 'Parla', en: 'Speak' })}</button>
          <button className="btn" onClick={() => voice.stop()}>{L({ it: 'Ferma', en: 'Stop' })}</button>
        </div>
        <div className="chips">
          {[...EXAMPLES.filter((e) => e.lang === ui.lang), ...EXAMPLES.filter((e) => e.lang !== ui.lang)].map((e) => (
            <button key={e.text} className="chip" onClick={() => { store.setSpeech({ text: e.text, lang: e.lang }); void speak(e.text, e.lang); }}>{e.text}<small> {e.lang}</small></button>
          ))}
        </div>
        <Slider label={L({ it: 'Velocità', en: 'Rate' })} value={rate} min={0.4} max={1.8} onChange={(v) => store.setSpeech({ rate: v })} format={(v) => `×${v.toFixed(2)}`} />
        <Slider label={L({ it: 'Accento melodico', en: 'Pitch accent' })} value={accent} min={0} max={8} step={0.5} onChange={(v) => store.setSpeech({ accent: v })} format={(v) => `${v.toFixed(1)} st`} />
        <p className="small muted">{L({ it: 'La nota di base è quella della scheda «Sorgente»; la voce (uomo, donna, bambino…) resta quella scelta.', en: 'The base pitch comes from the “Source” tab; the voice (man, woman, child…) stays as chosen.' })}</p>
      </Section>
      <Section title={L({ it: 'Cosa la rende naturale', en: 'What makes it sound natural' })} accent={C.teal}
        info={L({
          it: 'Una voce sintetica suona meccanica quando le manca qualcuno di questi ingredienti. Spegnili uno alla volta e riascolta la stessa frase: senti cosa porta ciascuno. Le regole vengono dalla fonetica: le durate dell’inglese da Klatt (1979), la melodia dal modello di Fujisaki (comandi di frase per la discesa lenta, comandi d’accento sulle sillabe toniche).',
          en: 'A synthetic voice sounds mechanical when one of these ingredients is missing. Switch them off one at a time and play the same sentence again: you hear what each one brings. The rules come from phonetics: English durations from Klatt (1979), the melody from the Fujisaki model (phrase commands for the slow drift down, accent commands on stressed syllables).',
        })}>
        {INGREDIENTS.map((g) => (
          <div key={g.key} className="ingredient">
            <Toggle label={L(g.name)} value={natural[g.key]} onChange={(v) => setNatural({ [g.key]: v })} />
            <p className="small muted">{L(g.what)}</p>
          </div>
        ))}
        <div className="row">
          <button className={all ? 'chip on' : 'chip'} onClick={() => { store.setSpeech({ natural: { ...NATURAL_ALL } }); }}>{L({ it: 'Tutti accesi', en: 'All on' })}</button>
          <button className={robot ? 'chip on' : 'chip'} onClick={() => { store.setSpeech({ natural: { timing: false, intonation: false, micro: false, voiceQuality: false, coarticulation: false } }); }}>{L({ it: 'Robot (tutti spenti)', en: 'Robot (all off)' })}</button>
          <button className="btn" onClick={() => void speak()}>▶ {L({ it: 'Riascolta', en: 'Play again' })}</button>
        </div>
      </Section>
      {sc && (
        <div className="timeline">
          {sc.phones.map((ph, i) => {
            const active = now >= ph.t0 && now < ph.t1;
            return <span key={i} className={active ? 'ph on' : 'ph'} style={{ flexGrow: Math.max(0.3, (ph.t1 - ph.t0) * 20) }}>{ph.ipa}</span>;
          })}
        </div>
      )}
    </div>
  );
}
