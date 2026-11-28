// AUTH-11: a Bangla shop name written in English letters, so the suggested shop link has something to start from.
// The owner, 2026-11-28: a Bangla name left the link empty, and new sellers typed their email or a Facebook address
// there, or gave up. Shop words borrowed from English read as their English spelling (শপ shop, ফ্যাশন fashion); every
// other word is written by its sound (বোরকা borka, হাতের তৈরি hater toiri, কন্যা konya).

// র‍্য typed with the joiner (র‍্যাব) is র with য-ফলা, not র্য: the joiner is kept as this one sign.
const YA_PHALA = '';
const HASANTA = '্';
const DIGITS = '০১২৩৪৫৬৭৮৯';

const CONSONANTS: Readonly<Record<string, string>> = {
  ক: 'k',
  খ: 'kh',
  গ: 'g',
  ঘ: 'gh',
  ঙ: 'ng',
  চ: 'ch',
  ছ: 'chh',
  জ: 'j',
  ঝ: 'jh',
  ঞ: 'n',
  ট: 't',
  ঠ: 'th',
  ড: 'd',
  ঢ: 'dh',
  ণ: 'n',
  ত: 't',
  থ: 'th',
  দ: 'd',
  ধ: 'dh',
  ন: 'n',
  প: 'p',
  ফ: 'f',
  ব: 'b',
  ভ: 'bh',
  ম: 'm',
  য: 'j',
  র: 'r',
  ল: 'l',
  শ: 'sh',
  ষ: 'sh',
  স: 's',
  হ: 'h',
  ড়: 'r',
  ঢ়: 'rh',
  য়: 'y',
  ৎ: 't',
  [YA_PHALA]: 'y',
};
const VOWELS: Readonly<Record<string, string>> = {
  অ: 'o',
  আ: 'a',
  ই: 'i',
  ঈ: 'i',
  উ: 'u',
  ঊ: 'u',
  ঋ: 'ri',
  এ: 'e',
  ঐ: 'oi',
  ও: 'o',
  ঔ: 'ou',
};
const SIGNS: Readonly<Record<string, string>> = {
  'া': 'a',
  'ি': 'i',
  'ী': 'i',
  'ু': 'u',
  'ূ': 'u',
  'ৃ': 'ri',
  'ে': 'e',
  'ৈ': 'oi',
  'ো': 'o',
  'ৌ': 'ou',
};
const MARKS: Readonly<Record<string, string>> = { 'ং': 'ng', 'ঃ': 'h', 'ঁ': '' };

/** Shop words borrowed from English, read as their English spelling. */
const WORDS: Readonly<Record<string, string>> = {
  শপ: 'shop',
  শপস: 'shops',
  শপিং: 'shopping',
  স্টোর: 'store',
  ষ্টোর: 'store',
  স্টোরস: 'stores',
  ফ্যাশন: 'fashion',
  ফ্যাশনস: 'fashions',
  কালেকশন: 'collection',
  কালেকশনস: 'collections',
  হাউস: 'house',
  হাউজ: 'house',
  গ্যালারি: 'gallery',
  গ্যালারী: 'gallery',
  অনলাইন: 'online',
  বাজার: 'bazar',
  মার্কেট: 'market',
  থ্রি: 'three',
  পিস: 'piece',
  থ্রিপিস: 'threepiece',
  টুপিস: 'twopiece',
  বোরকা: 'borka',
  বোরখা: 'borkha',
  শাড়ি: 'saree',
  শাড়ী: 'saree',
  কসমেটিক: 'cosmetic',
  কসমেটিকস: 'cosmetics',
  কসমেটিক্স: 'cosmetics',
  ফ্রেন্ড: 'friend',
  ফ্রেন্ডস: 'friends',
  ফ্লাওয়ার: 'flower',
  প্যাশন: 'passion',
  গ্যাজেট: 'gadget',
  গ্যাজেটস: 'gadgets',
  ডিজিটাল: 'digital',
  মার্ট: 'mart',
  সুপার: 'super',
  শো: 'show',
  রুম: 'room',
  ওয়ার্ল্ড: 'world',
  বিডি: 'bd',
  বাংলা: 'bangla',
  বাংলাদেশ: 'bangladesh',
  ঢাকা: 'dhaka',
  ক্লথিং: 'clothing',
  ড্রেস: 'dress',
  লেডিস: 'ladies',
  জেন্টস: 'gents',
  কিডস: 'kids',
  বেবি: 'baby',
  হোম: 'home',
  ডেকোর: 'decor',
  ফুড: 'food',
  ফুডস: 'foods',
  কেক: 'cake',
  বেকারি: 'bakery',
  ইলেকট্রনিক্স: 'electronics',
  মোবাইল: 'mobile',
  জুয়েলারি: 'jewellery',
  জুয়েলারী: 'jewellery',
  ব্যাগ: 'bag',
  শুজ: 'shoes',
  গিফট: 'gift',
  হ্যান্ডমেড: 'handmade',
  কর্নার: 'corner',
  পয়েন্ট: 'point',
  সেন্টার: 'center',
  ট্রেডার্স: 'traders',
  এন্টারপ্রাইজ: 'enterprise',
  লাইফস্টাইল: 'lifestyle',
  স্টাইল: 'style',
  বিউটি: 'beauty',
  কেয়ার: 'care',
  হারবাল: 'herbal',
  অর্গানিক: 'organic',
  ফ্রেশ: 'fresh',
  ভ্যারাইটিজ: 'varieties',
  ভ্যারাইটি: 'variety',
  টপ: 'top',
  বেস্ট: 'best',
  নিউ: 'new',
  স্মার্ট: 'smart',
  এক্সেসরিজ: 'accessories',
  অ্যাক্সেসরিজ: 'accessories',
  টেইলার্স: 'tailors',
  পাঞ্জাবি: 'panjabi',
  লন: 'lawn',
  কুর্তি: 'kurti',
  হিজাব: 'hijab',
  আবায়া: 'abaya',
  গাউন: 'gown',
  প্রোডাক্ট: 'product',
  প্রোডাক্টস: 'products',
  কমার্স: 'commerce',
  গ্রোসারি: 'grocery',
  ক্রাফট: 'craft',
  ক্রাফটস: 'crafts',
  বুক: 'book',
  বুকস: 'books',
  ওয়াচ: 'watch',
  অ্যান্ড: 'and',
  এন্ড: 'and',
  সন্স: 'sons',
  অল: 'all',
  বিজনেস: 'business',
  এক্সপ্রেস: 'express',
  হাব: 'hub',
  জোন: 'zone',
  প্লাস: 'plus',
  মিনি: 'mini',
  কালার: 'color',
  ড্রিম: 'dream',
  কুইন: 'queen',
  প্রিন্সেস: 'princess',
  রয়্যাল: 'royal',
  স্টার: 'star',
  বুটিক: 'boutique',
};

