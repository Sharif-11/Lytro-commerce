// I18N-01/02: the storefront is Bangla by default with an English switch, remembered per device. A cookie is the store
// both the server render and the browser read, so the first paint is already in the chosen language. Kept apart from the
// words themselves, so the middleware (Slice 9.10's edge cache) can read the language without loading every word.
export type Language = 'bn' | 'en';

export const LANGUAGE_COOKIE = 'lytro-lang';
const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseLanguage(value: string | undefined): Language {
  return value === 'en' ? 'en' : 'bn';
}

/** The Set-Cookie value the browser writes when the shopper switches language. */
export function languageCookieValue(language: Language): string {
  return `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${String(LANGUAGE_COOKIE_MAX_AGE)}; SameSite=Lax`;
}
