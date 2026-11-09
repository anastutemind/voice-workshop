/**
 * How each sound is made, in words a five-year-old can follow, and where on
 * the head to look. One entry per sound of the model; the aspirated (pʰ) and
 * murmured (bʱ) consonants of Hindi and Urdu derive from their plain ones.
 * The texts are in English (the letters and the words are in the language
 * being learnt).
 */
export type Place = 'lips' | 'teeth' | 'tip' | 'curl' | 'middle' | 'back' | 'throat' | 'nose' | 'vowel';
export type Handle = 'lips' | 'tip' | 'tongue' | 'jaw' | 'velum' | 'larynx' | 'teeth';

export interface SoundGuide {
  /** where the sound is made: the colour of its letters */
  place: Place;
  /** the handle on the head the hint points at */
  handle: Handle;
  /** the hint on the head, a few words */
  hint: string;
  /** how to make it, for a child */
  lips: string;
  tongue: string;
  air: string;
  voice: string;
  /** a trick to feel or check it */
  trick?: string;
  /** an English sound it is like, if any */
  like?: string;
}

export const PLACES: Record<Place, { name: string; colour: string; icon: string }> = {
  lips: { name: 'Lips', colour: '#f7708a', icon: '👄' },
  teeth: { name: 'Tongue at the teeth', colour: '#e9dfc0', icon: '🦷' },
  tip: { name: 'Tongue tip', colour: '#2ad4bd', icon: '👅' },
  curl: { name: 'Tip curled back', colour: '#45b8f5', icon: '🥄' },
  middle: { name: 'Middle of the tongue', colour: '#a98bfa', icon: '🌈' },
  back: { name: 'Back of the tongue', colour: '#f6a823', icon: '🔙' },
  throat: { name: 'Throat', colour: '#e8844a', icon: '🫁' },
  nose: { name: 'Through the nose', colour: '#7fd17f', icon: '👃' },
  vowel: { name: 'Vowel: open mouth', colour: '#ffd166', icon: '🔆' },
};
export const PLACE_ORDER: Place[] = ['vowel', 'lips', 'teeth', 'tip', 'curl', 'middle', 'back', 'throat', 'nose'];

const ON = 'Voice ON: hum while you do it. Put a hand on your throat and feel it buzz.';
const OFF = 'Voice OFF: only air, no humming. Your throat stays quiet.';
const NOSE = 'The air comes out through your nose, not your mouth.';
const FREE = 'Let the air flow out freely.';
const REST = 'Resting, out of the way.';

const V = (hint: string, lips: string, tongue: string, like: string, handle: Handle = 'jaw'): SoundGuide => ({ place: 'vowel', handle, hint, lips, tongue, air: FREE, voice: ON, like });

