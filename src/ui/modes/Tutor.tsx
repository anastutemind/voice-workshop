import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { store, useUi, TutorSpeed } from '../store';
import { useL } from '../i18n';
import { voice } from '../voice/voice';
import { COURSES, COURSE_IDS, Course, CourseId, Entry, Example, sayOf } from '../tutor/courses';
import { guideFor, Handle, PLACES, SoundGuide } from '../tutor/guide';
import { pictureOf } from '../tutor/pictures';
import { keyTime, poseAt, stagesOf, trajectory, Stage } from '../tutor/motion';
import { Clip, Outcome, player, Sound, usePlayer, What } from '../tutor/player';
import { FaceCanvas, Layers, setLayers, shapeOf, useLayers } from '../tutor/faces';
import { Mirror3D } from '../tutor/Mirror3D';
import { MirrorPhoto } from '../tutor/MirrorPhoto';
import { hush, narratorVoice, onVoices, sayText, speechText, voiceFor, voiceOf } from '../tutor/speech';
import { recorder, useRecorder } from '../tutor/recorder';
import { bestMatch, canRecognise, recognise } from '../tutor/recognise';
import { analyse, judge, Report } from '../tutor/listen';
import * as Icon from '../tutor/icons';
import { compactPhones } from '../../dsp/speech/indic';
import { buildScore } from '../../dsp/speech/sequencer';
import { PHONEMES } from '../../dsp/speech/phonemes';
import { textToPhones } from '../../dsp/speech/g2p';
import type { Phone } from '../../dsp/speech/g2p';

type Bi = { it: string; en: string };
const SPEEDS: [TutorSpeed, string, Bi][] = [[1, '1×', { it: 'velocità normale', en: 'normal speed' }], [0.5, '½×', { it: 'lento', en: 'slow' }], [0.25, '¼×', { it: 'lentissimo', en: 'very slow' }]];
type Phase = 'listen' | 'learn' | 'watch' | 'repeat' | 'word' | 'speak';
const PHASES: [Phase, Bi][] = [
  ['listen', { it: 'Ascolta', en: 'Listen' }], ['learn', { it: 'Impara', en: 'Learn' }], ['watch', { it: 'Guarda', en: 'Watch' }],
  ['repeat', { it: 'Ripeti', en: 'Repeat' }], ['word', { it: 'Parola', en: 'Word' }], ['speak', { it: 'Parla', en: 'Speak' }],
];
const STEP_NAME: Record<Stage['part'], string> = { hold: 'hold', pop: 'release', puff: 'air', say: 'shape' };
type Row = 'lips' | 'tongue' | 'air' | 'voice';
const PROGRESS_KEY = 'voice-workshop.tutor.progress';
const SLOW_SOUND_KEY = 'voice-workshop.tutor.slowSound';
const NARRATE_KEY = 'voice-workshop.tutor.narrate';
/** the recogniser's language for each alphabet */
const LOCALE: Record<string, string> = { ur: 'ur-PK', ar: 'ar-SA', hi: 'hi-IN' };
const XP_PER_LEVEL = 60;


/** The phones of a word in the compact form, as one stressed word. */
function wordPhones(ipa: string): Phone[] {
  const ps = compactPhones(ipa);
  const vi = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  if (vi >= 0 && !ps.some((p) => p.stress)) ps[vi].stress = true;
  if (ps.length) { ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true; }
  return ps;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const remembered = (key: string, fallback: boolean) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; } };
const remember = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };

// ------------------------------------------------------------- the progress

/** What the learner has done: the best score on each letter, and the points earned. */
interface Progress { best: Record<string, Record<string, number>>; xp: number }
function readProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null') as Partial<Progress> | null;
    return { best: p?.best ?? {}, xp: Number(p?.xp) || 0 };
  } catch { return { best: {}, xp: 0 }; }
}

// ---------------------------------------------- the teacher's and your tracks

type Cell = 'v' | 'a' | 'c' | 'o';
const CELLS = 56;
const tracks = new Map<string, Cell[]>();
/** What the model does through a clip, as a row of cells: voice, air alone, closed or silent. */
function teacherTrack(clip: Clip): Cell[] {
  let t = tracks.get(clip.key);
  if (!t) {
    const first = clip.stages[0]?.t0 ?? 0, last = clip.stages[clip.stages.length - 1]?.t1 ?? clip.traj.duration;
    t = [];
    for (let i = 0; i < CELLS; i++) {
      const pose = poseAt(clip.traj, first + ((last - first) * (i + 0.5)) / CELLS);
      if (!pose) { t.push('c'); continue; }
      const { flow } = shapeOf(pose);
      t.push(flow.voice > 0.3 ? 'v' : flow.mouth > 0.2 || flow.nose > 0.2 ? 'a' : 'c');
    }
    if (tracks.size > 80) tracks.clear();
    tracks.set(clip.key, t);
  }
  return t;
}
/** What was heard, as the same row of cells. */
function yourTrack(r: Report): Cell[] {
  const h = r.heard;
  const i0 = Math.max(0, Math.round(h.t0 / h.hop)), i1 = Math.min(h.level.length, Math.round(h.t1 / h.hop));
  const out: Cell[] = [];
  for (let i = 0; i < CELLS; i++) {
    const a = Math.floor(i0 + ((i1 - i0) * i) / CELLS), b = Math.max(a + 1, Math.floor(i0 + ((i1 - i0) * (i + 1)) / CELLS));
    let v = 0, n = 0, hiss = 0, lvl = 0;
    for (let j = a; j < b && j < h.level.length; j++) { n++; if (h.voiced[j]) v++; hiss += h.hiss[j] ?? 0; lvl += h.level[j] ?? 0; }
    if (!n) { out.push('c'); continue; }
    out.push(v / n >= 0.5 ? 'v' : hiss / n > 0.3 ? 'a' : lvl / n < 0.05 ? 'c' : 'o');
  }
  return out;
}

// ------------------------------------------------------------- the letters

