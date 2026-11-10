/**
 * Makes more photographs of the tutor's face with fal.ai: the same man, the
 * same light and the same frame, the mouth in another shape. Each is made by
 * an image-editing model from a photograph that is already there (the face
 * at rest, or the shape nearest the new one), told to change the mouth and
 * the jaw and nothing else.
 *
 *   npx tsx scripts/mirror-generate.ts <front|side> <name>[,<name>...] [--n 2]
 *
 * The jobs are listed below (JOBS). What comes back is kept, untouched, in
 * /private/tmp/claude-501/vw-faces/gen/<view>/<name>-<k>.png; every call is
 * logged with its cost in /private/tmp/claude-501/vw-faces/fal-log.tsv.
 * Nothing goes into public/ from here: scripts/mirror-prep.py (front) and
 * scripts/skin-prep.py (side) check each picture against the face at rest
 * (the head and the eyes must not have moved), put it in the frame, and only
 * then write it out.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = '/private/tmp/claude-501/vw-faces';
const MODEL = 'fal-ai/nano-banana/edit';
/** what the model costs a picture (fal.ai's price list) */
const COST = 0.039;

const KEEP = 'Keep everything else exactly as it is: the same man, the same skin and stubble, the same light, the same dark background, the same framing and camera; the head, the nose, the eyes and the neck do not move at all. Photorealistic, a real photograph, not a drawing.';
const FRONT = (mouth: string) => `Edit this photograph of a man's face seen from the front. Change only his mouth and jaw: ${mouth} ${KEEP}`;
const SIDE = (mouth: string) => `Edit this photograph of a man's face in profile (seen exactly from the side). Change only his mouth, lips and jaw: ${mouth} ${KEEP} The background stays one flat colour.`;

/** `also`: a second photograph given with the first (an in-between of the two is asked for) */
interface Job { from: string; also?: string; prompt: string; aspect: string }
const JOBS: Record<'front' | 'side', Record<string, Job>> = {
  front: {
    press: { from: 'rest', aspect: '3:4', prompt: FRONT('the lips are pressed firmly together, as when he holds the sound "m": the mouth shut, the lips a little thinner and flattened against each other, no smile.') },
    open1: { from: 'rest', aspect: '3:4', prompt: FRONT('the mouth is just slightly open: the lips parted by about four millimetres in the middle, the jaw dropped a very little, only the lower edge of the upper front teeth showing in the gap. Relaxed lips, no smile.') },
    open2: { from: 'rest', aspect: '3:4', prompt: FRONT('the mouth is half open, as when he says "uh": the lips about one and a half centimetres apart, the jaw dropped, the upper front teeth showing under the upper lip and the tongue lying low in the mouth. Relaxed lips, no smile.') },
    open3: { from: 'open2', aspect: '3:4', prompt: FRONT('his jaw drops further and the mouth opens about twice as much as in this photograph: the lips about two centimetres apart in the middle, the upper front teeth showing under the upper lip, the tongue low in the mouth and the tips of the lower teeth just visible. Relaxed lips, no smile. The chin moves down with the jaw.') },
    between: { from: 'open25', also: 'open', aspect: '3:4', prompt: 'The two photographs show the same man, framed the same way. Make a third photograph of him, framed exactly like the first: the same head position, eyes, nose, skin, stubble, light and dark background, and change only his mouth and jaw so that the mouth is open exactly half way between the first photograph and the second: the lips further apart than in the first, less than in the second, the chin half way between. The upper front teeth show under the upper lip, the tongue lies low. Photorealistic, a real photograph.' },
    open35: { from: 'open25', aspect: '3:4', prompt: FRONT('his jaw drops a little further, the mouth about one and a half times as open as in this photograph: the lips relax and part more, the upper front teeth under the upper lip, a dark gap and the front of the tongue behind the lower teeth, whose tips show above the lower lip. No smile. The chin moves down with the jaw.') },
    ee: { from: 'open1', aspect: '3:4', prompt: FRONT('his lips are drawn a little sideways, about one centimetre wider than in this photograph, as when he says "ee" in "see" (not a smile: the cheeks do not rise); the gap between the lips stays narrow, two or three millimetres, the edges of the upper and lower front teeth showing in it.') },
    halfopen: { from: 'open', aspect: '3:4', prompt: FRONT('his jaw rises and the mouth closes to about half as open as in this photograph: the lips about two centimetres apart in the middle, the upper front teeth and the tips of the lower teeth showing, the tongue low. Relaxed lips. The chin moves up with the jaw.') },
    owide: { from: 'o', aspect: '3:4', prompt: FRONT('the lips stay rounded and pushed forward but the mouth opens wider, as when he says "aw" in "law": a tall oval opening, the jaw dropped further, dark inside with the tips of the lower teeth showing.') },
    kiss: { from: 'round', aspect: '3:4', prompt: FRONT('the lips are rounded and pushed forward and the opening closes completely, as just before he says "w": a small puckered mouth, lips touching all round.') },
    ae: { from: 'e', aspect: '3:4', prompt: FRONT('the mouth opens wider and the lips spread sideways, as when he says the "a" of "cat": the jaw dropped, both rows of teeth showing and the tongue low behind the lower teeth.') },
    fv: { from: 'fv', aspect: '3:4', prompt: FRONT('he gently bites his lower lip: the lower lip is rolled in and up so that the edges of his four upper front teeth rest on the middle of the lower lip, as when he says "f" in "fan". No smile: the corners of the mouth stay where they are, the lower teeth are hidden.') },
    tip: { from: 'open2', aspect: '3:4', prompt: FRONT('he says "la": the mouth half open, and inside it, behind the lower teeth, the front of the tongue is lifted up toward the roof of the mouth so its underside shows. Nothing sticks out of the mouth.') },
    tongue: { from: 'mid', aspect: '3:4', prompt: FRONT('the tip of his tongue sticks out a little between his upper and lower front teeth, as when he says "th" in "think": the teeth gently on the tongue, the lips parted around it.') },
  },
  side: {
    open1: { from: 'rest', aspect: '2:3', prompt: SIDE('the mouth is just slightly open: the lips parted by about four millimetres at the front, the jaw dropped a very little. Relaxed lips, no smile.') },
    open2: { from: 'rest', aspect: '2:3', prompt: SIDE('the mouth is half open, as when he says "uh": the lips about one and a half centimetres apart at the front, the jaw and chin dropped and slightly back, the upper front teeth showing under the upper lip. Relaxed lips, no smile.') },
    open3: { from: 'open2', aspect: '2:3', prompt: SIDE('the jaw drops further and the mouth opens about one and a half times as much as in this photograph: the chin moves down and slightly back, the lower lip goes down with it, the upper lip stays where it is. Relaxed lips, no smile. The nose and the whole head stay exactly the same.') },
    owide: { from: 'o', aspect: '2:3', prompt: SIDE('the lips stay rounded and pushed forward but the mouth opens wider, as when he says "aw" in "law": the jaw and the chin dropped further.') },
    press: { from: 'rest', aspect: '2:3', prompt: SIDE('the lips are pressed firmly together, as when he holds the sound "m": the mouth shut, the lips flattened against each other.') },
    tip: { from: 'open2', aspect: '2:3', prompt: SIDE('the tip of his tongue is raised behind the upper front teeth, as when he says "l"; the mouth half open.') },
  },
};

