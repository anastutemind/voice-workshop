/**
 * Makes the mirror's speaking video of every recording with Kling AI Avatar (fal.ai): the man of the mirror's
 * photograph says what the recording says, and the clip is kept to be shown while the recording plays.
 *
 *   npx tsx scripts/mirror-kling.ts [--tier standard|pro] [--packs N] [--only text] [--dry] [--cut-only]
 *
 * A clip is billed by its length, and a word is a second long: so the recordings are packed, a few seconds of them
 * with a short silence between, into one audio file; Kling makes one video of the pack; and the video is cut
 * apart again, a clip to each recording, with where in the clip the recording's own time zero lies:
 *
 *   public/mirror/clips/<id>.mp4          the clip (no sound; the mouth of the man saying the recording)
 *   public/mirror/clips/manifest.json     { "<recording key>": { f: "<id>.mp4", t0: seconds, dur: seconds } }
 *
 * The player shows the clip at time t0 + (the recording's time) while the recording plays.
 * Packs, Kling's answers and the audio are kept in scripts/.kling/ (not committed): a pack already made is not made
 * again, so a run can be stopped and taken up again; a changed recording changes its pack (the name is the audio's hash).
 * --tier pro makes the same with the dearer model (the clips are named alike: a rerun replaces them).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fal } from './falClient';
import { RECORDED_VOICE } from '../src/ui/tutor/clips';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const tier = opt('--tier', 'standard');
const maxPacks = Number(opt('--packs', '1000'));
const only = opt('--only', '');
const dry = args.includes('--dry');
const cutOnly = args.includes('--cut-only');
const SCALE = Number(opt('--scale', '576'));

const AUDIO = new URL('../public/audio/tutor/', import.meta.url).pathname;
const CLIPS = new URL('../public/mirror/clips/', import.meta.url).pathname;
const WORK = new URL('./.kling/', import.meta.url).pathname;
const FACE = new URL('../public/mirror/rest.jpg', import.meta.url).pathname;
const FS = 24000;
/** the silence before the first recording of a pack, and between two, seconds */
const LEAD = 0.3, GAP = 0.35;
/** a pack's recordings together last at most this long, seconds (a long clip lets the head wander) */
const PACK_MAX = 6.5;
/** the clip of a recording starts this long before its sound and ends this long after, seconds */
const BEFORE = 0.2, AFTER = 0.1;
const PRICE = tier === 'pro' ? 0.115 : 0.0562;
const PROMPT = "A man demonstrating pronunciation to a student, speaking slowly and with exaggerated articulation. On open vowels like 'aa' his jaw drops fully and his mouth opens very wide, as when a doctor asks to say 'aah', showing his upper and lower teeth and his tongue; for 'm', 'b' and 'p' the lips close firmly. Head still, calm studio light, same framing and skin texture throughout.";

const manifest = JSON.parse(readFileSync(AUDIO + 'manifest.json', 'utf8')) as Record<string, { f: string }>;
const voices = new Set(Object.values(RECORDED_VOICE));
mkdirSync(WORK, { recursive: true });
mkdirSync(CLIPS, { recursive: true });

/** the recording as mono float samples at FS */
function samples(file: string): Float32Array {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', AUDIO + file, '-ac', '1', '-ar', String(FS), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

interface Item { key: string; file: string; x: Float32Array; at: number }
const keys = Object.keys(manifest).filter((k) => voices.has(k.split('|')[0]) && (!only || k.includes(only))).sort();
// the packs, in order
const packs: { items: Item[]; len: number }[] = [];
let cur: Item[] = [], t = LEAD;
for (const key of keys) {
  const x = samples(manifest[key].f);
  const dur = x.length / FS;
  if (cur.length && t + dur > PACK_MAX) { packs.push({ items: cur, len: t }); cur = []; t = LEAD; }
  cur.push({ key, file: manifest[key].f, x, at: t });
  t += dur + GAP;
}
if (cur.length) packs.push({ items: cur, len: t });
const total = packs.reduce((s, p) => s + p.len, 0);
console.log(`${keys.length} recordings in ${packs.length} packs, ${total.toFixed(0)} s of video: about $${(total * PRICE).toFixed(1)} on ${tier}`);
if (dry) process.exit(0);

/** the clips already cut: manifest of the clips */
const clipManifest: Record<string, { f: string; t0: number; dur: number }> = existsSync(CLIPS + 'manifest.json') ? JSON.parse(readFileSync(CLIPS + 'manifest.json', 'utf8')) : {};

/** where the audio track of Kling's video lies against the pack's audio: the lag (seconds) that makes their loudness curves alike */
function lagOf(pack: Float32Array, video: string): number {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', String(FS), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const v = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const H = 240; // 10 ms
  const env = (x: Float32Array) => { const e: number[] = []; for (let i = 0; i + H <= x.length; i += H) { let s = 0; for (let j = 0; j < H; j++) s += x[i + j] * x[i + j]; e.push(Math.sqrt(s / H)); } return e; };
  const a = env(pack), b = env(v);
  let best = 0, bestScore = -Infinity;
  for (let lag = -50; lag <= 100; lag++) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const j = i + lag; if (j >= 0 && j < b.length) s += a[i] * b[j]; }
    if (s > bestScore) { bestScore = s; best = lag; }
  }
  return best * H / FS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let spent = 0;
