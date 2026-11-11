/**
 * Writes the guide's air at rest (the head the plate was painted on: its lumen, canonical cm) as JSON, for
 * scripts/anatomy-air.py:
 *
 *   npx tsx scripts/anatomy-guide.ts > /tmp/guide.json
 */
import { guideHead } from '../src/ui/head/scene';

const G = guideHead();
const air: number[] = [];
for (let i = 0; i <= G.lastRay; i++) air.push(G.low[2 * i], G.low[2 * i + 1]);
for (let i = G.lastRay; i >= 0; i--) air.push(G.up[2 * i], G.up[2 * i + 1]);
console.log(JSON.stringify({ air: air.map((v) => +v.toFixed(4)) }));
