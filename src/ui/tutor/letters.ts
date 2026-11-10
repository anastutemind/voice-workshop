import type { TutorLang } from '../store';

/**
 * The alphabets the tutor teaches: Urdu, Arabic and Hindi, letter by letter
 * in their traditional order, and English as children learn to read it, by
 * its sounds (phonics): each with its name, its sound in the model and a
 * word a child knows. The words are written in the compact form of the
 * model's symbols (see compactPhones): ː for a long vowel, a tilde for a
 * nasal one, so that every example is said exactly as written.
 */
export interface Letter {
  /** the letter as written (a vowel mark sits on a dotted circle) */
  glyph: string;
  /** its name in its own script */
  name: string;
  /** its name in Latin letters (English: its sound, as phonics writes it, /b/) */
  roman: string;
  /** its sound: a symbol of the model, or ã for a nasal vowel */
  sound: string;
  /** a word that starts with it (or shows it); `pic`, a picture of it when its meaning has none */
  word: { text: string; roman: string; meaning: string; ipa: string; pic?: string };
  /** what the letter alone says (compact form); by default the consonant with the alphabet's vowel */
  say?: string;
  /** a word about the letter itself, when it is more than one sound */
  note?: string;
  /** what tells it from a letter written alike (the two th of English); by default the glyph */
  key?: string;
  /**
   * What a voice of the language reads (English: a voice reads a letter alone by its name, and some sounds
   * alone not at all). `sound`: the text that says the letter's sound; `from`: the sounds of that text when it
   * is a word the sound is taken out of ('it', ɪt, for the ɪ); `name`: the text that says its name ('' when
   * it has none, as a pair of letters).
   */
  read?: { sound?: string; from?: string; name?: string };
}

export interface Alphabet {
  name: string;
  /** the name of the language in its own script */
  native: string;
  dir: 'rtl' | 'ltr';
  /** the vowel a consonant is said with when it is taught alone */
  vowel: string;
  letters: Letter[];
}

const L = (glyph: string, name: string, roman: string, sound: string, text: string, wroman: string, meaning: string, ipa: string, extra: Partial<Letter> = {}): Letter =>
  ({ glyph, name, roman, sound, word: { text, roman: wroman, meaning, ipa }, ...extra });

/** an English letter: its glyph, name, sound as phonics writes it, model sound, and a word (its sounds, a few words of what it is, a picture) */
const E = (glyph: string, name: string, roman: string, sound: string, text: string, ipa: string, meaning: string, pic: string, extra: Partial<Letter> = {}): Letter =>
  ({ glyph, name, roman, sound, word: { text, roman: `/${ipa.replace(/ɫ/g, 'l').replace(/ɹ/g, 'r')}/`, meaning, ipa, pic }, ...extra });

/** a vowel mark shown on a dotted circle */
const mark = (m: string) => '◌' + m;

