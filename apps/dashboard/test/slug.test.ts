import { describe, expect, it } from 'vitest';
import { ShopSlug } from '../src/lib/slug';

const slug = new ShopSlug();

describe('ShopSlug', () => {
  it('suggests an address from a name, its Bangla written in English letters (the owner, 2026-11-28)', () => {
    expect(slug.suggest("Rahim's Gadgets")).toBe('rahim-s-gadgets');
    expect(slug.suggest('মেঘ ফ্যাশন')).toBe('megh-fashion');
    expect(slug.suggest('Megh Fashion ঢাকা')).toBe('megh-fashion-dhaka');
  });

  it.each([
    ['বোরকা শপ', 'borka-shop'],
    ['বিসমিল্লাহ ক্লোক স্টোর', 'bismillah-klok-store'],
    ['হাতের তৈরি জিনিস পত্র', 'hater-toiri-jinis-potro'],
    ['ফ্রেন্ডস ফ্লাওয়ার প্যাশন', 'friends-flower-passion'],
    ['জুই ভ্যারাটিস ষ্টোর', 'jui-bharatis-store'],
    ['বরগুনা অনলাইন শপ', 'borguna-online-shop'],
    ["মরিয়ম'স ফ্যাশন অ্যান্ড কসমেটিক", 'moriyoms-fashion-and-cosmetic'],
    ['মোহাম্মদিয়া শপ', 'mohammodiya-shop'],
    ['লন থ্রি-পিস কালেকশন', 'lawn-three-piece-collection'],
    ['নকশী কাঁথা ঘর', 'nokshi-katha-ghor'],
    ['চট্টগ্রাম হ্যান্ডমেড', 'chottogram-handmade'],
    ['Nayvella — নাইভেলা', 'nayvella-naibhela'],
    ['১২৩ শপ', '123-shop'],
  ])('writes the Bangla name %s as %s', (name, link) => {
    expect(slug.suggest(name)).toBe(link);
  });

  it.each([
    ['কলম', 'kolom'],
    ['রং', 'rong'],
    ['বাংলা', 'bangla'],
    ['চাঁদ', 'chad'],
    ['বই', 'boi'],
    ['সংগীত', 'songit'],
    ['ব্যাগ', 'bag'],
    ['প্ল্যান', 'plan'],
    ['ব্যবসা', 'bebsa'],
    ['ব্যস্ত', 'besto'],
    ['কন্যা', 'konya'],
    ['বন্যা', 'bonya'],
    ['সন্ধ্যা', 'sondhya'],
    ['কাব্য', 'kabbo'],
    ['সত্যি', 'sotti'],
    ['ধন্যবাদ', 'dhonnobad'],
    ['লক্ষ্য', 'lokkho'],
    ['সূর্য', 'surjo'],
    ['র\u200D্যাব', 'rab'],
    ['শিক্ষা', 'shikkha'],
    ['ক্ষমা', 'khoma'],
    ['বঙ্গ', 'bongo'],
    ['স্বপ্ন', 'swopno'],
    ['ময়না', 'moyna'],
  ])('says %s as %s', (word, link) => {
    expect(slug.suggest(word)).toBe(link);
  });

  it('cuts a long suggestion at a word boundary within the limit', () => {
    const long = slug.suggest('abcdefghij klmnopqrst uvwxyzabcd efgh');
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith('-')).toBe(false);
  });

  it('normalises typing to lowercase letters, digits and single hyphens', () => {
    expect(slug.normaliseTyping('Megh Shop!!')).toBe('megh-shop-');
    expect(slug.normaliseTyping('MEGH--2')).toBe('megh-2');
  });

  it("knows the address's own shape, and leaves whether it is free to the server", () => {
    expect(slug.isWellFormed('')).toBe(false);
    expect(slug.isWellFormed('ab')).toBe(false);
    expect(slug.isWellFormed('-megh')).toBe(false);
    expect(slug.isWellFormed('megh-')).toBe(false);
    expect(slug.isWellFormed('megh')).toBe(true);
    // Reserved names are well formed; the server's check says they are not free (TEN-26).
    expect(slug.isWellFormed('admin')).toBe(true);
  });
});
