import { APP_COPY } from './app-copy';
import { COPY } from './copy';

// I18N-01/02: the storefront is Bangla by default with an English switch, remembered per device. A cookie is the store
// both the server render and the browser read, so the first paint is already in the chosen language.
export type Language = 'bn' | 'en';
export type WordKey = keyof typeof COPY | keyof typeof APP_COPY;

const WORDS: Record<WordKey, readonly [string, string]> = { ...COPY, ...APP_COPY };

export const LANGUAGE_COOKIE = 'lytro-lang';
const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseLanguage(value: string | undefined): Language {
  return value === 'en' ? 'en' : 'bn';
}

/** The Set-Cookie value the browser writes when the shopper switches language. */
export function languageCookieValue(language: Language): string {
  return `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${String(LANGUAGE_COOKIE_MAX_AGE)}; SameSite=Lax`;
}

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
}

/** A taka amount as the prototype writes it in both languages: the sign, then Western digits with commas. */
export function money(amount: string | number): string {
  return `৳${plainNumber(amount)}`;
}

/** An amount without the sign, for words that carry it themselves (`৳{n} advance`). */
export function plainNumber(amount: string | number): string {
  return Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