const view = process.argv[2] as 'front' | 'side';
const names = (process.argv[3] ?? '').split(',').filter(Boolean);
const n = Number(process.argv[process.argv.indexOf('--n') + 1]) || 1;
if (!JOBS[view] || !names.length) { console.error('usage: npx tsx scripts/mirror-generate.ts <front|side> <name>[,<name>...] [--n 2]'); process.exit(2); }

/** the picture a job starts from: a photograph of the project, or one made before (its best take, chosen by hand: <name>.png) */
function source(v: 'front' | 'side', name: string): string {
  const made = join(ROOT, 'gen', v, `${name}.png`);
  if (existsSync(made)) return made;
  // (a photograph already put in the frame by scripts/mirror-prep.py)
  const framed = join(ROOT, v, `${name}.png`);
  if (existsSync(framed)) return framed;
  if (v === 'front') return join(ROOT, 'in', 'front', `${name}.png`);
  return join(ROOT, 'in', 'side', `${name}.png`);
}

function run(name: string, k: number): Promise<void> {
  const job = JOBS[view][name];
  if (!job) return Promise.reject(new Error(`no job ${name}`));
  const dir = join(ROOT, 'gen', view);
  const params = join(dir, `${name}-${k}.params.json`);
  writeFileSync(params, JSON.stringify({ prompt: job.prompt, image_urls: [`@${source(view, job.from)}`, ...(job.also ? [`@${source(view, job.also)}`] : [])], num_images: 1, output_format: 'png', aspect_ratio: job.aspect }));
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('npx', ['tsx', 'scripts/fal.ts', MODEL, params, dir, `${name}-${k}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      const ok = code === 0 && out.trim().length > 0;
      appendFileSync(join(ROOT, 'fal-log.tsv'), [new Date().toISOString(), MODEL, view, `${name}-${k}`, job.from, ok ? 'ok' : `failed ${code}`, ((Date.now() - t0) / 1000).toFixed(0) + 's', ok ? COST.toFixed(3) : '0'].join('\t') + '\n');
      console.log(`${view}/${name}-${k}: ${ok ? out.trim() : 'failed: ' + err.slice(-300)}`);
      resolve();
    });
  });
}

mkdirSync(join(ROOT, 'gen', view), { recursive: true });
void (async () => {
  const all: Promise<void>[] = [];
  for (const name of names) {
    // (takes are numbered on from those already made)
    let k = 0;
    for (let i = 0; i < n; i++) { while (existsSync(join(ROOT, 'gen', view, `${name}-${k}.params.json`))) k++; writeFileSync(join(ROOT, 'gen', view, `${name}-${k}.params.json`), ''); all.push(run(name, k)); }
  }
  await Promise.all(all);
})();
