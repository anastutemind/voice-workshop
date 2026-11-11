/**
 * A small client of fal.ai for the scripts: runs a model with an input (any
 * string "@path" is sent as a data URI of that file), waits for it, and
 * returns the answer with every file it names downloaded. The key is read
 * from FAL_KEY and never written anywhere. See also scripts/fal.ts (the same
 * from the command line).
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname } from 'node:path';

/**
 * The fal.ai key: the private file of this Mac (~/.config/voice-workshop/fal.key, made from the key of the user's own
 * account) first, the environment's (FAL_KEY) if there is no file. Never printed or kept anywhere else.
 */
export function falKey(): string | null {
  const file = `${homedir()}/.config/voice-workshop/fal.key`;
  if (existsSync(file)) { const k = readFileSync(file, 'utf8').trim(); if (k) return k; }
  return process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? null;
}

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };

function inline(v: unknown): unknown {
  if (typeof v === 'string' && v.startsWith('@')) {
    const p = v.slice(1);
    return `data:${MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(p).toString('base64')}`;
  }
  if (Array.isArray(v)) return v.map(inline);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, inline(x)]));
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FalAnswer { body: Record<string, unknown>; files: { name: string; url: string; bytes: Buffer }[] }

/** Runs `model` on fal.ai with `input`; rejects with the service's message when it refuses or fails. */
export async function fal(model: string, input: Record<string, unknown>, timeoutMs = 20 * 60 * 1000): Promise<FalAnswer> {
  const key = falKey();
  if (!key) throw new Error('no fal.ai key: put it in ~/.config/voice-workshop/fal.key or FAL_KEY');
  const auth = { Authorization: `Key ${key}` };
  const sub = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(inline(input)) });
  if (!sub.ok) throw new Error(`submit ${sub.status}: ${(await sub.text()).slice(0, 400)}`);
  const q = (await sub.json()) as { status_url: string; response_url: string };
  const t0 = Date.now();
  for (;;) {
    const st = (await (await fetch(q.status_url, { headers: auth })).json()) as { status: string };
    if (st.status === 'COMPLETED') break;
    if (Date.now() - t0 > timeoutMs) throw new Error('gave up waiting');
    await sleep(1500);
  }
  const res = await fetch(q.response_url, { headers: auth });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`failed ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  const urls: string[] = [];
  const walk = (v: unknown) => {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.url === 'string' && /^https?:/.test(o.url)) urls.push(o.url);
      for (const x of Object.values(o)) walk(x);
    }
  };
  walk(body);
  const files: FalAnswer['files'] = [];
  for (const url of urls) {
    const r = await fetch(url);
    files.push({ name: new URL(url).pathname.split('/').pop() ?? 'file', url, bytes: Buffer.from(await r.arrayBuffer()) });
  }
  return { body, files };
}
