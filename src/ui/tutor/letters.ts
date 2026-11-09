import type { TutorLang } from '../store';

/**
 * The alphabets the tutor teaches: Urdu, Arabic and Hindi, letter by letter
 * in their traditional order, each with its name, its sound in the model
 * and a word a child knows. The words are written in the compact form of
 * the model's symbols (see compactPhones): ː for a long vowel, a tilde for
 * a nasal one, so that every example is said exactly as written.
 */
export interface Letter {
  /** the letter as written (a vowel mark sits on a dotted circle) */
  glyph: string;
  /** its name in its own script */
  name: string;
  /** its name in Latin letters */
  roman: string;
  /** its sound: a symbol of the model, or ã for a nasal vowel */
  sound: string;
  /** a word that starts with it (or shows it) */
  word: { text: string; roman: string; meaning: string; ipa: string };
  /** what the letter alone says (compact form); by default the consonant with the alphabet's vowel */
  say?: string;
  /** a word about the letter itself, when it is more than one sound */
  note?: string;
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
};

export const TUTOR_LANGS: TutorLang[] = ['ur', 'ar', 'hi'];