/** One spelling for the same letters: ড় ঢ় য় typed as a letter and its dot become the one letter. */
function prep(text: string): string {
  return text
    .normalize('NFC')
    .replace(/ড়/g, 'ড়')
    .replace(/ঢ়/g, 'ঢ়')
    .replace(/য়/g, 'য়')
    .replace(/র‍্য/g, `র্${YA_PHALA}`)
    .replace(/[‌‍]/g, '');
}

const DICTIONARY = new Map(
  Object.entries(WORDS).map(([bangla, english]) => [prep(bangla), english]),
);

/** A letter group (with any joined letters), a vowel or a digit, and how it is said. */
interface Sound {
  kind: 'letter' | 'other';
  rom: string;
  joined: boolean;
  // The vowel sign's sound; '' when the hasanta says none; null for the hidden "o" to be decided.
  vowel: string | null;
  mark: string;
  tail: string;
}

function has(table: Readonly<Record<string, string>>, c: string | undefined): boolean {
  return c !== undefined && c in table;
}

function sayOf(table: Readonly<Record<string, string>>, c: string | undefined): string {
  return c === undefined ? '' : (table[c] ?? '');
}

/** A letter said twice, as ্য after a word's first letter makes it (ব্য bb, ভ্য bbh); never three times (ক্ষ্য kkh). */
function doubled(rom: string): string {
  const pair = /(bh|ch|dh|gh|jh|kh|ph|rh|sh|th)$/.exec(rom)?.[1];
  const letter = pair ?? rom.slice(-1);
  const before = rom.slice(0, rom.length - letter.length);
  return before.endsWith(letter.charAt(0)) ? rom : before + letter.charAt(0) + letter;
}