export const GUIDE: Record<string, SoundGuide> = {
  // ---------------------------------------------------------------- vowels
  a: V('Open wide', 'Open your mouth wide, like at the doctor: aaah.', 'Flat and low, resting in the bottom of your mouth.', 'the a in "father"'),
  'ə': V('Relax', 'Open a little, relaxed, as if you were about to yawn.', 'In the middle of your mouth, doing nothing.', 'the a in "about"'),
  'ɪ': V('Smile a little', 'A small smile.', 'High and forward, but relaxed.', 'the i in "sit"', 'tongue'),
  i: V('Big smile', 'A big smile, lips spread wide.', 'High and forward, nearly touching the roof of your mouth.', 'the ee in "see"', 'tongue'),
  'ʊ': V('Round a little', 'A little round, relaxed.', 'Back and up a bit.', 'the oo in "book"', 'lips'),
  u: V('Round and push forward', 'Make a small round hole and push your lips forward, like blowing a bubble.', 'Pulled back and high.', 'the oo in "moon"', 'lips'),
  e: V('Half smile', 'A half smile, mouth half open.', 'Forward, half way up.', 'the a in "day", without the glide at the end', 'tongue'),
  'ɛ': V('Open smile', 'Open, with the corners a little wide.', 'Forward and fairly low.', 'the e in "bed"', 'jaw'),
  o: V('Round like an O', 'Round, like the letter O.', 'Pulled back, half way up.', 'the o in "go", without the glide at the end', 'lips'),
  'ɔ': V('Open and round', 'Open and a little round.', 'Pulled back and low.', 'the aw in "saw"', 'lips'),
  // a nasal vowel: the velum opens
  'ã': { place: 'nose', handle: 'velum', hint: 'Let it into the nose', lips: 'As for the vowel.', tongue: 'As for the vowel.', air: 'Let the air come out through your nose AND your mouth at the same time. The little door at the back of your mouth opens.', voice: ON, trick: 'Pinch your nose while you say it: the sound changes! That means the nose was working.', like: 'the French "bon", or the ng feeling without the ng' },
  // ------------------------------------------------------------------ lips
  p: { place: 'lips', handle: 'lips', hint: 'Lips together, then pop', lips: 'Press your lips together. Then open them with a pop.', tongue: REST, air: 'Hold the air behind your lips, then let it burst out.', voice: OFF, trick: 'Hold a strip of paper in front of your mouth: a little puff moves it.', like: 'p in "pen"' },
  b: { place: 'lips', handle: 'lips', hint: 'Lips together, hum, pop', lips: 'Press your lips together. Then open them with a pop.', tongue: REST, air: 'Hold the air behind your lips, then let it out.', voice: ON, trick: 'Hum with your lips closed, then open: mmm-ba.', like: 'b in "ball"' },
  m: { place: 'lips', handle: 'lips', hint: 'Lips closed, hum', lips: 'Close your lips softly.', tongue: REST, air: NOSE, voice: ON, trick: 'Hum and touch the side of your nose: it tickles.', like: 'm in "mum"' },
  f: { place: 'lips', handle: 'lips', hint: 'Top teeth on the lower lip', lips: 'Put your top teeth gently on your lower lip.', tongue: REST, air: 'Blow air between the teeth and the lip: fff, like a cat hissing softly.', voice: OFF, like: 'f in "fish"' },
  v: { place: 'lips', handle: 'lips', hint: 'Top teeth on the lower lip, hum', lips: 'Put your top teeth gently on your lower lip.', tongue: REST, air: 'Let the air buzz between the teeth and the lip.', voice: ON, like: 'v in "van"' },
  'ʋ': { place: 'lips', handle: 'lips', hint: 'Lower lip near the teeth', lips: 'Bring your lower lip close to your top teeth, but do not press. Do not round your lips.', tongue: REST, air: 'Let the air pass softly, with no hiss.', voice: ON, like: 'half way between the English v and w' },
  w: { place: 'lips', handle: 'lips', hint: 'Small round hole', lips: 'Make a small round hole and push your lips forward, then relax them into the vowel.', tongue: 'Pulled back and up.', air: FREE, voice: ON, like: 'w in "water"' },
  // --------------------------------------------------------- tongue, teeth
  t: { place: 'teeth', handle: 'tip', hint: 'Tip touches the top teeth', lips: 'Open a little.', tongue: 'Put the tip of your tongue on the back of your top teeth. Then pull it away quickly.', air: 'Hold the air, then let it out with a little tap.', voice: OFF, like: 't in "top", but with the tongue touching the teeth' },
  d: { place: 'teeth', handle: 'tip', hint: 'Tip on the teeth, hum', lips: 'Open a little.', tongue: 'Put the tip of your tongue on the back of your top teeth. Then pull it away quickly.', air: 'Hold the air, then let it out.', voice: ON, like: 'd in "dog", but with the tongue touching the teeth' },
  n: { place: 'teeth', handle: 'tip', hint: 'Tip up, hum', lips: 'Open a little.', tongue: 'Tip touching the back of your top teeth.', air: NOSE, voice: ON, like: 'n in "nose"' },
  'θ': { place: 'teeth', handle: 'tip', hint: 'Tongue between the teeth', lips: 'Open a little.', tongue: 'Put the tip of your tongue between your teeth, so you can see it in the mirror.', air: 'Blow softly over the tongue.', voice: OFF, like: 'th in "think"' },
  'ð': { place: 'teeth', handle: 'tip', hint: 'Tongue between the teeth, hum', lips: 'Open a little.', tongue: 'Put the tip of your tongue between your teeth, so you can see it.', air: 'Let the air buzz over the tongue.', voice: ON, like: 'th in "this"' },
  s: { place: 'tip', handle: 'tip', hint: 'A thin stream of air', lips: 'A little smile.', tongue: 'Tip close behind the top teeth, not touching. Make a tiny groove down the middle of your tongue.', air: 'Push a thin stream of air through the groove: sss, like a snake.', voice: OFF, like: 's in "sun"' },
  z: { place: 'tip', handle: 'tip', hint: 'A buzzing stream of air', lips: 'A little smile.', tongue: 'Tip close behind the top teeth, not touching, with a tiny groove.', air: 'Push the air through the groove and hum: zzz, like a bee.', voice: ON, like: 'z in "zoo"' },
  l: { place: 'tip', handle: 'tip', hint: 'Tip up, air past the sides', lips: 'Open a little.', tongue: 'Tip touching behind the top teeth; let the sides of the tongue drop.', air: 'The air flows past both sides of the tongue.', voice: ON, like: 'l in "lamp"' },
  r: { place: 'tip', handle: 'tip', hint: 'Tip flutters', lips: 'Open a little.', tongue: 'Tip loose, just behind the top teeth.', air: 'Blow so the tip flutters: rrr, like a motorbike.', voice: ON, trick: 'Say "tdtdtd" very fast, then blow through it.', like: 'a rolled r, as in Spanish "perro"' },
  'ɾ': { place: 'tip', handle: 'tip', hint: 'One quick tap', lips: 'Open a little.', tongue: 'Flick the tip once against the ridge behind the top teeth.', air: FREE, voice: ON, like: 'the quick t in American "water"' },
  // ------------------------------------------------------------- retroflex
  'ʈ': { place: 'curl', handle: 'tip', hint: 'Curl the tip back', lips: 'Open a little.', tongue: 'Curl the tip of your tongue up and back, so that its underside touches the roof of your mouth. Then flick it down.', air: 'Hold the air, then let it out with a tap.', voice: OFF, trick: 'Point your tongue at the top of your head, inside your mouth.', like: 't in "tomato" as a Hindi or Urdu speaker says it' },
  'ɖ': { place: 'curl', handle: 'tip', hint: 'Curl the tip back, hum', lips: 'Open a little.', tongue: 'Curl the tip of your tongue up and back, so that its underside touches the roof of your mouth. Then flick it down.', air: 'Hold the air, then let it out.', voice: ON, like: 'd in "drum" as a Hindi or Urdu speaker says it' },
  'ɳ': { place: 'curl', handle: 'tip', hint: 'Curl the tip back, hum', lips: 'Open a little.', tongue: 'Curl the tip up and back to touch the roof of your mouth.', air: NOSE, voice: ON, like: 'an n made with the tongue curled back' },
  'ɽ': { place: 'curl', handle: 'tip', hint: 'Curl back and flick', lips: 'Open a little.', tongue: 'Curl the tip back, then flick it forward and down, touching the roof of the mouth once on the way.', air: FREE, voice: ON, like: 'the ṛ of "pahāṛ"' },
  'ʂ': { place: 'curl', handle: 'tip', hint: 'Curl and hiss', lips: 'A little round.', tongue: 'Curl the tip up and back, leaving a small gap.', air: 'Push the air through the gap: a deep shhh.', voice: OFF, like: 'sh with the tongue curled back' },
  // ----------------------------------------------------- middle, the roof
  'ʃ': { place: 'middle', handle: 'tip', hint: 'Shh, lips forward', lips: 'Push your lips forward, a little round.', tongue: 'Tip a bit back from the teeth; the front of the tongue high and wide.', air: 'Blow: shhh, like telling someone to be quiet.', voice: OFF, like: 'sh in "ship"' },
  'ʒ': { place: 'middle', handle: 'tip', hint: 'Shh with a hum', lips: 'Push your lips forward, a little round.', tongue: 'Tip a bit back from the teeth; the front of the tongue high and wide.', air: 'Blow and hum at the same time.', voice: ON, like: 's in "measure"' },
  'tʃ': { place: 'middle', handle: 'tip', hint: 'T, then shh, in one go', lips: 'Pushed forward a little.', tongue: 'Touch the roof just behind the ridge with the front of the tongue, then let go into shh.', air: 'Hold the air, then let it out with a hiss: ch.', voice: OFF, like: 'ch in "chair"' },
  'dʒ': { place: 'middle', handle: 'tip', hint: 'D, then zh, in one go', lips: 'Pushed forward a little.', tongue: 'Touch the roof just behind the ridge with the front of the tongue, then let go into a buzz.', air: 'Hold the air, then let it out with a buzz: j.', voice: ON, like: 'j in "jam"' },
  j: { place: 'middle', handle: 'tongue', hint: 'Middle of the tongue up', lips: 'Smile a little.', tongue: 'Lift the middle of your tongue toward the roof, like for "ee", then slide into the next vowel.', air: FREE, voice: ON, like: 'y in "yes"' },
  'ɲ': { place: 'middle', handle: 'tongue', hint: 'Middle up, hum', lips: 'Open a little.', tongue: 'Press the middle of the tongue against the roof of your mouth.', air: NOSE, voice: ON, like: 'ny in "canyon"' },
  // ------------------------------------------------------------------ back
  k: { place: 'back', handle: 'tongue', hint: 'Back of the tongue up', lips: 'Open.', tongue: 'Lift the back of your tongue until it touches the soft roof at the back; the tip stays down behind the bottom teeth.', air: 'Hold the air, then let the tongue drop with a pop.', voice: OFF, trick: 'Put a finger under your chin, far back, and say "ka": you feel it move.', like: 'k in "kite"' },
  g: { place: 'back', handle: 'tongue', hint: 'Back of the tongue up, hum', lips: 'Open.', tongue: 'Lift the back of your tongue until it touches the soft roof at the back; the tip stays down.', air: 'Hold the air, then let the tongue drop.', voice: ON, like: 'g in "go"' },
  'ŋ': { place: 'back', handle: 'tongue', hint: 'Back up, hum', lips: 'Open.', tongue: 'Lift the back of your tongue to the soft roof and keep it there.', air: NOSE, voice: ON, like: 'ng in "sing"' },
  x: { place: 'back', handle: 'tongue', hint: 'Back up, scrape the air', lips: 'Open.', tongue: 'Lift the back of the tongue close to the soft roof, without touching.', air: 'Push the air through: a rough, scraping sound, like clearing your throat gently.', voice: OFF, trick: 'Start with k and let it leak: k-khhh.', like: 'ch in Scottish "loch"' },
  'ɣ': { place: 'back', handle: 'tongue', hint: 'Back up, gargle softly', lips: 'Open.', tongue: 'Lift the back of the tongue close to the soft roof, without touching.', air: 'Let the voice out through the gap: a soft gargle.', voice: ON, trick: 'Start with g and let it leak: g-ghhh.', like: 'a soft gargling sound, like the French r' },
  q: { place: 'back', handle: 'tongue', hint: 'Even further back than k', lips: 'Open.', tongue: 'Lift the very back of your tongue to touch the dangling bit at the back of the roof (the uvula). Further back than for k.', air: 'Hold the air, then pop.', voice: OFF, trick: 'Yawn a little first: that opens the right place.', like: 'a k made deep in the throat' },
  // ---------------------------------------------------------------- throat
  h: { place: 'throat', handle: 'larynx', hint: 'Just breathe out', lips: 'Shaped for the next vowel.', tongue: 'Ready for the next vowel.', air: 'Breathe out, as if fogging up a mirror: hhh.', voice: OFF, like: 'h in "hat"' },
  'ʔ': { place: 'throat', handle: 'larynx', hint: 'Close the throat, then let go', lips: 'Open, ready for the vowel.', tongue: REST, air: 'Hold your breath for a tiny moment by closing your throat, then let go.', voice: OFF, trick: 'Say "uh-oh": the little catch in the middle is this sound.', like: 'the catch in "uh-oh"' },
  'ħ': { place: 'throat', handle: 'larynx', hint: 'Squeeze the throat, breathe out', lips: 'Open.', tongue: 'Pull the root of your tongue back toward the back of your throat.', air: 'Breathe out hard through the narrow throat: a strong, whispery h.', voice: OFF, trick: 'Pretend you are fogging up a window with your whole throat.', like: 'a loud whispered h from deep in the throat' },
  'ʕ': { place: 'throat', handle: 'larynx', hint: 'Squeeze the throat, hum', lips: 'Open.', tongue: 'Pull the root of your tongue back toward the back of your throat.', air: 'Let the voice out through the squeezed throat.', voice: ON, trick: 'Say "aaa" and gently press the front of your throat with two fingers.', like: 'nothing in English: a squeezed "a" from deep in the throat' },
  // ------------------------------------------------------------- emphatics
  'sˤ': { place: 'tip', handle: 'tongue', hint: 'S with a big, hollow mouth', lips: 'A little open, not smiling.', tongue: 'Make an s, but pull the back of your tongue back and down, so your mouth feels big and hollow.', air: 'Hiss: a deep, heavy sss.', voice: OFF, trick: 'The vowel after it sounds darker: "saa" instead of "sa".', like: 'a heavy s' },
  'tˤ': { place: 'teeth', handle: 'tongue', hint: 'T with a big, hollow mouth', lips: 'A little open, not smiling.', tongue: 'Tip on the back of the top teeth, and pull the back of the tongue back and down.', air: 'Hold the air, then let it out with a heavy tap.', voice: OFF, like: 'a heavy t' },
  'dˤ': { place: 'teeth', handle: 'tongue', hint: 'D with a big, hollow mouth', lips: 'A little open, not smiling.', tongue: 'Tip on the back of the top teeth, and pull the back of the tongue back and down.', air: 'Hold the air, then let it out.', voice: ON, like: 'a heavy d' },
  'ðˤ': { place: 'teeth', handle: 'tongue', hint: 'Th with a big, hollow mouth', lips: 'A little open.', tongue: 'Tip between the teeth, and pull the back of the tongue back and down.', air: 'Let the air buzz over the tongue.', voice: ON, like: 'a heavy th as in "this"' },
};

const PUFF = ' Then let out a big puff of air, like blowing out a candle. Hold your hand in front of your mouth: you should feel it!';
const MURMUR = ' Then let the air sigh out WITH your voice, soft and breathy, like a tired "hhh".';

/** The guide of a sound; the aspirated and murmured consonants add their puff or sigh to their plain sound. */
export function guideFor(ipa: string): SoundGuide {
  const g = GUIDE[ipa];
  if (g) return g;
  if (ipa.endsWith('ʰ')) {
    const b = GUIDE[ipa.slice(0, -1)];
    if (b) return { ...b, hint: b.hint + ', then puff!', air: b.air + PUFF, like: b.like ? b.like + ', with a puff of air' : undefined };
  }
  if (ipa.endsWith('ʱ')) {
    const b = GUIDE[ipa.slice(0, -1)];
    if (b) return { ...b, hint: b.hint + ', breathy', air: b.air + MURMUR, like: b.like ? b.like + ', said breathily' : undefined };
  }
  return { place: 'vowel', handle: 'jaw', hint: 'Listen and copy', lips: 'Watch the mouth.', tongue: 'Watch the tongue.', air: FREE, voice: ON };
}
