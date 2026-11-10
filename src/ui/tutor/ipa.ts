/**
 * The chart of the International Phonetic Alphabet (2020), for the tutor:
 * every sound with its official name, a few plain words about it, the sound
 * of the model that says it (or, for the few the model cannot make, the
 * posture that shows it best), and real words from languages that use it,
 * each in its own writing, for a voice of that language to read.
 *
 * The consonants are in the order of the chart (by manner, from the lips to
 * the throat), the vowels from close to open, front to back; then the
 * consonants made without air from the lungs (clicks, implosives,
 * ejectives), which the model cannot make: they are explained, and shown on
 * the nearest posture.
 */
import { PHONEMES } from '../../dsp/speech/phonemes';

export interface IpaExample {
  /** the language a browser voice is looked up by (the start of its tag): 'fr', 'zh-CN', 'en-GB' */
  lang: string;
  /** the name of the language */
  language: string;
  /** the word in its own writing, as a voice of that language should read it */
  text: string;
  /** in Latin letters, when the writing is not */
  roman?: string;
  /** what it means */
  meaning: string;
  /** the word in the compact form of the model (see compactPhones), when the model can say all of it */
  ipa?: string;
}

export interface IpaSound {
  symbol: string;
  /** the official name */
  name: string;
  /** a few plain words */
  short: string;
  /** the sound of the model that says it; null when the model cannot make it */
  sound: string | null;
  /** the sound of the model whose posture shows it best (the sound itself when there is one) */
  show: string;
  /** what the model says to show it alone (compact form): a vowel held, a consonant with a vowel; null when it cannot */
  say: string | null;
  /** a letter or a syllable that a real voice of that language reads as just this sound (with a vowel) */
  carrier?: { lang: string; text: string };
  /** real words that have the sound, from different languages */
  examples: IpaExample[];
  /** one more plain sentence, when it helps */
  note?: string;
}

export interface IpaSection { id: string; title: string; blurb: string; sounds: IpaSound[] }

/** The names of the languages of the examples, by the tag a voice is looked up by. */
export const IPA_LANGUAGES: Record<string, string> = {
  en: 'English', 'en-US': 'English (American)', 'en-GB': 'English (British)', 'en-AU': 'English (Australian)', 'en-NZ': 'English (New Zealand)',
  fr: 'French', de: 'German', es: 'Spanish', 'es-ES': 'Spanish (Spain)', it: 'Italian', pt: 'Portuguese', 'pt-PT': 'Portuguese (Portugal)',
  nl: 'Dutch', sv: 'Swedish', nb: 'Norwegian', da: 'Danish', fi: 'Finnish', et: 'Estonian', pl: 'Polish', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian',
  ru: 'Russian', uk: 'Ukrainian', bg: 'Bulgarian', sr: 'Serbian', sl: 'Slovene', el: 'Greek', tr: 'Turkish', ar: 'Arabic', 'ar-IQ': 'Arabic (Iraqi)',
  he: 'Hebrew', fa: 'Persian', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', mr: 'Marathi', ta: 'Tamil', ml: 'Malayalam', sd: 'Sindhi',
  ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Mandarin Chinese', 'zh-HK': 'Cantonese', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', mn: 'Mongolian', kk: 'Kazakh',
  ka: 'Georgian', am: 'Amharic', ha: 'Hausa', sw: 'Swahili', so: 'Somali', zu: 'Zulu', xh: 'Xhosa', ee: 'Ewe', mt: 'Maltese', cy: 'Welsh', ga: 'Irish',
  ca: 'Catalan', fo: 'Faroese', csb: 'Kashubian', qu: 'Quechua', nv: 'Navajo', tli: 'Tlingit', mam: 'Mam', guc: 'Wayuu', agx: 'Agul', ce: 'Chechen',
  nia: 'Nias', sbc: 'Kele', mnh: 'Mono', wgi: 'Mid-Wahgi', med: 'Melpa', nmn: 'Taa', huc: 'ǂʼAmkoe', naq: 'Khoekhoe',
};

/** An example word: language, the word, its meaning, the compact form the model says (if it can), and Latin letters (if needed). */
const w = (lang: string, text: string, meaning: string, ipa?: string, roman?: string): IpaExample => ({
  lang, language: IPA_LANGUAGES[lang] ?? lang, text, ...(roman ? { roman } : {}), meaning, ...(ipa ? { ipa } : {}),
});

/** a sound the model says: its own symbol in the model (or another key), held if a vowel, with a after it if a consonant */
function S(symbol: string, name: string, short: string, examples: IpaExample[], more: Partial<IpaSound> = {}): IpaSound {
  const sound = more.sound === undefined ? symbol : more.sound;
  const show = more.show ?? sound ?? symbol;
  const vowel = PHONEMES[show]?.manner === 'vowel';
  const say = sound === null ? null : more.say ?? (vowel ? sound + 'ː' : sound + 'a');
  return { symbol, name, short, examples, ...more, sound, show, say };
}
/** a sound the model cannot make: explained, and shown on the nearest posture */
const X = (symbol: string, name: string, short: string, show: string, examples: IpaExample[], note?: string): IpaSound =>
  S(symbol, name, short, examples, { sound: null, show, ...(note ? { note } : {}) });
const hi = (text: string) => ({ carrier: { lang: 'hi', text } });
const by = (lang: string, text: string) => ({ carrier: { lang, text } });