export const ALPHABETS: Record<TutorLang, Alphabet> = {
  ur: {
    name: 'Urdu', native: 'اردو', dir: 'rtl', vowel: 'a',
    letters: [
      L('ا', 'الف', 'alif', 'a', 'آم', 'ām', 'mango', 'aːm', { say: 'aː', note: 'The first letter: the open vowel a. With a wavy line on top (آ) it is long: ā.' }),
      L('ب', 'بے', 'be', 'b', 'بکری', 'bakrī', 'goat', 'bəkriː'),
      L('پ', 'پے', 'pe', 'p', 'پانی', 'pānī', 'water', 'paːniː'),
      L('ت', 'تے', 'te', 't', 'تارا', 'tārā', 'star', 'taːraː'),
      L('ٹ', 'ٹے', 'ṭe', 'ʈ', 'ٹماٹر', 'ṭamāṭar', 'tomato', 'ʈəmaːʈər'),
      L('ث', 'ثے', 'se', 's', 'ثمر', 'samar', 'fruit', 'səmər', { note: 'An Arabic letter; in Urdu it sounds like s.' }),
      L('ج', 'جیم', 'jīm', 'dʒ', 'جہاز', 'jahāz', 'ship', 'dʒəhaːz'),
      L('چ', 'چے', 'che', 'tʃ', 'چاند', 'chānd', 'moon', 'tʃaːnd'),
      L('ح', 'بڑی حے', 'baṛī he', 'h', 'حلوہ', 'halwā', 'sweet pudding', 'həlʋaː', { note: 'An Arabic letter; in Urdu it sounds like h.' }),
      L('خ', 'خے', 'khe', 'x', 'خرگوش', 'khargosh', 'rabbit', 'xərgoːʃ'),
      L('د', 'دال', 'dāl', 'd', 'دروازہ', 'darwāza', 'door', 'dərʋaːzaː'),
      L('ڈ', 'ڈال', 'ḍāl', 'ɖ', 'ڈاک', 'ḍāk', 'post, mail', 'ɖaːk'),
      L('ذ', 'ذال', 'zāl', 'z', 'ذائقہ', 'zāiqa', 'taste', 'zaːɪqaː', { note: 'An Arabic letter; in Urdu it sounds like z.' }),
      L('ر', 'رے', 're', 'r', 'رات', 'rāt', 'night', 'raːt'),
      L('ڑ', 'ڑے', 'ṛe', 'ɽ', 'پہاڑ', 'pahāṛ', 'mountain', 'pəhaːɽ'),
      L('ز', 'زے', 'ze', 'z', 'زمین', 'zamīn', 'earth, ground', 'zəmiːn'),
      L('ژ', 'ژے', 'zhe', 'ʒ', 'ژالہ', 'zhāla', 'hail', 'ʒaːlaː'),
      L('س', 'سین', 'sīn', 's', 'سیب', 'seb', 'apple', 'seːb'),
      L('ش', 'شین', 'shīn', 'ʃ', 'شیر', 'sher', 'lion', 'ʃeːr'),
      L('ص', 'صاد', 'swād', 's', 'صابن', 'sābun', 'soap', 'saːbʊn', { note: 'An Arabic letter; in Urdu it sounds like s.' }),
      L('ض', 'ضاد', 'zwād', 'z', 'ضرورت', 'zarūrat', 'need', 'zəruːrət', { note: 'An Arabic letter; in Urdu it sounds like z.' }),
      L('ط', 'طوے', 'toʾe', 't', 'طوطا', 'totā', 'parrot', 'toːtaː', { note: 'An Arabic letter; in Urdu it sounds like t.' }),
      L('ظ', 'ظوے', 'zoʾe', 'z', 'ظرف', 'zarf', 'vessel, dish', 'zərf', { note: 'An Arabic letter; in Urdu it sounds like z.' }),
      L('ع', 'عین', 'ʿain', 'ʔ', 'عینک', 'ainak', 'glasses', 'ɛːnək', { say: 'ʔa', note: 'In Urdu it is almost silent: a tiny catch in the throat, or the seat of a vowel.' }),
      L('غ', 'غین', 'ghain', 'ɣ', 'غبارہ', 'ghubāra', 'balloon', 'ɣʊbaːraː'),
      L('ف', 'فے', 'fe', 'f', 'فاختہ', 'fākhta', 'dove', 'faːxtaː'),
      L('ق', 'قاف', 'qāf', 'q', 'قلم', 'qalam', 'pen', 'qələm'),
      L('ک', 'کاف', 'kāf', 'k', 'کتاب', 'kitāb', 'book', 'kɪtaːb'),
      L('گ', 'گاف', 'gāf', 'g', 'گائے', 'gāy', 'cow', 'gaːeː'),
      L('ل', 'لام', 'lām', 'l', 'لڑکا', 'laṛkā', 'boy', 'ləɽkaː'),
      L('م', 'میم', 'mīm', 'm', 'مچھلی', 'machhlī', 'fish', 'mətʃʰliː'),
      L('ن', 'نون', 'nūn', 'n', 'ناک', 'nāk', 'nose', 'naːk'),
      L('ں', 'نون غنہ', 'nūn ghunna', 'ã', 'ماں', 'mā̃', 'mother', 'mãː', { say: 'ãː', note: 'A nūn without its dot, at the end of a word: the vowel before it goes through the nose.' }),
      L('و', 'واؤ', 'wāʾo', 'ʋ', 'والد', 'wālid', 'father', 'ʋaːlɪd', { note: 'Also the vowels o and ū: ٹوپی ṭopī, پھول phūl.' }),
      L('ہ', 'چھوٹی ہے', 'choṭī he', 'h', 'ہاتھی', 'hāthī', 'elephant', 'haːtʰiː'),
      L('ھ', 'دو چشمی ہے', 'do-chashmī he', 'h', 'پھول', 'phūl', 'flower', 'pʰuːl', { say: 'ha', note: 'Written after a letter it adds a puff of air to it: بھ پھ تھ… See the puffed letters at the end.' }),
      L('ء', 'ہمزہ', 'hamza', 'ʔ', 'کوئی', 'koī', 'someone', 'koːiː', { say: 'ʔa', note: 'A tiny catch between two vowels.' }),
      L('ی', 'چھوٹی یے', 'choṭī ye', 'j', 'یار', 'yār', 'friend', 'jaːr', { note: 'Also the vowel ī: پانی pānī.' }),
      L('ے', 'بڑی یے', 'baṛī ye', 'e', 'مزے', 'maze', 'fun', 'məzeː', { say: 'eː', note: 'The vowel e, at the end of a word.' }),
      // the aspirated letters, written with do-chashmī he
      L('بھ', 'بھے', 'bhe', 'bʱ', 'بھالو', 'bhālū', 'bear', 'bʱaːluː'),
      L('پھ', 'پھے', 'phe', 'pʰ', 'پھل', 'phal', 'fruit', 'pʰəl'),
      L('تھ', 'تھے', 'the', 'tʰ', 'تھالی', 'thālī', 'plate', 'tʰaːliː'),
      L('ٹھ', 'ٹھے', 'ṭhe', 'ʈʰ', 'ٹھنڈا', 'ṭhanḍā', 'cold', 'ʈʰəɳɖaː'),
      L('جھ', 'جھے', 'jhe', 'dʒʱ', 'جھنڈا', 'jhanḍā', 'flag', 'dʒʱəɳɖaː'),
      L('چھ', 'چھے', 'chhe', 'tʃʰ', 'چھتری', 'chhatrī', 'umbrella', 'tʃʰətriː'),
      L('دھ', 'دھال', 'dhāl', 'dʱ', 'دھوپ', 'dhūp', 'sunshine', 'dʱuːp'),
      L('ڈھ', 'ڈھال', 'ḍhāl', 'ɖʱ', 'ڈھول', 'ḍhol', 'drum', 'ɖʱoːl'),
      L('کھ', 'کھے', 'khe', 'kʰ', 'کھانا', 'khānā', 'food', 'kʰaːnaː'),
      L('گھ', 'گھے', 'ghe', 'gʱ', 'گھر', 'ghar', 'house', 'gʱər'),
      L('ڑھ', 'ڑھے', 'ṛhe', 'ɽʱ', 'پڑھنا', 'paṛhnā', 'to read', 'pəɽʱnaː'),
      // the vowel marks
      L(mark('َ'), 'زبر', 'zabar', 'ə', 'بَس', 'bas', 'enough', 'bəs', { say: 'ə', note: 'A small stroke above: the short vowel a.' }),
      L(mark('ِ'), 'زیر', 'zer', 'ɪ', 'دِل', 'dil', 'heart', 'dɪl', { say: 'ɪ', note: 'A small stroke below: the short vowel i.' }),
      L(mark('ُ'), 'پیش', 'pesh', 'ʊ', 'گُل', 'gul', 'flower', 'gʊl', { say: 'ʊ', note: 'A small hook above: the short vowel u.' }),
    ],
  },
  ar: {
    name: 'Arabic', native: 'العربية', dir: 'rtl', vowel: 'a',
    letters: [
      L('ا', 'ألف', 'alif', 'a', 'باب', 'bāb', 'door', 'baːb', { say: 'aː', note: 'The long vowel ā, and the seat of a vowel at the start of a word.' }),
      L('ب', 'باء', 'bāʾ', 'b', 'بَيْت', 'bayt', 'house', 'bajt'),
      L('ت', 'تاء', 'tāʾ', 't', 'تُفّاح', 'tuffāḥ', 'apple', 'tufːaːħ'),
      L('ث', 'ثاء', 'thāʾ', 'θ', 'ثَعْلَب', 'thaʿlab', 'fox', 'θaʕlab'),
      L('ج', 'جيم', 'jīm', 'dʒ', 'جَمَل', 'jamal', 'camel', 'dʒamal'),
      L('ح', 'حاء', 'ḥāʾ', 'ħ', 'حِصان', 'ḥiṣān', 'horse', 'ħisˤaːn'),
      L('خ', 'خاء', 'khāʾ', 'x', 'خُبْز', 'khubz', 'bread', 'xubz'),
      L('د', 'دال', 'dāl', 'd', 'دُبّ', 'dubb', 'bear', 'dubː'),
      L('ذ', 'ذال', 'dhāl', 'ð', 'ذِئْب', 'dhiʾb', 'wolf', 'ðiʔb'),
      L('ر', 'راء', 'rāʾ', 'r', 'رُمّان', 'rummān', 'pomegranate', 'rumːaːn'),
      L('ز', 'زاي', 'zāy', 'z', 'زَهْرَة', 'zahra', 'flower', 'zahra'),
      L('س', 'سين', 'sīn', 's', 'سَمَك', 'samak', 'fish', 'samak'),
      L('ش', 'شين', 'shīn', 'ʃ', 'شَمْس', 'shams', 'sun', 'ʃams'),
      L('ص', 'صاد', 'ṣād', 'sˤ', 'صَقْر', 'ṣaqr', 'falcon', 'sˤaqr'),
      L('ض', 'ضاد', 'ḍād', 'dˤ', 'ضِفْدَع', 'ḍifdaʿ', 'frog', 'dˤifdaʕ'),
      L('ط', 'طاء', 'ṭāʾ', 'tˤ', 'طائِر', 'ṭāʾir', 'bird', 'tˤaːʔir'),
      L('ظ', 'ظاء', 'ẓāʾ', 'ðˤ', 'ظَرْف', 'ẓarf', 'envelope', 'ðˤarf'),
      L('ع', 'عين', 'ʿayn', 'ʕ', 'عَيْن', 'ʿayn', 'eye', 'ʕajn'),
      L('غ', 'غين', 'ghayn', 'ɣ', 'غَزال', 'ghazāl', 'gazelle', 'ɣazaːl'),
      L('ف', 'فاء', 'fāʾ', 'f', 'فيل', 'fīl', 'elephant', 'fiːl'),
      L('ق', 'قاف', 'qāf', 'q', 'قَمَر', 'qamar', 'moon', 'qamar'),
      L('ك', 'كاف', 'kāf', 'k', 'كِتاب', 'kitāb', 'book', 'kitaːb'),
      L('ل', 'لام', 'lām', 'l', 'لَيْمون', 'laymūn', 'lemon', 'lajmuːn'),
      L('م', 'ميم', 'mīm', 'm', 'ماء', 'māʾ', 'water', 'maːʔ'),
      L('ن', 'نون', 'nūn', 'n', 'نَحْلَة', 'naḥla', 'bee', 'naħla'),
      L('ه', 'هاء', 'hāʾ', 'h', 'هِلال', 'hilāl', 'crescent moon', 'hilaːl'),
      L('و', 'واو', 'wāw', 'w', 'وَرْدَة', 'warda', 'rose', 'warda', { note: 'Also the long vowel ū: نور nūr.' }),
      L('ي', 'ياء', 'yāʾ', 'j', 'يَد', 'yad', 'hand', 'jad', { note: 'Also the long vowel ī: فيل fīl.' }),
      L('ء', 'همزة', 'hamza', 'ʔ', 'سَماء', 'samāʾ', 'sky', 'samaːʔ', { say: 'ʔa', note: 'A tiny catch in the throat, like the middle of "uh-oh".' }),
      // the vowel marks
      L(mark('َ'), 'فتحة', 'fatḥa', 'a', 'قَلَم', 'qalam', 'pen', 'qalam', { say: 'a', note: 'A small stroke above: the short vowel a.' }),
      L(mark('ِ'), 'كسرة', 'kasra', 'i', 'بِنْت', 'bint', 'girl', 'bint', { say: 'i', note: 'A small stroke below: the short vowel i.' }),
      L(mark('ُ'), 'ضمة', 'ḍamma', 'u', 'كُرَة', 'kura', 'ball', 'kura', { say: 'u', note: 'A small hook above: the short vowel u.' }),
      L(mark('ّ'), 'شدّة', 'shadda', 'm', 'أُمّ', 'umm', 'mother', 'ʔumː', { say: 'ʔumː', note: 'A little w above a letter: say the letter twice as long.' }),
    ],
  },
  hi: {
    name: 'Hindi', native: 'हिन्दी', dir: 'ltr', vowel: 'ə',
    letters: [
      // स्वर, the vowels
      L('अ', 'अ', 'a', 'ə', 'अनार', 'anār', 'pomegranate', 'ənaːr', { say: 'ə' }),
      L('आ', 'आ', 'ā', 'a', 'आम', 'ām', 'mango', 'aːm', { say: 'aː' }),
      L('इ', 'इ', 'i', 'ɪ', 'इमली', 'imlī', 'tamarind', 'ɪmliː', { say: 'ɪ' }),
      L('ई', 'ई', 'ī', 'i', 'ईख', 'īkh', 'sugar cane', 'iːkʰ', { say: 'iː' }),
      L('उ', 'उ', 'u', 'ʊ', 'उल्लू', 'ullū', 'owl', 'ʊlːuː', { say: 'ʊ' }),
      L('ऊ', 'ऊ', 'ū', 'u', 'ऊन', 'ūn', 'wool', 'uːn', { say: 'uː' }),
      L('ऋ', 'ऋ', 'ri', 'r', 'ऋषि', 'rishi', 'sage', 'rɪʂɪ', { say: 'rɪ', note: 'An old vowel, said today as "ri".' }),
      L('ए', 'ए', 'e', 'e', 'एक', 'ek', 'one', 'eːk', { say: 'eː' }),
      L('ऐ', 'ऐ', 'ai', 'ɛ', 'ऐनक', 'ainak', 'glasses', 'ɛːnək', { say: 'ɛː' }),
      L('ओ', 'ओ', 'o', 'o', 'ओखली', 'okhlī', 'mortar', 'oːkʰliː', { say: 'oː' }),
      L('औ', 'औ', 'au', 'ɔ', 'औरत', 'aurat', 'woman', 'ɔːrət', { say: 'ɔː' }),
      L('अं', 'अं', 'aṁ', 'ã', 'अंगूर', 'angūr', 'grapes', 'əŋguːr', { say: 'ə̃', note: 'The dot above (anusvāra): the vowel goes through the nose, or a nasal sound comes before the next letter.' }),
      L('अः', 'अः', 'aḥ', 'h', 'नमः', 'namaḥ', 'greetings', 'nəməh', { say: 'əh', note: 'The two dots (visarga): a soft breath after the vowel.' }),
      // व्यंजन, the consonants
      L('क', 'क', 'ka', 'k', 'कमल', 'kamal', 'lotus', 'kəməl'),
      L('ख', 'ख', 'kha', 'kʰ', 'खरगोश', 'khargosh', 'rabbit', 'kʰərgoːʃ'),
      L('ग', 'ग', 'ga', 'g', 'गमला', 'gamlā', 'flower pot', 'gəmlaː'),
      L('घ', 'घ', 'gha', 'gʱ', 'घर', 'ghar', 'house', 'gʱər'),
      L('ङ', 'ङ', 'ṅa', 'ŋ', 'रंग', 'rang', 'colour', 'rəŋg'),
      L('च', 'च', 'cha', 'tʃ', 'चम्मच', 'chammach', 'spoon', 'tʃəmːətʃ'),
      L('छ', 'छ', 'chha', 'tʃʰ', 'छतरी', 'chhatrī', 'umbrella', 'tʃʰətriː'),
      L('ज', 'ज', 'ja', 'dʒ', 'जहाज़', 'jahāz', 'ship', 'dʒəhaːz'),
      L('झ', 'झ', 'jha', 'dʒʱ', 'झंडा', 'jhaṇḍā', 'flag', 'dʒʱəɳɖaː'),
      L('ञ', 'ञ', 'ña', 'ɲ', 'पंजा', 'panjā', 'paw', 'pəɲdʒaː'),
      L('ट', 'ट', 'ṭa', 'ʈ', 'टमाटर', 'ṭamāṭar', 'tomato', 'ʈəmaːʈər'),
      L('ठ', 'ठ', 'ṭha', 'ʈʰ', 'ठंडा', 'ṭhaṇḍā', 'cold', 'ʈʰəɳɖaː'),
      L('ड', 'ड', 'ḍa', 'ɖ', 'डमरू', 'ḍamrū', 'little drum', 'ɖəmruː'),
      L('ढ', 'ढ', 'ḍha', 'ɖʱ', 'ढक्कन', 'ḍhakkan', 'lid', 'ɖʱəkːən'),
      L('ण', 'ण', 'ṇa', 'ɳ', 'बाण', 'bāṇ', 'arrow', 'baːɳ'),
      L('त', 'त', 'ta', 't', 'तरबूज़', 'tarbūz', 'watermelon', 'tərbuːz'),
      L('थ', 'थ', 'tha', 'tʰ', 'थाली', 'thālī', 'plate', 'tʰaːliː'),
      L('द', 'द', 'da', 'd', 'दवात', 'dawāt', 'inkpot', 'dəʋaːt'),
      L('ध', 'ध', 'dha', 'dʱ', 'धनुष', 'dhanush', 'bow', 'dʱənʊʂ'),
      L('न', 'न', 'na', 'n', 'नल', 'nal', 'tap', 'nəl'),
      L('प', 'प', 'pa', 'p', 'पतंग', 'patang', 'kite', 'pətəŋg'),
      L('फ', 'फ', 'pha', 'pʰ', 'फल', 'phal', 'fruit', 'pʰəl'),
      L('ब', 'ब', 'ba', 'b', 'बकरी', 'bakrī', 'goat', 'bəkriː'),
      L('भ', 'भ', 'bha', 'bʱ', 'भालू', 'bhālū', 'bear', 'bʱaːluː'),
      L('म', 'म', 'ma', 'm', 'मछली', 'machhlī', 'fish', 'mətʃʰliː'),
      L('य', 'य', 'ya', 'j', 'योग', 'yog', 'yoga', 'joːg'),
      L('र', 'र', 'ra', 'r', 'रथ', 'rath', 'chariot', 'rətʰ'),
      L('ल', 'ल', 'la', 'l', 'लड्डू', 'laḍḍū', 'sweet ball', 'ləɖːuː'),
      L('व', 'व', 'va', 'ʋ', 'वन', 'van', 'forest', 'ʋən'),
      L('श', 'श', 'sha', 'ʃ', 'शेर', 'sher', 'lion', 'ʃeːr'),
      L('ष', 'ष', 'ṣa', 'ʂ', 'भाषा', 'bhāṣā', 'language', 'bʱaːʂaː'),
      L('स', 'स', 'sa', 's', 'सेब', 'seb', 'apple', 'seːb'),
      L('ह', 'ह', 'ha', 'h', 'हाथी', 'hāthī', 'elephant', 'haːtʰiː'),
      // the letters with a nukta, for the sounds of Persian and Arabic words
      L('क़', 'क़', 'qa', 'q', 'क़लम', 'qalam', 'pen', 'qələm', { note: 'A dot below क: the k from deep in the throat.' }),
      L('ख़', 'ख़', 'ḳha', 'x', 'ख़ुश', 'ḳhush', 'happy', 'xʊʃ', { note: 'A dot below ख: the scraping kh.' }),
      L('ग़', 'ग़', 'ġa', 'ɣ', 'ग़ुब्बारा', 'ġubbārā', 'balloon', 'ɣʊbːaːraː', { note: 'A dot below ग: the soft gargled g.' }),
      L('ज़', 'ज़', 'za', 'z', 'ज़मीन', 'zamīn', 'earth, ground', 'zəmiːn', { note: 'A dot below ज: the buzzing z.' }),
      L('ड़', 'ड़', 'ṛa', 'ɽ', 'पहाड़', 'pahāṛ', 'mountain', 'pəhaːɽ', { note: 'A dot below ड: the curled flick.' }),
      L('ढ़', 'ढ़', 'ṛha', 'ɽʱ', 'पढ़ना', 'paṛhnā', 'to read', 'pəɽʱnaː', { note: 'A dot below ढ: the curled flick with a breathy sigh.' }),
      L('फ़', 'फ़', 'fa', 'f', 'फ़ोन', 'fon', 'phone', 'foːn', { note: 'A dot below फ: the f of the top teeth on the lip.' }),
    ],
  },
  // English as a child learns to read it (phonics, American): each letter's common sound, then the pairs of
  // letters that make one sound, the long vowels and the other vowel sounds. A stop is said with a short
  // "uh" (it cannot be heard alone); a sound that can be held (m, n, ng, s, sh) is held. The teacher's voice
  // reads some sounds only inside a word: the sound is taken out of it ("it" for the i, "but" for the b).
  en: {
    name: 'English', native: 'English', dir: 'ltr', vowel: 'ʌ',
    letters: [
      E('Aa', 'ay', '/a/', 'æ', 'apple', 'ˈæpəɫ', 'a red fruit', '🍎', { say: 'æ', read: { sound: 'at', from: 'æt', name: 'A' }, note: 'A also says its name, ay, in “cake”: see the long vowels.' }),
      E('Bb', 'bee', '/b/', 'b', 'ball', 'bɔɫ', 'a round toy', '⚽', { read: { sound: 'but', from: 'bʌt', name: 'B' } }),
      E('Cc', 'see', '/k/', 'k', 'cat', 'kæt', 'a pet that purrs', '🐱', { read: { sound: 'cut', from: 'kʌt', name: 'C' }, note: 'Before e, i and y, c says s: “city”, “face”.' }),
      E('Dd', 'dee', '/d/', 'd', 'dog', 'dɔg', 'a pet that barks', '🐶', { read: { sound: 'duh', name: 'D' } }),
      E('Ee', 'ee', '/e/', 'ɛ', 'egg', 'ɛg', 'a hen lays it', '🥚', { say: 'ɛ', read: { sound: 'eh', name: 'E' } }),
      E('Ff', 'ef', '/f/', 'f', 'fish', 'fɪʃ', 'it swims', '🐟', { read: { sound: 'fuh', name: 'F' } }),
      E('Gg', 'jee', '/g/', 'g', 'goat', 'goʊt', 'a farm animal', '🐐', { read: { sound: 'guh', name: 'G' }, note: 'Before e, i and y, g often says j: “giant”, “gem”.' }),
      E('Hh', 'aitch', '/h/', 'h', 'hat', 'hæt', 'you wear it', '🎩', { read: { sound: 'huh', name: 'H' } }),
      E('Ii', 'eye', '/i/', 'ɪ', 'igloo', 'ˈɪglu', 'a house of snow', '🛖', { say: 'ɪ', read: { sound: 'it', from: 'ɪt', name: 'I' }, note: 'I also says its name, eye, in “bike”: see the long vowels.' }),
      E('Jj', 'jay', '/j/', 'dʒ', 'jam', 'dʒæm', 'sweet fruit to spread', '🍓', { read: { sound: 'juh', name: 'J' } }),
      E('Kk', 'kay', '/k/', 'k', 'kite', 'kaɪt', 'it flies on a string', '🪁', { read: { sound: 'cut', from: 'kʌt', name: 'K' }, note: 'The same sound as c in “cat”.' }),
      E('Ll', 'el', '/l/', 'l', 'lion', 'ˈlaɪən', 'a big cat', '🦁', { read: { sound: 'luh', name: 'L' } }),
      E('Mm', 'em', '/m/', 'm', 'moon', 'mun', 'it shines at night', '🌙', { say: 'mː', read: { sound: 'hmm', from: 'hm', name: 'M' } }),
      E('Nn', 'en', '/n/', 'n', 'nest', 'nɛst', 'a bird’s home', '🪺', { say: 'nː', read: { sound: 'in', from: 'ɪn', name: 'N' } }),
      E('Oo', 'oh', '/o/', 'ɑ', 'octopus', 'ˈɑktəpəs', 'eight arms in the sea', '🐙', { say: 'ɑ', read: { sound: 'ah', name: 'O' }, note: 'O also says its name, oh, in “bone”: see the long vowels.' }),
      E('Pp', 'pee', '/p/', 'p', 'pig', 'pɪg', 'a pink farm animal', '🐷', { read: { sound: 'puh', name: 'P' } }),
      E('Qq', 'cue', '/kw/', 'k', 'queen', 'kwin', 'she wears a crown', '👸', { say: 'kwʌ', read: { sound: 'kwuh', name: 'Q' }, note: 'Q nearly always comes with u: qu says kw.' }),
      E('Rr', 'ar', '/r/', 'ɹ', 'rabbit', 'ˈɹæbɪt', 'long ears, a fluffy tail', '🐇', { read: { sound: 'run', from: 'ɹʌn', name: 'R' } }),
      E('Ss', 'ess', '/s/', 's', 'sun', 'sʌn', 'it shines in the day', '☀️', { say: 'sː', read: { sound: 'bus', from: 'bʌs', name: 'S' } }),
      E('Tt', 'tee', '/t/', 't', 'tiger', 'ˈtaɪgɚ', 'a striped big cat', '🐯', { read: { sound: 'tuh', name: 'T' } }),
      E('Uu', 'you', '/u/', 'ʌ', 'umbrella', 'ʌmˈbɹɛlə', 'it keeps the rain off', '☂️', { say: 'ʌ', read: { sound: 'uh', name: 'U' }, note: 'U also says its name, you, in “cube”: see the long vowels.' }),
      E('Vv', 'vee', '/v/', 'v', 'van', 'væn', 'a car for many', '🚐', { read: { sound: 'vuh', name: 'V' } }),
      E('Ww', 'double-you', '/w/', 'w', 'web', 'wɛb', 'a spider makes it', '🕸️', { read: { sound: 'was', from: 'wʌz', name: 'W' } }),
      E('Xx', 'ex', '/ks/', 'k', 'fox', 'fɑks', 'a red, bushy tail', '🦊', { say: 'ks', read: { sound: 'box', from: 'bɑks', name: 'X' }, note: 'X says two sounds, k and s, at the end of a word.' }),
      E('Yy', 'why', '/y/', 'j', 'yo-yo', 'ˈjoʊjoʊ', 'a toy on a string', '🪀', { read: { sound: 'yuh', name: 'Y' }, note: 'At the end of a word y is a vowel: “happy”, “my”.' }),
      E('Zz', 'zee', '/z/', 'z', 'zebra', 'ˈzibɹə', 'a striped horse', '🦓', { read: { sound: 'zuh', name: 'Z' } }),
      // two letters, one sound
      E('sh', 's + h', '/sh/', 'ʃ', 'ship', 'ʃɪp', 'it sails the sea', '🚢', { say: 'ʃː', read: { sound: 'shh', name: '' } }),
      E('ch', 'c + h', '/ch/', 'tʃ', 'cheese', 'tʃiz', 'mice love it', '🧀', { read: { sound: 'chuh', name: '' } }),
      E('th', 'quiet th', '/th/', 'θ', 'thumb', 'θʌm', 'the short, fat finger', '👍', { key: 'th-quiet', read: { sound: 'thud', from: 'θʌd', name: '' }, note: 'The tip of the tongue between the teeth, and only air.' }),
      E('th', 'buzzing th', '/th/', 'ð', 'feather', 'ˈfɛðɚ', 'a bird has many', '🪶', { key: 'th-buzz', say: 'ðə', read: { sound: 'the', name: '' }, note: 'The same tongue as in “thumb”, with the voice on: it buzzes.' }),
      E('ng', 'n + g', '/ng/', 'ŋ', 'king', 'kɪŋ', 'he wears a crown', '🤴', { say: 'ŋː', read: { sound: 'sing', from: 'sɪŋ', name: '' }, note: 'Only at the end of a part of a word: “sing”, “ring”.' }),
      E('ph', 'p + h', '/f/', 'f', 'phone', 'foʊn', 'you call with it', '📱', { read: { sound: 'fuh', name: '' }, note: 'Ph says f.' }),
      E('wh', 'w + h', '/w/', 'w', 'whale', 'weɪɫ', 'the biggest animal of the sea', '🐳', { read: { sound: 'was', from: 'wʌz', name: '' }, note: 'Wh says w.' }),
      // the long vowels: a vowel says its name (a magic e at the end, or two vowels together)
      E('a_e', 'long a', '/ā/', 'eɪ', 'cake', 'keɪk', 'for a birthday', '🎂', { say: 'eɪ', read: { sound: 'a', name: '' }, note: 'The magic e at the end is not said: it makes the a say its name.' }),
      E('ee', 'long e', '/ē/', 'i', 'tree', 'tɹi', 'it has leaves', '🌳', { say: 'i', read: { sound: 'ee', name: '' }, note: 'Also ea, as in “sea”, and e_e, as in “these”.' }),
      E('i_e', 'long i', '/ī/', 'aɪ', 'bike', 'baɪk', 'two wheels and pedals', '🚲', { say: 'aɪ', read: { sound: 'eye', name: '' }, note: 'The magic e makes the i say its name. Also igh, as in “night”.' }),
      E('o_e', 'long o', '/ō/', 'oʊ', 'bone', 'boʊn', 'a dog chews it', '🦴', { say: 'oʊ', read: { sound: 'oh', name: '' }, note: 'The magic e makes the o say its name. Also oa, as in “boat”.' }),
      E('u_e', 'long u', '/ū/', 'u', 'cube', 'kjub', 'a box shape', '🧊', { say: 'ju', read: { sound: 'you', name: '' }, note: 'The magic e makes the u say its name.' }),
      // more vowel sounds
      E('oo', 'double o', '/oo/', 'u', 'spoon', 'spun', 'you eat soup with it', '🥄', { say: 'u', read: { sound: 'ooh', name: '' } }),
      E('ar', 'a + r', '/ar/', 'ɹ', 'car', 'kɑɹ', 'it drives on the road', '🚗', { say: 'ɑɹ', read: { sound: 'are', name: '' }, note: 'The r changes the vowel before it.' }),
      E('er', 'e + r', '/er/', 'ɝ', 'mermaid', 'ˈmɝmeɪd', 'half girl, half fish', '🧜‍♀️', { say: 'ɝ', read: { sound: 'er', name: '' }, note: 'Also ir and ur: “bird”, “fur”.' }),
      E('ow', 'o + w', '/ow/', 'aʊ', 'cow', 'kaʊ', 'it gives milk', '🐄', { say: 'aʊ', read: { sound: 'ow', name: '' }, note: 'Also ou, as in “house”.' }),
      E('oy', 'o + y', '/oy/', 'ɔɪ', 'boy', 'bɔɪ', 'a young man', '👦', { say: 'ɔɪ', read: { sound: 'oy', name: '' }, note: 'Also oi, as in “coin”.' }),
      E('ə', 'schwa', '/uh/', 'ə', 'banana', 'bəˈnænə', 'a long yellow fruit', '🍌', { say: 'ə', read: { sound: 'uh', name: '' }, note: 'The lazy vowel: any vowel that is not stressed can sound like it, as the first and last a of “banana”.' }),
    ],
  },
};

export const TUTOR_LANGS: TutorLang[] = ['ur', 'ar', 'hi', 'en'];
