/**
 * The mouth shape of a moment, as a lip-reader names it. A sound has a shape
 * of its own: lips closed for p, b, m while they hold; the lip on the teeth
 * for f; the tongue at the teeth for t, d, n; and so on. The mirror and the
 * skin of the side view each have one photograph for every shape, and show
 * the one this module names: whole and sharp, never a mix of several.
 */
import type { Face } from './faces';
import { shapeOf } from './faces';
import { lipsOf } from './readout';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const SHAPES = ['rest', 'mid', 'open', 'round', 'spread', 'fv', 'th', 'l'] as const;
/** more shapes, used when their photographs are there; each stands in for one of the first eight otherwise */
export const MORE = { e: 'mid', o: 'round', s: 'spread', sh: 'round', t: 'l' } as const;
export type Shape = (typeof SHAPES)[number] | keyof typeof MORE;

/** The mouth shape of a pose, from its measures alone: used between sounds, and for sounds made out of sight. */
function byPose(face: Face): Shape {
  const a = face.pose.art;
  const { geom } = shapeOf(face.pose);
  const m = lipsOf(a, geom);
  if (m.state === 'closed') return 'rest';
  if (a.lipTuck > 0.5) return 'fv';
  if (m.between) return 'th';
  const open = clamp01(Math.max(Math.max(0, geom.slit.vertical), 0.8 * m.gap) / 1.8);
  if (a.lipRound > 0.5) return open > 0.42 ? 'o' : 'round';
  if (-a.lipProtrude / 0.35 > 0.55) return open > 0.5 ? 'e' : 'spread';
  return open < 0.22 ? 'mid' : open < 0.58 ? 'e' : 'open';
}

const SOUND: [RegExp, Shape][] = [
  [/^[fvʋ]/, 'fv'], [/^[θð]/, 'th'], [/^(tʃ|dʒ|[ʃʒʂ])/, 'sh'], [/^[sz]/, 's'], [/^[lɭ]/, 'l'], [/^[tdnʈɖɳɽrɾ]/, 't'],
  [/^w/, 'round'], [/^j/, 'spread'],
  [/^[aɑ]/, 'open'], [/^[əʌɐ]/, 'mid'], [/^[eɛæ]/, 'e'], [/^[iɪ]/, 'spread'], [/^[oɔ]/, 'o'], [/^[uʊ]/, 'round'],
];

/**
 * The one mouth shape a moment shows. A sound has a shape of its own, the
 * one a lip-reader knows it by: that photograph is shown whole and sharp,
 * not a mix of several. Lips closed for p, b, m while they hold; the lip on
 * the teeth for f; the tongue at the teeth for t, d, n; and so on. Sounds
 * made at the back of the mouth (k, g, h) show the mouth as it is, ready for
 * the vowel beside them.
 */
export function shapeAt(face: Face): Shape {
  const ipa = face.ipa;
  if (!ipa) return byPose(face);
  if (/^[pbm]/.test(ipa)) return face.part === 'hold' || face.part === 'say' ? (lipsOf(face.pose.art, shapeOf(face.pose).geom).state === 'closed' ? 'rest' : byPose(face)) : byPose(face);
  // a stop that has let go is already the next sound's mouth
  if (face.part === 'pop' || face.part === 'puff') return byPose(face);
  for (const [re, shape] of SOUND) if (re.test(ipa)) return shape;
  return byPose(face);
}