export const IPA_SECTIONS: IpaSection[] = [
  {
    id: 'plosives', title: 'Plosives',
    blurb: 'The mouth closes somewhere, the air waits behind the closure, then it pops out.',
    sounds: [
      S('p', 'voiceless bilabial plosive', 'the lips close and pop, without voice', [
        w('en', 'pen', 'pen', 'pɛn'), w('es', 'padre', 'father', 'ˈpaðɾe'), w('fr', 'pain', 'bread', 'pɛ~'), w('hi', 'पानी', 'water', 'paːniː', 'pānī'),
      ], hi('प')),
      S('b', 'voiced bilabial plosive', 'the lips close and pop, with voice', [
        w('en', 'bed', 'bed', 'bɛd'), w('fr', 'bon', 'good', 'bɔ~'), w('ar', 'باب', 'door', 'baːb', 'bāb'), w('hi', 'बकरी', 'goat', 'bəkriː', 'bakrī'),
      ], hi('ब')),
      S('t', 'voiceless alveolar plosive', 'the tongue tip closes behind the top teeth, without voice', [
        w('en', 'top', 'top', 'tɑp'), w('es', 'tú', 'you', 'tu'), w('it', 'tutto', 'everything', 'ˈtutːo'), w('hi', 'तारा', 'star', 'taːraː', 'tārā'),
      ], { ...hi('त'), note: 'In English the tip touches the ridge behind the teeth; in Spanish, Italian and Hindi it touches the teeth themselves.' }),
      S('d', 'voiced alveolar plosive', 'the tongue tip closes behind the top teeth, with voice', [
        w('en', 'dog', 'dog', 'dɔg'), w('fr', 'deux', 'two', 'dø'), w('ar', 'دار', 'house', 'daːr', 'dār'), w('hi', 'दाल', 'lentils', 'daːl', 'dāl'),
      ], hi('द')),
      S('ʈ', 'voiceless retroflex plosive', 'a t with the tip curled back', [
        w('hi', 'टमाटर', 'tomato', 'ʈəmaːʈər', 'ṭamāṭar'), w('ur', 'ٹوپی', 'cap', 'ʈoːpiː', 'ṭopī'), w('sv', 'kort', 'short', 'kɔʈː'),
      ], hi('ट')),
      S('ɖ', 'voiced retroflex plosive', 'a d with the tip curled back', [
        w('hi', 'डमरू', 'little drum', 'ɖəmruː', 'ḍamrū'), w('ur', 'ڈاک', 'post, mail', 'ɖaːk', 'ḍāk'), w('sv', 'bord', 'table', 'buːɖ'),
      ], hi('ड')),
      S('c', 'voiceless palatal plosive', 'between t and k: the middle of the tongue on the roof', [
        w('hu', 'tyúk', 'hen', 'cuːk'), w('cs', 'tělo', 'body', 'ˈcɛlo'), w('el', 'και', 'and', 'ce', 'kai'),
      ], by('hu', 'tya')),
      S('ɟ', 'voiced palatal plosive', 'between d and g: the middle of the tongue on the roof', [
        w('hu', 'gyerek', 'child', 'ˈɟɛrɛk'), w('cs', 'děti', 'children', 'ˈɟɛcɪ'), w('tr', 'güneş', 'sun', 'ɟyˈneʃ'),
      ], by('hu', 'gya')),
      S('k', 'voiceless velar plosive', 'the back of the tongue closes and pops, without voice', [
        w('en', 'cat', 'cat', 'kæt'), w('es', 'casa', 'house', 'ˈkasa'), w('ja', 'かさ', 'umbrella', 'kasa', 'kasa'), w('hi', 'कमल', 'lotus', 'kəməl', 'kamal'),
      ], hi('क')),
      S('ɡ', 'voiced velar plosive', 'the back of the tongue closes and pops, with voice', [
        w('en', 'go', 'go', 'goʊ'), w('de', 'gut', 'good', 'guːt'), w('ru', 'год', 'year', 'got', 'god'), w('hi', 'गाय', 'cow', 'gaːj', 'gāy'),
      ], { sound: 'g', ...hi('ग') }),
      S('q', 'voiceless uvular plosive', 'a k made further back, at the very back of the mouth', [
        w('ar', 'قَلْب', 'heart', 'qalb', 'qalb'), w('ur', 'قلم', 'pen', 'qələm', 'qalam'), w('kk', 'қазақ', 'Kazakh', 'qɑˈzɑq', 'qazaq'),
      ], by('ar', 'قَ')),
      S('ɢ', 'voiced uvular plosive', 'a g made further back, at the very back of the mouth', [
        w('fa', 'قند', 'sugar cube', 'ɢænd', 'qand'), w('so', 'Muqdisho', 'Mogadishu', 'muɢdiʃo'),
      ], { note: 'A rare sound. In Persian the letter ق is said this way at the start of a word.' }),
      S('ʔ', 'glottal plosive', 'the throat closes for a moment: a tiny catch', [
        w('en', 'uh-oh', 'uh-oh', 'ˈʔʌʔoʊ'), w('ar', 'سُؤال', 'question', 'suʔaːl', 'suʾāl'), w('de', 'beachten', 'to heed', 'bəˈʔaxtən'), w('id', 'maaf', 'sorry', 'maʔaf'),
      ], { ...by('ar', 'أَ'), note: 'Also called the glottal stop.' }),
    ],
  },
  {
    id: 'nasals', title: 'Nasals',
    blurb: 'The mouth is closed and the voice comes out through the nose.',
    sounds: [
      S('m', 'voiced bilabial nasal', 'the lips closed, a hum through the nose', [
        w('en', 'man', 'man', 'mæn'), w('es', 'mamá', 'mum', 'maˈma'), w('zh-CN', '妈妈', 'mum', 'mama', 'māma'), w('hi', 'माँ', 'mother', 'ma~ː', 'mā̃'),
      ], hi('म')),
      S('ɱ', 'voiced labiodental nasal', 'an m made with the top teeth on the lower lip', [
        w('en', 'symphony', 'symphony', 'ˈsɪɱfəni'), w('it', 'inverno', 'winter', 'iɱˈvɛrno'), w('es', 'enfermo', 'ill', 'eɱˈfeɾmo'),
      ], { note: 'It is what an m or an n turns into just before f or v.' }),
      S('n', 'voiced alveolar nasal', 'the tongue tip up, a hum through the nose', [
        w('en', 'no', 'no', 'noʊ'), w('es', 'nada', 'nothing', 'ˈnaða'), w('ja', 'なつ', 'summer', 'natsɯ', 'natsu'), w('hi', 'नाक', 'nose', 'naːk', 'nāk'),
      ], hi('न')),
      S('ɳ', 'voiced retroflex nasal', 'an n with the tip curled back', [
        w('hi', 'ठंडा', 'cold', 'ʈʰəɳɖaː', 'ṭhaṇḍā'), w('sv', 'barn', 'child', 'bɑːɳ'), w('ta', 'மணி', 'bell', 'maɳi', 'maṇi'),
      ], hi('ण')),
      S('ɲ', 'voiced palatal nasal', 'an n made with the middle of the tongue on the roof', [
        w('es', 'niño', 'boy', 'ˈniɲo'), w('fr', 'montagne', 'mountain', 'mɔ~ˈtaɲ'), w('it', 'gnocchi', 'gnocchi', 'ˈɲɔkːi'), w('pt', 'banho', 'bath', 'ˈbɐɲu'),
      ], by('es', 'ña')),
      S('ŋ', 'voiced velar nasal', 'the back of the tongue up, a hum through the nose', [
        w('en', 'sing', 'sing', 'sɪŋ'), w('de', 'lang', 'long', 'laŋ'), w('vi', 'ngon', 'tasty', 'ŋɔn'), w('id', 'bunga', 'flower', 'ˈbuŋa'),
      ], by('vi', 'nga')),
      S('ɴ', 'voiced uvular nasal', 'an ng made further back, at the very back of the mouth', [
        w('ja', '本', 'book', 'hoɴ', 'hon'), w('qu', 'sunqu', 'heart', 'ˈsoɴqo'),
      ], by('ja', 'ん')),
    ],
  },
  {
    id: 'trills-taps', title: 'Trills and taps',
    blurb: 'A trill flutters in the stream of air; a tap is one quick touch.',
    sounds: [
      S('ʙ', 'voiced bilabial trill', 'the lips flutter: brrr', [
        w('nia', 'simbi', 'lower jaw', 'siʙi'), w('sbc', 'mbuen', 'its fruit', 'mʙuɛn'),
      ], { note: 'English speakers make it when they say "brrr" for cold. The picture holds the lips where they flutter; it cannot make them flap.' }),
      S('r', 'voiced alveolar trill', 'the tongue tip flutters: a rolled r', [
        w('es', 'perro', 'dog', 'ˈpero'), w('it', 'terra', 'earth', 'ˈtɛrːa'), w('ru', 'рыба', 'fish', 'ˈrɨbə', 'ryba'), w('ar', 'رَمْل', 'sand', 'raml', 'raml'),
      ], hi('र')),
      S('ʀ', 'voiced uvular trill', 'the little tongue at the back of the mouth flutters: a gargled r', [
        w('de', 'rot', 'red', 'ʀoːt'), w('nl', 'rood', 'red', 'ʀoːt'),
      ], { note: 'Many speakers of German, French and Dutch use the softer ʁ instead. The picture holds the place; it cannot make the flutter.' }),
      S('ⱱ', 'voiced labiodental flap', 'the lower lip flicks once past the top teeth', [
        w('mnh', 'vwa', 'to send', 'ⱱa'),
      ], { say: 'aⱱa', note: 'Found in a few languages of central Africa.' }),
      S('ɾ', 'voiced alveolar tap', 'one quick tap of the tongue tip', [
        w('en-US', 'butter', 'butter', 'ˈbʌɾɚ'), w('es', 'pero', 'but', 'ˈpeɾo'), w('ja', 'ラーメン', 'ramen', 'ɾaːmeɴ', 'rāmen'), w('ko', '사람', 'person', 'ˈsaɾam', 'saram'),
      ], { say: 'aɾa', ...by('es', 'ara') }),
      S('ɽ', 'voiced retroflex flap', 'the curled tip flicks forward once', [
        w('hi', 'पहाड़', 'mountain', 'pəhaːɽ', 'pahāṛ'), w('ur', 'لڑکا', 'boy', 'ləɽkaː', 'laṛkā'), w('bn', 'গাড়ি', 'car', 'gaɽi', 'gāṛi'),
      ], { say: 'aɽa', ...hi('ड़') }),
    ],
  },
  {
    id: 'fricatives', title: 'Fricatives',
    blurb: 'The air is squeezed through a narrow gap and hisses, or buzzes when the voice is on.',
    sounds: [
      S('ɸ', 'voiceless bilabial fricative', 'air blown between the two lips, as on hot soup', [
        w('ja', 'ふね', 'boat', 'ɸɯne', 'fune'), w('ee', 'ƒo', 'to beat', 'ɸo'),
      ], by('ja', 'ふ')),
      S('β', 'voiced bilabial fricative', 'a b that never quite closes', [
        w('es', 'lobo', 'wolf', 'ˈloβo'), w('pt-PT', 'sábado', 'Saturday', 'ˈsaβɐðu'), w('ee', 'Eʋe', 'the Ewe language', 'eβe'),
      ], { say: 'aβa', ...by('es', 'aba') }),
      S('f', 'voiceless labiodental fricative', 'top teeth on the lower lip, air only', [
        w('en', 'fish', 'fish', 'fɪʃ'), w('fr', 'feu', 'fire', 'fø'), w('it', 'fame', 'hunger', 'ˈfaːme'), w('ar', 'فيل', 'elephant', 'fiːl', 'fīl'),
      ], hi('फ़')),
      S('v', 'voiced labiodental fricative', 'top teeth on the lower lip, with voice', [
        w('en', 'van', 'van', 'væn'), w('fr', 'vin', 'wine', 'vɛ~'), w('it', 'vino', 'wine', 'ˈviːno'), w('ru', 'вода', 'water', 'vɐˈda', 'voda'),
      ]),
      S('θ', 'voiceless dental fricative', 'the tongue between the teeth, air only', [
        w('en', 'thin', 'thin', 'θɪn'), w('es-ES', 'zapato', 'shoe', 'θaˈpato'), w('el', 'θάλασσα', 'sea', 'ˈθalasa', 'thálassa'), w('ar', 'ثَلاثة', 'three', 'θaˈlaːθa', 'thalātha'),
      ], by('ar', 'ثَ')),
      S('ð', 'voiced dental fricative', 'the tongue between the teeth, with voice', [
        w('en', 'this', 'this', 'ðɪs'), w('es', 'nada', 'nothing', 'ˈnaða'), w('el', 'δέντρο', 'tree', 'ˈðendro', 'déntro'), w('ar', 'ذَهَب', 'gold', 'ˈðahab', 'dhahab'),
      ], by('ar', 'ذَ')),
      S('s', 'voiceless alveolar fricative', 'a thin hiss behind the top teeth', [
        w('en', 'sun', 'sun', 'sʌn'), w('fr', 'soleil', 'sun', 'sɔˈlɛj'), w('ja', 'さくら', 'cherry blossom', 'sakɯɾa', 'sakura'), w('hi', 'सेब', 'apple', 'seːb', 'seb'),
      ], hi('स')),
      S('z', 'voiced alveolar fricative', 'the hiss of s with the voice: a buzz', [
        w('en', 'zoo', 'zoo', 'zu'), w('fr', 'zéro', 'zero', 'zeˈʁo'), w('pt', 'casa', 'house', 'ˈkazɐ'), w('ar', 'زَهْرة', 'flower', 'ˈzahra', 'zahra'),
      ], hi('ज़')),
      S('ʃ', 'voiceless postalveolar fricative', 'shh, with the lips pushed forward', [
        w('en', 'ship', 'ship', 'ʃɪp'), w('fr', 'chat', 'cat', 'ʃa'), w('de', 'Schule', 'school', 'ˈʃuːlə'), w('ar', 'شَمْس', 'sun', 'ʃams', 'shams'),
      ], hi('श')),
      S('ʒ', 'voiced postalveolar fricative', 'shh with the voice', [
        w('en', 'measure', 'measure', 'ˈmɛʒɚ'), w('fr', 'jour', 'day', 'ʒuʁ'), w('pt', 'janela', 'window', 'ʒɐˈnɛlɐ'),
      ], by('fr', 'ja')),
      S('ʂ', 'voiceless retroflex fricative', 'a sh with the tip curled back', [
        w('zh-CN', '书', 'book', 'ʂu', 'shū'), w('ru', 'шум', 'noise', 'ʂum', 'shum'), w('pl', 'szafa', 'wardrobe', 'ˈʂafa'), w('sv', 'fors', 'rapids', 'fɔʂ'),
      ], by('ru', 'ша')),
      S('ʐ', 'voiced retroflex fricative', 'the s of "measure" with the tip curled back', [
        w('ru', 'жук', 'beetle', 'ʐuk', 'zhuk'), w('pl', 'żaba', 'frog', 'ˈʐaba'),
      ], by('ru', 'жа')),
      S('ç', 'voiceless palatal fricative', 'the y of "yes" blown without voice', [
        w('de', 'ich', 'I', 'ɪç'), w('en', 'huge', 'huge', 'çudʒ'), w('ja', 'ひと', 'person', 'çito', 'hito'), w('el', 'χέρι', 'hand', 'ˈçeri', 'chéri'),
      ], by('ja', 'ひ')),
      S('ʝ', 'voiced palatal fricative', 'a y said so tightly that it buzzes', [
        w('es', 'ayer', 'yesterday', 'aˈʝeɾ'), w('el', 'γη', 'earth', 'ʝi', 'gi'),
      ], { say: 'aʝa', ...by('es', 'aya') }),
      S('x', 'voiceless velar fricative', 'air scraped at the back of the tongue', [
        w('en-GB', 'loch', 'lake (Scottish)', 'lɔx'), w('de', 'Buch', 'book', 'buːx'), w('es', 'jamón', 'ham', 'xaˈmon'), w('ru', 'хлеб', 'bread', 'xlep', 'khleb'),
      ], by('es', 'ja')),
      S('ɣ', 'voiced velar fricative', 'a g that never quite closes: a soft gargle', [
        w('es', 'amigo', 'friend', 'aˈmiɣo'), w('el', 'γάλα', 'milk', 'ˈɣala', 'gála'), w('ar', 'غَزال', 'gazelle', 'ɣaˈzaːl', 'ghazāl'),
      ], by('el', 'γα')),
      S('χ', 'voiceless uvular fricative', 'a rough scrape at the very back of the mouth', [
        w('nl', 'acht', 'eight', 'ɑχt'), w('de', 'Dach', 'roof', 'daχ'), w('he', 'חלב', 'milk', 'χaˈlav', 'ḥalav'), w('cy', 'chwech', 'six', 'χweːχ'),
      ]),
      S('ʁ', 'voiced uvular fricative', 'a soft gargle at the very back of the mouth', [
        w('fr', 'rouge', 'red', 'ʁuʒ'), w('de', 'rot', 'red', 'ʁoːt'), w('pt-PT', 'rato', 'mouse', 'ˈʁatu'), w('he', 'ראש', 'head', 'ʁoʃ', 'rosh'),
      ], by('fr', 'ra')),
      S('ħ', 'voiceless pharyngeal fricative', 'a strong whispered h from a squeezed throat', [
        w('ar', 'حُبّ', 'love', 'ħubː', 'ḥubb'), w('mt', 'ħelu', 'sweet', 'ˈħɛlu'), w('so', 'xoolo', 'livestock', 'ħoːlo'),
      ], by('ar', 'حَ')),
      S('ʕ', 'voiced pharyngeal fricative', 'the voice through a squeezed throat', [
        w('ar', 'عَيْن', 'eye', 'ʕajn', 'ʿayn'), w('so', 'cunto', 'food', 'ˈʕunto'),
      ], by('ar', 'عَ')),
      S('h', 'voiceless glottal fricative', 'just a breath out', [
        w('en', 'hat', 'hat', 'hæt'), w('de', 'Haus', 'house', 'haʊs'), w('ja', 'はな', 'flower', 'hana', 'hana'), w('hi', 'हाथी', 'elephant', 'haːtʰiː', 'hāthī'),
      ], hi('ह')),
      S('ɦ', 'voiced glottal fricative', 'a breathy h with the voice on', [
        w('en', 'behind', 'behind', 'bɪˈɦaɪnd'), w('nl', 'hoed', 'hat', 'ɦut'), w('cs', 'hrad', 'castle', 'ɦrat'), w('uk', 'голова', 'head', 'ɦoloˈwɑ', 'holova'),
      ], { say: 'aɦa', ...by('nl', 'ha') }),
    ],
  },
  {
    id: 'lateral-fricatives', title: 'Lateral fricatives',
    blurb: 'The tip closes the middle, and the air hisses out past the sides of the tongue.',
    sounds: [
      S('ɬ', 'voiceless alveolar lateral fricative', 'an l blown hard, without voice', [
        w('cy', 'llan', 'church, parish', 'ɬan'), w('zu', 'hlala', 'sit, stay', 'ˈɬaːla'), w('nv', 'łaʼ', 'one, some', 'ɬaʔ'),
      ]),
      S('ɮ', 'voiced alveolar lateral fricative', 'an l that buzzes', [
        w('zu', 'dlala', 'play', 'ˈɮaːla'), w('mn', 'монгол', 'Mongolian', 'ˈmɔŋɢɔɮ', 'mongol'),
      ]),
    ],
  },
  {
    id: 'approximants', title: 'Approximants',
    blurb: 'The tongue or the lips come close, but not close enough to hiss.',
    sounds: [
      S('ʋ', 'voiced labiodental approximant', 'half way between v and w: the lip near the teeth', [
        w('nl', 'wang', 'cheek', 'ʋɑŋ'), w('fi', 'vauva', 'baby', 'ˈʋɑuʋɑ'), w('hi', 'वन', 'forest', 'ʋən', 'van'),
      ], hi('व')),
      S('ɹ', 'voiced alveolar approximant', 'the English r: the tip up, touching nothing', [
        w('en', 'red', 'red', 'ɹɛd'), w('fo', 'róður', 'rudder', 'ˈɹɔuwʊɹ'),
      ]),
      S('ɻ', 'voiced retroflex approximant', 'an r with the tip curled back', [
        w('zh-CN', '肉', 'meat', 'ɻoʊ', 'ròu'), w('ta', 'தமிழ்', 'Tamil', 'tamiɻ', 'Tamiḻ'), w('ml', 'വഴി', 'way', 'ˈʋɐɻi', 'vaḻi'),
      ]),
      S('j', 'voiced palatal approximant', 'the y of "yes"', [
        w('en', 'yes', 'yes', 'jɛs'), w('de', 'ja', 'yes', 'jaː'), w('ja', 'やま', 'mountain', 'jama', 'yama'), w('hi', 'यार', 'friend', 'jaːr', 'yār'),
      ], hi('य')),
      S('ɰ', 'voiced velar approximant', 'a w with the lips kept flat', [
        w('ko', '의사', 'doctor', 'ɰisa', 'uisa'), w('ja', 'わたし', 'I', 'ɰataɕi', 'watashi'), w('es', 'pagar', 'to pay', 'paˈɰaɾ'),
      ], by('ja', 'わ')),
    ],
  },
  {
    id: 'laterals', title: 'Lateral approximants',
    blurb: 'The tongue closes the middle of the mouth and the air flows past its sides.',
    sounds: [
      S('l', 'voiced alveolar lateral approximant', 'the tip up, the air past the sides', [
        w('en', 'leg', 'leg', 'lɛg'), w('fr', 'lune', 'moon', 'lyn'), w('ar', 'لَيْل', 'night', 'lajl', 'layl'), w('hi', 'लाल', 'red', 'laːl', 'lāl'),
      ], hi('ल')),
      S('ɭ', 'voiced retroflex lateral approximant', 'an l with the tip curled back', [
        w('ta', 'நாள்', 'day', 'naːɭ', 'nāḷ'), w('mr', 'बाळ', 'baby', 'baːɭ', 'bāḷ'), w('sv', 'pärla', 'pearl', 'ˈpæːɭa'),
      ]),
      S('ʎ', 'voiced palatal lateral approximant', 'an l made with the middle of the tongue on the roof', [
        w('it', 'figlio', 'son', 'ˈfiʎːo'), w('pt', 'olho', 'eye', 'ˈoʎu'), w('ca', 'llibre', 'book', 'ˈʎiβɾə'), w('el', 'ήλιος', 'sun', 'ˈiʎos', 'ílios'),
      ], by('it', 'glia')),
      X('ʟ', 'voiced velar lateral approximant', 'an l made where g is made', 'g', [
        w('wgi', 'aglagle', 'dizzy'), w('med', 'paⱡa', 'fence'),
      ], 'A very rare sound of a few languages of New Guinea. The picture shows the back of the tongue up; the air slips past its sides.'),
    ],
  },
  {
    id: 'other', title: 'Affricates and other symbols',
    blurb: 'Sounds made in two places at once, and stops let go into a hiss.',
    sounds: [
      S('ʍ', 'voiceless labial-velar fricative', 'a w blown without voice: hw', [
        w('en-GB', 'which', 'which (Scottish, Irish)', 'ʍɪtʃ'), w('sl', 'vse', 'everything', 'ʍsɛ'),
      ]),
      S('w', 'voiced labial-velar approximant', 'round lips that open into the vowel', [
        w('en', 'we', 'we', 'wi'), w('fr', 'oui', 'yes', 'wi'), w('es', 'huevo', 'egg', 'ˈweβo'), w('ar', 'وَلَد', 'boy', 'ˈwalad', 'walad'),
      ], by('ar', 'وَ')),
      S('ɥ', 'voiced labial-palatal approximant', 'the tongue of y with the lips of w', [
        w('fr', 'huit', 'eight', 'ɥit'), w('zh-CN', '月', 'moon', 'ɥe', 'yuè'),
      ]),
      S('ʜ', 'voiceless epiglottal fricative', 'a rasping h from low in the throat', [
        w('agx', 'мехӀ', 'whey', 'mɛʜ', 'mekhʼ'), w('ce', 'хьо', 'you', 'ʜɔ', 'ẋo'),
      ], { note: 'A rare sound of some languages of the Caucasus.' }),
      S('ʢ', 'voiced epiglottal fricative', 'a squeezed, growled sound from low in the throat', [
        w('ar-IQ', 'تعال', 'come!', 'taʢaːl', 'taʿāl'),
      ]),
      S('ʡ', 'epiglottal plosive', 'a stop made low in the throat', [
        w('agx', 'йагӀ', 'centre', 'jaʡ', 'yagʼ'),
      ], { note: 'A rare sound. It is made a little above the catch of "uh-oh".' }),
      S('ɕ', 'voiceless alveolo-palatal fricative', 'a soft sh said with a smile', [
        w('zh-CN', '西', 'west', 'ɕi', 'xī'), w('ja', 'しお', 'salt', 'ɕio', 'shio'), w('pl', 'środa', 'Wednesday', 'ˈɕrɔda'), w('sv', 'kjol', 'skirt', 'ɕuːl'),
      ], by('ja', 'し')),
      S('ʑ', 'voiced alveolo-palatal fricative', 'the soft sh with the voice', [
        w('pl', 'zima', 'winter', 'ˈʑima'), w('ja', 'かじ', 'fire', 'kaʑi', 'kaji'),
      ], by('pl', 'zia')),
      S('ɺ', 'voiced alveolar lateral flap', 'one quick tap, between r and l', [
        w('ja', 'ろく', 'six', 'ɺokɯ', 'roku'), w('guc', 'püülükü', 'pig', 'pɯːɺɯkɯ'),
      ], { say: 'aɺa' }),
      S('ɧ', 'simultaneous ʃ and x', 'the Swedish sj: a dark, breathy hush', [
        w('sv', 'sju', 'seven', 'ɧʉː'),
      ], { ...by('sv', 'sju'), note: 'A sound of Swedish only. Speakers make it in more than one way.' }),
      S('ts', 'voiceless alveolar affricate', 't let go into s', [
        w('en', 'cats', 'cats', 'kæts'), w('de', 'Zeit', 'time', 'tsaɪt'), w('it', 'pizza', 'pizza', 'ˈpitsa'), w('ja', 'つなみ', 'tsunami', 'tsɯnami', 'tsunami'),
      ], by('ja', 'つ')),
      S('dz', 'voiced alveolar affricate', 'd let go into z', [
        w('en', 'kids', 'kids', 'kɪdz'), w('it', 'zero', 'zero', 'ˈdzɛːro'), w('pl', 'dzwon', 'bell', 'dzvɔn'), w('ka', 'ძაღლი', 'dog', 'ˈdzaɣli', 'dzaghli'),
      ]),
      S('tʃ', 'voiceless postalveolar affricate', 't let go into sh: ch', [
        w('en', 'chair', 'chair', 'tʃɛɹ'), w('es', 'chico', 'boy', 'ˈtʃiko'), w('it', 'ciao', 'hello', 'ˈtʃao'), w('hi', 'चाय', 'tea', 'tʃaːj', 'chāy'),
      ], hi('च')),
      S('dʒ', 'voiced postalveolar affricate', 'd let go into zh: j', [
        w('en', 'jam', 'jam', 'dʒæm'), w('it', 'gelato', 'ice cream', 'dʒeˈlaːto'), w('ar', 'جَمَل', 'camel', 'ˈdʒamal', 'jamal'), w('hi', 'जल', 'water', 'dʒəl', 'jal'),
      ], hi('ज')),
      S('tɕ', 'voiceless alveolo-palatal affricate', 'a ch said with a smile', [
        w('zh-CN', '鸡', 'chicken', 'tɕi', 'jī'), w('ja', 'ちち', 'father', 'tɕitɕi', 'chichi'), w('pl', 'ciało', 'body', 'ˈtɕawɔ'), w('ru', 'чай', 'tea', 'tɕæj', 'chay'),
      ], by('ja', 'ち')),
      S('dʑ', 'voiced alveolo-palatal affricate', 'a j said with a smile', [
        w('ja', 'じかん', 'time', 'dʑikaɴ', 'jikan'), w('pl', 'dźwięk', 'sound', 'dʑvjɛŋk'), w('ko', '가지', 'eggplant', 'ˈkadʑi', 'gaji'),
      ], by('ja', 'じ')),
      S('ʈʂ', 'voiceless retroflex affricate', 'a ch with the tip curled back', [
        w('zh-CN', '中', 'middle', 'ʈʂʊŋ', 'zhōng'), w('pl', 'czas', 'time', 'ʈʂas'),
      ], by('pl', 'cza')),
      S('ɖʐ', 'voiced retroflex affricate', 'a j with the tip curled back', [
        w('pl', 'dżem', 'jam', 'ɖʐɛm'), w('ru', 'джем', 'jam', 'ɖʐɛm', 'dzhem'), w('sr', 'џеп', 'pocket', 'ɖʐɛp', 'džep'),
      ], by('pl', 'dża')),
    ],
  },
  {
    id: 'vowels-close', title: 'Close vowels',
    blurb: 'The tongue is high and the mouth nearly closed: ee, oo and the sounds between them.',
    sounds: [
      S('i', 'close front unrounded vowel', 'ee: the tongue high and forward, a smile', [
        w('en', 'see', 'see', 'si'), w('fr', 'si', 'if', 'si'), w('de', 'sie', 'she', 'ziː'), w('ja', 'いち', 'one', 'itɕi', 'ichi'),
      ], hi('ई')),
      S('y', 'close front rounded vowel', 'ee said with rounded lips', [
        w('fr', 'lune', 'moon', 'lyn'), w('de', 'über', 'over', 'ˈyːbɐ'), w('zh-CN', '鱼', 'fish', 'y', 'yú'), w('tr', 'gül', 'rose', 'ɟyl'),
      ], by('fr', 'u')),
      S('ɨ', 'close central unrounded vowel', 'half way between ee and oo, lips flat', [
        w('ru', 'ты', 'you', 'tɨ', 'ty'), w('pl', 'syn', 'son', 'sɨn'), w('ro', 'în', 'in', 'ɨn'),
      ], by('ru', 'ы')),
      S('ʉ', 'close central rounded vowel', 'half way between ee and oo, lips round', [
        w('sv', 'ful', 'ugly', 'fʉːl'), w('nb', 'hus', 'house', 'hʉːs'), w('en-AU', 'goose', 'goose', 'gʉːs'),
      ], by('sv', 'u')),
      S('ɯ', 'close back unrounded vowel', 'oo said with flat lips', [
        w('ja', 'くうき', 'air', 'kɯːki', 'kūki'), w('ko', '음식', 'food', 'ˈɯmɕik', 'eumsik'), w('tr', 'kız', 'girl', 'kɯz'), w('vi', 'tư', 'fourth', 'tɯ'),
      ], by('ja', 'う')),
      S('u', 'close back rounded vowel', 'oo: the tongue high and back, the lips round', [
        w('en', 'moon', 'moon', 'mun'), w('fr', 'vous', 'you', 'vu'), w('es', 'luna', 'moon', 'ˈluna'), w('hi', 'फूल', 'flower', 'pʰuːl', 'phūl'),
      ], hi('ऊ')),
      S('ɪ', 'near-close near-front unrounded vowel', 'the short i of "sit"', [
        w('en', 'sit', 'sit', 'sɪt'), w('de', 'bitte', 'please', 'ˈbɪtə'), w('nl', 'ik', 'I', 'ɪk'), w('hi', 'दिल', 'heart', 'dɪl', 'dil'),
      ], hi('इ')),
      S('ʏ', 'near-close near-front rounded vowel', 'the i of "sit" with rounded lips', [
        w('de', 'hübsch', 'pretty', 'hʏpʃ'), w('nl', 'hut', 'hut', 'ɦʏt'), w('sv', 'ylle', 'wool', 'ˈʏlːɛ'),
      ]),
      S('ʊ', 'near-close near-back rounded vowel', 'the short oo of "book"', [
        w('en', 'book', 'book', 'bʊk'), w('de', 'Mutter', 'mother', 'ˈmʊtɐ'), w('hi', 'गुलाब', 'rose', 'gʊlaːb', 'gulāb'),
      ], hi('उ')),
    ],
  },
  {
    id: 'vowels-mid', title: 'Mid vowels',
    blurb: 'The tongue is half way up: the e and o sounds, and the relaxed vowels in the middle of the mouth.',
    sounds: [
      S('e', 'close-mid front unrounded vowel', 'the é of French: a half smile', [
        w('fr', 'été', 'summer', 'eˈte'), w('de', 'See', 'lake', 'zeː'), w('es', 'mesa', 'table', 'ˈmesa'), w('hi', 'एक', 'one', 'eːk', 'ek'),
      ], hi('ए')),
      S('ø', 'close-mid front rounded vowel', 'é said with rounded lips', [
        w('fr', 'feu', 'fire', 'fø'), w('de', 'schön', 'beautiful', 'ʃøːn'), w('sv', 'öl', 'beer', 'øːl'), w('hu', 'nő', 'woman', 'nøː'),
      ], by('de', 'ö')),
      S('ɘ', 'close-mid central unrounded vowel', 'a relaxed vowel, a little higher than the a of "about"', [
        w('en-NZ', 'bit', 'bit', 'bɘt'), w('kk', 'бір', 'one', 'bɘr', 'bir'),
      ]),
      S('ɵ', 'close-mid central rounded vowel', 'a relaxed vowel in the middle, lips round', [
        w('sv', 'full', 'full', 'fɵlː'), w('zh-HK', '出', 'to go out', 'tsɵt', 'ceot'), w('ru', 'тётя', 'aunt', 'ˈtɵtə', 'tyotya'),
      ]),
      S('ɤ', 'close-mid back unrounded vowel', 'o said with flat lips', [
        w('zh-CN', '饿', 'hungry', 'ɤ', 'è'), w('bg', 'път', 'road', 'pɤt', 'pǎt'), w('et', 'kõrv', 'ear', 'kɤrv'), w('th', 'เธอ', 'you, she', 'tʰɤː', 'thoe'),
      ], by('zh-CN', '饿')),
      S('o', 'close-mid back rounded vowel', 'a pure o: the lips round like the letter', [
        w('fr', 'eau', 'water', 'o'), w('de', 'Boot', 'boat', 'boːt'), w('es', 'sol', 'sun', 'sol'), w('hi', 'मोर', 'peacock', 'moːr', 'mor'),
      ], hi('ओ')),
      S('ə', 'mid central vowel', 'the relaxed a of "about": everything at rest', [
        w('en', 'about', 'about', 'əˈbaʊt'), w('fr', 'le', 'the', 'lə'), w('de', 'Name', 'name', 'ˈnaːmə'), w('hi', 'नमक', 'salt', 'nəmək', 'namak'),
      ], { ...hi('अ'), note: 'Also called schwa.' }),
      S('ɛ', 'open-mid front unrounded vowel', 'the e of "bed"', [
        w('en', 'bed', 'bed', 'bɛd'), w('fr', 'père', 'father', 'pɛʁ'), w('de', 'Bett', 'bed', 'bɛt'), w('it', 'bello', 'beautiful', 'ˈbɛlːo'),
      ], hi('ऐ')),
      S('œ', 'open-mid front rounded vowel', 'the e of "bed" with rounded lips', [
        w('fr', 'sœur', 'sister', 'sœʁ'), w('de', 'zwölf', 'twelve', 'tsvœlf'), w('tr', 'göl', 'lake', 'ɟœl'),
      ], by('tr', 'ö')),
      S('ɜ', 'open-mid central unrounded vowel', 'the ir of British "bird", with no r', [
        w('en-GB', 'bird', 'bird', 'bɜːd'),
      ]),
      S('ɞ', 'open-mid central rounded vowel', 'the "bird" vowel with rounded lips', [
        w('ga', 'tomhail', 'consume!', 'tɞːl'), w('csb', 'ptôch', 'bird', 'ptɞx'),
      ], { note: 'One of the rarest vowels.' }),
      S('ʌ', 'open-mid back unrounded vowel', 'the u of "cup"', [
        w('en', 'cup', 'cup', 'kʌp'), w('ko', '어머니', 'mother', 'ʌmʌni', 'eomeoni'),
      ], by('ko', '어')),
      S('ɔ', 'open-mid back rounded vowel', 'the aw of "saw": open and round', [
        w('en-GB', 'thought', 'thought', 'θɔːt'), w('fr', 'port', 'port', 'pɔʁ'), w('de', 'Sonne', 'sun', 'ˈzɔnə'), w('it', 'cosa', 'thing', 'ˈkɔːza'),
      ], hi('औ')),
    ],
  },
  {
    id: 'vowels-open', title: 'Open vowels',
    blurb: 'The mouth is wide open and the tongue low: the a sounds.',
    sounds: [
      S('æ', 'near-open front unrounded vowel', 'the a of "cat"', [
        w('en', 'cat', 'cat', 'kæt'), w('fi', 'äiti', 'mother', 'ˈæiti'), w('fa', 'دست', 'hand', 'dæst', 'dast'), w('sv', 'ära', 'honour', 'ˈæːra'),
      ]),
      S('ɐ', 'near-open central vowel', 'an open, relaxed a', [
        w('de', 'Vater', 'father', 'ˈfaːtɐ'), w('pt', 'casa', 'house', 'ˈkazɐ'), w('ru', 'молоко', 'milk', 'məlɐˈko', 'moloko'), w('zh-HK', '心', 'heart', 'sɐm', 'sam'),
      ]),
      S('a', 'open front unrounded vowel', 'aah: the mouth wide open', [
        w('es', 'casa', 'house', 'ˈkasa'), w('fr', 'patte', 'paw', 'pat'), w('it', 'pane', 'bread', 'ˈpaːne'), w('de', 'Mann', 'man', 'man'),
      ], hi('आ')),
      S('ɶ', 'open front rounded vowel', 'a wide-open a with rounded lips', [
        w('da', 'grøn', 'green', 'kʁɶn'), w('sv', 'öra', 'ear', 'ˈɶːra'),
      ], { note: 'The rarest vowel of the chart.' }),
      S('ɑ', 'open back unrounded vowel', 'the a of "father": open, the tongue back', [
        w('en-US', 'father', 'father', 'ˈfɑðɚ'), w('nl', 'bad', 'bath', 'bɑt'), w('fi', 'kala', 'fish', 'ˈkɑlɑ'),
      ]),
      S('ɒ', 'open back rounded vowel', 'the o of British "hot": open and a little round', [
        w('en-GB', 'hot', 'hot', 'hɒt'), w('hu', 'magyar', 'Hungarian', 'ˈmɒɟɒr'), w('fa', 'آب', 'water', 'ɒːb', 'āb'),
      ], by('hu', 'a')),
    ],
  },
  {
    id: 'non-pulmonic', title: 'Clicks, implosives and ejectives',
    blurb: 'Consonants made without a breath from the lungs: the mouth or the throat moves the air by itself. The pictures show where each is made.',
    sounds: [
      X('ʘ', 'bilabial click', 'a kiss: the lips smack apart', 'p', [
        w('nmn', 'ʘàa', 'child'), w('huc', 'ʘoa', 'two'),
      ]),
      X('ǀ', 'dental click', 'tsk: the tip sucked off the top teeth', 't', [
        w('zu', 'ucingo', 'wire, telephone'), w('xh', 'ukucela', 'to ask for'),
      ], 'English speakers make it as "tsk-tsk" (tut-tut), but not inside words.'),
      X('ǃ', '(post)alveolar click', 'a pop: the tip snaps down from the ridge', 't', [
        w('zu', 'iqanda', 'egg'), w('xh', 'iqaqa', 'polecat'),
      ]),
      X('ǂ', 'palatoalveolar click', 'the flat of the tongue snaps off the roof', 'c', [
        w('naq', 'ǂKhoesaob', 'July'), w('nmn', 'ǂnûm', 'two'),
      ]),
      X('ǁ', 'alveolar lateral click', 'a click at the side teeth', 'l', [
        w('zu', 'ixoxo', 'frog'), w('xh', 'isiXhosa', 'the Xhosa language'),
      ], 'It is the click some people make to tell a horse to go.'),
      X('ɓ', 'voiced bilabial implosive', 'a b with a little gulp', 'b', [
        w('vi', 'ba', 'three'), w('ha', 'ɓera', 'mouse'), w('sw', 'baba', 'father'),
      ]),
      X('ɗ', 'voiced dental/alveolar implosive', 'a d with a little gulp', 'd', [
        w('vi', 'đi', 'to go'), w('ha', 'ɗaya', 'one'), w('sw', 'dada', 'sister'),
      ]),
      X('ʄ', 'voiced palatal implosive', 'a gulped sound between d and g', 'ɟ', [
        w('sw', 'jana', 'yesterday'), w('sd', 'ڄڀ', 'tongue', undefined, 'jibh'),
      ]),
      X('ɠ', 'voiced velar implosive', 'a g with a little gulp', 'g', [
        w('sd', 'ڳرو', 'heavy', undefined, 'garo'), w('sw', 'gari', 'car'),
      ]),
      X('ʛ', 'voiced uvular implosive', 'a gulped g made at the very back', 'ɢ', [
        w('mam', 'qʼa', 'fire'),
      ], 'A very rare sound.'),
      X('pʼ', 'bilabial ejective', 'a sharp p popped with the breath held', 'p', [
        w('ka', 'პური', 'bread', undefined, 'puri'), w('am', 'ጴጥሮስ', 'Peter', undefined, 'Ṗeṭros'), w('qu', 'pʼacha', 'clothes'),
      ]),
      X('tʼ', 'dental/alveolar ejective', 'a sharp t popped with the breath held', 't', [
        w('ka', 'ტბა', 'lake', undefined, 'tba'), w('am', 'ጤና', 'health', undefined, 'ṭena'), w('qu', 'tʼanta', 'bread'),
      ]),
      X('kʼ', 'velar ejective', 'a sharp k popped with the breath held', 'k', [
        w('ka', 'კაცი', 'man', undefined, 'katsi'), w('ha', 'ƙasa', 'earth, country'), w('am', 'ቀን', 'day', undefined, 'qän'),
      ]),
      X('sʼ', 'alveolar ejective fricative', 'a short, sharp s squeezed out with the breath held', 's', [
        w('ha', 'tsuntsu', 'bird'), w('am', 'ፀሐይ', 'sun', undefined, 'ṣähay'), w('tli', 'sʼeek', 'black bear'),
      ]),
    ],
  },
];

