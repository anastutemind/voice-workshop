/** A picture for the word of a letter, by its meaning: something a child knows at a glance. */
const PICTURES: Record<string, string> = {
  mango: '🥭', goat: '🐐', water: '💧', star: '⭐', tomato: '🍅', fruit: '🍎', ship: '🚢', moon: '🌙', 'sweet pudding': '🍮', rabbit: '🐇',
  door: '🚪', 'post, mail': '📮', taste: '😋', night: '🌃', mountain: '⛰️', 'earth, ground': '🌍', hail: '🌨️', apple: '🍎', lion: '🦁', soap: '🧼',
  need: '🙏', parrot: '🦜', 'vessel, dish': '🍲', glasses: '👓', balloon: '🎈', dove: '🕊️', pen: '🖊️', book: '📖', cow: '🐄', boy: '👦',
  fish: '🐟', nose: '👃', mother: '👩', father: '👨', elephant: '🐘', flower: '🌸', someone: '🧑', friend: '🤝', fun: '🎉', bear: '🐻',
  plate: '🍽️', cold: '🥶', flag: '🚩', umbrella: '☂️', sunshine: '☀️', drum: '🥁', food: '🍛', house: '🏠', 'to read': '📚', enough: '✋', heart: '❤️',
  fox: '🦊', camel: '🐪', horse: '🐴', bread: '🍞', wolf: '🐺', pomegranate: '🍎', sun: '☀️', falcon: '🦅', frog: '🐸', bird: '🐦',
  envelope: '✉️', eye: '👁️', gazelle: '🦌', lemon: '🍋', bee: '🐝', 'crescent moon': '🌙', rose: '🌹', hand: '✋', sky: '🌤️', girl: '👧', ball: '⚽',
  tamarind: '🌰', 'sugar cane': '🎋', owl: '🦉', wool: '🧶', sage: '🧘', one: '☝️', mortar: '🥣', woman: '👩', grapes: '🍇', greetings: '🙏',
  lotus: '🪷', 'flower pot': '🪴', colour: '🎨', spoon: '🥄', paw: '🐾', 'little drum': '🥁', lid: '🫙', arrow: '🏹', watermelon: '🍉', inkpot: '🖋️',
  bow: '🏹', tap: '🚰', kite: '🪁', yoga: '🧘', chariot: '🛞', 'sweet ball': '🍡', forest: '🌳', language: '🗣️', happy: '😊', phone: '📱',
};

export const pictureOf = (meaning: string): string => PICTURES[meaning] ?? '🔤';
