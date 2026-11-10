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
// the consonants made without a breath from the lungs (clicks, implosives, ejectives)
const SUCK = 'No breath from the lungs: the tongue sucks a little air into the mouth, and it pops when the tongue lets go.';
const NO_VOICE = 'The click itself has no voice.';
const GULP = 'While your mouth is closed, pull your voice box down as if starting to gulp. When the mouth opens, a little air is drawn in.';
const SQUEEZE = 'Hold your breath by closing your throat, and squeeze upward: the air in your mouth pops out by itself.';

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

  // ======================================================================
  // The rest of the International Phonetic Alphabet (the tutor's IPA chart)
  // ---------------------------------------------------------------- vowels
  'æ': V('Open, corners wide', 'Open your mouth and pull the corners wide.', 'Low and forward, the tip behind your bottom teeth.', 'the a in "cat"'),
  'ɑ': V('Open wide, tongue back', 'Open wide. Relaxed, not round.', 'Low and pulled back, as when the doctor looks at your throat.', 'the a in "father"'),
  'ʌ': V('Half open, relaxed', 'Half open, relaxed, not round.', 'In the middle, a little back and low.', 'the u in "cup"'),
  y: { ...V('Say ee, then round the lips', 'Make a small round hole and push your lips forward, as for "oo".', 'High and forward, exactly as for "ee". Only the lips change.', 'the u of French "lune"', 'lips'), trick: 'Say "eee" and, without moving your tongue, slowly round your lips.' },
  'ʏ': V('The i of "sit", lips round', 'Round, a little relaxed.', 'High and forward but relaxed, as for the i in "sit".', 'the ü of German "hübsch"', 'lips'),
  'ø': { ...V('Say "ay", then round the lips', 'Round, like a small o.', 'Forward, half way up, as for the a in "day" without its glide.', 'the eu of French "feu"', 'lips'), trick: 'Say a long "ay" and slowly round your lips without moving your tongue.' },
  'œ': V('The e of "bed", lips round', 'Round and a little open.', 'Forward and fairly low, as for the e in "bed".', 'the œu of French "sœur"', 'lips'),
  'ɶ': V('Open wide, lips a little round', 'Open wide, and still a little round.', 'Low and forward, as for the a in "cat".', 'a very open œ, as in Danish "grøn"', 'lips'),
  'ɨ': { ...V('Tongue high, in the middle', 'Flat and relaxed. Not round.', 'High, half way between "ee" and "oo": neither forward nor back.', 'the ы of Russian "ты"', 'tongue'), trick: 'Slide slowly from "ee" to "oo" with your lips kept flat, and stop half way.' },
  'ʉ': V('Tongue in the middle, lips round', 'Round and pushed forward, as for "oo".', 'High, in the middle: further forward than for "oo".', 'the u of Swedish "ful"; the oo of Australian "goose"', 'lips'),
  'ɯ': { ...V('Say oo, then spread the lips', 'Flat and spread, like a small smile. Not round at all.', 'High and pulled back, exactly as for "oo".', 'the u of Japanese; an "oo" said with a smile', 'lips'), trick: 'Say "ooo" and pull the corners of your mouth into a smile with your fingers.' },
  'ɤ': { ...V('Say o, then spread the lips', 'Flat, not round.', 'Pulled back, half way up, exactly as for "o".', 'the e of Mandarin "è"; an "o" said with a smile', 'lips'), trick: 'Say a long "o" and slowly flatten your lips.' },
  'ɘ': V('Half way up, in the middle', 'Relaxed, not round.', 'In the middle of your mouth, a little higher than for the a in "about".', 'the i of New Zealand "bit"', 'tongue'),
  'ɵ': V('Half way up, middle, lips round', 'Round.', 'In the middle of your mouth, half way up.', 'the u of Swedish "full"', 'lips'),
  'ɜ': V('Half open, in the middle', 'Half open, relaxed, not round.', 'In the middle of your mouth, a little lower than for the a in "about".', 'the ir of British "bird", with no r'),
  'ɞ': V('Half open, middle, lips round', 'Half open and round.', 'In the middle of your mouth, fairly low.', 'the vowel of "bird" said with round lips', 'lips'),
  'ɐ': V('Open and relaxed', 'Open, relaxed.', 'Low, in the middle of your mouth, doing nothing.', 'the er of German "Vater"; the last a of Portuguese "casa"'),
  'ɒ': V('Open wide, a little round', 'Open wide, and make your lips a little round.', 'Low and pulled back.', 'the o of British "hot"', 'lips'),
  // ------------------------------------------------------------------ lips
  'ɱ': { place: 'lips', handle: 'lips', hint: 'Teeth on the lip, hum', lips: 'Put your top teeth gently on your lower lip, as for f, and keep them there.', tongue: REST, air: NOSE, voice: ON, trick: 'Say "comfort" slowly: the m just before the f is this sound.', like: 'the m in "symphony"' },
  'ʙ': { place: 'lips', handle: 'lips', hint: 'Lips loose, blow: brrr', lips: 'Close your lips loosely and blow, so that they flap against each other.', tongue: REST, air: 'Blow steadily: the air makes the lips flutter.', voice: ON, trick: 'It is the "brrr" you say when you are cold.', like: '"brrr"' },
  'ⱱ': { place: 'lips', handle: 'lips', hint: 'The lip flicks past the teeth', lips: 'Pull your lower lip back behind your top teeth, then flick it forward so that it brushes them once.', tongue: REST, air: FREE, voice: ON, like: 'a very quick v' },
  'ɸ': { place: 'lips', handle: 'lips', hint: 'Blow between the lips', lips: 'Bring your lips close together, flat, without touching and without the teeth.', tongue: REST, air: 'Blow softly through the gap, as when you cool hot soup.', voice: OFF, trick: 'Blow out a candle very gently.', like: 'the f of Japanese "Fuji": an f made with both lips' },
  'β': { place: 'lips', handle: 'lips', hint: 'Lips close together, hum', lips: 'Bring your lips close together, flat, without touching.', tongue: REST, air: 'Let the air buzz softly between the lips.', voice: ON, like: 'the b of Spanish "lobo": a b that never quite closes' },
  'ʍ': { place: 'lips', handle: 'lips', hint: 'Round lips, blow', lips: 'Make a small round hole, as for w.', tongue: 'Pulled back and up, as for w.', air: 'Blow through the round lips without your voice.', voice: OFF, trick: 'Blow out a candle with the lips of "w".', like: 'the wh of Scottish "which": hw' },
  // ------------------------------------------------------------ tongue tip
  'ɹ': { place: 'tip', handle: 'tip', hint: 'Tip up, touching nothing', lips: 'A little round.', tongue: 'Lift the tip toward the ridge behind your top teeth, without touching anything. The sides touch the back teeth.', air: FREE, voice: ON, like: 'the r in "red"' },
  'ɬ': { place: 'tip', handle: 'tip', hint: 'Tip up, hiss past the sides', lips: 'Open a little, smiling.', tongue: 'Put the tip behind your top teeth as for l, and keep the sides of your tongue close to the side teeth.', air: 'Blow hard, so that the air hisses out past the sides of the tongue.', voice: OFF, trick: 'Hold an l and blow without your voice.', like: 'the ll of Welsh "llan"' },
  'ɮ': { place: 'tip', handle: 'tip', hint: 'Tip up, buzz past the sides', lips: 'Open a little, smiling.', tongue: 'Put the tip behind your top teeth as for l, and keep the sides of your tongue close to the side teeth.', air: 'Push the air out past the sides of the tongue and hum: it buzzes.', voice: ON, like: 'the dl of Zulu "dlala": an l that buzzes' },
  'ɺ': { place: 'tip', handle: 'tip', hint: 'One tap, air past the sides', lips: 'Open a little.', tongue: 'Flick the tip once against the ridge behind your top teeth, with the sides of the tongue down.', air: FREE, voice: ON, like: 'between a quick r and an l: the r of Japanese' },
  ts: { place: 'tip', handle: 'tip', hint: 'T, then sss, in one go', lips: 'A little smile.', tongue: 'Touch behind your top teeth with the tip, then let go into s.', air: 'Hold the air, then let it out with a hiss: ts.', voice: OFF, like: 'the ts of "cats"; the z of German "Zeit"' },
  dz: { place: 'tip', handle: 'tip', hint: 'D, then zzz, in one go', lips: 'A little smile.', tongue: 'Touch behind your top teeth with the tip, then let go into z.', air: 'Hold the air, then let it out with a buzz: dz.', voice: ON, like: 'the ds of "kids"; the z of Italian "zero"' },
  // ------------------------------------------------------------- retroflex
  'ʐ': { place: 'curl', handle: 'tip', hint: 'Curl, hiss and hum', lips: 'A little round.', tongue: 'Curl the tip up and back, leaving a small gap.', air: 'Push the air through the gap and hum.', voice: ON, like: 'the ż of Polish "żaba": the s of "measure" with the tongue curled back' },
  'ɻ': { place: 'curl', handle: 'tip', hint: 'Curl the tip, touching nothing', lips: 'Relaxed.', tongue: 'Curl the tip up and back toward the roof of your mouth, without touching it.', air: FREE, voice: ON, like: 'the r of Mandarin "ròu": an r with the tongue curled back' },
  'ɭ': { place: 'curl', handle: 'tip', hint: 'Curl the tip, air past the sides', lips: 'Open a little.', tongue: 'Curl the tip up and back to touch the roof of your mouth; let the sides of the tongue drop.', air: 'The air flows past both sides of the tongue.', voice: ON, like: 'the ḷ of Tamil "nāḷ": an l with the tongue curled back' },
  'ʈʂ': { place: 'curl', handle: 'tip', hint: 'Curl, touch, then hiss', lips: 'A little round.', tongue: 'Curl the tip up and back to touch the roof, then let go into a deep sh.', air: 'Hold the air, then let it out with a hiss.', voice: OFF, like: 'the zh of Mandarin "zhōng"; the cz of Polish "czas"' },
  'ɖʐ': { place: 'curl', handle: 'tip', hint: 'Curl, touch, then buzz', lips: 'A little round.', tongue: 'Curl the tip up and back to touch the roof, then let go into a buzz.', air: 'Hold the air, then let it out with a buzz.', voice: ON, like: 'the dż of Polish "dżem"' },
  // ----------------------------------------------------- middle, the roof
  c: { place: 'middle', handle: 'tongue', hint: 'Middle of the tongue up, then let go', lips: 'Open a little, smiling.', tongue: 'Press the middle of your tongue flat against the roof of your mouth; the tip stays down behind the bottom teeth. Then let go.', air: 'Hold the air, then let it out.', voice: OFF, trick: 'Say "kya" very quickly: the k slides forward to this sound.', like: 'between t and k: the ty of Hungarian "tyúk"' },
  'ɟ': { place: 'middle', handle: 'tongue', hint: 'Middle of the tongue up, hum, let go', lips: 'Open a little, smiling.', tongue: 'Press the middle of your tongue flat against the roof of your mouth; the tip stays down behind the bottom teeth. Then let go.', air: 'Hold the air, then let it out.', voice: ON, trick: 'Say "gya" very quickly: the g slides forward to this sound.', like: 'between d and g: the gy of Hungarian "gyerek"' },
  'ç': { place: 'middle', handle: 'tongue', hint: 'Tongue as for y, blow', lips: 'Smile a little.', tongue: 'Lift the middle of your tongue close to the roof, as for the y of "yes", and hold it there.', air: 'Blow through the narrow gap: a soft hiss.', voice: OFF, trick: 'Whisper "huge": its first sound is this one.', like: 'the ch of German "ich"; the h of "huge"' },
  'ʝ': { place: 'middle', handle: 'tongue', hint: 'Tongue as for y, buzz', lips: 'Smile a little.', tongue: 'Lift the middle of your tongue very close to the roof, closer than for the y of "yes".', air: 'Let the air buzz through the narrow gap.', voice: ON, like: 'the y of Spanish "ayer": a y said so tightly that it buzzes' },
  'ɕ': { place: 'middle', handle: 'tongue', hint: 'A soft sh, with a smile', lips: 'Spread, like a small smile. Do not round them.', tongue: 'Keep the tip down and lift the front of your tongue, flat and wide, close to the roof just behind the ridge.', air: 'Blow: a soft, bright shhh.', voice: OFF, trick: 'Say "she" with a wide smile.', like: 'the x of Mandarin "xī": a sh said with a smile' },
  'ʑ': { place: 'middle', handle: 'tongue', hint: 'A soft zh, with a smile', lips: 'Spread, like a small smile. Do not round them.', tongue: 'Keep the tip down and lift the front of your tongue, flat and wide, close to the roof just behind the ridge.', air: 'Blow and hum at the same time.', voice: ON, like: 'the z of Polish "zima": the s of "measure" said with a smile' },
  'tɕ': { place: 'middle', handle: 'tongue', hint: 'T, then a soft sh', lips: 'Spread, like a small smile.', tongue: 'Touch the roof behind the ridge with the flat front of your tongue, then let go into a soft sh.', air: 'Hold the air, then let it out with a soft hiss.', voice: OFF, like: 'the j of Mandarin "jī": a ch said with a smile' },
  'dʑ': { place: 'middle', handle: 'tongue', hint: 'D, then a soft zh', lips: 'Spread, like a small smile.', tongue: 'Touch the roof behind the ridge with the flat front of your tongue, then let go into a soft buzz.', air: 'Hold the air, then let it out with a soft buzz.', voice: ON, like: 'the j of Japanese "jikan": a j said with a smile' },
  'ʎ': { place: 'middle', handle: 'tongue', hint: 'Middle up, air past the sides', lips: 'Smile a little.', tongue: 'Press the middle of your tongue against the roof, the tip down behind the bottom teeth; let the sides drop.', air: 'The air flows past both sides of the tongue.', voice: ON, trick: 'Say "million" quickly: its "lli" is close to this sound.', like: 'the gl of Italian "figlio"' },
  'ɥ': { place: 'middle', handle: 'lips', hint: 'Tongue of y, lips of w', lips: 'Make a small round hole and push your lips forward, then relax them into the vowel.', tongue: 'High and forward, as for the y of "yes".', air: FREE, voice: ON, trick: 'Say "ee" with round lips, then slide quickly into the next vowel.', like: 'the u of French "huit"' },
  // ------------------------------------------------------------------ back
  'ɢ': { place: 'back', handle: 'tongue', hint: 'Even further back than g, hum', lips: 'Open.', tongue: 'Lift the very back of your tongue to touch the dangling bit at the back of the roof (the uvula). Further back than for g.', air: 'Hold the air, then let it out.', voice: ON, like: 'a g made deep at the back of the mouth' },
  'ɴ': { place: 'back', handle: 'tongue', hint: 'Very back up, hum', lips: 'Open.', tongue: 'Lift the very back of your tongue to the dangling bit at the back of the roof (the uvula), and keep it there.', air: NOSE, voice: ON, like: 'the n at the end of Japanese "hon": an ng made further back' },
  'ʀ': { place: 'back', handle: 'tongue', hint: 'Very back up, let it flutter', lips: 'Open.', tongue: 'Lift the back of your tongue close to the dangling bit at the back of the roof (the uvula), and let the air shake it.', air: 'Blow steadily, as when you gargle.', voice: ON, trick: 'Gargle with a sip of water, then try the same with no water.', like: 'the rolled r of some German and Dutch speakers' },
  'χ': { place: 'back', handle: 'tongue', hint: 'Very back up, scrape', lips: 'Open.', tongue: 'Pull the back of your tongue up and back, close to the dangling bit at the back of the roof (the uvula).', air: 'Push the air through: a rough, rattling scrape, deeper than the ch of "loch".', voice: OFF, like: 'the ch of Dutch "acht"' },
  'ʁ': { place: 'back', handle: 'tongue', hint: 'Very back up, soft gargle', lips: 'Open.', tongue: 'Pull the back of your tongue up and back, close to the dangling bit at the back of the roof (the uvula).', air: 'Let the voice out through the gap: a soft gargle.', voice: ON, trick: 'Gargle very gently, without water.', like: 'the r of French "rouge"' },
  'ɰ': { place: 'back', handle: 'tongue', hint: 'Back up, not touching', lips: 'Flat, not round.', tongue: 'Lift the back of your tongue toward the soft roof at the back, without touching and without hissing.', air: FREE, voice: ON, trick: 'Say "w" with your lips kept flat.', like: 'a w without the lips: the first sound of Korean "uisa"' },
  'ʟ': { place: 'back', handle: 'tongue', hint: 'Back up, air past the sides', lips: 'Open.', tongue: 'Lift the back of your tongue to the soft roof, as for g, but let the air slip past its sides.', air: 'The air flows past the sides of the back of the tongue.', voice: ON, like: 'an l made where g is made' },
  'ɧ': { place: 'back', handle: 'lips', hint: 'Round lips, a breathy hush', lips: 'Round and pushed forward.', tongue: 'Lift the back of your tongue close to the soft roof, without touching.', air: 'Blow: a dark, breathy hush, between sh and the ch of "loch".', voice: OFF, like: 'the sj of Swedish "sju"' },
  // ---------------------------------------------------------------- throat
  'ɦ': { place: 'throat', handle: 'larynx', hint: 'A breathy h, with the voice', lips: 'Shaped for the next vowel.', tongue: 'Ready for the next vowel.', air: 'Sigh out with your voice at the same time: a breathy, murmured h.', voice: 'Voice ON, but soft and breathy: half voice, half air.', like: 'the h in "behind"; the h of Dutch "hoed"' },
  'ʜ': { place: 'throat', handle: 'larynx', hint: 'Squeeze low in the throat', lips: 'Open.', tongue: 'Pull the root of your tongue down and back, low in your throat: lower than for ħ.', air: 'Breathe out hard through the squeezed throat: a rasping h.', voice: OFF, like: 'a very strong, rasping h from low in the throat' },
  'ʢ': { place: 'throat', handle: 'larynx', hint: 'Squeeze low in the throat, hum', lips: 'Open.', tongue: 'Pull the root of your tongue down and back, low in your throat: lower than for ʕ.', air: 'Let the voice out through the squeezed throat.', voice: ON, like: 'a squeezed, growled sound from low in the throat' },
  'ʡ': { place: 'throat', handle: 'larynx', hint: 'Close low in the throat, let go', lips: 'Open.', tongue: 'Pull the root of your tongue down and back until it shuts your throat. Then let go.', air: 'Hold the air below the closure, then let it out.', voice: OFF, like: 'a stop made low in the throat, a little above the catch of "uh-oh"' },
  // ---------------------------------------------------------------- clicks
  'ʘ': { place: 'lips', handle: 'lips', hint: 'A kiss: the lips smack apart', lips: 'Close your lips, then pull them apart with a smack.', tongue: 'The back of your tongue rests against the soft roof, then slides back to suck the air.', air: SUCK, voice: NO_VOICE, trick: 'Blow a kiss without pushing your lips forward.', like: 'the smack of a kiss' },
  'ǀ': { place: 'teeth', handle: 'tip', hint: 'Tsk! the tip sucks off the teeth', lips: 'Open a little.', tongue: 'Press the tip against the back of your top teeth and the back of the tongue against the soft roof. Suck, and pull the tip away.', air: SUCK, voice: NO_VOICE, like: 'the "tsk-tsk" (tut-tut) of telling someone off' },
  'ǃ': { place: 'tip', handle: 'tip', hint: 'Pop! the tip snaps down', lips: 'Open, a little round.', tongue: 'Press the tip on the ridge behind your top teeth and the back of the tongue against the soft roof. Suck, and snap the tip down.', air: SUCK, voice: NO_VOICE, like: 'a cork popping; the clip-clop of a horse' },
  'ǂ': { place: 'middle', handle: 'tongue', hint: 'The flat tongue snaps off the roof', lips: 'Open a little.', tongue: 'Press the flat front of your tongue against the roof of your mouth. Suck, and pull it away sharply.', air: SUCK, voice: NO_VOICE, like: 'a sharp, flat click' },
  'ǁ': { place: 'tip', handle: 'tongue', hint: 'A click at the side teeth', lips: 'Open, the corners pulled back.', tongue: 'Keep the tip on the ridge behind your top teeth and suck one side of your tongue away from the side teeth.', air: SUCK, voice: NO_VOICE, like: 'the click that tells a horse to go' },
  // ------------------------------------------------------------ implosives
  'ɓ': { place: 'lips', handle: 'lips', hint: 'Lips together, gulp, open', lips: 'Press your lips together, then open them.', tongue: REST, air: GULP, voice: ON, trick: 'Say "ba" while pretending to swallow.', like: 'the b of Vietnamese "ba": a b with a little gulp' },
  'ɗ': { place: 'teeth', handle: 'tip', hint: 'Tip up, gulp, let go', lips: 'Open a little.', tongue: 'Put the tip behind your top teeth, then pull it away.', air: GULP, voice: ON, trick: 'Say "da" while pretending to swallow.', like: 'the đ of Vietnamese "đi": a d with a little gulp' },
  'ʄ': { place: 'middle', handle: 'tongue', hint: 'Middle up, gulp, let go', lips: 'Open a little, smiling.', tongue: 'Press the middle of your tongue against the roof of your mouth, then let go.', air: GULP, voice: ON, like: 'the j of Swahili "jana": a gulped sound between d and g' },
  'ɠ': { place: 'back', handle: 'tongue', hint: 'Back up, gulp, let go', lips: 'Open.', tongue: 'Lift the back of your tongue to the soft roof, then let it drop.', air: GULP, voice: ON, trick: 'Say "ga" while pretending to swallow.', like: 'a g with a little gulp' },
  'ʛ': { place: 'back', handle: 'tongue', hint: 'Very back up, gulp, let go', lips: 'Open.', tongue: 'Lift the very back of your tongue to the dangling bit at the back of the roof (the uvula), then let it drop.', air: GULP, voice: ON, like: 'a gulped g made at the very back of the mouth' },
  // ------------------------------------------------------------- ejectives
  'pʼ': { place: 'lips', handle: 'larynx', hint: 'Hold your breath, pop the lips', lips: 'Press your lips together, then let them pop.', tongue: REST, air: SQUEEZE, voice: OFF, trick: 'Hold your breath and say "p" as sharply as you can.', like: 'a sharp, popping p with a tiny silence after it' },
  'tʼ': { place: 'teeth', handle: 'larynx', hint: 'Hold your breath, pop the tip', lips: 'Open a little.', tongue: 'Put the tip behind your top teeth, then pull it away sharply.', air: SQUEEZE, voice: OFF, trick: 'Hold your breath and say "t" as sharply as you can.', like: 'a sharp, popping t with a tiny silence after it' },
  'kʼ': { place: 'back', handle: 'larynx', hint: 'Hold your breath, pop the back', lips: 'Open.', tongue: 'Lift the back of your tongue to the soft roof, then let it pop.', air: SQUEEZE, voice: OFF, trick: 'Hold your breath and say "k" as sharply as you can.', like: 'a sharp, popping k with a tiny silence after it' },
  'sʼ': { place: 'tip', handle: 'larynx', hint: 'Hold your breath, squeeze out an s', lips: 'A little smile.', tongue: 'Tip close behind your top teeth, as for s.', air: 'Hold your breath by closing your throat, and squeeze upward: a short, sharp hiss comes out.', voice: OFF, like: 'a short, sharp s' },
};
// the IPA letter ɡ is the same sound as the g of the keyboard; ç is one
// character or two (c and a combining cedilla) depending on how it was typed
GUIDE['ɡ'] = GUIDE.g;
GUIDE['ç'] = GUIDE['ç'];

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