/** Every sound of the chart, in its order. */
export const IPA_SOUNDS: IpaSound[] = IPA_SECTIONS.flatMap((s) => s.sounds);

const BY_SYMBOL = new Map(IPA_SOUNDS.map((s) => [s.symbol, s]));
/** The sound of a symbol of the chart (undefined if it is not one). */
export const ipaSound = (symbol: string): IpaSound | undefined => BY_SYMBOL.get(symbol);
/** The section a sound belongs to. */
export const ipaSection = (symbol: string): IpaSection | undefined => IPA_SECTIONS.find((s) => s.sounds.some((x) => x.symbol === symbol));

/** The sections of the consonants made with air from the lungs (the main table of the chart). */
export const IPA_PULMONIC = ['plosives', 'nasals', 'trills-taps', 'fricatives', 'lateral-fricatives', 'approximants', 'laterals'];
/** The sections of the vowels. */
export const IPA_VOWELS = ['vowels-close', 'vowels-mid', 'vowels-open'];

/** A mark written beside or on a symbol: how long, how strong, how high, or a change to the sound. */
export interface IpaMark { symbol: string; name: string; means: string; example: string }

export const IPA_MARKS: IpaMark[] = [
  { symbol: 'ː', name: 'long', means: 'Hold the sound about twice as long.', example: 'Hindi आम [aːm], mango; Italian tutto [ˈtutːo], everything' },
  { symbol: 'ˑ', name: 'half-long', means: 'Hold the sound a little longer.', example: 'English beat [biˑt], beside bead [biːd]' },
  { symbol: 'ˈ', name: 'primary stress', means: 'Say the part of the word after it louder and clearer.', example: 'English about [əˈbaʊt]' },
  { symbol: 'ˌ', name: 'secondary stress', means: 'Say the part after it a little stronger, but not the strongest.', example: 'English understand [ˌʌndɚˈstænd]' },
  { symbol: '.', name: 'syllable break', means: 'A new beat of the word starts here.', example: 'English react [ɹi.ˈækt]' },
  { symbol: '‿', name: 'linking', means: 'No break: the two words run together.', example: 'French les amis [lez‿ami], the friends' },
  { symbol: '|', name: 'minor break', means: 'A short pause, as at a comma.', example: 'yes | of course' },
  { symbol: '‖', name: 'major break', means: 'A longer pause, as at a full stop.', example: 'stop ‖ wait' },
  { symbol: 'ʰ', name: 'aspirated', means: 'A puff of air after the sound.', example: 'English pin [pʰɪn]; Hindi फल [pʰəl], fruit' },
  { symbol: 'ʱ', name: 'breathy-voiced release', means: 'The sound is let go into a breathy sigh of voice.', example: 'Hindi घर [gʱər], house' },
  { symbol: 'ʷ', name: 'labialized', means: 'Said with rounded lips.', example: 'English quick [kʷɪk]' },
  { symbol: 'ʲ', name: 'palatalized', means: 'Said with the middle of the tongue raised toward the roof, as if a y were hidden in it.', example: 'Russian мать [matʲ], mother' },
  { symbol: 'ˠ', name: 'velarized', means: 'Said with the back of the tongue raised: a dark sound.', example: 'English feel [fiːlˠ] (the dark l)' },
  { symbol: 'ˤ', name: 'pharyngealized', means: 'Said with the root of the tongue pulled back: a heavy sound.', example: 'Arabic صباح [sˤabaːħ], morning' },
  { symbol: 'ʼ', name: 'ejective', means: 'Popped out with the breath held in the throat.', example: 'Georgian კაცი [kʼatsi], man' },
  { symbol: '◌̃', name: 'nasalized', means: 'The air goes through the nose too.', example: 'French bon [bɔ̃], good; Hindi माँ [mãː], mother' },
  { symbol: '◌̥', name: 'voiceless', means: 'Said without the voice.', example: 'English play [pl̥eɪ]' },
  { symbol: '◌̬', name: 'voiced', means: 'Said with the voice.', example: 'American English butter, with a voiced t: [ˈbʌt̬ɚ]' },
  { symbol: '◌̤', name: 'breathy voiced', means: 'The voice with air leaking through it: a murmur.', example: 'Gujarati બહાર [ba̤ɾ], outside' },
  { symbol: '◌̰', name: 'creaky voiced', means: 'A low, creaking voice.', example: 'the creak at the end of a tired sentence' },
  { symbol: '◌̩', name: 'syllabic', means: 'A consonant that makes a beat of its own, with no vowel.', example: 'English button [ˈbʌtn̩]' },
  { symbol: '◌̯', name: 'non-syllabic', means: 'A vowel that glides and makes no beat of its own.', example: 'English boy [bɔɪ̯]' },
  { symbol: '◌̪', name: 'dental', means: 'The tongue touches the teeth themselves.', example: 'Spanish, Italian and Hindi t: [t̪]' },
  { symbol: '◌̚', name: 'no audible release', means: 'The mouth closes and does not pop open.', example: 'Korean 밥 [pap̚], cooked rice' },
  { symbol: '˞', name: 'rhotic', means: 'A vowel with the sound of r in it.', example: 'American English bird [bɝd], butter [ˈbʌɾɚ]' },
  { symbol: '◌̝', name: 'raised', means: 'The tongue a little higher than the symbol says.', example: 'Czech ř: [r̝]' },
  { symbol: '◌̞', name: 'lowered', means: 'The tongue a little lower than the symbol says.', example: 'Spanish e: [e̞]' },
  { symbol: '͡', name: 'tie bar', means: 'Two symbols said as one sound.', example: 'English chair [t͡ʃɛɹ]' },
  { symbol: '˥', name: 'extra high tone', means: 'The voice at its highest pitch.', example: 'Mandarin 妈 [ma˥], mother' },
  { symbol: '˧', name: 'mid tone', means: 'The voice at a middle pitch.', example: 'Cantonese 試 [siː˧], to try' },
  { symbol: '˩', name: 'extra low tone', means: 'The voice at its lowest pitch.', example: 'Thai, Vietnamese and Yoruba use low tones' },
  { symbol: '˧˥', name: 'rising tone', means: 'The pitch of the voice goes up, as in a question.', example: 'Mandarin 麻 [ma˧˥], hemp' },
  { symbol: '˥˩', name: 'falling tone', means: 'The pitch of the voice comes down, as in a firm "No!".', example: 'Mandarin 骂 [ma˥˩], to scold' },
  { symbol: '↗', name: 'global rise', means: 'The whole phrase goes up.', example: 'Really? ↗' },
  { symbol: '↘', name: 'global fall', means: 'The whole phrase comes down.', example: 'Really. ↘' },
];