async function makePack(p: { items: Item[]; len: number }, n: number): Promise<void> {
  const x = new Float32Array(Math.round(p.len * FS));
  for (const it of p.items) x.set(it.x, Math.round(it.at * FS));
  const id = createHash('sha1').update(Buffer.from(x.buffer)).digest('hex').slice(0, 12);
  const mp3 = `${WORK}${id}.mp3`, video = `${WORK}${id}.${tier}.mp4`;
  if (!existsSync(video) && !cutOnly) {
    const wav = `${WORK}${id}.wav`;
    // 16-bit wav, then mp3 (what Kling is sent)
    const pcm = Buffer.alloc(x.length * 2);
    for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
    writeFileSync(wav + '.raw', pcm);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 's16le', '-ar', String(FS), '-ac', '1', '-i', wav + '.raw', '-b:a', '128k', mp3]);
    let last = '';
    for (let k = 0; k < 3; k++) {
      try {
        const r = await fal(`fal-ai/kling-video/ai-avatar/v2/${tier}`, { image_url: '@' + WORK + 'face.png', audio_url: '@' + mp3, prompt: PROMPT });
        const f = r.files.find((o) => /\.mp4$/i.test(o.name));
        if (!f) throw new Error('no video');
        writeFileSync(video, f.bytes);
        spent += p.len * PRICE;
        last = '';
        break;
      } catch (e) { last = (e as Error).message.slice(0, 200); await sleep(3000); }
    }
    if (last) { console.log(`!! pack ${n} (${p.items.length} recordings): ${last}`); return; }
  }
  if (!existsSync(video)) return;
  // the audio track of the video against the pack's: its own lead
  const lag = lagOf(x, video);
  for (const it of p.items) {
    const id2 = createHash('sha1').update(it.key).digest('hex').slice(0, 12);
    const s = Math.max(0, it.at + lag - BEFORE), e = it.at + lag + it.x.length / FS + AFTER;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', s.toFixed(3), '-to', e.toFixed(3), '-i', video, '-an',
      '-vf', `scale=${SCALE}:-2:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', `${CLIPS}${id2}.mp4`]);
    clipManifest[it.key] = { f: `${id2}.mp4`, t0: Math.round((it.at + lag - s) * 1000) / 1000, dur: Math.round((e - s) * 1000) / 1000 };
  }
  console.log(`pack ${n}: ${p.items.length} clips, kling lag ${(lag * 1000).toFixed(0)} ms${spent ? `, spent $${spent.toFixed(2)} so far` : ''}`);
}

// the face Kling is given: the mirror's rest photograph
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', FACE, WORK + 'face.png']);
const todo = packs.slice(0, maxPacks);
let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  for (;;) {
    const i = next++;
    if (i >= todo.length) return;
    await makePack(todo[i], i + 1);
    writeFileSync(CLIPS + 'manifest.json', JSON.stringify(clipManifest, null, 0).replace(/},"/g, '},\n"') + '\n');
  }
}));
console.log(`${Object.keys(clipManifest).length} clips in the manifest${spent ? `; spent about $${spent.toFixed(2)} on Kling` : ''}`);
