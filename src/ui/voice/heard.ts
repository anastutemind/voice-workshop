/**
 * The place on an audio context's time line that is heard now, seconds. The
 * context's `currentTime` is the time of what it has handed to the system,
 * which is heard later (by the output's latency) and moves in steps (a block
 * of samples at a time); where the browser gives the time of what is leaving
 * the loudspeaker, with the instant it was measured, that is used and carried
 * forward on the wall clock (`wall`, milliseconds of performance.now()), so
 * it moves smoothly.
 */
export function heardNow(ac: { currentTime: number; outputLatency?: number; baseLatency?: number; getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number } }, wall: number): number {
  const plain = ac.currentTime - (ac.outputLatency || 0) - (ac.baseLatency || 0);
  const st = ac.getOutputTimestamp?.();
  if (st && (st.contextTime ?? 0) > 0 && (st.performanceTime ?? 0) > 0) {
    const t = st.contextTime! + (wall - st.performanceTime!) / 1000;
    // (a stamp that is stale or wild is not believed: the two clocks tell the same time to within the latency)
    if (Math.abs(t - plain) < 0.25) return t;
  }
  return plain;
}
