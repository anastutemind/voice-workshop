/**
 * Keeping the picture with the sound, on any computer.
 *
 * The sound has a clock of its own and never waits for the picture. So the
 * picture never counts frames or adds up the time between them: at every
 * frame it asks the sound's clock where the sound is, and draws the mouth of
 * that instant. A slow computer then draws fewer mouths, each one the right
 * one; it cannot fall behind and play the movement late or in slow motion.
 *
 * One thing is left: a frame drawn now is seen a little later (the browser
 * has to paint it and the screen to show it, at its next refresh), and it
 * then stays on the screen until the next one. The slower the frames, the
 * longer it stays. `Pace` measures how far apart the frames come and says
 * how far ahead of the sound a frame must be drawn to be right in the middle
 * of the time it is seen: a refresh and half a frame ahead. Lips that are a
 * little early pass unnoticed (the eye allows them some 120 ms); lips that
 * are late do not (45 ms is seen), so the lead errs on the early side, by
 * some 15 ms on top, and more on a computer that takes longer to show a frame.
 * A frame much slower or faster than the ones before it is still seen within
 * those bounds: the lead stops growing at 145 ms, where a frame that comes
 * 300 ms after it is not seen late, nor one that comes at once after it too early.
 */

/** The shortest and the longest lead a frame is given, seconds. */
export const LEAD_MIN = 0.03, LEAD_MAX = 0.145;

export class Pace {
  private last = 0;
  /** seconds between frames, smoothed: it follows a slowdown at once and a recovery more slowly */
  gap = 1 / 60;

  /** A frame begins (`now` in milliseconds, the clock of performance.now()). */
  frame(now: number): void {
    if (this.last > 0) {
      const d = Math.min(0.5, Math.max(0.004, (now - this.last) / 1000));
      this.gap += (d - this.gap) * (d > this.gap ? 0.6 : 0.2);
    }
    this.last = now;
  }

  /** Nothing was being drawn for a while: the wait is not a slow frame. */
  rest(): void { this.last = 0; }

  /** How far ahead of the sound a frame drawn now must be, seconds: a refresh (17 ms), half a frame, and a little more. */
  lead(): number { return Math.min(LEAD_MAX, Math.max(LEAD_MIN, 0.03 + 0.6 * this.gap)); }
}

export { heardNow } from '../voice/heard';
