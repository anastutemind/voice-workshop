import { useStore, Lang } from './store';

/** UI strings in Italian and English (English is the default language). */
export const S = {
  appTitle: { it: 'Officina della voce', en: 'Voice Workshop' },
  appSub: { it: 'un ronzio, un fruscio e un filtro', en: 'a buzz, a hiss and a filter' },
  mLearn: { it: 'Impara', en: 'Learn' },
  mPlay: { it: 'Gioca', en: 'Play' },
  mLab: { it: 'Laboratorio', en: 'Lab' },
  mTutor: { it: 'Lettere', en: 'Letters' },
  mLearnHint: { it: 'Capitoli guidati, un passo alla volta', en: 'Guided chapters, one step at a time' },
  mPlayHint: { it: 'Pochi controlli grandi per giocare con la voce', en: 'A few big controls to play with the voice' },
  mLabHint: { it: 'Tutti i controlli, ordinati lungo la catena del segnale', en: 'Every control, ordered along the signal chain' },
  mTutorHint: { it: 'Le lettere di urdu, arabo e hindi: bocca e lingua al rallentatore', en: 'The letters of Urdu, Arabic and Hindi: mouth and tongue in slow motion' },
  sound: { it: 'Suono', en: 'Sound' },
  soundOn: { it: 'Suono acceso', en: 'Sound on' },
  soundHint: { it: 'Dà alla testa un respiro di voce: senti la sua forma', en: 'Gives the head a breath of voice: you hear its shape' },
  soundOffHint: { it: 'Ferma tutto: frase, melodia, clip e polmoni', en: 'Stops everything: sentence, melody, clip and lungs' },
  hold: { it: 'Tieni', en: 'Hold' },
  holdHint: { it: 'La voce resta accesa invece di tacere dopo un respiro', en: 'The voice keeps sounding instead of resting after a breath' },
  numbers: { it: 'Numeri', en: 'Numbers' },
  freeze: { it: 'Blocca', en: 'Freeze' },
  volume: { it: 'Volume', en: 'Volume' },
  // view tabs
  vSpectrum: { it: 'Spettro', en: 'Spectrum' },
  vScope: { it: 'Onda', en: 'Waveform' },
  vGlottis: { it: 'Corde vocali', en: 'Vocal folds' },
  vChart: { it: 'Mappa delle vocali', en: 'Vowel map' },
  vTube: { it: 'Il tubo', en: 'The tube' },
  v3d: { it: 'Tratto in 3D', en: '3D tract' },
  spectrogram: { it: 'Spettrogramma', en: 'Spectrogram' },
  // control tabs
  cSource: { it: 'Sorgente', en: 'Source' },
  cTract: { it: 'Tratto e persona', en: 'Tract & person' },
  cTeeth: { it: 'Denti e fessura', en: 'Teeth & slit' },
  cNoise: { it: 'Rumore', en: 'Noise' },
  cSpeak: { it: 'Parla', en: 'Speak' },
  cMelody: { it: 'Melodia', en: 'Melody' },
  cAB: { it: 'Esperimento A/B', en: 'A/B experiment' },
  cMachine: { it: 'Voce sintetica', en: 'Machine voice' },
  // head view
  headTitle: { it: 'Sezione della testa', en: 'Head cross-section' },
  headHint: { it: 'Trascina i punti: lingua, punta, mascella, labbra, velo, laringe, denti', en: 'Drag the handles: tongue, tip, jaw, lips, velum, larynx, teeth' },
  fieldPressure: { it: 'Pressione', en: 'Pressure' },
  fieldVelocity: { it: 'Velocità', en: 'Velocity' },
  fieldAir: { it: 'Flusso d’aria', en: 'Airflow' },
  hTongue: { it: 'lingua', en: 'tongue' },
  hTip: { it: 'punta', en: 'tip' },
  hJaw: { it: 'mascella', en: 'jaw' },
  hLips: { it: 'labbra', en: 'lips' },
  hVelum: { it: 'velo', en: 'velum' },
  hLarynx: { it: 'laringe', en: 'larynx' },
  hTeeth: { it: 'denti', en: 'teeth' },
  // misc
  play: { it: 'Ascolta', en: 'Listen' },
  stop: { it: 'Ferma', en: 'Stop' },
  reset: { it: 'Ripristina', en: 'Reset' },
  on: { it: 'acceso', en: 'on' },
  off: { it: 'spento', en: 'off' },
  mic: { it: 'Microfono', en: 'Microphone' },
  micHint: { it: 'Confronta la tua voce (solo analisi, niente registrazione)', en: 'Compare your voice (analysis only, nothing is recorded)' },
  harmonics: { it: 'Armoniche', en: 'Harmonics' },
  envelope: { it: 'Inviluppo del filtro', en: 'Filter envelope' },
  window: { it: 'Finestra', en: 'Window' },
  mel: { it: 'Log-mel 80 bande', en: 'Log-mel 80 bands' },
  linear: { it: 'Lineare', en: 'Linear' },
  noAudio: { it: 'Premi «Suono» per sentire e vedere la voce.', en: 'Press “Sound” to hear and see the voice.' },
} as const;

export type Key = keyof typeof S;

export function tr(k: Key, lang: Lang): string { return S[k][lang]; }

export function useT(): (k: Key) => string {
  const lang = useStore((s) => s.ui.lang);
  return (k: Key) => S[k][lang];
}

/** Inline bilingual text: L({ it, en }). */
export function useL(): (t: { it: string; en: string }) => string {
  const lang = useStore((s) => s.ui.lang);
  return (t) => t[lang];
}
