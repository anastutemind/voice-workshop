/**
 * Listens to the recordings with a speech recogniser (fal.ai's Whisper) and lists the words it does not hear as
 * the word that was meant: a voice may mispronounce, add a sound, or say another word. Letters (one sound) are
 * not checked: a recogniser does not know what to make of them.
 *
 *   npx tsx scripts/tutor-voice-asr.ts [--lang ur|hi|ar|en] [--min 0.6] [--out file.json]
 *
 * A word is compared with what was heard after the marks (vowel signs, tashkeel) and the punctuation are taken
 * off both. Urdu of the letters' courses is heard as Hindi (the key of its recording holds the Devanagari text it was
 * asked for); Urdu words in Arabic letters (the IPA course) as Urdu.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fal } from './falClient';
import { RECORDED_VOICE } from '../src/ui/tutor/clips';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const only = opt('--lang', '');
const min = Number(opt('--min', '0.6'));
const OUT = new URL('../public/audio/tutor/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(OUT + 'manifest.json', 'utf8')) as Record<string, { f: string }>;

const norm = (s: string): string => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
  // (letters the scripts write alike or the recogniser spells either way)
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/ہ/g, 'ه').replace(/ۃ/g, 'ه');
function similar(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

const LANG_OF_VOICE: Record<string, string> = {};
for (const [lang, voice] of Object.entries(RECORDED_VOICE)) LANG_OF_VOICE[voice] = lang;
const tmp = mkdtempSync(join(tmpdir(), 'asr-'));

interface Job { key: string; file: string; text: string; lang: string }
const jobs: Job[] = [];
for (const [key, v] of Object.entries(manifest)) {
  const [voice, rate, ...rest] = key.split('|');
  const lang = LANG_OF_VOICE[voice];
  const text = rest.join('|');
  // (words: said at 0.82; a letter's sound at 0.75; a text of one character is a letter)
  if (!lang || rate !== '0.82' || [...text].length < 2 || (only && lang !== only)) continue;
  jobs.push({ key, file: v.f, text, lang });
}
console.log(jobs.length, 'words to listen to');

const bad: { key: string; heard: string; score: number }[] = [];
let next = 0, done = 0;
async function work(): Promise<void> {
  for (;;) {
    const j = jobs[next++];
    if (!j) return;
    try {
      const wav = join(tmp, j.file.replace('.m4a', '.mp3'));
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', OUT + j.file, '-ac', '1', '-ar', '16000', '-b:a', '64k', wav]);
      // Urdu is heard as Hindi: the key holds its Devanagari
      const language = j.lang === 'ur' && !/[\u0600-\u06FF]/.test(j.text) ? 'hi' : j.lang;
      const r = await fal('fal-ai/wizper', { audio_url: '@' + wav, task: 'transcribe', language });
      const heard = String((r.body as { text?: string }).text ?? '');
      const s = similar(norm(j.text), norm(heard));
      if (s < min) bad.push({ key: j.key, heard: heard.trim(), score: Math.round(s * 100) / 100 });
    } catch (e) { bad.push({ key: j.key, heard: 'ERROR ' + (e as Error).message.slice(0, 80), score: 0 }); }
    if (++done % 50 === 0) console.log(`  ${done} / ${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, work));
rmSync(tmp, { recursive: true, force: true });
bad.sort((a, b) => a.score - b.score);
for (const b of bad) console.log(`${b.score.toFixed(2)}  ${b.key}  heard: ${b.heard}`);
console.log(`${bad.length} of ${jobs.length} not heard as meant (below ${min})`);
if (opt('--out', '')) writeFileSync(opt('--out', ''), JSON.stringify(bad, null, 1));
