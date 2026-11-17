import { APP_COPY } from './app-copy';
import { COPY } from './copy';
import type { Language } from './language';

export { type Language, LANGUAGE_COOKIE, languageCookieValue, parseLanguage } from './language';
export type WordKey = keyof typeof COPY | keyof typeof APP_COPY;

const WORDS: Record<WordKey, readonly [string, string]> = { ...COPY, ...APP_COPY };

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Every word on a page, in the shopper's language, as the prototype writes them. */
export class Words {
  constructor(readonly language: Language) {}

  /** A word, with `{name}` filled in from `vars`. */
  t(key: WordKey, vars?: Record<string, string | number>): string {
    const entry = WORDS[key];
    let text = this.language === 'bn' ? entry[0] : entry[1];
    if (vars) {
      for (const [name, value] of Object.entries(vars))
        text = text.split(`{${name}}`).join(String(value));
    }
    return text;
  }

  /** A count in words, in its singular form for exactly one. */
  count(key: 'products_n' | 'cart_n', n: number): string {
    const one = key === 'products_n' ? 'products_one' : 'cart_one';
    return this.t(n === 1 ? one : key, { n });
  }

  /** One of two words the shop or the platform gave in both languages. */
  pick(bilingual: { bn: string; en: string }): string {
    return this.language === 'bn' ? bilingual.bn : bilingual.en;
  }

  /** A whole number in the shopper's own digits, as the prototype writes a busy page's wait (৩০ in Bangla, Part 910). */
  digits(n: number): string {
    const text = String(n);
    return this.language === 'bn'
      ? text.replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)] ?? digit)
      : text;
  }
}

/** A taka amount as the prototype writes it in both languages: the sign, then Western digits with commas. */
export function money(amount: string | number): string {
  return `৳${plainNumber(amount)}`;
}

/** An amount without the sign, for words that carry it themselves (`৳{n} advance`). */
export function plainNumber(amount: string | number): string {
  const value = Number(amount);
  // A part of a taka is two figures, ৳42.50: half a kg of something makes these ordinary (LND-07).
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
