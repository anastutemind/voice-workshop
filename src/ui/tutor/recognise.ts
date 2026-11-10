/**
 * A second opinion on a whole word: the browser's speech recognition, asked
 * in the language being learnt, says which word it understood. It is used
 * only for the word of a letter (a recogniser guesses words, so it cannot
 * judge a single sound: the listener of listen.ts does that from the sound
 * itself), and only where the browser has it.
 */
interface RecognitionLike {
  lang: string; maxAlternatives: number; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canRecognise = (): boolean => !!ctor();

/** Listens for one phrase in a language ('hi-IN', 'fr'); resolves with what the recogniser understood, best guess first (empty if nothing). */
export function recognise(locale: string): { heard: Promise<string[]>; stop: () => void } {
  const C = ctor();
  if (!C) return { heard: Promise.resolve([]), stop: () => {} };
  const rec = new C();
  rec.lang = locale;
  rec.maxAlternatives = 5;
  rec.interimResults = false;
  rec.continuous = false;
  let out: string[] = [];
  const heard = new Promise<string[]>((resolve) => {
    rec.onresult = (e) => {
      const r = e.results[0];
      out = [];
      for (let i = 0; r && i < r.length; i++) out.push(r[i].transcript.trim());
    };
    rec.onerror = () => resolve(out);
    rec.onend = () => resolve(out);
    try { rec.start(); } catch { resolve([]); }
  });
  return { heard, stop: () => { try { rec.stop(); } catch { /* already over */ } } };
}

/** A word as a recogniser and a book may both write it: no vowel marks, one form for the letters that have several. */
export function plainScript(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200C\u200D\u093C]/g, '') // Arabic marks, tatweel, joiners, the nukta
    .replace(/[أإآٱ]/g, 'ا').replace(/[يىئ]/g, 'ی').replace(/ك/g, 'ک').replace(/[ةهھۂ]/g, 'ہ').replace(/ؤ/g, 'و')
    .replace(/[ँं]/g, 'ं')
    .replace(/[^\p{L}\p{M}]/gu, '')
    .normalize('NFC');
}

/** How alike two written words are, 0..1 (1 = the same letters). */
export function likeness(a: string, b: string): number {
  const x = [...plainScript(a)], y = [...plainScript(b)];
  if (!x.length || !y.length) return 0;
  const d: number[] = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return 1 - d[y.length] / Math.max(x.length, y.length);
}

/** The best match of what was understood with the word asked for: the phrase and its likeness. */
export function bestMatch(heard: string[], want: string): { text: string; like: number } | null {
  let best: { text: string; like: number } | null = null;
  for (const h of heard) {
    // a recogniser may wrap the word in others: every word of the phrase is tried, and the whole phrase
    for (const part of [h, ...h.split(/\s+/)]) {
      const like = likeness(part, want);
      if (!best || like > best.like) best = { text: h, like };
    }
  }
  return best;
}