const Tiles = memo(function Tiles({ course, idx, best, onPick }: { course: Course; idx: number; best: Record<string, number>; onPick: (i: number) => void }) {
  const on = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { on.current?.scrollIntoView({ block: 'nearest' }); }, [course.id, idx]);
  let i = 0;
  return (
    <div className="tu-tiles">
      {course.sections.map((sec) => (
        <section key={sec.id}>
          {course.sections.length > 1 && <h3 title={sec.blurb}>{sec.title}<span>{sec.entries.length}</span></h3>}
          <div className={`tu-grid script-${course.id}`} dir={course.dir} lang={course.id === 'ipa' ? undefined : course.id}>
            {sec.entries.map((e) => {
              const k = i++;
              const g = course.id === 'ipa' ? guideFor(e.glyph) : guideFor(e.sound);
              const score = best[e.glyph];
              return (
                <button key={e.glyph + k} ref={k === idx ? on : undefined} className={k === idx ? 'tu-tile on' : 'tu-tile'} style={{ '--place': PLACES[g.place].colour } as React.CSSProperties}
                  title={course.id === 'ipa' ? e.name : `${e.roman} · ${e.word.roman}`} aria-pressed={k === idx} onClick={() => onPick(k)}>
                  <span className="g">{e.glyph}</span>
                  {course.id !== 'ipa' && <small dir="ltr">{e.roman}</small>}
                  {score !== undefined && <i className={score >= 85 ? 'best gold' : score >= 60 ? 'best ok' : 'best'} aria-label={`best ${score}`} />}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
});

// --------------------------------------------------------------- the layers

function LayerControls() {
  const L = useL();
  const ly = useLayers();
  const [open, setOpen] = useState(false);
  const preset: [string, number][] = [[L({ it: 'Anatomia', en: 'Anatomy' }), 0], [L({ it: 'Insieme', en: 'Blend' }), 0.5], [L({ it: 'Pelle', en: 'Skin' }), 1]];
  const toggles: [keyof Pick<Layers, 'labels' | 'air' | 'guides'>, string, React.ReactNode][] = [
    ['labels', L({ it: 'Nomi degli organi', en: 'Organ names' }), <Icon.IconTag size={15} />],
    ['air', L({ it: 'Aria', en: 'Airflow' }), <Icon.IconAir size={15} />],
    ['guides', L({ it: 'Guide del movimento', en: 'Movement guides' }), <Icon.IconIdea size={15} />],
  ];
  return (
    <div className="tu-layers" role="group" aria-label={L({ it: 'Livelli', en: 'Layers' })}>
      <div className="tu-layers-bar">
        <div className="tu-mini-seg">
          {preset.map(([name, v]) => <button key={name} className={Math.abs(ly.skin - v) < 0.13 ? 'on' : ''} onClick={() => setLayers({ skin: v })}>{name}</button>)}
        </div>
        <button className={open ? 'tu-icon-btn on' : 'tu-icon-btn'} aria-expanded={open} title={L({ it: 'Livelli', en: 'Layers' })} onClick={() => setOpen((v) => !v)}><Icon.IconLayers size={17} /></button>
      </div>
      {open && (
        <div className="tu-layers-panel">
          <label>
            <span><Icon.IconFace size={15} />{L({ it: 'Pelle sopra l’anatomia', en: 'Skin over the anatomy' })}<b>{Math.round(ly.skin * 100)}%</b></span>
            <input className="tu-range" type="range" min={0} max={1} step={0.01} value={ly.skin} style={{ '--at': `${ly.skin * 100}%` } as React.CSSProperties} onChange={(e) => setLayers({ skin: Number(e.target.value) })} />
          </label>
          {toggles.map(([id, name, icon]) => (
            <button key={id} className={ly[id] ? 'on' : ''} role="switch" aria-checked={ly[id]} onClick={() => setLayers({ [id]: !ly[id] })}>{icon}<span>{name}</span><i /></button>
          ))}
          <button className={ly.zoom === 'head' ? 'on' : ''} role="switch" aria-checked={ly.zoom === 'head'} onClick={() => setLayers({ zoom: ly.zoom === 'head' ? 'mouth' : 'head' })}><Icon.IconZoom size={15} /><span>{L({ it: 'Testa intera', en: 'Whole head' })}</span><i /></button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the attempts

type Attempt =
  | { kind: 'sound'; url: string; report: Report }
  | { kind: 'word'; url: string; heard: string[]; match: { text: string; like: number } | null; score: number; recognised: boolean }
  | { kind: 'plain'; url: string };

function ScoreRing({ score }: { score: number }) {
  const r = 30, c = 2 * Math.PI * r;
  const tone = score >= 85 ? 'gold' : score >= 60 ? 'ok' : 'low';
  return (
    <div className={`tu-ring ${tone}`} role="img" aria-label={`score ${score} of 100`}>
      <svg viewBox="0 0 72 72" width="72" height="72">
        <circle cx="36" cy="36" r={r} className="bg" />
        <circle cx="36" cy="36" r={r} className="fg" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.02, score / 100))} transform="rotate(-90 36 36)" />
      </svg>
      <b>{score}</b>
    </div>
  );
}

// ---------------------------------------------------------------- the tutor

/**
 * Letters: a pronunciation teacher for the alphabets of Urdu, Arabic and
 * Hindi and for the whole International Phonetic Alphabet. One sound at a
 * time. A real voice says it; the head shows it, from the painted anatomy to
 * the skin of the face, layer by layer, with the part that works named, an
 * arrow from where it rests to where it goes, the air and the voice; the
 * mouth is shown in a mirror beside it; everything can be slowed, paused and
 * stepped through. The lesson runs it all in order (listen, learn, watch,
 * repeat, a word, speak), and then the tutor listens: it decodes how the
 * learner said the sound and sets it against what was asked.
 */
export function Tutor() {
  const L = useL();
  const ui = useUi();
  const course = COURSES[COURSE_IDS.includes(ui.tutor.lang) ? ui.tutor.lang : 'ur'];
  const idx = Math.min(ui.tutor.letter, course.entries.length - 1);
  const entry: Entry = course.entries[idx];
  const guide: SoundGuide = course.id === 'ipa' ? guideFor(entry.glyph) : guideFor(entry.sound);
  const place = PLACES[guide.place];
  const p = usePlayer();
  const ear = useRecorder();
  const clip = p.clip;

  const [phase, setPhase] = useState<Phase | null>(null);
  const [row, setRow] = useState<Row | null>(null);
  const [slowSound, setSlowSound] = useState(() => remembered(SLOW_SOUND_KEY, true));
  const [narrate, setNarrate] = useState(() => remembered(NARRATE_KEY, true));
  const [progress, setProgress] = useState(readProgress);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [target, setTarget] = useState<'sound' | 'word'>('sound');
  const [, setVoices] = useState(0);
  const [sentence, setSentence] = useState('');
  const [photo, setPhoto] = useState(true); // the photographed mirror; the three-dimensional face without its photographs
  const [flat, setFlat] = useState(false); // the drawn mirror, when the three-dimensional face cannot be shown
  useEffect(() => onVoices(() => setVoices((v) => v + 1)), []);
  const lesson = useRef(0);
  const auto = useRef(false);
  const clips = useRef(new Map<string, Clip | null>());
  const playback = useRef<HTMLAudioElement | null>(null);
  const meter = useRef<HTMLButtonElement | null>(null);

  // ---- the voices (asked when used: the browser fills its list a moment after the page loads)
  const alphabet = course.id === 'ipa' ? null : course.id;
  const teacher = alphabet ? voiceFor(alphabet) : null;
  const narrator = narratorVoice();
  const soundVoice = (): { voice: SpeechSynthesisVoice; text: string } | null => {
    if (!alphabet) { const c = entry.carrier, v = c ? voiceOf(c.lang) : null; return v && c ? { voice: v, text: c.text } : null; }
    const t = voiceFor(alphabet);
    return t ? { voice: t.voice, text: speechText(entry, alphabet, t.via, 'sound', sayOf(entry, course)) } : null;
  };
  const wordVoice = (ex?: Example): { voice: SpeechSynthesisVoice; text: string } | null => {
    if (!alphabet || ex) { const e = ex ?? entry.examples[0], v = e ? voiceOf(e.lang) : null; return v && e ? { voice: v, text: e.text } : null; }
    const t = voiceFor(alphabet);
    return t ? { voice: t.voice, text: speechText(entry, alphabet, t.via, 'word', '') } : null;
  };
  const nameVoice = (): { voice: SpeechSynthesisVoice; text: string } | null => {
    if (!alphabet) return narrator ? { voice: narrator, text: entry.name } : null;
    const t = voiceFor(alphabet);
    return t && alphabet !== 'hi' ? { voice: t.voice, text: speechText(entry, alphabet, t.via, 'name', '') } : null;
  };

  // ---- the clips of this entry
  const clipFor = (what: What, speed: TutorSpeed, ex?: Example): Clip | null => {
    const src = voice.manual.source;
    const key = `${course.id}:${idx}:${what}:${speed}:${Math.round(src.f0)}:${ex?.text ?? ''}`;
    if (!clips.current.has(key)) {
      const ipa = what === 'sound' ? sayOf(entry, course) : ex ? ex.ipa ?? '' : entry.wordShown || alphabet ? entry.word.ipa : '';
      const phones = wordPhones(ipa);
      let c: Clip | null = null;
      if (phones.length) {
        const score = buildScore(phones, { lang: alphabet ?? 'it', f0: src.f0, ps: Math.max(7, src.ps), rate: 0.9, timeScale: 1 / speed });
        const traj = trajectory(score);
        const stages = stagesOf(score.phones, traj);
        c = { key, what, speed, score, traj, stages, keyT: keyTime(stages, entry.show), label: what === 'sound' ? entry.glyph : ex?.text ?? entry.word.text };
      }
      if (clips.current.size > 80) clips.current.clear();
      clips.current.set(key, c);
    }
    return clips.current.get(key) ?? null;
  };
  /** What is heard with a clip: a real voice at full speed when the browser has one; in slow motion the model's own voice, in step with the mouth. */
  const soundFor = (what: What, speed: TutorSpeed, ex?: Example): Sound => {
    if (speed === 1) {
      const v = what === 'sound' ? soundVoice() : wordVoice(ex);
      if (v) { const rate = what === 'sound' ? 0.75 : 0.82; return { kind: 'voice', id: `${v.voice.name}|${rate}|${v.text}`, speak: () => sayText(v.text, v.voice, rate) }; }
      return entry.silent || (what === 'word' && ex && !ex.ipa) ? { kind: 'none' } : { kind: 'model' };
    }
    return slowSound && !entry.silent ? { kind: 'model' } : { kind: 'none' };
  };
  const run = async (what: What, speed: TutorSpeed, ex?: Example): Promise<Outcome> => {
    playback.current?.pause();
    player.point(null);
    const c = clipFor(what, speed, ex);
    const snd = soundFor(what, speed, ex);
    if (c) { player.load(c, 0); return player.play(snd); }
    // a word the head cannot show: the voice alone
    player.pause();
    if (snd.kind === 'voice') await snd.speak().ended;
    return 'done';
  };
  const endLesson = () => { lesson.current++; setPhase(null); setRow(null); player.point(null); };

  // ---- the explanation, read aloud while the head points at each part
  const rows = useMemo((): [Row, Handle | null, string][] => {
    const tongue: Handle = guide.handle === 'tip' || guide.handle === 'tongue' ? guide.handle : 'tongue';
    return [['lips', 'lips', guide.lips], ['tongue', tongue, guide.tongue], ['air', guide.place === 'nose' ? 'velum' : null, guide.air], ['voice', 'larynx', guide.voice]];
  }, [guide]);
  const explain = async (only?: Row): Promise<boolean> => {
    const my = lesson.current;
    const c = clipFor('sound', 1);
    if (c) player.load(c);
    for (const [id, handle, text] of rows) {
      if (only && id !== only) continue;
      if (my !== lesson.current) return false;
      setRow(id);
      player.point(handle);
      if (narrate && narrator) await sayText(text, narrator, 0.95).ended;
      else await sleep(Math.min(5200, 1100 + text.length * 42));
      if (my !== lesson.current) return false;
      await sleep(220);
    }
    if (my === lesson.current) { setRow(null); player.point(null); }
    return my === lesson.current;
  };

  // ---- the learner's turn: listen, decode, compare
  const award = (score: number) => setProgress((pr) => {
    const mine = pr.best[course.id] ?? {};
    const before = mine[entry.glyph];
    const next: Progress = {
      best: { ...pr.best, [course.id]: { ...mine, [entry.glyph]: Math.max(before ?? 0, score) } },
      xp: pr.xp + Math.round(score / 10) + (score >= 85 && (before ?? 0) < 85 ? 5 : 0),
    };
    remember(PROGRESS_KEY, JSON.stringify(next));
    return next;
  });
  const replay = (url: string) => {
    hush();
    playback.current?.pause();
    const a = new Audio(url);
    playback.current = a;
    void a.play().catch(() => {});
  };
  const practise = async (kind: 'sound' | 'word') => {
    if (recorder.state !== 'idle' && recorder.state !== 'denied') { recorder.stop(); return; }
    player.pause();
    hush();
    playback.current?.pause();
    setAttempt(null);
    recorder.onLevel = (v) => meter.current?.style.setProperty('--level', v.toFixed(3));
    const locale = alphabet ? LOCALE[alphabet] : entry.wordLang;
    const asr = kind === 'word' && canRecognise() ? recognise(locale) : null;
    const take = await recorder.listen(kind === 'word' ? 5500 : 4500);
    asr?.stop();
    if (!take) return;
    if (kind === 'word') {
      const heard = asr ? await asr.heard : [];
      const match = bestMatch(heard, entry.word.text);
      const score = match ? Math.round(match.like * 100) : 0;
      setAttempt({ kind: 'word', url: take.url, heard, match, score, recognised: !!asr });
      if (asr) award(score);
    } else if (entry.silent) {
      setAttempt({ kind: 'plain', url: take.url });
    } else {
      const report = judge(analyse(take.samples, take.sampleRate), { sound: entry.show, say: sayOf(entry, course) });
      setAttempt({ kind: 'sound', url: take.url, report });
      if (!report.heard.silent) award(report.score);
    }
  };

  // ---- what the buttons do
  const hear = (what: What, speed: TutorSpeed, ex?: Example) => { endLesson(); void run(what, speed, ex); };
  const sayName = () => { endLesson(); player.pause(); const v = nameVoice(); if (v) sayText(v.text, v.voice, 0.85); };
  const teach = async () => {
    endLesson();
    const my = ++lesson.current;
    const alive = () => my === lesson.current;
    const play = async (ph: Phase, what: What, speed: TutorSpeed) => {
      if (!alive()) return false;
      setPhase(ph);
      const r = await run(what, speed);
      if (r !== 'done' || !alive()) return false;
      await sleep(420);
      return alive();
    };
    setAttempt(null);
    const ok = (await play('listen', 'sound', 1))
      && (setPhase('learn'), await explain())
      && (await play('watch', 'sound', 0.25))
      && (await play('repeat', 'sound', 1))
      && (await play('word', 'word', 1));
    if (!ok) { if (alive()) setPhase(null); return; }
    const c = clipFor('sound', 1);
    if (c) player.load(c);
    setPhase('speak');
    setTarget('sound');
    await practise('sound');
    if (alive()) setPhase(null);
  };
  const toggle = () => {
    if (p.playing) { endLesson(); player.pause(); }
    else if (clip) hear(clip.what, clip.speed);
  };
  const setSpeed = (s: TutorSpeed) => {
    if (!clip || clip.speed === s) return;
    endLesson();
    const next = clipFor(clip.what, s);
    if (next) player.load(next, (p.t / clip.traj.duration) * next.traj.duration);
  };
  const seek = (t: number) => { endLesson(); player.seek(t); };
  /** Says what was typed: the head goes through it at the chosen speed, with the model's own voice, which the picture follows exactly. */
  const saySentence = () => {
    const text = sentence.trim();
    if (!text) return;
    endLesson();
    playback.current?.pause();
    player.point(null);
    const lang = alphabet ?? 'en';
    const phones = textToPhones(text, lang);
    if (!phones.length) return;
    const speed = clip?.speed ?? 1;
    const src = voice.manual.source;
    const score = buildScore(phones, { lang, f0: src.f0, ps: Math.max(7, src.ps), rate: 0.9, timeScale: 1 / speed });
    const traj = trajectory(score);
    const stages = stagesOf(score.phones, traj);
    const c: Clip = { key: `typed:${lang}:${speed}:${text}`, what: 'word', speed, score, traj, stages, keyT: 0, label: text };
    player.load(c, 0);
    void player.play({ kind: 'model' });
  };
  const go = (i: number, id: CourseId = course.id) => {
    const n = COURSES[id].entries.length;
    const to = ((i % n) + n) % n;
    // the letter already open is said again
    if (id === course.id && to === idx) { hear('sound', 1); return; }
    auto.current = true;
    store.setTutor({ lang: id, letter: to });
  };

  // a new letter: it rests on the stage at its key instant; picked by hand, it is said at once
  useEffect(() => {
    endLesson();
    hush();
    playback.current?.pause();
    setAttempt(null);
    setTarget('sound');
    const c = clipFor('sound', 1);
    if (c) player.load(c);
    if (auto.current) { auto.current = false; void run('sound', 1); }
  }, [course.id, idx]);
  useEffect(() => () => { lesson.current++; player.pause(); player.point(null); hush(); recorder.stop(); playback.current?.pause(); }, []);

  // the keyboard: arrows turn the letters, the space bar plays and pauses
  const keys = useRef({ go, toggle, idx });
  keys.current = { go, toggle, idx };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === 'ArrowRight') keys.current.go(keys.current.idx + 1);
      else if (e.key === 'ArrowLeft') keys.current.go(keys.current.idx - 1);
      else if (e.key === ' ' && (!t || t.tagName !== 'BUTTON')) { e.preventDefault(); keys.current.toggle(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const pick = useMemo(() => (i: number) => keys.current.go(i), []);

  const script = `script-${course.id}`;
  const stage = clip?.stages[p.stage];
  const voiced = entry.sound === 'ã' || (PHONEMES[entry.show]?.voiced ?? true);
  const caption = row ? rows.find((r) => r[0] === row)![2]
    : phase === 'speak' ? L({ it: 'Ora dillo tu: ti ascolto.', en: 'Now you say it. I am listening.' })
      : stage?.caption ?? guide.hint;
  const duration = clip?.traj.duration ?? 1;
  const shown = p.face();
  const words = shown ? shapeOf(shown.pose).words : null;
  const best = progress.best[course.id] ?? {};
  const done = Object.values(best).filter((s) => s >= 60).length;
  const level = Math.floor(progress.xp / XP_PER_LEVEL) + 1;
  const listening = ear.state === 'listening' || ear.state === 'asking';
  const inLesson = phase !== null;
  const hasName = !!nameVoice();
  const rowIcon: Record<Row, React.ReactNode> = { lips: <Icon.IconLips />, tongue: <Icon.IconTongue />, air: <Icon.IconAir />, voice: <Icon.IconVoice /> };
  const rowName: Record<Row, string> = { lips: L({ it: 'Labbra', en: 'Lips' }), tongue: L({ it: 'Lingua', en: 'Tongue' }), air: L({ it: 'Aria', en: 'Air' }), voice: L({ it: 'Voce', en: 'Voice' }) };
  return (
    <main className="tu">
      {/* ------------------------------------------------ the letters */}
      <aside className="tu-rail tu-glass" aria-label={L({ it: 'Le lettere', en: 'The letters' })}>
        <nav className="tu-seg" role="tablist" aria-label={L({ it: 'Corso', en: 'Course' })} style={{ '--n': COURSE_IDS.length } as React.CSSProperties}>
          {COURSE_IDS.map((id) => (
            <button key={id} role="tab" aria-selected={id === course.id} className={id === course.id ? 'on' : ''} onClick={() => id !== course.id && go(0, id)}>
              <span className={`script-${id}`} dir={COURSES[id].dir}>{id === 'ipa' ? 'ə' : COURSES[id].native}</span>
              <small>{COURSES[id].name}</small>
            </button>
          ))}
        </nav>
        <div className="tu-level" title={L({ it: 'Punti guadagnati parlando', en: 'Points earned by speaking' })}>
          <span><b>{done}</b> {L({ it: 'di', en: 'of' })} {course.entries.length} {L({ it: 'provate', en: 'practised' })}</span>
          <div className="bar"><i style={{ width: `${(done / course.entries.length) * 100}%` }} /></div>
          <span className="pts" title={L({ it: 'Livello e punti', en: 'Level and points' })}>{L({ it: 'Liv.', en: 'Lv' })} {level} · {progress.xp}</span>
        </div>
        <Tiles course={course} idx={idx} best={best} onPick={pick} />
      </aside>

      {/* ------------------------------------------------ the stage */}
      <section className="tu-stage">
        <header className="tu-stage-top">
          <ol className={inLesson ? 'tu-phases live' : 'tu-phases'} aria-label={L({ it: 'La lezione', en: 'The lesson' })}>
            {PHASES.map(([id, name], i) => <li key={id} className={id === phase ? 'on' : phase && PHASES.findIndex((x) => x[0] === phase) > i ? 'done' : ''}><i>{i + 1}</i>{L(name)}</li>)}
          </ol>
          {clip && clip.speed < 1 && <span className="tu-badge tu-hud">{SPEEDS.find((s) => s[0] === clip.speed)![1]} {L({ it: 'rallentatore', en: 'slow motion' })}</span>}
        </header>
        <div className="tu-views">
          <button className="tu-arrow" aria-label={L({ it: 'Lettera prima', en: 'Previous letter' })} onClick={() => go(idx - 1)}><Icon.IconChevronLeft /></button>
          <figure className="tu-view side">
            <FaceCanvas kind="side" face={player.face} label={L({ it: 'La testa vista di lato', en: 'The head from the side' })} />
            <figcaption className="tu-hud">{L({ it: 'Di lato', en: 'Side view' })}</figcaption>
            <LayerControls />
          </figure>
          <figure className="tu-view mirror">
            {flat
              ? <FaceCanvas kind="front" face={player.face} label={L({ it: 'La bocca allo specchio', en: 'The mouth in the mirror' })} />
              : photo
                ? <MirrorPhoto face={player.face} label={L({ it: 'La bocca allo specchio', en: 'The mouth in the mirror' })} onFail={() => setPhoto(false)} />
                : <Mirror3D face={player.face} label={L({ it: 'La bocca allo specchio', en: 'The mouth in the mirror' })} onFail={() => setFlat(true)} />}
            <figcaption className="tu-hud">{L({ it: 'Specchio', en: 'Mirror' })}</figcaption>
          </figure>
          <button className="tu-arrow" aria-label={L({ it: 'Lettera dopo', en: 'Next letter' })} onClick={() => go(idx + 1)}><Icon.IconChevronRight /></button>
        </div>
        <p className="tu-caption" aria-live="polite">{caption}</p>
        {words && (
          <dl className="tu-readout" aria-label={L({ it: 'Che cosa fa la bocca adesso', en: 'What the mouth is doing now' })}>
            <div><dt>{L({ it: 'Labbra', en: 'Lips' })}</dt><dd>{words.lips}</dd></div>
            <div><dt>{L({ it: 'Lingua', en: 'Tongue' })}</dt><dd>{words.tongue}</dd></div>
            <div className={words.noseOpen ? 'air' : ''}><dt>{L({ it: 'Naso', en: 'Nose' })}</dt><dd>{words.nose}</dd></div>
            <div className={words.voiceOn ? 'voice' : ''}><dt>{L({ it: 'Voce', en: 'Voice' })}</dt><dd>{words.voice}</dd></div>
            <div><dt>{L({ it: 'Aria', en: 'Air' })}</dt><dd>{words.air}</dd></div>
          </dl>
        )}
        <div className="tu-main">
          <form className="tu-say" onSubmit={(e) => { e.preventDefault(); saySentence(); }}>
            <input value={sentence} onChange={(e) => setSentence(e.target.value)} dir="auto" spellCheck={false}
              placeholder={L({ it: 'Scrivi una parola o una frase…', en: 'Type a word or a sentence…' })} aria-label={L({ it: 'Frase da dire', en: 'Sentence to say' })} />
            <button type="submit" disabled={!sentence.trim()}><Icon.IconPlay size={14} /> {L({ it: 'Dilla', en: 'Say it' })}</button>
          </form>
          <div className="tu-main-group">
            <span>{L({ it: 'Velocità', en: 'Speed' })}</span>
            <div className="tu-mini-seg speeds" role="group" aria-label={L({ it: 'Velocità', en: 'Speed' })}>
              {SPEEDS.map(([s, name, hint]) => <button key={s} className={clip?.speed === s ? 'on' : ''} title={L(hint)} aria-pressed={clip?.speed === s} onClick={() => setSpeed(s)}>{name}</button>)}
            </div>
          </div>
          <button className={listening ? 'tu-speak on' : 'tu-speak'} onClick={() => void practise('sound')}>
            {listening ? <Icon.IconStop size={15} /> : <Icon.IconMic size={17} />} {L({ it: 'Parla', en: 'Speak' })}
          </button>
        </div>
        <div className="tu-transport">
          <button className="tu-play" onClick={toggle} aria-label={p.playing ? L({ it: 'Pausa', en: 'Pause' }) : L({ it: 'Riproduci', en: 'Play' })}>{p.playing ? <Icon.IconPause size={22} /> : <Icon.IconPlay size={22} />}</button>
          <div className="tu-track-wrap">
            <div className="tu-steps">
              <button className="tu-stepper" onClick={() => { endLesson(); player.step(-1); }} aria-label={L({ it: 'Passo indietro', en: 'Step back' })}><Icon.IconStepBack size={15} /></button>
              {clip?.stages.map((s, i) => (
                <button key={i} className={i === p.stage && p.t <= s.t1 + 1e-6 ? 'tu-step on' : 'tu-step'} title={s.caption} onClick={() => seek(s.key)}>
                  <b>{s.ipa}</b><span>{STEP_NAME[s.part]}</span>
                </button>
              ))}
              <button className="tu-stepper" onClick={() => { endLesson(); player.step(1); }} aria-label={L({ it: 'Passo avanti', en: 'Step forward' })}><Icon.IconStepForward size={15} /></button>
            </div>
            <input className="tu-range" type="range" min={0} max={duration} step={duration / 500} value={Math.min(duration, p.t)}
              style={{ '--at': `${(100 * Math.min(duration, p.t)) / duration}%` } as React.CSSProperties}
              aria-label={L({ it: 'Istante', en: 'Moment' })} onChange={(e) => seek(Number(e.target.value))} />
          </div>
          <button className={slowSound ? 'tu-icon-btn on' : 'tu-icon-btn'} aria-pressed={slowSound} onClick={() => setSlowSound((v) => { remember(SLOW_SOUND_KEY, v ? '0' : '1'); return !v; })}
            title={L({ it: 'Al rallentatore: la voce del modello, a tempo con il disegno', en: 'In slow motion: the model’s own voice, in step with the picture' })}>
            {slowSound ? <Icon.IconSpeaker size={18} /> : <Icon.IconSpeakerOff size={18} />}
          </button>
        </div>
      </section>

      {/* ------------------------------------------------ the letter */}
      <aside className="tu-panel tu-glass" style={{ '--place': place.colour } as React.CSSProperties}>
        <header className="tu-hero">
          <div className={`tu-glyph ${script}`} dir={course.dir}>{entry.glyph}</div>
          <div className="tu-names">
            <span className="tu-kicker tu-hud">{idx + 1} / {course.entries.length} · {place.name}</span>
            {course.id === 'ipa'
              ? <h2>{entry.roman}</h2>
              : <h2><span className={script} dir={course.dir}>{entry.name}</span><em>{entry.roman}</em></h2>}
            <p>{course.id === 'ipa' ? entry.name : guide.like ? `${L({ it: 'come', en: 'like' })} ${guide.like}` : ''}</p>
          </div>
        </header>

        <button className={inLesson ? 'tu-cta stop' : 'tu-cta'} onClick={() => (inLesson ? (endLesson(), player.pause(), hush(), recorder.stop()) : void teach())}>
          {inLesson ? <><Icon.IconStop size={18} />{L({ it: 'Ferma la lezione', en: 'Stop the lesson' })}</> : <><Icon.IconLesson size={20} />{L({ it: 'Inizia la lezione', en: 'Start the lesson' })}</>}
        </button>
        <div className="tu-actions" style={{ '--n': hasName ? 4 : 3 } as React.CSSProperties}>
          <button onClick={() => hear('sound', 1)}><Icon.IconSpeaker />{L({ it: 'Ascolta', en: 'Listen' })}</button>
          <button onClick={() => hear('sound', 0.25)}><Icon.IconSlow />{L({ it: 'Al rallentatore', en: 'Slow motion' })}</button>
          {hasName && <button onClick={sayName}><Icon.IconName />{L({ it: 'Nome', en: 'Name' })}</button>}
          <button onClick={() => hear('word', 1)}><Icon.IconWord />{L({ it: 'Parola', en: 'Word' })}</button>
        </div>

        {/* the learner's turn */}
        <section className={phase === 'speak' ? 'tu-card turn live' : 'tu-card turn'}>
          <header>
            <h3 className="tu-hud">{L({ it: 'Tocca a te', en: 'Your turn' })}</h3>
            <div className="tu-mini-seg">
              <button className={target === 'sound' ? 'on' : ''} onClick={() => { setTarget('sound'); setAttempt(null); }}>{L({ it: 'Suono', en: 'Sound' })}</button>
              <button className={target === 'word' ? 'on' : ''} onClick={() => { setTarget('word'); setAttempt(null); }}>{L({ it: 'Parola', en: 'Word' })}</button>
            </div>
          </header>
          <div className="tu-mic-row">
            <button ref={meter} className={`tu-mic ${ear.state}`} onClick={() => { if (phase !== 'speak') endLesson(); void practise(target); }} aria-label={listening ? L({ it: 'Ferma', en: 'Stop' }) : L({ it: 'Parla', en: 'Speak' })}>
              {listening ? <Icon.IconStop size={22} /> : <Icon.IconMic size={26} />}
            </button>
            <div className="tu-mic-text">
              <b>{ear.state === 'asking' ? L({ it: 'Consenti il microfono…', en: 'Allow the microphone…' }) : ear.state === 'listening' ? L({ it: 'Ti ascolto…', en: 'Listening…' }) : ear.state === 'working' ? L({ it: 'Un momento…', en: 'One moment…' })
                : target === 'sound' ? <>{L({ it: 'Di’', en: 'Say' })} <span className="tu-say">{course.id === 'ipa' ? `[${sayOf(entry, course)}]` : entry.roman}</span></>
                  : <>{L({ it: 'Di’', en: 'Say' })} <span className={`tu-say ${alphabet ? script : ''}`} dir={alphabet ? course.dir : 'ltr'}>{entry.word.text}</span></>}</b>
              <span>{ear.state === 'denied' ? L({ it: 'Il microfono è bloccato: consentilo nel browser.', en: 'The microphone is blocked: allow it in the browser.' })
                : target === 'sound' ? L({ it: 'Ascolto la voce, l’aria e il tipo di suono, e li confronto con ciò che ti ho chiesto.', en: 'I listen for the voice, the air and the kind of sound, and set them against what I asked.' })
                  : L({ it: 'Il riconoscimento vocale dice quale parola ha capito.', en: 'Speech recognition tells which word it understood.' })}</span>
            </div>
          </div>

          {attempt?.kind === 'sound' && (
            <div className="tu-result">
              <div className="tu-result-head">
                <ScoreRing score={attempt.report.score} />
                <div>
                  <b className="tu-verdict tu-hud">{attempt.report.headline}</b>
                  <div className="tu-compare">
                    <button onClick={() => replay(attempt.url)}><Icon.IconUser size={15} />{L({ it: 'Io', en: 'Me' })}</button>
                    <button onClick={() => hear('sound', 1)}><Icon.IconSpeaker size={15} />{L({ it: 'Maestro', en: 'Teacher' })}</button>
                    <button onClick={() => void practise('sound')}><Icon.IconRetry size={15} />{L({ it: 'Riprova', en: 'Again' })}</button>
                  </div>
                </div>
              </div>
              {!attempt.report.heard.silent && clipFor('sound', 1) && (
                <div className="tu-tracks" aria-label={L({ it: 'Il maestro e tu, nel tempo', en: 'The teacher and you, through time' })}>
                  <span>{L({ it: 'Maestro', en: 'Teacher' })}</span><div className="tu-track">{teacherTrack(clipFor('sound', 1)!).map((c, i) => <i key={i} className={c} />)}</div>
                  <span>{L({ it: 'Tu', en: 'You' })}</span><div className="tu-track">{yourTrack(attempt.report).map((c, i) => <i key={i} className={c} />)}</div>
                  <span /><div className="tu-legend"><i className="v" />{L({ it: 'voce', en: 'voice' })}<i className="a" />{L({ it: 'solo aria', en: 'air only' })}<i className="c" />{L({ it: 'chiuso', en: 'closed' })}</div>
                </div>
              )}
              <ul className="tu-findings">
                {attempt.report.findings.map((f) => (
                  <li key={f.id} className={f.ok === null ? 'unknown' : f.ok ? 'ok' : 'bad'}>
                    <i>{f.ok === null ? <Icon.IconUnknown size={14} /> : f.ok ? <Icon.IconCheck size={14} /> : <Icon.IconCross size={14} />}</i>
                    <div>
                      <b>{f.title}</b>
                      <span><em>{L({ it: 'chiesto', en: 'asked' })}</em> {f.want}</span>
                      <span><em>{L({ it: 'sentito', en: 'heard' })}</em> {f.got}</span>
                      {f.ok === false && f.tip && <p>{f.tip}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {attempt?.kind === 'word' && (
            <div className="tu-result">
              <div className="tu-result-head">
                {attempt.recognised && <ScoreRing score={attempt.score} />}
                <div>
                  <b className="tu-verdict tu-hud">{!attempt.recognised ? L({ it: 'Riascoltati', en: 'Listen back' }) : attempt.score >= 85 ? L({ it: 'Capito!', en: 'Understood!' }) : attempt.match ? L({ it: 'Quasi', en: 'Close' }) : L({ it: 'Non capito', en: 'Not understood' })}</b>
                  <div className="tu-compare">
                    <button onClick={() => replay(attempt.url)}><Icon.IconUser size={15} />{L({ it: 'Io', en: 'Me' })}</button>
                    <button onClick={() => hear('word', 1)}><Icon.IconSpeaker size={15} />{L({ it: 'Maestro', en: 'Teacher' })}</button>
                    <button onClick={() => void practise('word')}><Icon.IconRetry size={15} />{L({ it: 'Riprova', en: 'Again' })}</button>
                  </div>
                </div>
              </div>
              <ul className="tu-findings">
                <li className={!attempt.recognised ? 'unknown' : attempt.score >= 85 ? 'ok' : 'bad'}>
                  <i>{!attempt.recognised ? <Icon.IconUnknown size={14} /> : attempt.score >= 85 ? <Icon.IconCheck size={14} /> : <Icon.IconCross size={14} />}</i>
                  <div>
                    <b>{L({ it: 'La parola', en: 'The word' })}</b>
                    <span><em>{L({ it: 'chiesto', en: 'asked' })}</em> <span className={alphabet ? script : ''} dir={alphabet ? course.dir : 'ltr'}>{entry.word.text}</span></span>
                    <span><em>{L({ it: 'capito', en: 'understood' })}</em> {!attempt.recognised ? L({ it: 'questo browser non ha il riconoscimento vocale', en: 'this browser has no speech recognition' }) : attempt.heard[0] ? <span dir="auto">{attempt.heard[0]}</span> : L({ it: 'niente', en: 'nothing' })}</span>
                  </div>
                </li>
              </ul>
            </div>
          )}
          {attempt?.kind === 'plain' && (
            <div className="tu-result">
              <p className="tu-note">{L({ it: 'Questo suono non si fa con l’aria dei polmoni: il maestro non sa ancora giudicarlo. Riascoltati e confronta.', en: 'This sound is not made with air from the lungs: the tutor cannot judge it yet. Listen back and compare.' })}</p>
              <div className="tu-compare"><button onClick={() => replay(attempt.url)}><Icon.IconUser size={15} />{L({ it: 'Io', en: 'Me' })}</button><button onClick={() => void practise('sound')}><Icon.IconRetry size={15} />{L({ it: 'Riprova', en: 'Again' })}</button></div>
            </div>
          )}
        </section>

        {/* how to make it */}
        <section className="tu-card how">
          <header>
            <h3 className="tu-hud">{L({ it: 'Come si fa', en: 'How to make it' })}</h3>
            <button className={narrate ? 'tu-chip on' : 'tu-chip'} aria-pressed={narrate} title={L({ it: 'Leggi le spiegazioni ad alta voce', en: 'Read the explanations aloud' })}
              onClick={() => setNarrate((v) => { remember(NARRATE_KEY, v ? '0' : '1'); if (v) hush(); return !v; })}>
              {narrate ? <Icon.IconSpeaker size={14} /> : <Icon.IconSpeakerOff size={14} />}{L({ it: 'Voce guida', en: 'Read aloud' })}
            </button>
          </header>
          {entry.note && <p className="tu-note">{entry.note}</p>}
          {rows.map(([id, handle]) => (
            <button key={id} className={`tu-row${row === id ? ' on' : ''}${id === 'voice' && voiced ? ' voiced' : ''}`}
              onMouseEnter={() => !inLesson && !p.playing && player.point(handle)} onMouseLeave={() => !inLesson && row === null && player.point(null)}
              onClick={() => { endLesson(); player.pause(); void explain(id); }}>
              <i>{rowIcon[id]}</i>
              <div><b>{rowName[id]}</b><span>{rows.find((r) => r[0] === id)![2]}</span></div>
            </button>
          ))}
          {guide.trick && <div className="tu-row tip"><i><Icon.IconIdea /></i><div><b>{L({ it: 'Prova così', en: 'Try this' })}</b><span>{guide.trick}</span></div></div>}
        </section>

        {/* a word with it; for the IPA, words from several languages */}
        <section className="tu-card words">
          <header><h3 className="tu-hud">{course.id === 'ipa' ? L({ it: 'Nelle lingue', en: 'In languages' }) : L({ it: 'Una parola', en: 'A word' })}</h3></header>
          {course.id !== 'ipa' && (
            <div className="tu-word">
              <span className="pic" aria-hidden>{pictureOf(entry.word.meaning)}</span>
              <div className="txt">
                <b className={script} dir={course.dir}>{entry.word.text}</b>
                <span><em>{entry.word.roman}</em> · {entry.word.meaning}</span>
              </div>
              <button className="tu-icon-btn" onClick={() => hear('word', 0.5)} title={L({ it: 'La parola al rallentatore', en: 'The word in slow motion' })}><Icon.IconSlow size={18} /></button>
              <button className="tu-icon-btn on" onClick={() => hear('word', 1)} title={L({ it: 'Ascolta la parola', en: 'Hear the word' })}><Icon.IconPlay size={16} /></button>
            </div>
          )}
          {entry.examples.map((ex) => {
            const has = !!voiceOf(ex.lang);
            return (
              <div key={ex.lang + ex.text} className="tu-word ex">
                <span className="lang tu-hud">{ex.language}</span>
                <div className="txt">
                  <b dir="auto">{ex.text}</b>
                  <span>{ex.roman && <em>{ex.roman}</em>}{ex.roman ? ' · ' : ''}{ex.meaning}</span>
                </div>
                <button className={has ? 'tu-icon-btn on' : 'tu-icon-btn'} disabled={!has && !ex.ipa} onClick={() => hear('word', 1, ex)}
                  title={has ? L({ it: 'Ascolta con una voce di questa lingua', en: 'Hear it in a voice of this language' }) : ex.ipa ? L({ it: 'Nessuna voce per questa lingua: parla il modello', en: 'No voice for this language here: the model speaks' }) : L({ it: 'Nessuna voce per questa lingua in questo browser', en: 'No voice for this language in this browser' })}><Icon.IconPlay size={16} /></button>
              </div>
            );
          })}
        </section>

        {course.marks.length > 0 && (
          <details className="tu-card marks">
            <summary className="tu-hud">{L({ it: 'Lunghezza, accento e segni', en: 'Length, stress and marks' })}</summary>
            <dl>{course.marks.map((m) => <div key={m.symbol + m.name}><dt>{m.symbol}</dt><dd><b>{m.name}</b>{m.means} <em>{m.example}</em></dd></div>)}</dl>
          </details>
        )}
        {alphabet && !teacher && <p className="tu-note">{L({ it: 'Questo browser non ha una voce per questa lingua: parla la voce del modello.', en: 'This browser has no voice for this language: the model’s voice speaks instead.' })}</p>}
        {alphabet && teacher && teacher.via !== alphabet && <p className="tu-note small">{L({ it: 'Voce: hindi (gli stessi suoni dell’urdu).', en: 'Voice: Hindi (the same sounds as Urdu).' })}</p>}
      </aside>
    </main>
  );
}
