/**
 * The picture keeps to the sound on any computer. The player is run here
 * with a recording that plays at its own speed on a clock of its own, on
 * computers that draw sixty, twenty, six and four frames a second (and one
 * that stutters), each frame seen some time after it was drawn. What a
 * viewer would see is then set against what is heard at that instant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compactPhones } from '../src/dsp/speech/indic';
import { buildScore } from '../src/dsp/speech/sequencer';
import { PHONEMES } from '../src/dsp/speech/phonemes';
import { stagesOf, trajectory, keyTime } from '../src/ui/tutor/motion';
import { fit } from '../src/ui/tutor/align';
import { heardNow, LEAD_MAX, LEAD_MIN, Pace } from '../src/ui/tutor/sync';
import type { VoiceClip } from '../src/ui/tutor/clips';

/** the wall clock of the made-up computer, milliseconds */
let wall = 0;
/** when the recording's first sample is heard, on that clock */
let heardAt = 0;
let rec: VoiceClip;

vi.mock('../src/ui/tutor/clips', () => ({
  voiceClip: async () => rec,
  playClip: () => { heardAt = wall + 40; return { now: () => (wall - heardAt) / 1000, ended: new Promise<void>(() => {}), latency: () => 0.02 }; },
  stopClip: () => {},
}));

/** A recording of "bāb" as the script makes them: silence, then sound, with the times of its sounds beside it. */
function recording(): VoiceClip {
  const fs = 22050, n = Math.round(0.9 * fs), x = new Float32Array(n);
  for (let i = Math.round(0.05 * fs); i < Math.round(0.82 * fs); i++) {
    const t = i / fs;
    x[i] = 0.3 * Math.sin(2 * Math.PI * 120 * t) + 0.2 * Math.sin(2 * Math.PI * 720 * t) + 0.1 * Math.sin(2 * Math.PI * 1200 * t);
  }
  const buffer = { duration: n / fs, sampleRate: fs, length: n, numberOfChannels: 1, getChannelData: () => x } as unknown as AudioBuffer;
  return { buffer, t0: 0.05, t1: 0.82, marks: [-0.01, 0.072, 0.113, 0.604, 0.71, 0.755] };
}

function clip() {
  const ps = compactPhones('baːb');
  const vi_ = ps.findIndex((p) => PHONEMES[p.ipa]?.manner === 'vowel');
  ps[vi_].stress = true; ps[0].wordStart = true; ps[ps.length - 1].wordEnd = true;
  const score = buildScore(ps, { lang: 'ar', f0: 120, ps: 8, rate: 0.9, timeScale: 1 });
  const traj = trajectory(score);
  const stages = stagesOf(score.phones, traj);
  return { key: 'test', what: 'word' as const, speed: 1 as const, score, traj, stages, keyT: keyTime(stages, 'b'), label: 'bāb' };
}

/**
 * Plays the clip with the recording on a computer that starts a frame every `gap()` milliseconds and shows it
 * `latency` milliseconds after drawing it. Returns, for every frame shown while the recording sounds, how far the
 * mouth on the screen is from the mouth of what is heard, in seconds of the movement, at the middle of the
 * time the frame stays on the screen (positive: the picture is ahead).
 */
