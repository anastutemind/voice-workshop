/**
 * Replaces the words that two speech recognisers (tutor-voice-asr.ts: Whisper and ElevenLabs' Scribe) do not hear as
 * the word that was meant: the AI voice sometimes says a word wrongly (a vowel short, a stop voiced the other way).
 *
 *   npx tsx scripts/tutor-voice-hear.ts FLAGGED_WHISPER.json FLAGGED_SCRIBE.json [--variants 12] [--jobs 3] [--max-ms 90]
 *
 * The two files are the --out files of tutor-voice-asr.ts (each lists the words it doubted, with the score of the
 * recognition). A word doubted by both is made again with each other take of the voice (TAKE_VARIANT=k), the recording
 * made from it (tutor-voice.ts, which also finds its sounds) is heard by both recognisers, and the take that both
 * hear best is kept, if it is clearly better than the recording there is now and its closures and releases are found
 * within --max-ms; else the recording as it was is put back.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fal } from './falClient';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const files = args.filter((a, i) => !a.startsWith('--') && !['--variants', '--jobs', '--max-ms'].includes(args[i - 1]));
const variants = Number(opt('--variants', '12'));
const jobs = Number(opt('--jobs', '3'));
const maxAway = Number(opt('--max-ms', '90')) / 1000;
const OUT = new URL('../public/audio/tutor/', import.meta.url).pathname;
const manifestPath = OUT + 'manifest.json';
const tmp = mkdtempSync(join(tmpdir(), 'hear-'));

const norm = (s: string): string => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/ہ/g, 'ه').replace(/ۃ/g, 'ه');
function similar(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

type Flag = { key: string; heard: string; score: number };
const flagged = files.map((f) => new Map((JSON.parse(readFileSync(f, 'utf8')) as Flag[]).map((b) => [b.key, b.score])));
// the words every list doubted (the second file lists only what the first did)
const targets = [...flagged[0].keys()].filter((k) => flagged.every((m) => m.has(k)) && k.split('|')[0] !== 'Daniel');
const now = new Map(targets.map((k) => [k, flagged.reduce((s, m) => s + (m.get(k) ?? 0), 0)]));
console.log(targets.length, 'words doubted by every recogniser');

const mf = () => JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, { f: string; k: number[]; z?: unknown }>;
// the recordings as they are now, to be put back when no take is better
const saved = new Map<string, { entry: unknown; file: string }>();
mkdirSync(join(tmp, 'saved'), { recursive: true });
for (const k of targets) {
  const e = mf()[k];
  if (!e) continue;
  copyFileSync(OUT + e.f, join(tmp, 'saved', e.f));
  saved.set(k, { entry: e, file: e.f });
}

async function hear(wav: string, text: string, lang: string): Promise<number> {
  const mp3 = wav.replace(/\.wav$/, '.mp3');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '16000', '-b:a', '64k', mp3]);
  const language = lang === 'ur' && !/[؀-ۿ]/.test(text) ? 'hi' : lang === 'en-GB' ? 'en' : lang;
  const [w, s] = await Promise.all([
    fal('fal-ai/wizper', { audio_url: '@' + mp3, task: 'transcribe', language }).then((r) => String((r.body as { text?: string }).text ?? ''), () => ''),
    fal('fal-ai/elevenlabs/speech-to-text/scribe-v2', { audio_url: '@' + mp3, language_code: language, diarize: false, tag_audio_events: false }).then((r) => String((r.body as { text?: string }).text ?? '').replace(/\([^)]*\)/g, ''), () => ''),
  ]);
  return similar(norm(text), norm(w)) + similar(norm(text), norm(s));
}

const LANG: Record<string, string> = { Naqsh: 'ur', Niraj: 'hi', Hijazi: 'ar', Eric: 'en', Daniel: 'en' };
const best = new Map<string, { k: number; score: number }>();
let next = 0;
async function work(): Promise<void> {
  for (;;) {
    const key = targets[next++];
    if (!key) return;
    const text = key.split('|').slice(2).join('|');
    const lang = LANG[key.split('|')[0]];
    let top = { k: -1, score: now.get(key) ?? 0 };
    for (let k = 0; k < variants; k++) {
      const dir = join(tmp, `${next}-${k}`);
      try {
        execFileSync('npx', ['tsx', 'scripts/tutor-voice.ts', key, '--inspect', dir], { env: { ...process.env, TAKE_VARIANT: String(k) }, stdio: 'ignore' });
        const info = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { key: string; worstSharp: number | null }).find((i) => i.key === key);
        if (!info || info.worstSharp === null || info.worstSharp > maxAway) continue;
        const wav = readdirSync(dir).find((f) => f.endsWith('.made.wav'))!;
        const score = await hear(join(dir, wav), text, lang);
        console.log(`  ${key} variant ${k}: heard ${score.toFixed(2)} of 2 (closures ${(1000 * info.worstSharp).toFixed(0)} ms)`);
        if (score > top.score + 1e-6) top = { k, score };
        if (score >= 1.7) break;
      } catch { /* the voice may refuse or the take be bad: next */ }
    }
    best.set(key, top);
    // the best is made last, so that it is what stays; none better: the old one back
    if (top.k >= 0 && top.score >= (now.get(key) ?? 0) + 0.4) {
      execFileSync('npx', ['tsx', 'scripts/tutor-voice.ts', key], { env: { ...process.env, TAKE_VARIANT: String(top.k) }, stdio: 'ignore' });
      console.log(`${key}: ${(now.get(key) ?? 0).toFixed(2)} -> ${top.score.toFixed(2)} (variant ${top.k})`);
    } else {
      console.log(`${key}: kept as it was (${(now.get(key) ?? 0).toFixed(2)}; best other ${top.score.toFixed(2)})`);
      top.k = -1;
    }
  }
}
await Promise.all(Array.from({ length: jobs }, work));

// the words left as they were: their recordings and times back as they were
const m = mf();
for (const [k, b] of best) {
  if (b.k >= 0) continue;
  const s = saved.get(k);
  if (!s) continue;
  copyFileSync(join(tmp, 'saved', s.file), OUT + s.file);
  m[k] = s.entry as { f: string; k: number[] };
}
writeFileSync(manifestPath, JSON.stringify(m, null, 0).replace(/},"/g, '},\n"') + '\n');
rmSync(tmp, { recursive: true, force: true });
console.log(`${[...best.values()].filter((b) => b.k >= 0).length} of ${targets.length} words made again with a take both recognisers hear better`);
if (!existsSync(manifestPath)) process.exit(1);
