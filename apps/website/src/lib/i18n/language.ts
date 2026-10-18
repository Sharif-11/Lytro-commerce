// I18N-01/02: the site is Bangla by default with an English toggle, remembered per device. A cookie is the
// per-device store that both the server render and the browser can read, so the first paint is already in
// the chosen language (no flash of the other one).
export type Language = 'bn' | 'en';

export const DEFAULT_LANGUAGE: Language = 'bn';

export class LanguageCookie {
  constructor(
    readonly name = 'lytro-lang',
    private readonly maxAgeSeconds = 60 * 60 * 24 * 365,
  ) {}

  /** Reads a cookie value and returns a language, falling back to Bangla for anything unknown. */
  parse(value: string | undefined): Language {
    return value === 'en' ? 'en' : DEFAULT_LANGUAGE;
  }

  /** The Set-Cookie value the browser writes when the visitor switches language. */
  serialize(language: Language): string {
    return `${this.name}=${language}; Path=/; Max-Age=${String(this.maxAgeSeconds)}; SameSite=Lax`;
  }
}

/** The one cookie the whole site uses; the server reads it and the toggle writes it. */
export const languageCookie = new LanguageCookie();