async function watch(gap: () => number, latency: number): Promise<{ errors: number[]; heardErrors: number[]; endShown: number; speech: number; frames: number }> {
  const { Player } = await import('../src/ui/tutor/player');
  const queue: (() => void)[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { queue.push(cb); return queue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { queue.length = 0; });
  vi.spyOn(performance, 'now').mockImplementation(() => wall);
  wall = 1000; heardAt = Infinity;
  rec = recording();
  const c = clip();
  const p = new Player();
  p.load(c);
  void p.play({ kind: 'voice', id: 'x', speak: () => { throw new Error('the recording is there'); } });
  const f = fit(c.traj, c.score.phones, rec);
  const ideal = (at: number) => Math.min(c.traj.speech, f.at((at - heardAt) / 1000));
  const shown: { at: number; t: number }[] = [];
  for (let i = 0; i < 4000 && wall < heardAt + 1000 * f.end + 2 * latency + 600; i++) {
    wall += gap();
    for (const cb of queue.splice(0)) cb();
    for (let k = 0; k < 6; k++) await Promise.resolve();
    // the pictures draw: they ask the player for the face of this instant
    wall += 2;
    p.face();
    if (Number.isFinite(heardAt)) shown.push({ at: wall + latency, t: p.t });
  }
  // (and in seconds of the sound: the instant of the recording whose mouth is shown, against the instant heard)
  const { audio: ka, model: km } = f.knots;
  const soundOf = (t: number): number => {
    if (t <= km[0]) return ka[0] + (t - km[0]);
    for (let i = 0; i + 1 < km.length; i++) if (t <= km[i + 1]) return km[i + 1] > km[i] ? ka[i] + ((t - km[i]) / (km[i + 1] - km[i])) * (ka[i + 1] - ka[i]) : ka[i + 1];
    return ka[ka.length - 1] + (t - km[km.length - 1]);
  };
  const errors: number[] = [], heardErrors: number[] = [];
  let endShown = 0;
  for (let i = 0; i + 1 < shown.length; i++) {
    const mid = 0.5 * (shown[i].at + shown[i + 1].at);
    const heard = (mid - heardAt) / 1000;
    if (heard > 0.02 && heard < f.end) { errors.push(shown[i].t - ideal(mid)); heardErrors.push(soundOf(shown[i].t) - heard); }
    if (shown[i].at <= heardAt + 1000 * f.end + 250) endShown = shown[i].t;
  }
  p.pause();
  return { errors, heardErrors, endShown, speech: c.traj.speech, frames: errors.length };
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

describe('the picture keeps to the sound', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('a lead grows with the time between frames, within its bounds', () => {
    const pace = new Pace();
    let t = 0;
    for (let i = 0; i < 30; i++) pace.frame((t += 16.7));
    expect(pace.lead()).toBeGreaterThanOrEqual(LEAD_MIN);
    expect(pace.lead()).toBeLessThan(0.045);
    for (let i = 0; i < 6; i++) pace.frame((t += 160));
    expect(pace.lead()).toBeGreaterThan(0.12);
    for (let i = 0; i < 6; i++) pace.frame((t += 900));
    expect(pace.lead()).toBe(LEAD_MAX);
    // a pause is not a slow frame
    pace.rest();
    const before = pace.gap;
    pace.frame(t + 60000);
    expect(pace.gap).toBe(before);
  });

  it('the time heard is the output\'s own, carried forward on the wall clock', () => {
    const ac = { currentTime: 10, outputLatency: 0.03, baseLatency: 0.01, getOutputTimestamp: () => ({ contextTime: 9.955, performanceTime: 5000 }) };
    expect(heardNow(ac, 5000)).toBeCloseTo(9.955, 6);
    expect(heardNow(ac, 5012)).toBeCloseTo(9.967, 6);
    // a stamp that tells nothing, or nonsense, is not believed
    expect(heardNow({ ...ac, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }, 5000)).toBeCloseTo(9.96, 6);
    expect(heardNow({ ...ac, getOutputTimestamp: () => ({ contextTime: 3, performanceTime: 5000 }) }, 5000)).toBeCloseTo(9.96, 6);
    expect(heardNow({ currentTime: 10 }, 5000)).toBe(10);
  });

  const computers: [string, () => number, number][] = [
    ['a fast one (60 frames a second)', () => 14.7, 25],
    ['an ordinary one under load (20 a second)', () => 48, 50],
    ['a slow one (6 a second)', () => 165, 70],
    ['a very slow one (4 a second)', () => 248, 60],
  ];
  for (const [name, gap, latency] of computers) {
    it(`on ${name} the mouth seen is the mouth of what is heard`, async () => {
      const r = await watch(gap, latency);
      console.log(name, r.frames, "frames; error ms min/mean/max", Math.round(1000*Math.min(...r.errors)), Math.round(1000*mean(r.errors)), Math.round(1000*Math.max(...r.errors)), "end", r.endShown.toFixed(3), r.speech.toFixed(3));
      expect(r.frames).toBeGreaterThan(1);
      // never late by more than the eye allows (45 ms), never early by more than it allows (125 ms)
      for (const e of r.errors) { expect(e).toBeGreaterThan(-0.045); expect(e).toBeLessThan(0.125); }
      // and not in slow motion: when the sound is over the movement is over too
      expect(r.endShown).toBeGreaterThan(r.speech - 0.03);
    });
  }

  // A browser shows a frame at the screen's next refresh, whatever the time between frames: on a fast computer and on
  // one held up by its work, every frame is seen within what the eye allows, counted in time of the sound itself.
  const browsers: [string, () => number][] = [
    ['60 frames a second', () => 16.7], ['30', () => 33.3], ['20', () => 50], ['10', () => 100], ['6', () => 165], ['4', () => 250], ['3', () => 330],
  ];
  for (const [name, gap] of browsers) {
    it(`in a browser at ${name}, every frame is seen less than 45 ms after its sound and less than 125 ms before it`, async () => {
      const r = await watch(gap, 16.7);
      expect(r.frames).toBeGreaterThan(0);
      for (const e of r.heardErrors) { expect(e).toBeGreaterThan(-0.045); expect(e).toBeLessThan(0.125); }
    });
  }
  it('in a browser that draws a frame at once after a run of slow ones, that frame is not too early', async () => {
    let k = 0;
    const r = await watch(() => (k++ % 3 === 1 ? 8 : 300), 16.7);
    expect(r.frames).toBeGreaterThan(1);
    for (const e of r.heardErrors) { expect(e).toBeGreaterThan(-0.045); expect(e).toBeLessThan(0.125); }
  });
  it('in a browser whose frames swing between 40 and 300 ms apart, every frame is still within those bounds', async () => {
    let k = 0;
    const r = await watch(() => (k++ % 2 ? 40 : 300), 16.7);
    expect(r.frames).toBeGreaterThan(1);
    for (const e of r.heardErrors) { expect(e).toBeGreaterThan(-0.045); expect(e).toBeLessThan(0.125); }
  });

  it('on a computer that stutters (frames from 30 to 300 ms apart) the picture is never left behind', async () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const r = await watch(() => 30 + 270 * rnd() * rnd(), 45);
    // one frame may come later than the last ones promised; the picture is back with the sound at the next
    expect(Math.min(...r.errors)).toBeGreaterThan(-0.2);
    expect(mean(r.errors)).toBeGreaterThan(-0.045);
    expect(mean(r.errors)).toBeLessThan(0.125);
    expect(r.endShown).toBeGreaterThan(r.speech - 0.03);
  });

  it('the lips of the picture meet at the instant the recording\'s lips do, and part at its burst', async () => {
    const { lipsOf } = await import('../src/ui/tutor/readout');
    const { computeGeometry } = await import('../src/dsp/tract/geometry');
    const { DEFAULT_ANATOMY, DEFAULT_TEETH } = await import('../src/dsp/tract/types');
    const { poseAt } = await import('../src/ui/tutor/motion');
    const { listen, onset } = await import('../src/ui/tutor/align');
    const c = clip(), r = recording();
    const f = fit(c.traj, c.score.phones, r);
    const x = r.buffer.getChannelData(0);
    const t0 = onset(listen(x, r.buffer.sampleRate));
    const lips = (audio: number) => { const pose = poseAt(c.traj, f.at(audio))!; return lipsOf(pose.art, computeGeometry(pose.art, DEFAULT_ANATOMY, DEFAULT_TEETH)).state; };
    // "bāb" as recorded: b held, its burst, ā, b held again from 0.604 s to 0.710 s after the first sound, its burst
    const [, , vowel, shut, burst] = r.marks!.map((m) => t0 + m);
    expect(lips(vowel + 0.2)).not.toBe('closed');
    expect(lips(shut - 0.03)).not.toBe('closed');
    expect(lips(shut + 0.006)).toBe('closed');
    expect(lips(0.5 * (shut + burst))).toBe('closed');
    expect(lips(burst - 0.006)).toBe('closed');
    expect(lips(burst + 0.03)).not.toBe('closed');
  });

  it('counting frames instead would fail this test: at 4 frames a second the movement runs at a quarter of its speed', async () => {
    // the mistake this guards against: adding a capped step at every frame
    const c = clip();
    let t = 0, wallMs = 0;
    while (wallMs < 1000 * c.traj.speech) { wallMs += 248; t += Math.min(1 / 15, 0.248); }
    expect(t).toBeLessThan(0.35 * c.traj.speech);
  });
});
