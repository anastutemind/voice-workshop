/**
 * Runs a model on fal.ai and saves what it makes.
 *
 *   npx tsx scripts/fal.ts <model-id> <params.json> <out-dir> [name]
 *
 * params.json holds the model's input. Any string in it that names a local
 * file ("@path/to/photo.jpg") is sent as the file itself (a data URI), so the
 * pictures and recordings of this project can be given as references. The
 * request is queued, waited for, and every image, video or audio file in the
 * answer is downloaded into out-dir as <name>-<n>.<ext>; the whole answer is
 * kept beside them as <name>.json. The key is read from FAL_KEY (never
 * written anywhere).
 *
 * Model ids and their inputs: https://fal.ai/models (each model's page has an
 * "API" tab with its schema).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const [model, paramsPath, outDir, name = 'out'] = process.argv.slice(2);
if (!model || !paramsPath || !outDir) {
  console.error('usage: npx tsx scripts/fal.ts <model-id> <params.json> <out-dir> [name]');
  process.exit(2);
}
const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
if (!key) { console.error('FAL_KEY is not set'); process.exit(2); }

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };
/** local files named "@path" become data URIs */
function inline(v: unknown): unknown {
  if (typeof v === 'string' && v.startsWith('@')) {
    const p = v.slice(1);
    return `data:${MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(p).toString('base64')}`;
  }
  if (Array.isArray(v)) return v.map(inline);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, inline(x)]));
  return v;
}

const auth = { Authorization: `Key ${key}` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const input = inline(JSON.parse(readFileSync(paramsPath, 'utf8')));
  const sub = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!sub.ok) { console.error('submit failed', sub.status, (await sub.text()).slice(0, 800)); process.exit(1); }
  const q = (await sub.json()) as { request_id: string; status_url: string; response_url: string };
  console.error('queued', q.request_id);
  const t0 = Date.now();
  for (;;) {
    const st = (await (await fetch(q.status_url, { headers: auth })).json()) as { status: string };
    if (st.status === 'COMPLETED') break;
    if (Date.now() - t0 > 20 * 60 * 1000) { console.error('gave up waiting'); process.exit(1); }
    await sleep(2500);
  }
  const res = await fetch(q.response_url, { headers: auth });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) { console.error('failed', res.status, JSON.stringify(body).slice(0, 800)); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(body, null, 1));
  // every file the answer names
  const urls: string[] = [];
  const walk = (v: unknown) => {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.url === 'string' && /^https?:/.test(o.url)) urls.push(o.url);
      for (const x of Object.values(o)) walk(x);
    }
  };
  walk(body);
  let n = 0;
  for (const u of urls) {
    const r = await fetch(u);
    const ext = extname(new URL(u).pathname) || '.bin';
    const file = join(outDir, `${name}-${n++}${ext}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    console.log(file);
  }
  console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${n} file(s), answer in ${basename(join(outDir, `${name}.json`))}`);
}

void main();
