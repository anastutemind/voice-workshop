import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/');
const UI = files(join(SRC, 'ui')).filter((f) => !rel(f).startsWith('ui/voice/'));

/**
 * Files still allowed to break a rule while they are being moved to the
 * voice controller. The list may only shrink: a file that no longer needs
 * its exception makes the test fail until it is removed from here.
 */
// the tutor's recorder opens an audio context of its own to listen to the microphone: it never reaches the engine
const ALLOWED: Record<string, string[]> = { AudioContext: ['ui/tutor/recorder.ts', 'ui/tutor/clips.ts'] };

function offenders(rule: RegExp, list: string[]): string[] {
  return list.filter((f) => rule.test(readFileSync(f, 'utf8'))).map(rel);
}

describe('one door to the voice', () => {
  it('only the voice controller and the entry point reach the audio', () => {
    const all = files(SRC).filter((f) => !rel(f).startsWith('ui/voice/') && !rel(f).startsWith('audio/') && rel(f) !== 'main.tsx');
    expect(offenders(/from ['"][./]*(\.\.\/)*audio\//, all)).toEqual([]);
  });

  it('the interface never writes the engine parameters directly', () => {
    const rules: [string, RegExp][] = [
      ['setParams', /\.setParams\(/],
      ['postMessage', /postMessage\(/],
      ['AudioContext', /new AudioContext|AudioBufferSource/],
      // the hands' parameters are changed only through voice.edit()
      ['manual write', /\.manual\.[\w.[\]]+\s*(=(?!=)|\+=|-=)/],
    ];
    for (const [name, rule] of rules) {
      const hits = offenders(rule, UI);
      const allowed = ALLOWED[name] ?? [];
      expect(hits.filter((h) => !allowed.includes(h)), name).toEqual([]);
      expect(allowed.filter((a) => !hits.includes(a)), `${name}: exceptions no longer needed`).toEqual([]);
    }
  });
});