function soundsOf(word: string): Sound[] {
  const ch = Array.from(word);
  const out: Sound[] = [];
  let i = 0;
  while (i < ch.length) {
    const c = ch[i] ?? '';
    if (has(CONSONANTS, c)) {
      const sound: Sound = {
        kind: 'letter',
        rom: sayOf(CONSONANTS, c),
        joined: false,
        vowel: null,
        mark: '',
        tail: c,
      };
      const atStart = out.length === 0;
      i += 1;
      while (ch[i] === HASANTA && sound.vowel === null) {
        const next = ch[i + 1];
        if (!has(CONSONANTS, next)) {
          sound.vowel = '';
          i += 1;
          break;
        }
        i += 2;
        if (next === 'য' && sound.tail === 'র') {
          sound.rom += 'j'; // র্য: য reads "j" (সূর্য surjo)
        } else if (next === 'য' || next === YA_PHALA) {
          if (atStart) {
            // য-ফলা in a word's first letter: ্যা "a" (ব্যাগ bag), ্য "e" (ব্যবসা bebsa)
            if (ch[i] === 'া') {
              sound.vowel = 'a';
              i += 1;
            } else if (!has(SIGNS, ch[i])) sound.vowel = 'e';
          } else if (ch[i] === 'া') {
            sound.vowel = 'ya'; // after it: ্যা "ya" (কন্যা konya)
            i += 1;
          } else {
            sound.rom = doubled(sound.rom); // else the letter is said twice (কাব্য kabbo, সত্যি sotti)
          }
        } else if (next === 'ব') {
          sound.rom += sound.tail === 'ম' ? 'b' : 'w'; // ব-ফলা: স্ব sw, but ম্ব mb
        } else if (sound.tail === 'ক' && next === 'ষ') {
          sound.rom = sound.rom.slice(0, -1) + (atStart && !sound.joined ? 'kh' : 'kkh');
        } else if (sound.tail === 'জ' && next === 'ঞ') {
          sound.rom = sound.rom.slice(0, -1) + (atStart && !sound.joined ? 'g' : 'gg');
        } else if (sound.tail === 'ঙ' && (next === 'গ' || next === 'ক')) {
          sound.rom = sound.rom.slice(0, -2) + (next === 'গ' ? 'ng' : 'nk');
        } else {
          sound.rom += sayOf(CONSONANTS, next);
        }
        sound.joined = true;
        sound.tail = next ?? '';
      }
      if (sound.vowel === null && has(SIGNS, ch[i])) {
        sound.vowel = sayOf(SIGNS, ch[i]);
        i += 1;
      }
      while (has(MARKS, ch[i])) {
        sound.mark += sayOf(MARKS, ch[i]);
        i += 1;
      }
      out.push(sound);
      continue;
    }
    if (has(VOWELS, c)) {
      let rom = sayOf(VOWELS, c);
      i += 1;
      if (c === 'অ' && ch[i] === HASANTA && ch[i + 1] === 'য') {
        i += 2; // অ্যা sounds "a" (অ্যান্ড and)
        if (ch[i] === 'া') {
          rom = 'a';
          i += 1;
        }
      }
      const sound: Sound = { kind: 'other', rom, joined: false, vowel: '', mark: '', tail: c };
      while (has(MARKS, ch[i])) {
        sound.mark += sayOf(MARKS, ch[i]);
        i += 1;
      }
      out.push(sound);
      continue;
    }
    const digit = DIGITS.indexOf(c);
    if (digit >= 0)
      out.push({ kind: 'other', rom: String(digit), joined: false, vowel: '', mark: '', tail: '' });
    i += 1;
  }
  return out;
}

/** Whether the hidden "o" after a letter group with no vowel sign is said. */
function hiddenVowel(sounds: readonly Sound[], i: number): string {
  const sound = sounds[i];
  const next = sounds[i + 1];
  if (!sound) return '';
  if (sound.mark) return 'o'; // রং rong
  // The word's end, or a digit after it.
  if (!next || (next.kind !== 'letter' && next.tail === '')) {
    if (sound.joined) return sound.tail === 'স' ? '' : 'o'; // পত্র potro, but সন্স sons
    return i === 0 ? 'o' : ''; // হাতের hater
  }
  if (next.kind !== 'letter') return 'o'; // বই boi
  const nextIsLast = i + 2 >= sounds.length;
  // An English plural: the letter before a last bare স says nothing (গ্যাজেটস gadgets).
  if (i > 0 && nextIsLast && !next.joined && next.rom === 's' && next.vowel === null && !next.mark)
    return '';
  if (i === 0) return 'o'; // কলম kolom
  if (sound.joined) return 'o'; // মোহাম্মদ mohammod
  return next.vowel ? '' : 'o'; // বিসমিল্লাহ bismillah, কলম kolom
}

function romanise(word: string): string {
  const sounds = soundsOf(word);
  return sounds
    .map((sound, i) => {
      // ং before গ is one "ng" (সংগীত songit), not "ngg".
      const mark = sound.mark === 'ng' && sounds[i + 1]?.rom.startsWith('g') ? 'n' : sound.mark;
      if (sound.kind !== 'letter') return sound.rom + mark;
      return sound.rom + (sound.vowel ?? hiddenVowel(sounds, i)) + mark;
    })
    .join('');
}

/** Each Bangla word of a name written in English letters; everything else left as it is. */
export function banglaToLatin(text: string): string {
  return prep(text)
    .replace(/([ঀ-৿])['’]([ঀ-৿])/g, '$1$2')
    .replace(/[ঀ-৿]+/g, (word) => ` ${DICTIONARY.get(word) ?? romanise(word)} `);
}
